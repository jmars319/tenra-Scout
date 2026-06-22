import {
  buildBusinessBreakdowns,
  buildRunSummary,
  createEmptyAcquisitionDiagnostics,
  type ScoutQueryInput,
  type ScoutRunReport
} from "@scout/domain";
import {
  acquisitionDiagnosticsSchema,
  leadOpportunitySchema,
  persistedRunBusinessResultsSchema,
  persistedRunRecordSchema,
  resolvedMarketIntentSchema,
  scoutQueryInputSchema,
  searchCandidateSchema
} from "@scout/validation";
import { z } from "zod";

export type PersistedRunRecord = z.infer<typeof persistedRunRecordSchema>;

/* Legacy schema contract */

const legacyPersistedRunRecordSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  runId: z.string(),
  status: z.enum(["completed", "failed"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  input: scoutQueryInputSchema,
  intent: resolvedMarketIntentSchema,
  acquisition: acquisitionDiagnosticsSchema,
  selectedCandidates: z.array(searchCandidateSchema),
  businessResults: persistedRunBusinessResultsSchema,
  shortlist: z.array(leadOpportunitySchema),
  notes: z.array(z.string()),
  errorMessage: z.string().optional()
});

export interface PersistenceMetadataInput {
  importedFromLegacyLocal?: boolean;
  importSourcePath?: string;
  importedAt?: string;
  handoffHistory?: PersistedRunRecord["persistence"]["handoffHistory"];
}

export interface RunExecutionInput {
  queuedAt: string;
  attemptCount: number;
  startedAt?: string;
  finishedAt?: string;
  heartbeatAt?: string;
  stage?: PersistedRunRecord["execution"]["stage"];
  workerId?: string;
  workerNote?: string;
  lastErrorMessage?: string;
}

export interface QueuedRunRecordInput {
  runId: string;
  createdAt: string;
  input: ScoutQueryInput;
  intent: ScoutRunReport["intent"];
  persistence?: PersistenceMetadataInput;
}

export interface PersistedRunRecordOptions {
  execution?: RunExecutionInput;
  persistence?: PersistenceMetadataInput;
}

/* Metadata normalization boundary */

function createPersistenceMetadata(
  input: PersistenceMetadataInput = {}
): PersistedRunRecord["persistence"] {
  const metadata: PersistedRunRecord["persistence"] = {
    runStorage: "postgres",
    evidenceStorage: "local",
    importedFromLegacyLocal: input.importedFromLegacyLocal ?? false,
    handoffHistory: input.handoffHistory ?? []
  };

  if (input.importSourcePath) {
    metadata.importSourcePath = input.importSourcePath;
  }

  if (input.importedAt) {
    metadata.importedAt = input.importedAt;
  }

  return metadata;
}

function createExecutionMetadata(input: RunExecutionInput): PersistedRunRecord["execution"] {
  return {
    queuedAt: input.queuedAt,
    attemptCount: input.attemptCount,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.heartbeatAt ? { heartbeatAt: input.heartbeatAt } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.workerId ? { workerId: input.workerId } : {}),
    ...(input.workerNote ? { workerNote: input.workerNote } : {}),
    ...(input.lastErrorMessage ? { lastErrorMessage: input.lastErrorMessage } : {})
  };
}

function buildEmptyBusinessResults(
  sampleQuality: ScoutRunReport["summary"]["sampleQuality"]
): NonNullable<PersistedRunRecord["businessResults"]> {
  return {
    presences: [],
    findings: [],
    classifications: [],
    businessBreakdowns: [],
    summary: buildRunSummary([], [], [], sampleQuality, new Set())
  };
}

function resolveSearchSource(record: PersistedRunRecord): string {
  if (!record.acquisition) {
    return "unresolved";
  }

  const selectedSources = [
    ...new Set(
      record.acquisition.candidateSources
        .filter((source) => source.selectedCandidateCount > 0)
        .map((source) => source.source)
    )
  ];

  if (selectedSources.length > 0) {
    return selectedSources.join(" + ");
  }

  if (record.acquisition.provider === "seeded_stub") {
    return "seeded_stub";
  }

  return record.acquisition.fallbackUsed
    ? `${record.acquisition.provider} + seeded_stub`
    : record.acquisition.provider;
}

/* Report normalization boundary */

export function normalizePersistedIntent(
  intent: PersistedRunRecord["intent"]
): ScoutRunReport["intent"] {
  return {
    originalQuery: intent.originalQuery,
    normalizedQuery: intent.normalizedQuery,
    marketTerm: intent.marketTerm,
    categories: intent.categories,
    searchQuery: intent.searchQuery,
    ...(intent.locationLabel ? { locationLabel: intent.locationLabel } : {}),
    ...(intent.locationCity ? { locationCity: intent.locationCity } : {}),
    ...(intent.locationRegion ? { locationRegion: intent.locationRegion } : {})
  };
}

function normalizeFindings(
  findings: NonNullable<PersistedRunRecord["businessResults"]>["findings"]
): ScoutRunReport["findings"] {
  return findings.map((finding) => ({
    id: finding.id,
    candidateId: finding.candidateId,
    pageUrl: finding.pageUrl,
    pageLabel: finding.pageLabel,
    viewport: finding.viewport,
    issueType: finding.issueType,
    severity: finding.severity,
    confidence: finding.confidence,
    message: finding.message,
    reproductionNote: finding.reproductionNote,
    ...(finding.screenshotUrl ? { screenshotUrl: finding.screenshotUrl } : {}),
    ...(finding.screenshotPath ? { screenshotPath: finding.screenshotPath } : {}),
    ...(finding.ruleId ? { ruleId: finding.ruleId } : {})
  }));
}

function normalizeLegacyIssueType(
  finding: Pick<ScoutRunReport["findings"][number], "issueType" | "viewport">
): ScoutRunReport["findings"][number]["issueType"] {
  if (
    finding.issueType === "console_error" ||
    finding.issueType === "failed_request" ||
    finding.issueType === "broken_navigation" ||
    finding.issueType === "missing_contact_path" ||
    finding.issueType === "missing_primary_cta" ||
    finding.issueType === "accessibility_issue" ||
    finding.issueType === "mobile_layout_issue" ||
    finding.issueType === "tap_target_issue" ||
    finding.issueType === "blocked_content" ||
    finding.issueType === "dead_page" ||
    finding.issueType === "weak_trust_signal"
  ) {
    return finding.issueType;
  }

  if (finding.issueType === "layout") {
    return finding.viewport === "mobile" ? "mobile_layout_issue" : "weak_trust_signal";
  }

  return "weak_trust_signal";
}

function normalizeLegacyFinding(
  finding: ScoutRunReport["findings"][number]
): ScoutRunReport["findings"][number] {
  return {
    id: finding.id,
    candidateId: finding.candidateId,
    pageUrl: finding.pageUrl,
    pageLabel: finding.pageLabel,
    viewport: finding.viewport,
    issueType: normalizeLegacyIssueType(finding),
    severity: finding.severity,
    confidence: finding.confidence,
    message: finding.message,
    reproductionNote: finding.reproductionNote,
    ...(finding.screenshotUrl ? { screenshotUrl: finding.screenshotUrl } : {}),
    ...(finding.screenshotPath ? { screenshotPath: finding.screenshotPath } : {}),
    ...(finding.ruleId ? { ruleId: finding.ruleId } : {})
  };
}

/* Record creation boundary */

export function createQueuedPersistedRunRecord(
  input: QueuedRunRecordInput
): PersistedRunRecord {
  return {
    schemaVersion: 3,
    runId: input.runId,
    status: "queued",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    input: input.input,
    intent: input.intent,
    acquisition: null,
    selectedCandidates: [],
    businessResults: null,
    shortlist: [],
    notes: [],
    execution: createExecutionMetadata({
      queuedAt: input.createdAt,
      heartbeatAt: input.createdAt,
      attemptCount: 0,
      stage: "queued",
      workerNote: "Run stored and waiting for a worker."
    }),
    persistence: createPersistenceMetadata(input.persistence)
  };
}

export function createPersistedRunRecord(
  report: ScoutRunReport,
  options: PersistedRunRecordOptions = {}
): PersistedRunRecord {
  const updatedAt = options.execution?.finishedAt ?? new Date().toISOString();
  const execution = createExecutionMetadata({
    queuedAt: options.execution?.queuedAt ?? report.createdAt,
    attemptCount: options.execution?.attemptCount ?? 1,
    ...(options.execution?.startedAt ? { startedAt: options.execution.startedAt } : { startedAt: report.createdAt }),
    finishedAt: updatedAt,
    heartbeatAt: options.execution?.heartbeatAt ?? updatedAt,
    stage: report.status === "completed" ? "completed" : "failed",
    ...(options.execution?.workerId ? { workerId: options.execution.workerId } : {}),
    workerNote:
      report.status === "completed"
        ? "Run completed and report saved."
        : report.errorMessage ?? options.execution?.workerNote ?? "Scout run failed.",
    ...(report.errorMessage || options.execution?.lastErrorMessage
      ? { lastErrorMessage: report.errorMessage ?? options.execution?.lastErrorMessage ?? "Scout run failed." }
      : {})
  });
  const record: PersistedRunRecord = {
    schemaVersion: 3,
    runId: report.runId,
    status: report.status,
    createdAt: report.createdAt,
    updatedAt,
    input: report.query,
    intent: report.intent,
    acquisition: report.acquisition,
    selectedCandidates: report.candidates,
    businessResults: {
      presences: report.presences,
      findings: report.findings,
      classifications: report.classifications,
      businessBreakdowns: report.businessBreakdowns,
      summary: report.summary
    },
    shortlist: report.shortlist,
    notes: report.notes,
    execution,
    persistence: createPersistenceMetadata(options.persistence)
  };

  if (report.errorMessage) {
    record.errorMessage = report.errorMessage;
  }

  return record;
}

export function toScoutRunReport(record: PersistedRunRecord): ScoutRunReport | null {
  if (record.status !== "completed" && record.status !== "failed") {
    return null;
  }

  const acquisition = record.acquisition ?? createEmptyAcquisitionDiagnostics("unresolved");
  const businessResults =
    record.businessResults ?? buildEmptyBusinessResults(acquisition.sampleQuality);

  const report: ScoutRunReport = {
    schemaVersion: 2,
    runId: record.runId,
    status: record.status,
    createdAt: record.createdAt,
    query: record.input,
    intent: normalizePersistedIntent(record.intent),
    acquisition,
    searchSource: resolveSearchSource(record),
    candidates: record.selectedCandidates,
    presences: businessResults.presences,
    findings: normalizeFindings(businessResults.findings),
    classifications: businessResults.classifications,
    businessBreakdowns: businessResults.businessBreakdowns,
    shortlist: record.shortlist,
    summary: businessResults.summary,
    notes: record.notes
  };

  if (record.errorMessage) {
    report.errorMessage = record.errorMessage;
  }

  return report;
}

/* Legacy upgrade boundary */

function upgradeLegacyV2Record(
  value: z.infer<typeof legacyPersistedRunRecordSchemaV2>,
  sourcePath?: string
): PersistedRunRecord {
  const record: PersistedRunRecord = {
    schemaVersion: 3,
    runId: value.runId,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    input: value.input,
    intent: value.intent,
    acquisition: value.acquisition,
    selectedCandidates: value.selectedCandidates,
    businessResults: value.businessResults,
    shortlist: value.shortlist,
    notes: value.notes,
    execution: createExecutionMetadata({
      queuedAt: value.createdAt,
      startedAt: value.createdAt,
      finishedAt: value.updatedAt,
      heartbeatAt: value.updatedAt,
      attemptCount: 1,
      stage: value.status === "completed" ? "completed" : "failed",
      workerNote:
        value.status === "completed"
          ? "Run completed and report saved."
          : value.errorMessage ?? "Scout run failed.",
      ...(value.errorMessage ? { lastErrorMessage: value.errorMessage } : {})
    }),
    persistence: createPersistenceMetadata({
      importedFromLegacyLocal: true,
      ...(sourcePath ? { importSourcePath: sourcePath } : {}),
      importedAt: new Date().toISOString()
    })
  };

  if (value.errorMessage) {
    record.errorMessage = value.errorMessage;
  }

  return record;
}

type LegacyReportPayload = Partial<ScoutRunReport> & {
  runId?: string;
  status?: ScoutRunReport["status"];
  createdAt?: string;
  query?: ScoutRunReport["query"];
  intent?: ScoutRunReport["intent"];
  searchSource?: string;
  candidates?: ScoutRunReport["candidates"];
  presences?: ScoutRunReport["presences"];
  findings?: ScoutRunReport["findings"];
  classifications?: ScoutRunReport["classifications"];
  businessBreakdowns?: ScoutRunReport["businessBreakdowns"];
  shortlist?: ScoutRunReport["shortlist"];
  summary?: Partial<ScoutRunReport["summary"]>;
  notes?: ScoutRunReport["notes"];
  errorMessage?: string;
};

function upgradeLegacyReportPayload(
  reportPayload: LegacyReportPayload | null | undefined,
  sourcePath?: string
): PersistedRunRecord | null {
  if (
    !reportPayload?.runId ||
    !reportPayload.createdAt ||
    !reportPayload.query ||
    !reportPayload.intent
  ) {
    return null;
  }

  const provider = (reportPayload.searchSource ?? "legacy_record").replace(" + seeded_stub", "");
  const acquisition = createEmptyAcquisitionDiagnostics(provider);
  acquisition.fallbackUsed = (reportPayload.searchSource ?? "").includes("seeded_stub");
  acquisition.selectedCandidateCount = reportPayload.candidates?.length ?? 0;
  acquisition.liveCandidateCount = acquisition.fallbackUsed ? 0 : acquisition.selectedCandidateCount;
  acquisition.fallbackCandidateCount = acquisition.fallbackUsed
    ? acquisition.selectedCandidateCount
    : 0;
  acquisition.sampleQuality = "partial_sample";
  acquisition.notes = [
    "This run was saved before acquisition diagnostics were added. Treat market coverage as legacy/unknown."
  ];

  const presences = reportPayload.presences ?? [];
  const normalizedFindings = (reportPayload.findings ?? []).map(normalizeLegacyFinding);
  const classifications = reportPayload.classifications ?? [];
  const auditedCandidateIds = new Set(
    presences.filter((presence) => presence.auditEligible).map((presence) => presence.candidateId)
  );
  const businessBreakdowns = buildBusinessBreakdowns(
    presences,
    classifications,
    normalizedFindings,
    auditedCandidateIds
  );
  const summary = buildRunSummary(
    presences,
    classifications,
    normalizedFindings,
    "partial_sample",
    auditedCandidateIds
  );

  const upgradedReport: ScoutRunReport = {
    schemaVersion: 2,
    runId: reportPayload.runId,
    status: reportPayload.status ?? "completed",
    createdAt: reportPayload.createdAt,
    query: reportPayload.query,
    intent: reportPayload.intent,
    acquisition,
    searchSource: reportPayload.searchSource ?? provider,
    candidates: reportPayload.candidates ?? [],
    presences,
    findings: normalizedFindings,
    classifications,
    businessBreakdowns,
    shortlist: reportPayload.shortlist ?? [],
    summary,
    notes: reportPayload.notes ?? []
  };

  if (reportPayload.errorMessage) {
    upgradedReport.errorMessage = reportPayload.errorMessage;
  }

  return createPersistedRunRecord(upgradedReport, {
    execution: {
      queuedAt: reportPayload.createdAt,
      startedAt: reportPayload.createdAt,
      finishedAt: reportPayload.createdAt,
      heartbeatAt: reportPayload.createdAt,
      attemptCount: 1,
      stage: (reportPayload.status ?? "completed") === "completed" ? "completed" : "failed",
      workerNote:
        (reportPayload.status ?? "completed") === "completed"
          ? "Run completed and report saved."
          : reportPayload.errorMessage ?? "Scout run failed.",
      ...(reportPayload.errorMessage ? { lastErrorMessage: reportPayload.errorMessage } : {})
    },
    persistence: {
      importedFromLegacyLocal: true,
      handoffHistory: [],
      ...(sourcePath ? { importSourcePath: sourcePath } : {}),
      importedAt: new Date().toISOString()
    }
  });
}

export function upgradeLegacyLocalRecord(
  value: unknown,
  sourcePath?: string
): PersistedRunRecord | null {
  const persistedRecord = persistedRunRecordSchema.safeParse(value);
  if (persistedRecord.success) {
    return persistedRecord.data;
  }

  const legacyV2Record = legacyPersistedRunRecordSchemaV2.safeParse(value);
  if (legacyV2Record.success) {
    return upgradeLegacyV2Record(legacyV2Record.data, sourcePath);
  }

  const legacyReportPayload = upgradeLegacyReportPayload(
    value as LegacyReportPayload,
    sourcePath
  );

  if (legacyReportPayload) {
    return legacyReportPayload;
  }

  if (!value || typeof value !== "object" || !("report" in value)) {
    return null;
  }

  const wrapped = value as {
    report?: LegacyReportPayload;
  };

  return wrapped.report ? upgradeLegacyReportPayload(wrapped.report, sourcePath) : null;
}
