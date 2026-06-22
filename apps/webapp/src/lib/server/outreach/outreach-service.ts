import { getOutreachConfig } from "@scout/config";
import type {
  OutreachContactChannel,
  OutreachDraft,
  OutreachLength,
  OutreachPhoneTalkingPoints,
  OutreachTone,
  ScoutRunReport
} from "@scout/domain";
import { z } from "zod";

import { createRunRepository } from "../storage/run-repository.ts";
import {
  createOutreachDraftRepository,
  type SaveOutreachDraftInput
} from "../storage/outreach-draft-repository.ts";
import { analyzeContactStrategy } from "./contact-strategy.ts";
import { buildOutreachTargetContext } from "./grounding.ts";
import { getOutreachProfile } from "../settings/outreach-profile-service.ts";

const generatedDraftSchema = z.object({
  subjectLine: z.string().trim().min(1).max(180),
  body: z.string().trim().min(30).max(5000),
  shortMessage: z.string().trim().min(20).max(1200),
  phoneTalkingPoints: z
    .object({
      opener: z.string().trim().min(10).max(400),
      keyPoints: z.array(z.string().trim().min(6).max(280)).min(2).max(4),
      close: z.string().trim().min(10).max(320)
    })
    .nullable()
    .optional()
});

export interface OutreachWorkspaceState {
  runId: string;
  aiAvailable: boolean;
  defaultTone: OutreachTone;
  defaultLength: OutreachLength;
  model?: string | undefined;
  drafts: OutreachDraft[];
}

interface GenerateOutreachDraftInput {
  runId: string;
  candidateId: string;
  tone?: OutreachTone;
  length?: OutreachLength;
}

interface SaveOutreachDraftEditInput {
  runId: string;
  candidateId: string;
  tone: OutreachTone;
  length: OutreachLength;
  subjectLine: string;
  body: string;
  shortMessage?: string | undefined;
  phoneTalkingPoints?: OutreachPhoneTalkingPoints | undefined;
}

interface ContactStrategyState {
  target: ReturnType<typeof buildOutreachTargetContext>;
  existingDraft: OutreachDraft | null;
  recommendedChannel?: OutreachDraft["recommendedChannel"];
  contactChannels: OutreachContactChannel[];
  contactRationale: string[];
}

function resolveLengthGuidance(length: OutreachLength): string {
  return length === "brief"
    ? "Keep the body around 90 to 140 words."
    : "Keep the body around 150 to 220 words.";
}

function resolveToneGuidance(tone: OutreachTone): string {
  if (tone === "direct") {
    return "Be straightforward and concise, but not pushy.";
  }

  if (tone === "friendly") {
    return "Be warm and approachable without sounding casual or fluffy.";
  }

  return "Be calm, low-pressure, and matter-of-fact.";
}

function buildPromptPayload(
  report: ScoutRunReport,
  target: ReturnType<typeof buildOutreachTargetContext>,
  strategy: ContactStrategyState,
  profile: Awaited<ReturnType<typeof getOutreachProfile>>,
  tone: OutreachTone,
  length: OutreachLength
) {
  return {
    senderProfile: {
      senderName: profile.senderName,
      companyName: profile.companyName,
      roleTitle: profile.roleTitle,
      serviceLine: profile.serviceLine,
      serviceSummary: profile.serviceSummary,
      defaultCallToAction: profile.defaultCallToAction,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      websiteUrl: profile.websiteUrl,
      schedulerUrl: profile.schedulerUrl,
      toneNotes: profile.toneNotes,
      avoidPhrases: profile.avoidPhrases,
      signature: profile.signature
    },
    businessName: target.businessName,
    primaryUrl: target.primaryUrl,
    presenceType: target.business.presenceType,
    presenceQuality: target.business.presenceQuality,
    confidence: target.lead?.confidence ?? target.business.confidence,
    opportunityTypes: target.lead?.opportunityTypes ?? target.business.opportunityTypes,
    shortlistReasons: target.lead?.reasons ?? [],
    topIssues: target.business.topIssues,
    findings: target.findings.map((finding) => ({
      issueType: finding.issueType,
      severity: finding.severity,
      confidence: finding.confidence,
      pageLabel: finding.pageLabel,
      viewport: finding.viewport,
      message: finding.message
    })),
    recommendedChannel: strategy.recommendedChannel ?? null,
    contactChannels: strategy.contactChannels.map((channel) => ({
      kind: channel.kind,
      label: channel.label,
      score: channel.score,
      value: channel.value ?? null,
      url: channel.url ?? null,
      reason: channel.reason
    })),
    contactRationale: strategy.contactRationale,
    grounding: target.grounding,
    cautionNotes: target.cautionNotes,
    sampleQuality: report.summary.sampleQuality,
    tone,
    length
  };
}

function buildSystemPrompt(
  tone: OutreachTone,
  length: OutreachLength,
  profile: Awaited<ReturnType<typeof getOutreachProfile>>
): string {
  const lines = [
    `You write restrained outreach drafts for ${profile.companyName || "tenra"}.`,
    "Use only the evidence provided in the JSON input.",
    "Use the senderProfile object as the source of truth for who is reaching out, what they offer, and what next step they prefer.",
    "Use senderProfile.defaultCallToAction when a concrete next step is helpful, but omit it if the field is blank.",
    "If senderProfile fields are blank, omit them instead of inventing details.",
    "Do not invent page details, metrics, business context, pricing, or results not present in the input.",
    "Do not mention Scout, AI, automation, scraping, search providers, screenshots, or audits directly.",
    "If the evidence is weak or not confirmed, use softer language like 'may', 'might', or 'could'.",
    "Mention at most two specific website or conversion issues.",
    "Write plain-text outreach assets only, with no markdown and no placeholders.",
    "Return JSON with keys subjectLine, body, shortMessage, and phoneTalkingPoints.",
    "body should be a full email draft.",
    "shortMessage should be a compact version suitable for a contact form, social DM, or concise follow-up.",
    "If phone is a viable channel, include phoneTalkingPoints with opener, keyPoints, and close. Otherwise return null for phoneTalkingPoints.",
    resolveToneGuidance(tone),
    resolveLengthGuidance(length)
  ];

  if (profile.toneNotes) {
    lines.push(`Additional sender tone guidance: ${profile.toneNotes}`);
  }

  if (profile.avoidPhrases.length > 0) {
    lines.push(`Never use these phrases: ${profile.avoidPhrases.join("; ")}`);
  }

  return lines.join(" ");
}

function extractResponseText(payload: unknown): string {
  const responsePayload = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof responsePayload.output_text === "string") {
    return responsePayload.output_text;
  }

  if (!Array.isArray(responsePayload.output)) {
    throw new Error("OpenAI response did not include output text.");
  }

  const textParts: string[] = [];

  for (const item of responsePayload.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (typeof content?.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  if (textParts.length === 0) {
    throw new Error("OpenAI response content was empty.");
  }

  return textParts.join("\n").trim();
}

function extractOpenAiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : null;
}

function firstUsefulLine(values: Array<string | undefined | null>, fallback: string): string {
  return values.find((value) => value?.trim())?.trim() ?? fallback;
}

/* Provider fallback boundary */
function buildLocalTemplateDraft(
  target: ReturnType<typeof buildOutreachTargetContext>,
  strategy: ContactStrategyState,
  profile: Awaited<ReturnType<typeof getOutreachProfile>>,
  tone: OutreachTone,
  length: OutreachLength
) {
  const issue = firstUsefulLine(
    [
      target.findings[0]?.message,
      target.grounding[0],
      target.lead?.reasons[0],
      target.business.topIssues[0]
    ],
    "there may be a few practical website improvements worth reviewing"
  );
  const serviceLine = profile.serviceLine || "website review";
  const serviceSummary = profile.serviceSummary || "help businesses turn web presence issues into a short, practical fix list";
  const senderName = profile.senderName || "";
  const companyName = profile.companyName || "tenra";
  const callToAction = profile.defaultCallToAction || "If it would be useful, I can send over the short version of what stood out.";
  const signoff = profile.signature || [senderName, companyName].filter(Boolean).join("\n");
  const opener =
    tone === "direct"
      ? `I was reviewing ${target.businessName}'s web presence and noticed one item worth a look.`
      : tone === "friendly"
        ? `I came across ${target.businessName} and noticed one practical item that may be worth a look.`
        : `I reviewed ${target.businessName}'s web presence and noticed one practical item that may be worth checking.`;
  const evidenceLine = `The clearest signal was: ${issue}`;
  const offerLine = `My work is focused on ${serviceLine}; in practice, that means ${serviceSummary}.`;
  const bodyLines =
    length === "brief"
      ? [opener, evidenceLine, callToAction]
      : [opener, evidenceLine, offerLine, callToAction];

  return generatedDraftSchema.parse({
    subjectLine: `${target.businessName} website note`,
    body: [...bodyLines, signoff ? `\n${signoff}` : ""].filter(Boolean).join("\n\n"),
    shortMessage: `${opener} ${evidenceLine} ${callToAction}`.slice(0, 1100),
    phoneTalkingPoints:
      strategy.contactChannels.some((channel) => channel.kind === "phone")
        ? {
            opener: `Hi, I am calling with a quick website note for ${target.businessName}.`,
            keyPoints: [
              issue,
              `This is based on a narrow review of ${target.primaryUrl}.`,
              callToAction
            ].slice(0, 3),
            close: "What is the best email address to send the short note to?"
          }
        : null
  });
}

async function requestOllamaDraft(
  report: ScoutRunReport,
  target: ReturnType<typeof buildOutreachTargetContext>,
  strategy: ContactStrategyState,
  profile: Awaited<ReturnType<typeof getOutreachProfile>>,
  tone: OutreachTone,
  length: OutreachLength
) {
  const config = getOutreachConfig();
  const baseUrl = (config.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      format: "json",
      prompt: [
        buildSystemPrompt(tone, length, profile),
        "Return only JSON with keys subjectLine, body, shortMessage, and phoneTalkingPoints.",
        JSON.stringify(buildPromptPayload(report, target, strategy, profile, tone, length), null, 2)
      ].join("\n\n")
    }),
    signal: AbortSignal.timeout(120_000)
  });

  const payload = (await response.json().catch(() => null)) as { response?: unknown; error?: unknown } | null;

  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `Local Ollama draft generation failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  if (typeof payload?.response !== "string") {
    throw new Error("Local Ollama draft generation returned no text.");
  }

  return generatedDraftSchema.parse(JSON.parse(payload.response));
}

async function requestGeneratedDraft(
  report: ScoutRunReport,
  candidateId: string,
  strategy: ContactStrategyState,
  tone: OutreachTone,
  length: OutreachLength
) {
  const config = getOutreachConfig();
  const target = buildOutreachTargetContext(report, candidateId);
  const profile = await getOutreachProfile();

  if (!config.enabled) {
    throw new Error("Scout outreach draft generation is disabled.");
  }

  if (config.provider === "local_template") {
    return {
      generated: buildLocalTemplateDraft(target, strategy, profile, tone, length),
      target,
      model: "local-template"
    };
  }

  if (config.provider === "ollama") {
    return {
      generated: await requestOllamaDraft(report, target, strategy, profile, tone, length),
      target,
      model: config.model
    };
  }

  if (!config.apiKey) {
    throw new Error("OPENAI_API_KEY is required when SCOUT_OUTREACH_PROVIDER=openai.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemPrompt(tone, length, profile) }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Return only JSON.\n${JSON.stringify(
                buildPromptPayload(report, target, strategy, profile, tone, length),
                null,
                2
              )}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      }
    }),
    signal: AbortSignal.timeout(45_000)
  });

  const payload: unknown = await response.json();

  if (!response.ok) {
    const message = extractOpenAiErrorMessage(payload) ?? "OpenAI draft generation failed.";
    throw new Error(message);
  }

  const parsed = generatedDraftSchema.parse(JSON.parse(extractResponseText(payload)));

  return {
    generated: parsed,
    target,
    model: config.model
  };
}

async function requireCompletedRunReport(runId: string): Promise<ScoutRunReport> {
  const report = await createRunRepository().get(runId);

  if (!report) {
    throw new Error("Scout run report not found.");
  }

  if (report.status !== "completed") {
    throw new Error("Scout outreach drafts are only available for completed runs.");
  }

  return report;
}

async function resolveContactStrategyState(
  report: ScoutRunReport,
  runId: string,
  candidateId: string,
  forceRefresh = false
): Promise<ContactStrategyState> {
  const target = buildOutreachTargetContext(report, candidateId);
  const existingDraft = await createOutreachDraftRepository().get(runId, candidateId);

  if (
    !forceRefresh &&
    existingDraft &&
    (existingDraft.recommendedChannel ||
      existingDraft.contactChannels.length > 0 ||
      existingDraft.contactRationale.length > 0)
  ) {
    return {
      target,
      existingDraft,
      recommendedChannel: existingDraft.recommendedChannel,
      contactChannels: existingDraft.contactChannels,
      contactRationale: existingDraft.contactRationale
    };
  }

  const presence = report.presences.find((item) => item.candidateId === candidateId);
  if (!presence) {
    return {
      target,
      existingDraft,
      recommendedChannel: existingDraft?.recommendedChannel,
      contactChannels: existingDraft?.contactChannels ?? [],
      contactRationale:
        existingDraft?.contactRationale ?? ["Scout could not find a presence record for this business."]
    };
  }

  const contactStrategy = await analyzeContactStrategy(presence);

  return {
    target,
    existingDraft,
    recommendedChannel: contactStrategy.channels[0]?.kind,
    contactChannels: contactStrategy.channels,
    contactRationale: contactStrategy.rationale
  };
}

function buildSaveInputFromTarget(
  strategy: ContactStrategyState,
  input: {
    runId: string;
    candidateId: string;
    tone: OutreachTone;
    length: OutreachLength;
    subjectLine: string;
    body: string;
    shortMessage?: string | undefined;
    phoneTalkingPoints?: OutreachPhoneTalkingPoints | undefined;
    model?: string | undefined;
  }
): SaveOutreachDraftInput {
  return {
    runId: input.runId,
    candidateId: input.candidateId,
    businessName: strategy.target.businessName,
    primaryUrl: strategy.target.primaryUrl,
    tone: input.tone,
    length: input.length,
    recommendedChannel: strategy.recommendedChannel,
    contactChannels: strategy.contactChannels,
    contactRationale: strategy.contactRationale,
    subjectLine: input.subjectLine,
    body: input.body,
    ...(input.shortMessage ? { shortMessage: input.shortMessage } : {}),
    ...(input.phoneTalkingPoints ? { phoneTalkingPoints: input.phoneTalkingPoints } : {}),
    grounding: strategy.target.grounding,
    ...(input.model ? { model: input.model } : {})
  };
}

function buildSaveInputFromStrategy(
  strategy: ContactStrategyState,
  input: {
    runId: string;
    candidateId: string;
    tone?: OutreachTone | undefined;
    length?: OutreachLength | undefined;
    subjectLine?: string | undefined;
    body?: string | undefined;
    shortMessage?: string | undefined;
    phoneTalkingPoints?: OutreachPhoneTalkingPoints | undefined;
    model?: string | undefined;
  }
): SaveOutreachDraftInput {
  const config = getOutreachConfig();

  return buildSaveInputFromTarget(strategy, {
    runId: input.runId,
    candidateId: input.candidateId,
    tone: input.tone ?? strategy.existingDraft?.tone ?? config.defaultTone,
    length: input.length ?? strategy.existingDraft?.length ?? config.defaultLength,
    subjectLine: input.subjectLine ?? strategy.existingDraft?.subjectLine ?? "",
    body: input.body ?? strategy.existingDraft?.body ?? "",
    shortMessage: input.shortMessage ?? strategy.existingDraft?.shortMessage ?? "",
    phoneTalkingPoints:
      input.phoneTalkingPoints ?? strategy.existingDraft?.phoneTalkingPoints ?? undefined,
    model: input.model ?? strategy.existingDraft?.model
  });
}

export async function getOutreachWorkspaceState(runId: string): Promise<OutreachWorkspaceState> {
  const config = getOutreachConfig();
  const drafts = await createOutreachDraftRepository().listByRun(runId);

  return {
    runId,
    aiAvailable: config.enabled,
    defaultTone: config.defaultTone,
    defaultLength: config.defaultLength,
    ...(config.enabled ? { model: config.model } : {}),
    drafts
  };
}

export async function generateOutreachDraft(
  input: GenerateOutreachDraftInput
): Promise<OutreachWorkspaceState & { draft: OutreachDraft }> {
  const config = getOutreachConfig();
  const tone = input.tone ?? config.defaultTone;
  const length = input.length ?? config.defaultLength;
  const report = await requireCompletedRunReport(input.runId);
  const strategy = await resolveContactStrategyState(report, input.runId, input.candidateId);
  const { generated, model } = await requestGeneratedDraft(
    report,
    input.candidateId,
    strategy,
    tone,
    length
  );
  const draft = await createOutreachDraftRepository().save(
    buildSaveInputFromTarget(strategy, {
      runId: input.runId,
      candidateId: input.candidateId,
      tone,
      length,
      subjectLine: generated.subjectLine,
      body: generated.body,
      shortMessage: generated.shortMessage,
      ...(generated.phoneTalkingPoints ? { phoneTalkingPoints: generated.phoneTalkingPoints } : {}),
      model
    })
  );

  return {
    ...(await getOutreachWorkspaceState(input.runId)),
    draft
  };
}

export async function analyzeOutreachCandidate(
  input: Pick<GenerateOutreachDraftInput, "runId" | "candidateId">
): Promise<OutreachWorkspaceState & { draft: OutreachDraft }> {
  const report = await requireCompletedRunReport(input.runId);
  const strategy = await resolveContactStrategyState(report, input.runId, input.candidateId, true);
  const draft = await createOutreachDraftRepository().save(
    buildSaveInputFromStrategy(strategy, {
      runId: input.runId,
      candidateId: input.candidateId
    })
  );

  return {
    ...(await getOutreachWorkspaceState(input.runId)),
    draft
  };
}

export async function saveOutreachDraftEdit(
  input: SaveOutreachDraftEditInput
): Promise<OutreachWorkspaceState & { draft: OutreachDraft }> {
  const report = await requireCompletedRunReport(input.runId);
  const strategy = await resolveContactStrategyState(report, input.runId, input.candidateId);
  const draft = await createOutreachDraftRepository().save(
    buildSaveInputFromStrategy(strategy, {
      ...input,
      ...(strategy.existingDraft?.model ? { model: strategy.existingDraft.model } : {})
    })
  );

  return {
    ...(await getOutreachWorkspaceState(input.runId)),
    draft
  };
}
