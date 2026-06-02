import type {
  LeadInboxItem,
  LeadStatus,
  OutreachDraft,
  ScoutProxyHandoffReceipt
} from "@scout/domain";
import { Tag } from "@scout/ui";
import { describeProxyReceipt } from "../lib/handoffs/proxy-receipt-copy";

import {
  formatLeadUpdatedAt,
  labelForLeadOutreachStatus,
  labelForLeadStatus
} from "./lead-workflow-copy";

export type LeadAction = "analyze_contact" | "generate_draft" | "mark_contacted";
export type HandoffTarget = "assembly" | "proxy" | "guardrail";
export type ScoutEndpointConfig = Record<HandoffTarget, string>;
export type HandoffHealthResult = {
  target: HandoffTarget;
  ok: boolean;
  endpoint?: string;
  healthEndpoint?: string;
  status: string | number;
  message: string;
};

export interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

export interface LeadTimelineEntry {
  label: string;
  value: string;
  detail: string;
}

export const endpointStorageKey = "tenra-scout-suite-endpoints:v1";
export const defaultEndpointConfig: ScoutEndpointConfig = {
  assembly: "",
  proxy: "",
  guardrail: ""
};
export const suiteEndpointPresets: ScoutEndpointConfig = {
  assembly: "http://localhost:3001/api/handoffs/scout-opportunity",
  proxy: "http://localhost:5173/api/shape-external-output",
  guardrail: "http://localhost:5174/api/external-reviews"
};

export function isEndpointConfig(value: unknown): value is Partial<ScoutEndpointConfig> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (["assembly", "proxy", "guardrail"] as const).every((target) => {
    const endpoint = (value as Partial<Record<HandoffTarget, unknown>>)[target];
    return endpoint === undefined || typeof endpoint === "string";
  });
}

export function readEndpointConfig(): ScoutEndpointConfig {
  if (typeof window === "undefined") {
    return defaultEndpointConfig;
  }

  try {
    const raw = window.localStorage.getItem(endpointStorageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return { ...defaultEndpointConfig, ...(isEndpointConfig(parsed) ? parsed : {}) };
  } catch {
    return defaultEndpointConfig;
  }
}

export function writeEndpointConfig(config: ScoutEndpointConfig) {
  window.localStorage.setItem(endpointStorageKey, JSON.stringify(config));
}

export function endpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.pathname;
  } catch {
    return endpoint;
  }
}

export function ProxyReceiptSummary({ receipt }: { receipt: ScoutProxyHandoffReceipt | undefined }) {
  if (!receipt) {
    return null;
  }

  return (
    <div className="lead-receipt-summary">
      <div className="tag-row">
        {describeProxyReceipt(receipt).map((line) => (
          <Tag key={line} tone={receipt.validationResult === "invalid" ? "warn" : "neutral"}>
            {line}
          </Tag>
        ))}
      </div>
      {receipt.shapedOutputPreview ? (
        <p className="muted">Preview: {receipt.shapedOutputPreview}</p>
      ) : null}
    </div>
  );
}

export function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

export function buildTimeline(item: LeadInboxItem, draft?: OutreachDraft): LeadTimelineEntry[] {
  const entries: LeadTimelineEntry[] = [
    {
      label: "Run created",
      value: formatLeadUpdatedAt(item.runCreatedAt),
      detail: item.rawQuery
    },
    {
      label: "Lead tracked",
      value: formatLeadUpdatedAt(item.annotation.createdAt),
      detail: labelForLeadStatus(item.annotation.state)
    },
    {
      label: "Lead updated",
      value: formatLeadUpdatedAt(item.annotation.updatedAt),
      detail: item.outreach.nextAction
    }
  ];

  if (draft) {
    entries.push({
      label: "Outreach updated",
      value: formatLeadUpdatedAt(draft.updatedAt),
      detail: labelForLeadOutreachStatus(item.outreach.status)
    });
  }

  if (item.annotation.followUpDate) {
    entries.push({
      label: "Next follow-up",
      value: item.annotation.followUpDate,
      detail: isClosed(item.annotation.state) ? "Closed lead" : "Scheduled follow-up"
    });
  }

  return entries;
}

export function resolveRecommendedChannel(draft?: OutreachDraft) {
  if (!draft) {
    return null;
  }

  if (draft.recommendedChannel) {
    return (
      draft.contactChannels.find((channel) => channel.kind === draft.recommendedChannel) ??
      draft.contactChannels[0] ??
      null
    );
  }

  return draft.contactChannels[0] ?? null;
}

export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}

export function buildMailtoHref(draft: OutreachDraft | undefined): string | null {
  const email = draft?.contactChannels.find((channel) => channel.kind === "email")?.value;

  if (!email || !draft?.subjectLine.trim() || !draft.body.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    subject: draft.subjectLine,
    body: draft.body
  });

  return `mailto:${email}?${params.toString()}`;
}

export function buildCompletionChecklist(item: LeadInboxItem, draft: OutreachDraft | undefined) {
  return [
    {
      label: "Lead triaged",
      complete: item.annotation.state !== "needs_review"
    },
    {
      label: "Contact analyzed",
      complete: Boolean(draft)
    },
    {
      label: "Outreach draft ready",
      complete: Boolean(draft?.body.trim() || draft?.shortMessage?.trim() || draft?.phoneTalkingPoints)
    },
    {
      label: "Proxy receipt captured",
      complete: item.handoffHistory.some((entry) => Boolean(entry.proxyReceipt))
    },
    {
      label: "Guardrail review requested",
      complete: item.handoffHistory.some((entry) => entry.target === "guardrail")
    },
    {
      label: "Guardrail decision returned",
      complete: item.handoffHistory.some((entry) => entry.mode === "decision-return")
    },
    {
      label: "Operator contacted or closed",
      complete: item.annotation.state === "contacted" || isClosed(item.annotation.state)
    }
  ];
}
