import assert from "node:assert/strict";

import type { ScoutRunReport } from "../packages/domain/src/model.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";

import {
  buildLeadExport,
  buildLeadInboxExport,
  buildLeadPackExport
} from "../apps/webapp/src/lib/server/leads/lead-export-service.ts";
import { buildOperatorReadinessReport } from "../apps/webapp/src/lib/server/operator/readiness.ts";
import {
  runLeadInboxAction,
  runLeadInboxBulkAction
} from "../apps/webapp/src/lib/server/leads/lead-inbox-actions.ts";
import {
  filterLeadInboxItems,
  getLeadInboxItem,
  listLeadInboxItems
} from "../apps/webapp/src/lib/server/leads/lead-inbox-service.ts";
import { createManualLead } from "../apps/webapp/src/lib/server/leads/manual-leads.ts";
import {
  getLeadAnnotations,
  saveLeadAnnotation
} from "../apps/webapp/src/lib/server/leads/lead-workflow-service.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";
import { createOutreachDraftRepository } from "../apps/webapp/src/lib/server/storage/outreach-draft-repository.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const repository = createRunRepository();
const createdAt = new Date();
const runId = `verify-leads-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const secondRunId = `verify-leads-cross-run-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const candidateId = "lead-workflow-candidate";
const secondCandidateId = "lead-workflow-second-candidate";
let manualRunId = "";
const query = {
  rawQuery: "lead workflow verification shop in Winston-Salem, NC"
};
const intent = resolveMarketIntent(query);
const acquisition = createEmptyAcquisitionDiagnostics("verification");
const outreachDraftRepository = createOutreachDraftRepository();

acquisition.rawCandidateCount = 1;
acquisition.selectedCandidateCount = 1;
acquisition.liveCandidateCount = 1;
acquisition.candidateSources = [
  {
    source: "verification",
    kind: "live",
    rawCandidateCount: 1,
    selectedCandidateCount: 1
  }
];

const report: ScoutRunReport = {
  schemaVersion: 2,
  runId,
  status: "completed",
  createdAt: createdAt.toISOString(),
  query,
  intent,
  acquisition,
  searchSource: "verification",
  candidates: [
    {
      candidateId,
      rank: 1,
      title: "Lead Workflow Verification Shop",
      url: "https://lead-workflow.example",
      domain: "lead-workflow.example",
      snippet: "Lead workflow verification fixture.",
      source: "verification"
    }
  ],
  presences: [
    {
      candidateId,
      businessName: "Lead Workflow Verification Shop",
      primaryUrl: "https://lead-workflow.example",
      domain: "lead-workflow.example",
      searchRank: 1,
      presenceType: "owned_website",
      auditEligible: true,
      secondaryUrls: [],
      detectionNotes: ["Owned website fixture for lead workflow verification."]
    }
  ],
  findings: [
    {
      id: "lead-workflow-finding",
      candidateId,
      pageUrl: "https://lead-workflow.example",
      pageLabel: "homepage",
      viewport: "desktop",
      issueType: "missing_contact_path",
      severity: "high",
      confidence: "confirmed",
      message: "Contact path is not visible.",
      reproductionNote: "The fixture records a deterministic contact gap."
    }
  ],
  classifications: [
    {
      candidateId,
      presenceQuality: "weak",
      opportunityTypes: ["rebuild"],
      confidence: "confirmed",
      rationale: ["Verification fixture should rank as a lead."]
    }
  ],
  businessBreakdowns: [
    {
      candidateId,
      businessName: "Lead Workflow Verification Shop",
      primaryUrl: "https://lead-workflow.example",
      searchRank: 1,
      presenceType: "owned_website",
      presenceQuality: "weak",
      opportunityTypes: ["rebuild"],
      confidence: "confirmed",
      findingCount: 1,
      highSeverityFindings: 1,
      audited: true,
      auditStatus: "audited",
      topIssues: ["missing_contact_path"],
      secondaryUrls: [],
      detectionNotes: ["Owned website fixture for lead workflow verification."]
    }
  ],
  shortlist: [
    {
      candidateId,
      businessName: "Lead Workflow Verification Shop",
      primaryUrl: "https://lead-workflow.example",
      presenceType: "owned_website",
      presenceQuality: "weak",
      opportunityTypes: ["rebuild"],
      confidence: "confirmed",
      priorityScore: 84,
      reasons: ["Contact path is not visible."]
    }
  ],
  summary: {
    totalCandidates: 1,
    auditedPresences: 1,
    skippedPresences: 0,
    sampleQuality: acquisition.sampleQuality,
    presenceBreakdown: {
      owned_website: 1,
      facebook_only: 0,
      yelp_only: 0,
      directory_only: 0,
      marketplace: 0,
      dead: 0,
      blocked: 0,
      unknown: 0
    },
    qualityBreakdown: {
      none: 0,
      weak: 1,
      functional: 0,
      broken: 0,
      strong: 0
    },
    commonIssues: [
      {
        issueType: "missing_contact_path",
        count: 1
      }
    ]
  },
  notes: ["Lead workflow verification run."]
};

function buildSecondReport(): ScoutRunReport {
  const secondReport = structuredClone(report);
  const secondQuery = {
    rawQuery: "second lead workflow verification shop in Greensboro, NC"
  };

  secondReport.runId = secondRunId;
  secondReport.createdAt = new Date(createdAt.getTime() + 1_000).toISOString();
  secondReport.query = secondQuery;
  secondReport.intent = resolveMarketIntent(secondQuery);
  secondReport.candidates[0] = {
    candidateId: secondCandidateId,
    rank: 1,
    title: "Second Lead Workflow Shop",
    url: "https://second-lead-workflow.example",
    domain: "second-lead-workflow.example",
    snippet: "Second lead workflow verification fixture.",
    source: "verification"
  };
  secondReport.presences[0] = {
    candidateId: secondCandidateId,
    businessName: "Second Lead Workflow Shop",
    primaryUrl: "https://second-lead-workflow.example",
    domain: "second-lead-workflow.example",
    searchRank: 1,
    presenceType: "owned_website",
    auditEligible: true,
    secondaryUrls: [],
    detectionNotes: ["Owned website fixture for cross-run lead verification."]
  };
  secondReport.findings[0] = {
    id: "second-lead-workflow-finding",
    candidateId: secondCandidateId,
    pageUrl: "https://second-lead-workflow.example",
    pageLabel: "homepage",
    viewport: "desktop",
    issueType: "missing_primary_cta",
    severity: "medium",
    confidence: "confirmed",
    message: "Primary call to action is unclear.",
    reproductionNote: "The fixture records a deterministic CTA gap."
  };
  secondReport.classifications[0] = {
    candidateId: secondCandidateId,
    presenceQuality: "functional",
    opportunityTypes: ["conversion_improvement"],
    confidence: "confirmed",
    rationale: ["Verification fixture should remain trackable across runs."]
  };
  secondReport.businessBreakdowns[0] = {
    candidateId: secondCandidateId,
    businessName: "Second Lead Workflow Shop",
    primaryUrl: "https://second-lead-workflow.example",
    searchRank: 1,
    presenceType: "owned_website",
    presenceQuality: "functional",
    opportunityTypes: ["conversion_improvement"],
    confidence: "confirmed",
    findingCount: 1,
    highSeverityFindings: 0,
    audited: true,
    auditStatus: "audited",
    topIssues: ["missing_primary_cta"],
    secondaryUrls: [],
    detectionNotes: ["Owned website fixture for cross-run lead verification."]
  };
  secondReport.shortlist[0] = {
    candidateId: secondCandidateId,
    businessName: "Second Lead Workflow Shop",
    primaryUrl: "https://second-lead-workflow.example",
    presenceType: "owned_website",
    presenceQuality: "functional",
    opportunityTypes: ["conversion_improvement"],
    confidence: "confirmed",
    priorityScore: 62,
    reasons: ["Primary call to action is unclear."]
  };
  secondReport.summary.qualityBreakdown = {
    none: 0,
    weak: 0,
    functional: 1,
    broken: 0,
    strong: 0
  };
  secondReport.summary.commonIssues = [
    {
      issueType: "missing_primary_cta",
      count: 1
    }
  ];
  secondReport.notes = ["Second lead workflow verification run."];

  return secondReport;
}

try {
  await applyScoutSchema();
  await repository.save(report);
  await repository.save(buildSecondReport());

  const saved = await saveLeadAnnotation({
    runId,
    candidateId,
    state: "saved",
    operatorNote: "Follow up with the owner after reviewing the contact gap.",
    followUpDate: "2026-05-06"
  });

  assert.equal(saved.state, "saved");
  assert.equal(saved.followUpDate, "2026-05-06");

  const annotations = await getLeadAnnotations(runId);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0]?.operatorNote, "Follow up with the owner after reviewing the contact gap.");

  const updated = await saveLeadAnnotation({
    runId,
    candidateId,
    state: "contacted",
    operatorNote: "Called the listed number.",
    followUpDate: null
  });

  assert.equal(updated.state, "contacted");
  assert.equal(updated.followUpDate, undefined);

  await outreachDraftRepository.save({
    runId,
    candidateId,
    businessName: "Lead Workflow Verification Shop",
    primaryUrl: "https://lead-workflow.example",
    tone: "calm",
    length: "standard",
    recommendedChannel: "email",
    contactChannels: [
      {
        kind: "email",
        label: "Email",
        value: "owner@lead-workflow.example",
        score: 80,
        reason: "Verification contact channel."
      }
    ],
    contactRationale: ["Email is the clearest verification channel."],
    subjectLine: "Website contact path",
    body: "I noticed the website contact path may be hard to find and wanted to share a quick note.",
    shortMessage: "Quick note about the website contact path.",
    grounding: ["Contact path is not visible."],
    model: "verification-model"
  });

  const csvExport = await buildLeadExport({
    runId,
    format: "csv"
  });
  assert.match(csvExport.contentType, /text\/csv/);
  assert.match(csvExport.body, /Lead Workflow Verification Shop/);
  assert.match(csvExport.body, /Contacted/);
  assert.match(csvExport.body, /Draft Ready/);

  const markdownExport = await buildLeadExport({
    runId,
    format: "markdown"
  });
  assert.match(markdownExport.contentType, /text\/markdown/);
  assert.match(markdownExport.body, /# Scout Leads:/);
  assert.match(markdownExport.body, /Called the listed number\./);

  await saveLeadAnnotation({
    runId: secondRunId,
    candidateId: secondCandidateId,
    state: "saved",
    operatorNote: "Second lead is due for owner follow-up.",
    followUpDate: "2026-05-01"
  });

  await outreachDraftRepository.save({
    runId: secondRunId,
    candidateId: secondCandidateId,
    businessName: "Second Lead Workflow Shop",
    primaryUrl: "https://second-lead-workflow.example",
    tone: "calm",
    length: "standard",
    recommendedChannel: "contact_form",
    contactChannels: [
      {
        kind: "contact_form",
        label: "Contact Form",
        url: "https://second-lead-workflow.example/contact",
        score: 72,
        reason: "Verification contact form channel."
      }
    ],
    contactRationale: ["Contact form is present in the verification fixture."],
    subjectLine: "",
    body: "",
    grounding: ["Primary call to action is unclear."]
  });

  const contactedInboxItem = await runLeadInboxAction({
    runId: secondRunId,
    candidateId: secondCandidateId,
    action: {
      action: "mark_contacted"
    }
  });

  assert.equal(contactedInboxItem.annotation.state, "contacted");
  assert.equal(contactedInboxItem.outreach.status, "contact_analyzed");
  assert.equal(contactedInboxItem.outreach.nextAction, "Follow up");

  const inboxItems = await listLeadInboxItems(20);
  assert(inboxItems.some((item) => item.runId === runId && item.candidateId === candidateId));
  assert(
    inboxItems.some((item) => item.runId === secondRunId && item.candidateId === secondCandidateId)
  );

  const manualLead = await createManualLead({
    market: "manual lead workflow verification in Winston-Salem, NC",
    businessName: "Operator Entered Verification Shop",
    primaryUrl: "https://operator-entered.example",
    notes: "Known operator-entered lead for manual fallback verification.",
    contactEmail: "owner@operator-entered.example"
  });
  manualRunId = manualLead.runId;
  assert.match(manualLead.runId, /^manual-/);
  assert.match(manualLead.candidateId, /^operator-entered-/);
  assert.equal(manualLead.item?.businessName, "Operator Entered Verification Shop");

  const manualInboxItem = await getLeadInboxItem(manualLead.runId, manualLead.candidateId);
  assert.equal(manualInboxItem?.annotation.state, "needs_review");
  assert.equal(manualInboxItem?.outreach.status, "no_draft");
  assert.equal(manualInboxItem?.provenance, "manual");
  assert.equal(manualInboxItem?.source, "operator-entered");
  assert.match(manualInboxItem?.annotation.operatorNote ?? "", /operator-entered lead/);

  assert.equal(
    inboxItems.find((item) => item.candidateId === candidateId)?.outreach.status,
    "draft_ready"
  );
  assert.equal(
    inboxItems.find((item) => item.candidateId === secondCandidateId)?.outreach.status,
    "contact_analyzed"
  );

  const dueItems = filterLeadInboxItems(inboxItems, {
    filter: "due",
    today: "2026-05-02"
  });
  assert.equal(dueItems.length, 1);
  assert.equal(dueItems[0]?.candidateId, secondCandidateId);

  const searchedItems = filterLeadInboxItems(inboxItems, {
    search: "second lead workflow"
  });
  assert(searchedItems.some((item) => item.candidateId === secondCandidateId));

  const inboxCsvExport = await buildLeadInboxExport({
    format: "csv",
    filters: {
      filter: "due",
      today: "2026-05-02"
    }
  });
  assert.match(inboxCsvExport.contentType, /text\/csv/);
  assert.match(inboxCsvExport.body, /Second Lead Workflow Shop/);
  assert.match(inboxCsvExport.body, /Contact Analyzed/);
  assert.match(inboxCsvExport.body, /Contact Form/);
  assert.match(inboxCsvExport.body, /Follow up/);

  const inboxMarkdownExport = await buildLeadInboxExport({
    format: "markdown",
    filters: {
      search: "second lead workflow",
      today: "2026-05-02"
    }
  });
  assert.match(inboxMarkdownExport.contentType, /text\/markdown/);
  assert.match(inboxMarkdownExport.body, /# Scout Lead Inbox/);
  assert.match(inboxMarkdownExport.body, /Second lead is due for owner follow-up\./);
  assert.match(inboxMarkdownExport.body, /Follow up/);
  assert.match(inboxMarkdownExport.body, /Sample quality/);

  const leadPackMarkdown = await buildLeadPackExport({
    runId,
    candidateId,
    format: "markdown"
  });
  assert.match(leadPackMarkdown.contentType, /text\/markdown/);
  assert.match(leadPackMarkdown.body, /# Scout Lead Pack/);
  assert.match(leadPackMarkdown.body, /Proxy receipt: Missing/);

  const manualLeadPackJson = await buildLeadPackExport({
    runId: manualLead.runId,
    candidateId: manualLead.candidateId,
    format: "json"
  });
  assert.match(manualLeadPackJson.contentType, /application\/json/);
  assert.match(manualLeadPackJson.body, /operator-entered/);

  const readiness = await buildOperatorReadinessReport();
  assert(readiness.checks.some((check) => check.id === "database"));
  assert(readiness.checks.some((check) => check.id === "worker"));
  assert(readiness.checks.some((check) => check.id === "evidence"));

  const bulkFollowUpItems = await runLeadInboxBulkAction({
    items: [
      {
        runId,
        candidateId
      },
      {
        runId: secondRunId,
        candidateId: secondCandidateId
      }
    ],
    action: {
      action: "set_follow_up",
      followUpDate: "2026-05-09"
    }
  });
  assert.equal(bulkFollowUpItems.length, 2);
  assert(
    bulkFollowUpItems.every((item) => item.annotation.followUpDate === "2026-05-09")
  );

  const bulkDismissedItems = await runLeadInboxBulkAction({
    items: [
      {
        runId,
        candidateId
      }
    ],
    action: {
      action: "dismiss"
    }
  });
  assert.equal(bulkDismissedItems[0]?.annotation.state, "dismissed");
  assert.equal(bulkDismissedItems[0]?.annotation.followUpDate, undefined);

  console.log("Lead workflow verification passed.");
} finally {
  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = ${runId} or run_id = ${secondRunId}`;
  if (manualRunId) {
    await sql`delete from scout_runs where run_id = ${manualRunId}`;
  }
  await closeScoutSchemaClient();
}
