import type {
  LeadOpportunity,
  OutreachContactChannel,
  OutreachDraft,
  OutreachLength,
  OutreachPhoneTalkingPoints,
  OutreachTone
} from "@scout/domain";

export type BusyState = "analyze" | "generate" | "save";

export interface DraftEditorState {
  tone: OutreachTone;
  length: OutreachLength;
  recommendedChannel?: OutreachDraft["recommendedChannel"];
  contactChannels: OutreachContactChannel[];
  contactRationale: string[];
  subjectLine: string;
  body: string;
  shortMessage: string;
  phoneTalkingPoints?: OutreachPhoneTalkingPoints;
  grounding: string[];
  updatedAt?: string;
}

export interface DraftMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

export function draftToEditor(
  draft: OutreachDraft,
  fallbackGrounding: string[]
): DraftEditorState {
  return {
    tone: draft.tone,
    length: draft.length,
    recommendedChannel: draft.recommendedChannel,
    contactChannels: draft.contactChannels,
    contactRationale: draft.contactRationale,
    subjectLine: draft.subjectLine,
    body: draft.body,
    shortMessage: draft.shortMessage ?? "",
    ...(draft.phoneTalkingPoints ? { phoneTalkingPoints: draft.phoneTalkingPoints } : {}),
    grounding: draft.grounding.length > 0 ? draft.grounding : fallbackGrounding,
    updatedAt: draft.updatedAt
  };
}

export function buildEmptyEditor(
  lead: LeadOpportunity,
  defaultTone: OutreachTone,
  defaultLength: OutreachLength
): DraftEditorState {
  return {
    tone: defaultTone,
    length: defaultLength,
    contactChannels: [],
    contactRationale: [],
    subjectLine: "",
    body: "",
    shortMessage: "",
    grounding: lead.reasons.slice(0, 4)
  };
}

export function buildInitialEditors(
  leads: LeadOpportunity[],
  drafts: OutreachDraft[],
  defaultTone: OutreachTone,
  defaultLength: OutreachLength
): Record<string, DraftEditorState> {
  const draftMap = new Map(drafts.map((draft) => [draft.candidateId, draft]));

  return Object.fromEntries(
    leads.map((lead) => {
      const existingDraft = draftMap.get(lead.candidateId);
      return [
        lead.candidateId,
        existingDraft
          ? draftToEditor(existingDraft, lead.reasons.slice(0, 4))
          : buildEmptyEditor(lead, defaultTone, defaultLength)
      ];
    })
  );
}

export function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function normalizePhoneTalkingPoints(
  value: DraftEditorState["phoneTalkingPoints"]
): OutreachPhoneTalkingPoints | undefined {
  if (!value) {
    return undefined;
  }

  const opener = value.opener.trim();
  const keyPoints = value.keyPoints.map((point) => point.trim()).filter(Boolean);
  const close = value.close.trim();

  if (!opener && keyPoints.length === 0 && !close) {
    return undefined;
  }

  return {
    opener,
    keyPoints,
    close
  };
}

export function formatPhoneTalkingPoints(value?: OutreachPhoneTalkingPoints): string {
  if (!value) {
    return "";
  }

  return [
    "Opener:",
    value.opener,
    "",
    "Key points:",
    ...value.keyPoints.map((point) => `- ${point}`),
    "",
    "Close:",
    value.close
  ]
    .join("\n")
    .trim();
}

export function resolveRecommendedChannel(editor: DraftEditorState): OutreachContactChannel | null {
  if (editor.recommendedChannel) {
    const matched = editor.contactChannels.find(
      (channel) => channel.kind === editor.recommendedChannel
    );
    if (matched) {
      return matched;
    }
  }

  return editor.contactChannels[0] ?? null;
}

export function buildMailtoHref(editor: DraftEditorState): string | null {
  const email = editor.contactChannels.find((channel) => channel.kind === "email")?.value;

  if (!email || !editor.subjectLine.trim() || !editor.body.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    subject: editor.subjectLine,
    body: editor.body
  });

  return `mailto:${email}?${params.toString()}`;
}

export function resolveBusyMessage(busyState?: BusyState): string | null {
  if (busyState === "analyze") {
    return "Scout is inspecting the business presence for the best contact path.";
  }

  if (busyState === "generate") {
    return "Scout is generating the outreach pack from the saved findings and contact fit.";
  }

  if (busyState === "save") {
    return "Scout is saving this outreach pack locally.";
  }

  return null;
}

export function hasPhoneNotes(editor: DraftEditorState): boolean {
  const phone = editor.phoneTalkingPoints;

  if (!phone) {
    return false;
  }

  return Boolean(
    phone.opener.trim() || phone.keyPoints.some((point) => point.trim()) || phone.close.trim()
  );
}

export function describeLeadCardSummary(lead: LeadOpportunity, editor: DraftEditorState): string {
  const parts: string[] = [];
  const recommendedChannel = resolveRecommendedChannel(editor);

  if (recommendedChannel) {
    parts.push(`Best fit: ${recommendedChannel.label}`);
  }

  if (editor.subjectLine.trim() && editor.body.trim()) {
    parts.push("Email draft ready");
  }

  if (editor.shortMessage.trim()) {
    parts.push("Short version ready");
  }

  if (hasPhoneNotes(editor)) {
    parts.push("Phone notes ready");
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return lead.reasons[0] ?? "Analyze contact fit or generate an outreach pack.";
}
