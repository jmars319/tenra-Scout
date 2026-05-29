import {
  acquisitionAttemptOutcomes,
  acquisitionFallbackTriggerReasons,
  acquisitionSourceKinds,
  auditIssueTypes,
  candidateProvenanceKinds,
  confidenceLevels,
  findingSeverities,
  leadOutreachStatuses,
  leadStatuses,
  marketSampleQualities,
  runExecutionStages,
  outreachChannelKinds,
  outreachLengths,
  outreachTones,
  opportunityTypes,
  presenceQualities,
  presenceTypes,
  runStatuses,
  viewportKinds
} from "@scout/domain";
import { z } from "zod";

export const scoutQueryInputSchema = z.object({
  rawQuery: z.string().trim().min(3).max(180)
});

export const resolvedMarketIntentSchema = z.object({
  originalQuery: z.string(),
  normalizedQuery: z.string(),
  marketTerm: z.string(),
  categories: z.array(z.string()).min(1),
  locationLabel: z.string().optional(),
  locationCity: z.string().optional(),
  locationRegion: z.string().optional(),
  searchQuery: z.string()
});

export const scoutRunInputSchema = scoutQueryInputSchema;

export const searchCandidateSchema = z.object({
  candidateId: z.string(),
  rank: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  domain: z.string(),
  snippet: z.string(),
  source: z.string(),
  provenance: z.enum(candidateProvenanceKinds).optional(),
  provenanceNote: z.string().optional(),
  extractedFromCandidateId: z.string().optional()
});

export const acquisitionQueryVariantSchema = z.object({
  label: z.string(),
  query: z.string(),
  source: z.string(),
  rawResultCount: z.number().int().nonnegative(),
  acceptedResultCount: z.number().int().nonnegative()
});

export const acquisitionProviderAttemptSchema = z.object({
  provider: z.string(),
  kind: z.enum(acquisitionSourceKinds),
  variantLabel: z.string(),
  query: z.string(),
  outcome: z.enum(acquisitionAttemptOutcomes),
  rawResultCount: z.number().int().nonnegative(),
  httpStatus: z.number().int().positive().optional(),
  detail: z.string().optional()
});

export const acquisitionSourceCountSchema = z.object({
  source: z.string(),
  kind: z.enum(acquisitionSourceKinds),
  rawCandidateCount: z.number().int().nonnegative(),
  selectedCandidateCount: z.number().int().nonnegative()
});

export const acquisitionFallbackTriggerSchema = z.object({
  reason: z.enum(acquisitionFallbackTriggerReasons),
  provider: z.string().optional(),
  detail: z.string().optional()
});

export const acquisitionDuplicateRecordSchema = z.object({
  keptCandidateId: z.string(),
  duplicateCandidateId: z.string(),
  reason: z.string()
});

export const acquisitionDiscardRecordSchema = z.object({
  candidateId: z.string(),
  reason: z.string(),
  title: z.string().optional(),
  url: z.url().optional(),
  domain: z.string().optional(),
  snippet: z.string().optional(),
  source: z.string().optional()
});

export const acquisitionDiagnosticsSchema = z.object({
  provider: z.string(),
  fallbackUsed: z.boolean(),
  rawCandidateCount: z.number().int().nonnegative(),
  selectedCandidateCount: z.number().int().nonnegative(),
  liveCandidateCount: z.number().int().nonnegative(),
  fallbackCandidateCount: z.number().int().nonnegative(),
  mergedDuplicateCount: z.number().int().nonnegative(),
  discardedCandidateCount: z.number().int().nonnegative(),
  sampleQuality: z.enum(marketSampleQualities),
  queryVariants: z.array(acquisitionQueryVariantSchema),
  providerAttempts: z.array(acquisitionProviderAttemptSchema).default([]),
  candidateSources: z.array(acquisitionSourceCountSchema).default([]),
  fallbackTriggers: z.array(acquisitionFallbackTriggerSchema).default([]),
  mergedDuplicates: z.array(acquisitionDuplicateRecordSchema),
  discardedCandidates: z.array(acquisitionDiscardRecordSchema),
  notes: z.array(z.string())
});

export const presenceRecordSchema = z.object({
  candidateId: z.string(),
  businessName: z.string(),
  primaryUrl: z.url(),
  domain: z.string(),
  searchRank: z.number().int().positive(),
  presenceType: z.enum(presenceTypes),
  auditEligible: z.boolean(),
  secondaryUrls: z.array(z.url()),
  detectionNotes: z.array(z.string())
});

export const auditFindingSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  pageUrl: z.url(),
  pageLabel: z.enum(["homepage", "secondary"]),
  viewport: z.enum(viewportKinds),
  issueType: z.enum(auditIssueTypes),
  severity: z.enum(findingSeverities),
  confidence: z.enum(confidenceLevels),
  message: z.string(),
  reproductionNote: z.string(),
  screenshotUrl: z.string().optional(),
  screenshotPath: z.string().optional(),
  ruleId: z.string().optional()
});

export const businessClassificationSchema = z.object({
  candidateId: z.string(),
  presenceQuality: z.enum(presenceQualities),
  opportunityTypes: z.array(z.enum(opportunityTypes)),
  confidence: z.enum(confidenceLevels),
  rationale: z.array(z.string())
});

export const leadOpportunitySchema = z.object({
  candidateId: z.string(),
  businessName: z.string(),
  primaryUrl: z.url(),
  presenceType: z.enum(presenceTypes),
  presenceQuality: z.enum(presenceQualities),
  opportunityTypes: z.array(z.enum(opportunityTypes)),
  confidence: z.enum(confidenceLevels),
  priorityScore: z.number(),
  reasons: z.array(z.string())
});

export const followUpDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a follow-up date in YYYY-MM-DD format.");

export const leadAnnotationSchema = z.object({
  runId: z.string(),
  candidateId: z.string(),
  state: z.enum(leadStatuses),
  operatorNote: z.string(),
  followUpDate: followUpDateSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const leadOutreachSummarySchema = z.object({
  status: z.enum(leadOutreachStatuses),
  nextAction: z.string(),
  draftId: z.string().optional(),
  recommendedChannel: z.enum(outreachChannelKinds).optional(),
  recommendedChannelLabel: z.string().optional(),
  subjectLine: z.string().optional(),
  draftUpdatedAt: z.iso.datetime().optional()
});

export const scoutProxyHandoffReceiptSchema = z.object({
  responseStatus: z.number().int().positive(),
  validationResult: z.enum(["valid", "invalid", "unknown"]),
  validationValid: z.boolean().optional(),
  guardrailRecommended: z.boolean().optional(),
  traceId: z.string().min(1),
  endpoint: z.string().min(1),
  shapedOutputPreview: z.string().optional()
});

export const scoutHandoffHistoryEntrySchema = z.object({
  exportedAt: z.iso.datetime(),
  candidateId: z.string().min(1),
  target: z.enum(["assembly", "proxy", "guardrail"]),
  mode: z.enum(["download", "direct-post", "json-fallback", "decision-return"]),
  endpoint: z.string().optional(),
  traceId: z.string().min(1),
  status: z.enum(["ok", "failed"]),
  message: z.string().optional(),
  proxyReceipt: scoutProxyHandoffReceiptSchema.optional()
});

export const leadInboxItemSchema = z.object({
  runId: z.string(),
  runCreatedAt: z.iso.datetime(),
  runUpdatedAt: z.iso.datetime(),
  rawQuery: z.string(),
  marketTerm: z.string(),
  locationLabel: z.string().optional(),
  sampleQuality: z.enum(marketSampleQualities).optional(),
  candidateId: z.string(),
  businessName: z.string(),
  primaryUrl: z.string(),
  shortlistRank: z.number().int().positive().optional(),
  priorityScore: z.number().optional(),
  presenceType: z.enum(presenceTypes).optional(),
  presenceQuality: z.enum(presenceQualities).optional(),
  confidence: z.enum(confidenceLevels).optional(),
  opportunityTypes: z.array(z.enum(opportunityTypes)),
  findingCount: z.number().int().nonnegative(),
  highSeverityFindings: z.number().int().nonnegative(),
  topIssues: z.array(z.enum(auditIssueTypes)),
  reasons: z.array(z.string()),
  handoffHistory: z.array(scoutHandoffHistoryEntrySchema).default([]),
  outreach: leadOutreachSummarySchema,
  annotation: leadAnnotationSchema
});

export const businessBreakdownSchema = z.object({
  candidateId: z.string(),
  businessName: z.string(),
  primaryUrl: z.url(),
  searchRank: z.number().int().positive(),
  presenceType: z.enum(presenceTypes),
  presenceQuality: z.enum(presenceQualities),
  opportunityTypes: z.array(z.enum(opportunityTypes)),
  confidence: z.enum(confidenceLevels),
  findingCount: z.number().int().nonnegative(),
  highSeverityFindings: z.number().int().nonnegative(),
  audited: z.boolean(),
  auditStatus: z.enum(["audited", "skipped"]),
  topIssues: z.array(z.enum(auditIssueTypes)),
  secondaryUrls: z.array(z.url()),
  detectionNotes: z.array(z.string())
});

export const scoutRunSummarySchema = z.object({
  totalCandidates: z.number().int().nonnegative(),
  auditedPresences: z.number().int().nonnegative(),
  skippedPresences: z.number().int().nonnegative(),
  sampleQuality: z.enum(marketSampleQualities),
  presenceBreakdown: z.record(z.enum(presenceTypes), z.number().int().nonnegative()),
  qualityBreakdown: z.record(z.enum(presenceQualities), z.number().int().nonnegative()),
  commonIssues: z.array(
    z.object({
      issueType: z.enum(auditIssueTypes),
      count: z.number().int().positive()
    })
  )
});

export const scoutRunReportSchema = z.object({
  schemaVersion: z.literal(2),
  runId: z.string(),
  status: z.enum(["completed", "failed"]),
  createdAt: z.iso.datetime(),
  query: scoutQueryInputSchema,
  intent: resolvedMarketIntentSchema,
  acquisition: acquisitionDiagnosticsSchema,
  searchSource: z.string(),
  candidates: z.array(searchCandidateSchema),
  presences: z.array(presenceRecordSchema),
  findings: z.array(auditFindingSchema),
  classifications: z.array(businessClassificationSchema),
  businessBreakdowns: z.array(businessBreakdownSchema),
  shortlist: z.array(leadOpportunitySchema),
  summary: scoutRunSummarySchema,
  notes: z.array(z.string()),
  errorMessage: z.string().optional()
});

export const outreachDraftSchema = z.object({
  draftId: z.string(),
  runId: z.string(),
  candidateId: z.string(),
  businessName: z.string(),
  primaryUrl: z.url(),
  tone: z.enum(outreachTones),
  length: z.enum(outreachLengths),
  recommendedChannel: z.enum(outreachChannelKinds).optional(),
  contactChannels: z.array(
    z.object({
      kind: z.enum(outreachChannelKinds),
      label: z.string(),
      value: z.string().optional(),
      url: z.string().optional(),
      score: z.number().int().nonnegative(),
      reason: z.string()
    })
  ),
  contactRationale: z.array(z.string()),
  subjectLine: z.string(),
  body: z.string(),
  shortMessage: z.string().optional(),
  phoneTalkingPoints: z
    .object({
      opener: z.string(),
      keyPoints: z.array(z.string()),
      close: z.string()
    })
    .optional(),
  grounding: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  model: z.string().optional()
});

export const outreachProfileSchema = z.object({
  profileId: z.string(),
  senderName: z.string().trim().max(120),
  companyName: z.string().trim().max(120),
  roleTitle: z.string().trim().max(120),
  serviceLine: z.string().trim().max(160),
  serviceSummary: z.string().trim().max(1200),
  defaultCallToAction: z.string().trim().max(400),
  contactEmail: z.string().trim().max(160),
  contactPhone: z.string().trim().max(80),
  websiteUrl: z.string().trim().max(240),
  schedulerUrl: z.string().trim().max(240),
  toneNotes: z.string().trim().max(700),
  avoidPhrases: z.array(z.string().trim().max(120)).max(20),
  signature: z.string().trim().max(500),
  updatedAt: z.iso.datetime().optional()
});

export const persistenceMetadataSchema = z.object({
  runStorage: z.literal("postgres"),
  evidenceStorage: z.literal("local"),
  importedFromLegacyLocal: z.boolean(),
  importSourcePath: z.string().optional(),
  importedAt: z.iso.datetime().optional(),
  handoffHistory: z.array(scoutHandoffHistoryEntrySchema).default([])
});

export const runExecutionSchema = z.object({
  queuedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  heartbeatAt: z.iso.datetime().optional(),
  attemptCount: z.number().int().nonnegative(),
  stage: z.enum(runExecutionStages).optional(),
  workerId: z.string().optional(),
  workerNote: z.string().optional(),
  lastErrorMessage: z.string().optional()
});

export const persistedRunBusinessResultsSchema = z.object({
  presences: z.array(presenceRecordSchema),
  findings: z.array(auditFindingSchema),
  classifications: z.array(businessClassificationSchema),
  businessBreakdowns: z.array(businessBreakdownSchema),
  summary: scoutRunSummarySchema
});

export const persistedRunRecordSchema = z.object({
  schemaVersion: z.literal(3),
  runId: z.string(),
  status: z.enum(runStatuses),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  input: scoutQueryInputSchema,
  intent: resolvedMarketIntentSchema,
  acquisition: acquisitionDiagnosticsSchema.nullable(),
  selectedCandidates: z.array(searchCandidateSchema),
  businessResults: persistedRunBusinessResultsSchema.nullable(),
  shortlist: z.array(leadOpportunitySchema),
  notes: z.array(z.string()),
  errorMessage: z.string().optional(),
  execution: runExecutionSchema,
  persistence: persistenceMetadataSchema
});
