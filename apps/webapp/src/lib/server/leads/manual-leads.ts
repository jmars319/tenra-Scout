import {
  buildBusinessBreakdowns,
  buildLeadShortlist,
  buildRunSummary,
  createEmptyAcquisitionDiagnostics,
  resolveMarketIntent,
  type BusinessClassification,
  type PresenceRecord,
  type ScoutRunReport,
  type SearchCandidate
} from "@scout/domain";

import type { CreateManualLeadRequest } from "@scout/api-contracts";

import { addManualCandidateToRun } from "../candidates/candidate-additions.ts";
import { canonicalizeUrl } from "../search/canonicalize.ts";
import { createRunRepository } from "../storage/run-repository.ts";
import { saveLeadAnnotation } from "./lead-workflow-service.ts";
import { getLeadInboxItem } from "./lead-inbox-service.ts";

export interface ManualLeadResult {
  runId: string;
  candidateId: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeInputUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return canonicalizeUrl(withProtocol).canonicalUrl;
}

function manualNote(input: CreateManualLeadRequest): string {
  return [
    input.notes ? `Operator notes: ${input.notes}` : "",
    input.contactName ? `Contact name: ${input.contactName}` : "",
    input.contactEmail ? `Contact email: ${input.contactEmail}` : "",
    input.contactPhone ? `Contact phone: ${input.contactPhone}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function createManualCandidate(input: CreateManualLeadRequest, now: Date): SearchCandidate {
  const url = normalizeInputUrl(input.primaryUrl);
  const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const note = manualNote(input);

  return {
    candidateId: `operator-entered-${now.getTime().toString(36)}-${slugify(input.businessName)}`,
    rank: 1,
    title: input.businessName,
    url,
    domain,
    snippet: note || "Operator entered this lead manually.",
    source: "operator-entered",
    provenance: "manual",
    provenanceNote:
      "operator-entered manual lead. Scout should treat this as operator-supplied evidence, not a live-provider result."
  };
}

function buildManualReport(input: CreateManualLeadRequest, now = new Date()): ScoutRunReport {
  const rawQuery = input.query?.trim() || input.market?.trim() || input.businessName;
  const query = { rawQuery };
  const intent = resolveMarketIntent(query);
  const candidate = createManualCandidate(input, now);
  const presence: PresenceRecord = {
    candidateId: candidate.candidateId,
    businessName: input.businessName,
    primaryUrl: candidate.url,
    domain: candidate.domain,
    searchRank: 1,
    presenceType: "owned_website",
    auditEligible: true,
    secondaryUrls: [],
    detectionNotes: [
      "Operator entered this lead manually.",
      input.notes || "No operator notes were supplied."
    ]
  };
  const classification: BusinessClassification = {
    candidateId: candidate.candidateId,
    presenceQuality: "weak",
    opportunityTypes: ["conversion_improvement"],
    confidence: "confirmed",
    rationale: [
      "Operator-entered fallback lead.",
      "Manual entry should be triaged, contact-analyzed, drafted, shaped by Proxy, and reviewed by Guardrail before use."
    ]
  };
  const auditedCandidateIds = new Set([candidate.candidateId]);
  const acquisition = createEmptyAcquisitionDiagnostics("operator-entered");

  acquisition.selectedCandidateCount = 1;
  acquisition.rawCandidateCount = 1;
  acquisition.sampleQuality = "partial_sample";
  acquisition.candidateSources = [
    {
      source: "operator-entered",
      kind: "fallback",
      rawCandidateCount: 1,
      selectedCandidateCount: 1
    }
  ];
  acquisition.providerAttempts = [
    {
      provider: "operator-entered",
      kind: "fallback",
      variantLabel: "manual lead",
      query: rawQuery,
      outcome: "success",
      rawResultCount: 1,
      detail: "Operator entered a single lead manually."
    }
  ];
  acquisition.notes = [
    "Manual run created by operator entry. Treat coverage as narrow and provenance as operator-entered.",
    ...(input.notes ? [`Operator notes: ${input.notes}`] : [])
  ];

  const shortlist = buildLeadShortlist([presence], [classification], []);

  return {
    schemaVersion: 2,
    runId: `manual-${now.toISOString().replace(/[:.]/g, "-")}-${slugify(input.businessName)}`,
    status: "completed",
    createdAt: now.toISOString(),
    query,
    intent,
    acquisition,
    searchSource: "operator-entered",
    candidates: [candidate],
    presences: [presence],
    findings: [],
    classifications: [classification],
    businessBreakdowns: buildBusinessBreakdowns(
      [presence],
      [classification],
      [],
      auditedCandidateIds
    ),
    shortlist,
    summary: buildRunSummary([presence], [classification], [], "partial_sample", auditedCandidateIds),
    notes: [
      "Operator-entered manual lead fallback.",
      ...(input.notes ? [`Operator notes: ${input.notes}`] : [])
    ]
  };
}

async function attachToExistingRun(input: CreateManualLeadRequest): Promise<ManualLeadResult> {
  if (!input.runId) {
    throw new Error("Existing run id is required.");
  }

  const repository = createRunRepository();
  const before = await repository.get(input.runId);
  const beforeIds = new Set(before?.candidates.map((candidate) => candidate.candidateId) ?? []);
  const report = await addManualCandidateToRun({
    runId: input.runId,
    businessName: input.businessName,
    url: input.primaryUrl,
    expectedReason: input.notes
  });
  const candidate =
    report.candidates.find((candidate) => !beforeIds.has(candidate.candidateId)) ??
    report.candidates.find((candidate) => candidate.title === input.businessName);

  if (!candidate) {
    throw new Error("Manual lead was added, but Scout could not identify the new candidate.");
  }

  await saveLeadAnnotation({
    runId: report.runId,
    candidateId: candidate.candidateId,
    state: "needs_review",
    operatorNote: manualNote(input)
  });

  return { runId: report.runId, candidateId: candidate.candidateId };
}

async function createManualRun(input: CreateManualLeadRequest): Promise<ManualLeadResult> {
  const report = buildManualReport(input);
  await createRunRepository().save(report, {
    handoffHistory: []
  });
  const candidate = report.candidates[0];
  if (!candidate) {
    throw new Error("Manual run did not create a candidate.");
  }

  await saveLeadAnnotation({
    runId: report.runId,
    candidateId: candidate.candidateId,
    state: "needs_review",
    operatorNote: manualNote(input)
  });

  return { runId: report.runId, candidateId: candidate.candidateId };
}

export async function createManualLead(input: CreateManualLeadRequest) {
  const result = input.runId ? await attachToExistingRun(input) : await createManualRun(input);
  const item = await getLeadInboxItem(result.runId, result.candidateId);

  return {
    ...result,
    ...(item ? { item } : {})
  };
}
