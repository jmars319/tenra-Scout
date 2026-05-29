import type { ScoutOpportunityHandoff } from "@scout/api-contracts";
import type {
  ScoutHandoffHistoryEntry,
  ScoutProxyHandoffReceipt
} from "@scout/domain";

export interface ScoutGuardrailReviewRequest {
  schema: "tenra-guardrail.external-action-review.v1";
  exportedAt: string;
  sourceApp: "scout";
  actionKind: "send-message";
  actorLabel: string;
  targetLabel: string;
  summary: string;
  evidence: Array<{
    label: string;
    value: string;
  }>;
  recommendedDecision: "review";
  traceId: string;
  callbackUrl?: string | undefined;
}

export function findProxyReceiptForGuardrail(
  history: ScoutHandoffHistoryEntry[],
  traceId?: string
): ScoutProxyHandoffReceipt | undefined {
  if (!traceId) {
    return undefined;
  }

  return history.find((entry) => entry.target === "proxy" && entry.proxyReceipt?.traceId === traceId)?.proxyReceipt;
}

export function buildScoutGuardrailReviewRequest({
  handoff,
  traceId,
  callbackUrl,
  proxyReceipt
}: {
  handoff: ScoutOpportunityHandoff;
  traceId: string;
  callbackUrl?: string | undefined;
  proxyReceipt?: ScoutProxyHandoffReceipt | undefined;
}): ScoutGuardrailReviewRequest {
  const evidence = [
    { label: "Business", value: handoff.businessName },
    { label: "Primary URL", value: handoff.primaryUrl },
    { label: "Scout run", value: handoff.runId }
  ];

  if (proxyReceipt) {
    evidence.push(
      { label: "Proxy trace", value: proxyReceipt.traceId },
      { label: "Proxy endpoint", value: proxyReceipt.endpoint },
      { label: "Proxy HTTP status", value: String(proxyReceipt.responseStatus) },
      { label: "Proxy validation", value: proxyReceipt.validationResult },
      {
        label: "Guardrail recommendation",
        value:
          proxyReceipt.guardrailRecommended === undefined
            ? "unknown"
            : proxyReceipt.guardrailRecommended
              ? "recommended"
              : "not recommended"
      }
    );

    if (proxyReceipt.shapedOutputPreview) {
      evidence.push({ label: "Shaped output preview", value: proxyReceipt.shapedOutputPreview });
    }
  }

  return {
    schema: "tenra-guardrail.external-action-review.v1",
    exportedAt: handoff.exportedAt,
    sourceApp: "scout",
    actionKind: "send-message",
    actorLabel: "Scout lead inbox",
    targetLabel: handoff.businessName,
    summary: proxyReceipt
      ? "Proxy-shaped Scout output is ready for Guardrail review before outreach or Assembly intake."
      : "Scout opportunity evidence is ready for reviewed outreach or Assembly intake.",
    evidence,
    recommendedDecision: "review",
    traceId,
    ...(callbackUrl ? { callbackUrl } : {})
  };
}
