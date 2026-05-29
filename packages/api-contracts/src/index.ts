import {
  leadAnnotationSchema,
  leadInboxItemSchema,
  outreachDraftSchema,
  outreachProfileSchema,
  scoutQueryInputSchema,
  scoutRunReportSchema
} from "@scout/validation";
import { z } from "zod";

type ScoutRunReport = z.infer<typeof scoutRunReportSchema>;

const leadStatuses = ["needs_review", "saved", "contacted", "dismissed", "not_a_fit"] as const;
const outreachTones = ["calm", "direct", "friendly"] as const;
const outreachLengths = ["brief", "standard"] as const;

export const createScoutRunRequestSchema = scoutQueryInputSchema;

export const createScoutRunResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  report: scoutRunReportSchema.optional(),
  errorMessage: z.string().optional()
});

export const getScoutRunResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "not_found"]),
  report: scoutRunReportSchema.optional(),
  errorMessage: z.string().optional()
});

export const runControlActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel")
  }),
  z.object({
    action: z.literal("retry")
  }),
  z.object({
    action: z.literal("rerun")
  }),
  z.object({
    action: z.literal("cleanup_stale")
  })
]);

export const runControlActionResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "not_found"]),
  newRunId: z.string().optional(),
  requeuedCount: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional()
});

export const updateLeadAnnotationRequestSchema = z.object({
  state: z.enum(leadStatuses),
  operatorNote: z.string().trim().max(1600).default(""),
  followUpDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional()
});

export const listLeadAnnotationsResponseSchema = z.object({
  runId: z.string(),
  annotations: z.array(leadAnnotationSchema),
  errorMessage: z.string().optional()
});

export const leadAnnotationResponseSchema = z.object({
  runId: z.string(),
  annotation: leadAnnotationSchema.optional(),
  errorMessage: z.string().optional()
});

export const listLeadInboxResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  items: z.array(leadInboxItemSchema),
  errorMessage: z.string().optional()
});

export const leadInboxItemResponseSchema = z.object({
  item: leadInboxItemSchema.optional(),
  errorMessage: z.string().optional()
});

export const createManualLeadRequestSchema = z
  .object({
    runId: z.string().trim().min(1).optional(),
    market: z.string().trim().max(180).optional(),
    query: z.string().trim().max(220).optional(),
    businessName: z.string().trim().min(2).max(140),
    primaryUrl: z.string().trim().min(4).max(400),
    notes: z.string().trim().max(1600).default(""),
    contactName: z.string().trim().max(120).optional(),
    contactEmail: z.string().trim().email().optional(),
    contactPhone: z.string().trim().max(80).optional()
  })
  .refine((value) => Boolean(value.runId || value.market || value.query), {
    message: "Provide an existing runId or a market/query for a manual run."
  });

export const createManualLeadResponseSchema = z.object({
  runId: z.string(),
  candidateId: z.string(),
  item: leadInboxItemSchema.optional(),
  errorMessage: z.string().optional()
});

const leadInboxActionTargetSchema = z.object({
  runId: z.string().min(1),
  candidateId: z.string().min(1)
});

export const leadInboxActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("analyze_contact")
  }),
  z.object({
    action: z.literal("generate_draft"),
    tone: z.enum(outreachTones).optional(),
    length: z.enum(outreachLengths).optional()
  }),
  z.object({
    action: z.literal("mark_contacted"),
    followUpDate: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
      .optional()
  })
]);

export const leadInboxBulkActionRequestSchema = z.object({
  items: z.array(leadInboxActionTargetSchema).min(1).max(100),
  action: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("mark_contacted"),
      followUpDate: z
        .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
        .optional()
    }),
    z.object({
      action: z.literal("dismiss")
    }),
    z.object({
      action: z.literal("mark_not_a_fit")
    }),
    z.object({
      action: z.literal("set_follow_up"),
      followUpDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    })
  ])
});

export const leadInboxBulkActionResponseSchema = z.object({
  items: z.array(leadInboxItemSchema).default([]),
  errorMessage: z.string().optional()
});

export const createOutreachDraftRequestSchema = z.object({
  candidateId: z.string(),
  tone: z.enum(outreachTones).optional(),
  length: z.enum(outreachLengths).optional()
});

export const updateOutreachDraftRequestSchema = z.object({
  tone: z.enum(outreachTones),
  length: z.enum(outreachLengths),
  subjectLine: z.string().trim().max(180),
  body: z.string().trim().max(5000),
  shortMessage: z.string().trim().max(1200).optional(),
  phoneTalkingPoints: z
    .object({
      opener: z.string().trim().max(400),
      keyPoints: z.array(z.string().trim().max(280)).max(6),
      close: z.string().trim().max(320)
    })
    .optional()
});

export const listOutreachDraftsResponseSchema = z.object({
  runId: z.string(),
  aiAvailable: z.boolean(),
  defaultTone: z.enum(outreachTones),
  defaultLength: z.enum(outreachLengths),
  model: z.string().optional(),
  drafts: z.array(outreachDraftSchema),
  errorMessage: z.string().optional()
});

export const outreachDraftResponseSchema = z.object({
  runId: z.string(),
  aiAvailable: z.boolean(),
  defaultTone: z.enum(outreachTones),
  defaultLength: z.enum(outreachLengths),
  model: z.string().optional(),
  draft: outreachDraftSchema.optional(),
  errorMessage: z.string().optional()
});

export const updateOutreachProfileRequestSchema = outreachProfileSchema.omit({
  profileId: true,
  updatedAt: true
});

export const outreachProfileResponseSchema = z.object({
  profile: outreachProfileSchema.optional(),
  errorMessage: z.string().optional()
});

export const scoutOpportunityHandoffSchema = z.object({
  schema: z.literal("tenra-scout.opportunity-handoff.v1"),
  exportedAt: z.iso.datetime(),
  sourceApp: z.literal("scout"),
  runId: z.string().min(1),
  candidateId: z.string().min(1),
  businessName: z.string().trim().min(1),
  primaryUrl: z.string().url(),
  evidenceMarkdown: z.string().trim().min(1),
  recommendedNextApps: z.array(z.enum(["assembly", "proxy"])).min(1),
  proxyShapeRequest: z.object({
    clientApp: z.literal("scout"),
    surface: z.enum(["email", "operator-brief", "report"]),
    profileId: z.string().regex(/^profile:/),
    purpose: z.string().trim().min(1),
    draftText: z.string().trim().min(1),
    hardConstraints: z.array(z.string().trim().min(1)),
    traceId: z.string().trim().min(1)
  })
});

export function buildScoutOpportunityHandoff(input: {
  report: ScoutRunReport;
  candidateId: string;
  exportedAt?: string | undefined;
}): ScoutOpportunityHandoff {
  const lead = input.report.shortlist.find((item) => item.candidateId === input.candidateId);
  const business = input.report.businessBreakdowns.find((item) => item.candidateId === input.candidateId);
  const candidate = input.report.candidates.find((item) => item.candidateId === input.candidateId);
  const findings = input.report.findings.filter((item) => item.candidateId === input.candidateId);
  const businessName = lead?.businessName ?? business?.businessName ?? candidate?.title ?? input.candidateId;
  const primaryUrl = lead?.primaryUrl ?? business?.primaryUrl ?? candidate?.url;

  if (!primaryUrl) {
    throw new Error("Scout opportunity handoff requires a primary URL.");
  }

  const evidenceMarkdown = [
    `# ${businessName}`,
    "",
    `Run: ${input.report.runId}`,
    `Query: ${input.report.query.rawQuery}`,
    `URL: ${primaryUrl}`,
    "",
    "## Reasons",
    ...(lead?.reasons.length ? lead.reasons : business?.detectionNotes ?? []).map((reason) => `- ${reason}`),
    "",
    "## Findings",
    ...(findings.length
      ? findings.map((finding) => `- ${finding.severity}: ${finding.message}`)
      : ["- No audit findings were recorded for this candidate."])
  ].join("\n");

  return scoutOpportunityHandoffSchema.parse({
    schema: "tenra-scout.opportunity-handoff.v1",
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    sourceApp: "scout",
    runId: input.report.runId,
    candidateId: input.candidateId,
    businessName,
    primaryUrl,
    evidenceMarkdown,
    recommendedNextApps: ["assembly", "proxy"],
    proxyShapeRequest: {
      clientApp: "scout",
      surface: "email",
      profileId: "profile:default",
      purpose: "Shape Scout opportunity evidence for reviewed outreach or Assembly content intake.",
      draftText: evidenceMarkdown,
      hardConstraints: [
        "Do not invent contact details",
        "Preserve audit findings and uncertainty"
      ],
      traceId: `scout-${input.report.runId}-${input.candidateId}`
    }
  });
}

export type CreateScoutRunRequest = z.infer<typeof createScoutRunRequestSchema>;
export type CreateScoutRunResponse = z.infer<typeof createScoutRunResponseSchema>;
export type GetScoutRunResponse = z.infer<typeof getScoutRunResponseSchema>;
export type RunControlActionRequest = z.infer<typeof runControlActionRequestSchema>;
export type RunControlActionResponse = z.infer<typeof runControlActionResponseSchema>;
export type UpdateLeadAnnotationRequest = z.infer<typeof updateLeadAnnotationRequestSchema>;
export type ListLeadAnnotationsResponse = z.infer<typeof listLeadAnnotationsResponseSchema>;
export type LeadAnnotationResponse = z.infer<typeof leadAnnotationResponseSchema>;
export type ListLeadInboxResponse = z.infer<typeof listLeadInboxResponseSchema>;
export type LeadInboxItemResponse = z.infer<typeof leadInboxItemResponseSchema>;
export type CreateManualLeadRequest = z.infer<typeof createManualLeadRequestSchema>;
export type CreateManualLeadResponse = z.infer<typeof createManualLeadResponseSchema>;
export type LeadInboxActionRequest = z.infer<typeof leadInboxActionRequestSchema>;
export type LeadInboxBulkActionRequest = z.infer<typeof leadInboxBulkActionRequestSchema>;
export type LeadInboxBulkActionResponse = z.infer<typeof leadInboxBulkActionResponseSchema>;
export type CreateOutreachDraftRequest = z.infer<typeof createOutreachDraftRequestSchema>;
export type UpdateOutreachDraftRequest = z.infer<typeof updateOutreachDraftRequestSchema>;
export type ListOutreachDraftsResponse = z.infer<typeof listOutreachDraftsResponseSchema>;
export type OutreachDraftResponse = z.infer<typeof outreachDraftResponseSchema>;
export type UpdateOutreachProfileRequest = z.infer<typeof updateOutreachProfileRequestSchema>;
export type OutreachProfileResponse = z.infer<typeof outreachProfileResponseSchema>;
export type ScoutOpportunityHandoff = z.infer<typeof scoutOpportunityHandoffSchema>;
