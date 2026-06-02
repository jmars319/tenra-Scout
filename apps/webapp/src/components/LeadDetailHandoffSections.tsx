import { Tag } from "@scout/ui";
import type { LeadInboxItem } from "@scout/domain";

import {
  endpointLabel,
  ProxyReceiptSummary,
  type HandoffHealthResult,
  type HandoffTarget,
  type ScoutEndpointConfig
} from "./LeadDetailView.helpers";
import { formatLeadUpdatedAt } from "./lead-workflow-copy";

export function LeadDetailHandoffSections({
  applyEndpointPresets,
  checkEndpointHealth,
  deliverHandoff,
  endpointConfig,
  endpointHealth,
  item,
  pendingKey,
  updateEndpoint
}: {
  applyEndpointPresets: () => void;
  checkEndpointHealth: () => Promise<void>;
  deliverHandoff: (
    target: HandoffTarget,
    options?: { guardrailSourceTraceId?: string | undefined }
  ) => Promise<void>;
  endpointConfig: ScoutEndpointConfig;
  endpointHealth: HandoffHealthResult[];
  item: LeadInboxItem;
  pendingKey: string | null;
  updateEndpoint: (target: HandoffTarget, value: string) => void;
}) {
  return (
    <>
<div className="report-card lead-detail-section">
          <div className="section-label">Handoff Destinations</div>
          <div className="lead-inbox-controls">
            {(["assembly", "proxy", "guardrail"] as const).map((target) => (
              <label className="field-stack" key={target}>
                <span className="section-label">{target}</span>
                <input
                  className="draft-input"
                  onChange={(event) => updateEndpoint(target, event.currentTarget.value)}
                  placeholder={`Optional ${target} endpoint`}
                  value={endpointConfig[target]}
                />
              </label>
            ))}
          </div>
          <div className="lead-detail-actions">
            <button
              className="secondary-button"
              disabled={Boolean(pendingKey)}
              onClick={applyEndpointPresets}
              type="button"
            >
              Apply Suite Presets
            </button>
            <button
              className="secondary-button"
              disabled={Boolean(pendingKey)}
              onClick={() => void checkEndpointHealth()}
              type="button"
            >
              {pendingKey === "endpoint-health" ? "Checking..." : "Check Health"}
            </button>
          </div>
          {endpointHealth.length ? (
            <div className="tag-row">
              {endpointHealth.map((result) => (
                <Tag key={result.target} tone={result.ok ? "good" : result.status === "not-configured" ? "warn" : "danger"}>
                  {result.target}: {result.ok ? "ok" : String(result.status)}
                  {result.healthEndpoint && result.healthEndpoint !== result.endpoint
                    ? ` · health ${endpointLabel(result.healthEndpoint)}`
                    : ""}
                </Tag>
              ))}
            </div>
          ) : null}
        </div>

        {item.handoffHistory.length ? (
          <div className="report-card lead-detail-section">
            <div className="section-label">Handoff History</div>
            <ol className="lead-timeline">
              {item.handoffHistory.slice(0, 6).map((entry) => (
                <li key={`${entry.traceId}-${entry.exportedAt}`}>
                  <strong>
                    {entry.target} / {entry.mode}
                  </strong>
                  <span>{formatLeadUpdatedAt(entry.exportedAt)}</span>
                  <div className="muted">
                    {entry.status}
                    {entry.endpoint ? ` · ${entry.endpoint}` : ""}
                    {entry.message ? ` · ${entry.message.slice(0, 120)}` : ""}
                  </div>
                  <ProxyReceiptSummary receipt={entry.proxyReceipt} />
                  <div className="lead-detail-actions">
                    <button
                      className="secondary-button"
                      disabled={Boolean(pendingKey)}
                      onClick={() => void deliverHandoff(entry.target)}
                      type="button"
                    >
                      {entry.status === "failed" ? "Retry" : "Resend"} {entry.target}
                    </button>
                    {entry.proxyReceipt ? (
                      <button
                        className="secondary-button"
                        disabled={Boolean(pendingKey)}
                        onClick={() =>
                          void deliverHandoff("guardrail", {
                            guardrailSourceTraceId: entry.proxyReceipt?.traceId
                          })
                        }
                        type="button"
                      >
                        {pendingKey === `deliver-guardrail-${entry.proxyReceipt.traceId}`
                          ? "Sending..."
                          : "Send receipt to Guardrail"}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
    </>
  );
}
