"use client";

import Link from "next/link";
import { useState } from "react";

import {
  leadAnnotationResponseSchema,
  leadInboxItemResponseSchema,
  listOutreachDraftsResponseSchema
} from "@scout/api-contracts";
import type {
  AuditFinding,
  LeadInboxItem,
  LeadStatus,
  OutreachDraft,
  SearchCandidate
} from "@scout/domain";
import { Tag } from "@scout/ui";

import {
  formatLeadUpdatedAt,
  humanizeLeadValue,
  labelForLeadOutreachStatus,
  labelForLeadStatus,
  leadStatusOptions,
  toneForLeadOutreachStatus,
  toneForLeadStatus
} from "./lead-workflow-copy";
import {
  describeSampleQuality,
  toneForSampleQuality
} from "./sample-quality-copy";

type LeadAction = "analyze_contact" | "generate_draft" | "mark_contacted";
type HandoffTarget = "assembly" | "proxy" | "guardrail";
type ScoutEndpointConfig = Record<HandoffTarget, string>;
type HandoffHealthResult = {
  target: HandoffTarget;
  ok: boolean;
  endpoint?: string;
  status: string | number;
  message: string;
};

interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

interface LeadTimelineEntry {
  label: string;
  value: string;
  detail: string;
}

const endpointStorageKey = "tenra-scout-suite-endpoints:v1";
const defaultEndpointConfig: ScoutEndpointConfig = {
  assembly: "",
  proxy: "",
  guardrail: ""
};
const suiteEndpointPresets: ScoutEndpointConfig = {
  assembly: "http://localhost:3001/api/handoffs/scout-opportunity",
  proxy: "http://localhost:5173/api/shape-external-output",
  guardrail: "http://localhost:5174/api/external-reviews"
};

function isEndpointConfig(value: unknown): value is Partial<ScoutEndpointConfig> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (["assembly", "proxy", "guardrail"] as const).every((target) => {
    const endpoint = (value as Partial<Record<HandoffTarget, unknown>>)[target];
    return endpoint === undefined || typeof endpoint === "string";
  });
}

function readEndpointConfig(): ScoutEndpointConfig {
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

function writeEndpointConfig(config: ScoutEndpointConfig) {
  window.localStorage.setItem(endpointStorageKey, JSON.stringify(config));
}

function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function buildTimeline(item: LeadInboxItem, draft?: OutreachDraft): LeadTimelineEntry[] {
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

function resolveRecommendedChannel(draft?: OutreachDraft) {
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

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}

function buildMailtoHref(draft: OutreachDraft | undefined): string | null {
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

export function LeadDetailView({
  initialItem,
  initialDraft,
  findings,
  candidate
}: {
  initialItem: LeadInboxItem;
  initialDraft?: OutreachDraft | undefined;
  findings: AuditFinding[];
  candidate?: SearchCandidate | undefined;
}) {
  const [item, setItem] = useState(initialItem);
  const [draft, setDraft] = useState<OutreachDraft | undefined>(initialDraft);
  const [message, setMessage] = useState<LeadMessage | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [endpointConfig, setEndpointConfig] = useState<ScoutEndpointConfig>(readEndpointConfig);
  const [endpointHealth, setEndpointHealth] = useState<HandoffHealthResult[]>([]);
  const recommendedChannel = resolveRecommendedChannel(draft);
  const mailtoHref = buildMailtoHref(draft);
  const contactFormUrl = draft?.contactChannels.find((channel) => channel.kind === "contact_form")?.url;
  const phoneChannel = draft?.contactChannels.find((channel) => channel.kind === "phone");
  const timeline = buildTimeline(item, draft);
  const hasDraft = Boolean(draft?.subjectLine.trim() || draft?.body.trim() || draft?.shortMessage?.trim());

  function updateAnnotation(apply: (annotation: LeadInboxItem["annotation"]) => LeadInboxItem["annotation"]) {
    setItem((current) => ({
      ...current,
      annotation: apply(current.annotation)
    }));
    setMessage({ text: "Unsaved", tone: "neutral" });
  }

  async function saveLead() {
    if (pendingKey) {
      return;
    }

    setPendingKey("save");
    const response = await fetch(
      `/api/runs/${encodeURIComponent(item.runId)}/leads/${encodeURIComponent(item.candidateId)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          state: item.annotation.state,
          operatorNote: item.annotation.operatorNote,
          followUpDate: item.annotation.followUpDate || null
        })
      }
    );

    if (!response.ok) {
      setMessage({ text: await readErrorMessage(response), tone: "danger" });
      setPendingKey(null);
      return;
    }

    const body = leadAnnotationResponseSchema.parse(await response.json());
    if (body.annotation) {
      setItem((current) => ({
        ...current,
        annotation: body.annotation!
      }));
    }

    setMessage({ text: "Saved", tone: "good" });
    setPendingKey(null);
  }

  async function refreshDraft(runId: string, candidateId: string) {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/outreach`, {
      method: "GET"
    });

    if (!response.ok) {
      setMessage({ text: await readErrorMessage(response), tone: "danger" });
      return;
    }

    const body = listOutreachDraftsResponseSchema.parse(await response.json());
    setDraft(body.drafts.find((entry) => entry.candidateId === candidateId));
  }

  async function runAction(action: LeadAction) {
    if (pendingKey) {
      return;
    }

    setPendingKey(action);
    setMessage({
      text:
        action === "analyze_contact"
          ? "Analyzing contact..."
          : action === "generate_draft"
            ? "Generating draft..."
            : "Marking contacted...",
      tone: "neutral"
    });

    const response = await fetch(
      `/api/leads/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}/actions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ action })
      }
    );

    if (!response.ok) {
      setMessage({ text: await readErrorMessage(response), tone: "danger" });
      setPendingKey(null);
      return;
    }

    const body = leadInboxItemResponseSchema.parse(await response.json());
    if (body.item) {
      setItem(body.item);
      if (action === "analyze_contact" || action === "generate_draft") {
        await refreshDraft(body.item.runId, body.item.candidateId);
      }
    }

    setMessage({
      text:
        action === "analyze_contact"
          ? "Contact analyzed"
          : action === "generate_draft"
            ? "Draft ready"
            : "Marked contacted",
      tone: "good"
    });
    setPendingKey(null);
  }

  async function copyText(label: string, value: string) {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setMessage({ text: `${label} copied`, tone: "good" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Clipboard copy failed.",
        tone: "danger"
      });
    }
  }

  async function deliverHandoff(target: HandoffTarget) {
    if (pendingKey) {
      return;
    }

    setPendingKey(`deliver-${target}`);
    const response = await fetch(
      `/api/handoffs/deliver/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ target, endpoint: endpointConfig[target].trim() || undefined })
      }
    );

    const body = (await response.json()) as {
      ok?: boolean;
      delivered?: boolean;
      deliveryMode?: string;
      fallback?: unknown;
      handoffHistory?: LeadInboxItem["handoffHistory"];
      errorMessage?: string;
    };

    if (!response.ok || !body.ok) {
      setMessage({ text: body.errorMessage ?? "Handoff delivery failed.", tone: "danger" });
      setPendingKey(null);
      return;
    }

    if (!body.delivered && body.fallback) {
      await navigator.clipboard?.writeText(JSON.stringify(body.fallback, null, 2));
    }

    if (body.handoffHistory) {
      setItem((current) => ({ ...current, handoffHistory: body.handoffHistory ?? [] }));
    }

    setMessage({
      text: body.delivered
        ? `Sent to ${target}`
        : `${target} endpoint not configured; JSON fallback copied`,
      tone: body.delivered ? "good" : "neutral"
    });
    setPendingKey(null);
  }

  async function checkEndpointHealth() {
    if (pendingKey) {
      return;
    }

    setPendingKey("endpoint-health");
    try {
      const response = await fetch("/api/handoffs/health", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(endpointConfig)
      });
      const body = (await response.json()) as {
        ok?: boolean;
        results?: HandoffHealthResult[];
        errorMessage?: string;
      };
      if (!response.ok || !body.results) {
        throw new Error(body.errorMessage ?? "Endpoint health check failed.");
      }
      setEndpointHealth(body.results);
      setMessage({
        text: body.results.filter((result) => result.ok).length
          ? "Endpoint health checked"
          : "No reachable endpoints found",
        tone: body.results.some((result) => !result.ok && result.status !== "not-configured") ? "danger" : "neutral"
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Endpoint health check failed.", tone: "danger" });
    } finally {
      setPendingKey(null);
    }
  }

  function updateEndpoint(target: HandoffTarget, value: string) {
    setEndpointConfig((current) => {
      const next = { ...current, [target]: value };
      writeEndpointConfig(next);
      return next;
    });
  }

  function applyEndpointPresets() {
    setEndpointConfig(suiteEndpointPresets);
    writeEndpointConfig(suiteEndpointPresets);
    setMessage({ text: "Suite handoff destination presets applied.", tone: "good" });
  }

  return (
    <div className="scout-shell">
      <div className="lead-detail-hero report-card">
        <div className="lead-detail-title">
          <div>
            <div className="section-label">Lead</div>
            <h2>{item.businessName}</h2>
            {item.primaryUrl ? (
              <a className="inline-link" href={item.primaryUrl} target="_blank" rel="noreferrer">
                {item.primaryUrl}
              </a>
            ) : null}
          </div>
          <div className="tag-row">
            <Tag tone={toneForLeadStatus(item.annotation.state)}>
              {labelForLeadStatus(item.annotation.state)}
            </Tag>
            <Tag tone={toneForLeadOutreachStatus(item.outreach.status)}>
              {labelForLeadOutreachStatus(item.outreach.status)}
            </Tag>
            {item.sampleQuality ? (
              <Tag tone={toneForSampleQuality(item.sampleQuality)}>
                {describeSampleQuality(item.sampleQuality)}
              </Tag>
            ) : null}
            {item.shortlistRank ? <Tag tone="warn">Shortlist #{item.shortlistRank}</Tag> : null}
          </div>
        </div>

        <div className="lead-detail-actions">
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("analyze_contact")}
            type="button"
          >
            {pendingKey === "analyze_contact" ? "Analyzing..." : "Analyze Contact"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("generate_draft")}
            type="button"
          >
            {pendingKey === "generate_draft" ? "Generating..." : "Generate Draft"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("mark_contacted")}
            type="button"
          >
            {pendingKey === "mark_contacted" ? "Marking..." : "Mark Contacted"}
          </button>
          <Link className="link-button" href={`/runs/${encodeURIComponent(item.runId)}`}>
            Report
          </Link>
          <a
            className="secondary-button"
            href={`/api/handoffs/opportunity/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Export Handoff
          </a>
          <a
            className="secondary-button"
            href={`/api/handoffs/proxy-shape/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Proxy Shape JSON
          </a>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void deliverHandoff("assembly")}
            type="button"
          >
            {pendingKey === "deliver-assembly" ? "Sending..." : "Send Assembly"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void deliverHandoff("proxy")}
            type="button"
          >
            {pendingKey === "deliver-proxy" ? "Sending..." : "Send Proxy"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void deliverHandoff("guardrail")}
            type="button"
          >
            {pendingKey === "deliver-guardrail" ? "Sending..." : "Send Guardrail"}
          </button>
          </div>
        </div>

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
                  <div className="lead-detail-actions">
                    <button
                      className="secondary-button"
                      disabled={Boolean(pendingKey)}
                      onClick={() => void deliverHandoff(entry.target)}
                      type="button"
                    >
                      {entry.status === "failed" ? "Retry" : "Resend"} {entry.target}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

      <div className="scout-grid report-overview-grid">
        <section className="report-card lead-detail-section">
          <div className="section-label">Timeline</div>
          <ol className="lead-timeline">
            {timeline.map((entry) => (
              <li key={`${entry.label}-${entry.value}`}>
                <strong>{entry.label}</strong>
                <span>{entry.value}</span>
                <div className="muted">{entry.detail}</div>
              </li>
            ))}
          </ol>
        </section>

        <section className="report-card lead-detail-section">
          <div className="section-label">Lead State</div>
          <div className="lead-inbox-controls">
            <label className="field-stack">
              <span className="section-label">State</span>
              <select
                className="draft-input"
                onChange={(event) =>
                  updateAnnotation((annotation) => ({
                    ...annotation,
                    state: event.target.value as LeadStatus
                  }))
                }
                value={item.annotation.state}
              >
                {leadStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span className="section-label">Follow Up</span>
              <input
                className="draft-input"
                onChange={(event) =>
                  updateAnnotation((annotation) => ({
                    ...annotation,
                    followUpDate: event.target.value || undefined
                  }))
                }
                type="date"
                value={item.annotation.followUpDate ?? ""}
              />
            </label>
          </div>
          <label className="field-stack">
            <span className="section-label">Operator Note</span>
            <textarea
              className="draft-textarea lead-note-textarea"
              maxLength={1600}
              onChange={(event) =>
                updateAnnotation((annotation) => ({
                  ...annotation,
                  operatorNote: event.target.value
                }))
              }
              value={item.annotation.operatorNote}
            />
          </label>
          <div className="lead-inbox-save-row">
            {message ? (
              <span className={`status-note ${message.tone}`}>{message.text}</span>
            ) : (
              <span className="muted">Updated {formatLeadUpdatedAt(item.annotation.updatedAt)}</span>
            )}
            <button
              className="link-button"
              disabled={Boolean(pendingKey)}
              onClick={() => void saveLead()}
              type="button"
            >
              {pendingKey === "save" ? "Saving..." : "Save"}
            </button>
          </div>
        </section>

        <section className="report-card lead-detail-section">
          <div className="section-label">Outreach Handoff</div>
          <div className="tag-row">
            {recommendedChannel ? <Tag tone="good">Best fit: {recommendedChannel.label}</Tag> : null}
            {draft?.recommendedChannel ? <Tag>{humanizeLeadValue(draft.recommendedChannel)}</Tag> : null}
            {hasDraft ? <Tag tone="good">Draft ready</Tag> : <Tag>No draft</Tag>}
          </div>
          {recommendedChannel ? (
            <p className="muted" style={{ margin: 0 }}>
              {recommendedChannel.reason}
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Analyze contact fit to let Scout inspect this business for the best first channel.
            </p>
          )}
          <div className="lead-detail-actions">
            {mailtoHref ? (
              <a className="secondary-button" href={mailtoHref}>
                Open Email
              </a>
            ) : null}
            {contactFormUrl ? (
              <a className="secondary-button" href={contactFormUrl} target="_blank" rel="noreferrer">
                Open Contact Form
              </a>
            ) : null}
            {phoneChannel?.value ? <Tag tone="warn">{phoneChannel.value}</Tag> : null}
            {draft?.body ? (
              <button
                className="secondary-button"
                onClick={() =>
                  void copyText("Email", `Subject: ${draft.subjectLine}\n\n${draft.body}`)
                }
                type="button"
              >
                Copy Email
              </button>
            ) : null}
            {draft?.shortMessage ? (
              <button
                className="secondary-button"
                onClick={() => void copyText("Short message", draft.shortMessage ?? "")}
                type="button"
              >
                Copy Short Message
              </button>
            ) : null}
          </div>
          {draft?.subjectLine ? (
            <div className="section-stack">
              <div className="section-label">Subject</div>
              <div>{draft.subjectLine}</div>
            </div>
          ) : null}
          {draft?.body ? (
            <div className="section-stack">
              <div className="section-label">Email Draft</div>
              <pre className="lead-detail-pre">{draft.body}</pre>
            </div>
          ) : null}
          {draft?.phoneTalkingPoints ? (
            <div className="section-stack">
              <div className="section-label">Phone Notes</div>
              <ul className="note-list">
                <li>{draft.phoneTalkingPoints.opener}</li>
                {draft.phoneTalkingPoints.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
                <li>{draft.phoneTalkingPoints.close}</li>
              </ul>
            </div>
          ) : null}
        </section>

        <section className="report-card lead-detail-section">
          <div className="section-label">Evidence Context</div>
          <div className="tag-row">
            {item.presenceType ? <Tag>{humanizeLeadValue(item.presenceType)}</Tag> : null}
            {item.presenceQuality ? <Tag>{humanizeLeadValue(item.presenceQuality)}</Tag> : null}
            {item.confidence ? <Tag>{humanizeLeadValue(item.confidence)}</Tag> : null}
            <Tag>{item.findingCount} findings</Tag>
            {item.highSeverityFindings > 0 ? (
              <Tag tone="danger">{item.highSeverityFindings} high severity</Tag>
            ) : null}
          </div>
          {candidate?.provenanceNote ? (
            <p className="muted" style={{ margin: 0 }}>
              {candidate.provenanceNote}
            </p>
          ) : null}
          {item.reasons.length > 0 ? (
            <ul className="note-list">
              {item.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {findings.length > 0 ? (
            <table className="finding-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Severity</th>
                  <th>Viewport</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={finding.id}>
                    <td>
                      <div>{finding.message}</div>
                      <div className="muted">{finding.reproductionNote}</div>
                    </td>
                    <td>{humanizeLeadValue(finding.severity)}</td>
                    <td>{humanizeLeadValue(finding.viewport)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No deterministic findings are attached to this candidate.
            </p>
          )}
          {findings.some((finding) => finding.screenshotUrl) ? (
            <div className="evidence-grid">
              {findings
                .filter((finding) => finding.screenshotUrl)
                .slice(0, 4)
                .map((finding) => (
                  <div className="evidence-card" key={`evidence-${finding.id}`}>
                    <img alt={finding.message} src={finding.screenshotUrl} />
                    <div className="muted">
                      {humanizeLeadValue(finding.pageLabel)} / {humanizeLeadValue(finding.viewport)}
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
