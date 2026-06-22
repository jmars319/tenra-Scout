import { chromium } from "playwright";

import {
  buildBusinessBreakdowns,
  buildLeadShortlist,
  buildRunSummary,
  classifyBusiness,
  emptyAuditResult,
  type CandidateProvenanceKind,
  type PresenceAuditResult,
  type ScoutRunReport,
  type SearchCandidate
} from "@scout/domain";

import { createPlaywrightAuditor } from "../audit/playwright-auditor.ts";
import { detectPresence } from "../search/presence-detector.ts";
import { canonicalizeUrl } from "../search/canonicalize.ts";
import { createEvidenceStorage } from "../storage/evidence-storage.ts";
import {
  createPersistedRunRecord,
  type PersistedRunRecord
} from "../storage/persisted-run-record.ts";
import { createRunRepository } from "../storage/run-repository.ts";

/* Candidate mutation contract */

export interface AddManualCandidateInput {
  runId: string;
  businessName: string;
  url: string;
  expectedReason?: string | undefined;
}

export interface PromoteDiscardedCandidateInput {
  runId: string;
  discardedCandidateId: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function normalizeInputUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return canonicalizeUrl(withProtocol).canonicalUrl;
}

function buildCandidateId(provenance: CandidateProvenanceKind, title: string, url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return `${provenance}-${Date.now()}-${slugify(`${title}-${host}`) || "candidate"}`;
}

function normalizeName(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameOrSimilarName(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function domainFromUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/* Miss diagnostics boundary */

function buildMissDiagnostics(
  report: ScoutRunReport,
  candidate: SearchCandidate,
  expectedReason: string | undefined
): string[] {
  const candidateDomain = domainFromUrl(candidate.url) ?? candidate.domain;
  const discardedMatch = report.acquisition.discardedCandidates.find((discarded) => {
    const discardedDomain = domainFromUrl(discarded.url);
    return (
      (discardedDomain && discardedDomain === candidateDomain) ||
      sameOrSimilarName(discarded.title, candidate.title)
    );
  });
  const diagnostics: string[] = [];

  if (expectedReason?.trim()) {
    diagnostics.push(`Operator expected it because: ${expectedReason.trim()}`);
  }

  if (discardedMatch) {
    diagnostics.push(
      `Scout saw a similar acquisition result but discarded it during filtering: ${discardedMatch.reason}`
    );
  } else {
    diagnostics.push(
      `Scout did not keep ${candidateDomain} in the original selected candidate set, which points to a provider or query-variant coverage gap.`
    );
  }

  if (report.acquisition.mergedDuplicateCount > 0) {
    diagnostics.push(
      `Duplicate handling merged ${report.acquisition.mergedDuplicateCount} result(s); similar names or domains may have been collapsed before review.`
    );
  }

  if (report.acquisition.discardedCandidateCount > 0 && !discardedMatch) {
    diagnostics.push(
      `${report.acquisition.discardedCandidateCount} acquisition result(s) were discarded as low-value, duplicate, or non-specific before this manual check.`
    );
  }

  if (
    report.acquisition.liveCandidateCount === 0 ||
    report.acquisition.providerAttempts.some(
      (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
    )
  ) {
    diagnostics.push(
      "Live search was degraded for this run, so missing a known local business is more likely a provider issue than a Scout scoring decision."
    );
  }

  if (report.acquisition.selectedCandidateCount > 0 && report.acquisition.selectedCandidateCount < 10) {
    diagnostics.push(
      `Only ${report.acquisition.selectedCandidateCount} final candidate(s) survived acquisition filtering, so the market sample was narrow.`
    );
  }

  return diagnostics.slice(0, 5);
}

function buildMissLearningNotes(candidate: SearchCandidate, diagnostics: string[]): string[] {
  return diagnostics.map(
    (diagnostic) => `Miss learning for ${candidate.title}: ${diagnostic}`
  );
}

function createCandidate(input: {
  title: string;
  url: string;
  source: string;
  rank: number;
  provenance: CandidateProvenanceKind;
  snippet: string;
  provenanceNote: string;
  extractedFromCandidateId?: string;
}): SearchCandidate {
  const url = normalizeInputUrl(input.url);
  const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

  return {
    candidateId: buildCandidateId(input.provenance, input.title, url),
    rank: input.rank,
    title: input.title.trim() || domain,
    url,
    domain,
    snippet: input.snippet,
    source: input.source,
    provenance: input.provenance,
    provenanceNote: input.provenanceNote,
    ...(input.extractedFromCandidateId
      ? { extractedFromCandidateId: input.extractedFromCandidateId }
      : {})
  };
}

/* Report rebuild boundary */

function rebuildReport(
  report: ScoutRunReport,
  additions: {
    candidates: SearchCandidate[];
    presences: ScoutRunReport["presences"];
    audits: PresenceAuditResult[];
    notes: string[];
    acquisitionNotes?: string[] | undefined;
  }
): ScoutRunReport {
  const candidates = [...report.candidates, ...additions.candidates].map((candidate, index) => ({
    ...candidate,
    rank: index + 1
  }));
  const findings = [...report.findings, ...additions.audits.flatMap((audit) => audit.findings)];
  const auditTargetsByCandidate = new Map(
    additions.audits.map((audit) => [
      audit.candidateId,
      audit.targets
        .filter((target) => target.label === "secondary")
        .map((target) => target.url)
    ])
  );
  const presences = report.presences.map((presence) => ({
    ...presence,
    secondaryUrls: presence.secondaryUrls
  }));

  for (const presence of additions.presences) {
    if (!presences.some((existing) => existing.candidateId === presence.candidateId)) {
      presences.push(presence);
    }
  }

  const findingsByCandidate = new Map<string, ScoutRunReport["findings"]>();
  for (const finding of findings) {
    const current = findingsByCandidate.get(finding.candidateId) ?? [];
    current.push(finding);
    findingsByCandidate.set(finding.candidateId, current);
  }

  const enrichedPresences = presences.map((presence) => ({
    ...presence,
    secondaryUrls: auditTargetsByCandidate.get(presence.candidateId) ?? presence.secondaryUrls
  }));
  const classifications = enrichedPresences.map((presence) =>
    classifyBusiness(presence, findingsByCandidate.get(presence.candidateId) ?? [])
  );
  const auditedCandidateIds = new Set(
    enrichedPresences
      .filter((presence) => presence.auditEligible)
      .map((presence) => presence.candidateId)
  );

  return {
    ...report,
    candidates,
    presences: enrichedPresences,
    findings,
    classifications,
    businessBreakdowns: buildBusinessBreakdowns(
      enrichedPresences,
      classifications,
      findings,
      auditedCandidateIds
    ),
    shortlist: buildLeadShortlist(enrichedPresences, classifications, findings).slice(0, 5),
    summary: buildRunSummary(
      enrichedPresences,
      classifications,
      findings,
      report.acquisition.sampleQuality,
      auditedCandidateIds
    ),
    acquisition: {
      ...report.acquisition,
      notes: [...report.acquisition.notes, ...(additions.acquisitionNotes ?? [])]
    },
    notes: [...report.notes, ...additions.notes]
  };
}

/* Candidate audit boundary */

async function auditNewCandidates(
  report: ScoutRunReport,
  candidates: SearchCandidate[]
): Promise<{
  presences: ScoutRunReport["presences"];
  audits: PresenceAuditResult[];
}> {
  const presences = await Promise.all(
    candidates.map((candidate) => detectPresence(candidate, report.intent))
  );
  const auditEligible = presences.filter((presence) => presence.auditEligible);
  const audits: PresenceAuditResult[] = [];

  if (auditEligible.length === 0) {
    return {
      presences,
      audits: presences.map((presence) => emptyAuditResult(presence.candidateId))
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const auditor = createPlaywrightAuditor({
      browser,
      evidenceStorage: createEvidenceStorage(),
      runId: report.runId
    });

    for (const presence of presences) {
      audits.push(
        presence.auditEligible
          ? await auditor.auditPresence(presence, report.intent)
          : emptyAuditResult(presence.candidateId)
      );
    }
  } finally {
    await browser.close();
  }

  return {
    presences,
    audits
  };
}

/* Mutation save boundary */

function ensureCanMutate(record: PersistedRunRecord, report: ScoutRunReport | null): ScoutRunReport {
  if (record.status !== "completed" || !report) {
    throw new Error("Only completed Scout reports can accept added candidates.");
  }

  return report;
}

async function saveMutatedReport(record: PersistedRunRecord, report: ScoutRunReport) {
  const repository = createRunRepository();
  const now = new Date().toISOString();
  const nextRecord = createPersistedRunRecord(report, {
    execution: {
      queuedAt: record.execution.queuedAt,
      attemptCount: record.execution.attemptCount,
      ...(record.execution.startedAt ? { startedAt: record.execution.startedAt } : {}),
      finishedAt: now,
      heartbeatAt: now,
      stage: "completed",
      ...(record.execution.workerId ? { workerId: record.execution.workerId } : {}),
      workerNote: "Report updated with operator-supplied candidate changes.",
      ...(record.execution.lastErrorMessage
        ? { lastErrorMessage: record.execution.lastErrorMessage }
        : {})
    },
    persistence: {
      importedFromLegacyLocal: record.persistence.importedFromLegacyLocal,
      handoffHistory: record.persistence.handoffHistory,
      ...(record.persistence.importSourcePath
        ? { importSourcePath: record.persistence.importSourcePath }
        : {}),
      ...(record.persistence.importedAt ? { importedAt: record.persistence.importedAt } : {})
    }
  });

  await repository.upsertRecord(nextRecord);
  return report;
}

async function addCandidatesToRun(
  runId: string,
  candidates: SearchCandidate[],
  notes: string[],
  acquisitionNotes: string[] = []
): Promise<ScoutRunReport> {
  const repository = createRunRepository();
  const record = await repository.getRecord(runId);

  if (!record) {
    throw new Error("Scout run not found.");
  }

  const report = ensureCanMutate(record, await repository.get(runId));
  const existingUrls = new Set(report.candidates.map((candidate) => canonicalizeUrl(candidate.url).comparisonKey));
  const filteredCandidates = candidates.filter(
    (candidate) => !existingUrls.has(canonicalizeUrl(candidate.url).comparisonKey)
  );

  if (filteredCandidates.length === 0) {
    throw new Error("That candidate URL is already present in this Scout report.");
  }

  const additions = await auditNewCandidates(report, filteredCandidates);
  const nextReport = rebuildReport(report, {
    candidates: filteredCandidates,
    presences: additions.presences,
    audits: additions.audits,
    notes,
    acquisitionNotes
  });

  return saveMutatedReport(record, nextReport);
}

/* Public mutation boundary */

export async function addManualCandidateToRun(
  input: AddManualCandidateInput
): Promise<ScoutRunReport> {
  const repository = createRunRepository();
  const report = await repository.get(input.runId);

  if (!report) {
    throw new Error("Scout run not found.");
  }

  const nextRank = report.candidates.length + 1;
  const baseCandidate = createCandidate({
    title: input.businessName,
    url: input.url,
    source: "manual",
    rank: nextRank,
    provenance: "manual",
    snippet: "Operator supplied this business manually after the initial live acquisition.",
    provenanceNote: "Operator-supplied candidate. Scout evaluated it with the same presence, audit, and shortlist rules."
  });
  const missDiagnostics = buildMissDiagnostics(report, baseCandidate, input.expectedReason);
  const provenanceNote = [
    "Operator-supplied missed business.",
    `Likely miss diagnostics: ${missDiagnostics.join(" ")}`
  ].join(" ");
  const candidate: SearchCandidate = {
    ...baseCandidate,
    provenanceNote
  };
  const missLearningNotes = buildMissLearningNotes(candidate, missDiagnostics);

  return addCandidatesToRun(
    input.runId,
    [candidate],
    [
      `Operator manually added expected missing business ${candidate.title}.`,
      ...missDiagnostics.map((diagnostic) => `Miss diagnostic for ${candidate.title}: ${diagnostic}`)
    ],
    missLearningNotes
  );
}

export async function promoteDiscardedCandidateToRun(
  input: PromoteDiscardedCandidateInput
): Promise<ScoutRunReport> {
  const repository = createRunRepository();
  const record = await repository.getRecord(input.runId);

  if (!record) {
    throw new Error("Scout run not found.");
  }

  const report = ensureCanMutate(record, await repository.get(input.runId));
  const discarded = report.acquisition.discardedCandidates.find(
    (candidate) => candidate.candidateId === input.discardedCandidateId
  );

  if (!discarded?.url || !discarded.title) {
    throw new Error("That discarded candidate does not have enough saved detail to promote.");
  }

  const candidate = createCandidate({
    title: discarded.title,
    url: discarded.url,
    source: discarded.source ?? "promoted_discarded",
    rank: report.candidates.length + 1,
    provenance: "promoted_discarded",
    snippet: discarded.snippet ?? discarded.reason,
    provenanceNote: `Operator promoted a discarded acquisition result. Original reason: ${discarded.reason}`,
    extractedFromCandidateId: discarded.candidateId
  });

  return addCandidatesToRun(input.runId, [candidate], [
    `Operator promoted discarded result ${candidate.title}. Original reason: ${discarded.reason}`
  ]);
}

export function canPromoteDiscardedCandidate(
  discarded: ScoutRunReport["acquisition"]["discardedCandidates"][number]
): boolean {
  return Boolean(discarded.url && discarded.title);
}
