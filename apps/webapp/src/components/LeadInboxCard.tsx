import Link from "next/link";

import type { LeadInboxItem, LeadStatus } from "@scout/domain";
import { Tag } from "@scout/ui";

import type { LeadAction, LeadMessage } from "./LeadInbox.helpers";
import { dueLabel, isDue, updatedAgeLabel } from "./LeadInbox.helpers";
import {
  formatLeadUpdatedAt,
  humanizeLeadValue,
  labelForLeadOutreachStatus,
  labelForLeadStatus,
  leadStatusOptions,
  toneForLeadOutreachStatus,
  toneForLeadStatus
} from "./lead-workflow-copy";
import { describeSampleQuality, toneForSampleQuality } from "./sample-quality-copy";

export function LeadInboxCard({
  item,
  messageByKey,
  pendingKey,
  runLeadAction,
  saveLead,
  selectedKeys,
  today,
  toggleSelected,
  updateLead
}: {
  item: LeadInboxItem;
  messageByKey: Record<string, LeadMessage>;
  pendingKey: string | null;
  runLeadAction: (item: LeadInboxItem, action: LeadAction) => Promise<void>;
  saveLead: (item: LeadInboxItem) => Promise<void>;
  selectedKeys: Set<string>;
  today: string;
  toggleSelected: (item: LeadInboxItem) => void;
  updateLead: (
    item: LeadInboxItem,
    apply: (annotation: LeadInboxItem["annotation"]) => LeadInboxItem["annotation"]
  ) => void;
}) {
  const itemKey = `${item.runId}:${item.candidateId}`;
  const message = messageByKey[itemKey];
  const selected = selectedKeys.has(itemKey);
  const saveBusy = pendingKey === `${itemKey}:save`;
  const analyzeBusy = pendingKey === `${itemKey}:analyze_contact`;
  const generateBusy = pendingKey === `${itemKey}:generate_draft`;
  const markContactedBusy = pendingKey === `${itemKey}:mark_contacted`;
  const canAnalyze = item.outreach.status === "no_draft";
  const canGenerate = item.outreach.status === "no_draft" || item.outreach.status === "contact_analyzed";
  const canMarkContacted =
    item.annotation.state !== "contacted" &&
    (item.outreach.status === "draft_ready" || item.outreach.status === "edited_saved");

  return (
              <li className="report-card lead-inbox-card" key={itemKey}>
                <div className="lead-inbox-card-head">
                  <div className="lead-select-title">
                    <input
                      aria-label={`Select ${item.businessName}`}
                      checked={selected}
                      disabled={Boolean(pendingKey)}
                      onChange={() => toggleSelected(item)}
                      type="checkbox"
                    />
                    <div className="lead-inbox-title">
                      <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{item.businessName}</div>
                      {item.primaryUrl ? (
                        <a className="inline-link" href={item.primaryUrl} target="_blank">
                          {item.primaryUrl}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="tag-row">
                    <Tag tone={toneForLeadStatus(item.annotation.state)}>
                      {labelForLeadStatus(item.annotation.state)}
                    </Tag>
                    {isDue(item, today) ? <Tag tone="warn">{dueLabel(item, today)}</Tag> : null}
                    <Tag tone={toneForLeadOutreachStatus(item.outreach.status)}>
                      {labelForLeadOutreachStatus(item.outreach.status)}
                    </Tag>
                    {item.shortlistRank ? <Tag tone="warn">Shortlist #{item.shortlistRank}</Tag> : null}
                    {item.priorityScore ? <Tag>{item.priorityScore} pts</Tag> : null}
                    <Tag>{updatedAgeLabel(item, today)}</Tag>
                  </div>
                </div>

                <div className="lead-inbox-meta">
                  <div>
                    <div className="section-label">Run</div>
                    <Link className="inline-link" href={`/runs/${encodeURIComponent(item.runId)}`}>
                      {item.marketTerm}
                    </Link>
                    <div className="muted">{item.rawQuery}</div>
                  </div>
                  <div className="tag-row">
                    {item.locationLabel ? <Tag>{item.locationLabel}</Tag> : null}
                    {item.presenceType ? <Tag>{humanizeLeadValue(item.presenceType)}</Tag> : null}
                    {item.presenceQuality ? <Tag>{humanizeLeadValue(item.presenceQuality)}</Tag> : null}
                    {item.confidence ? <Tag>{humanizeLeadValue(item.confidence)}</Tag> : null}
                    {item.sampleQuality ? (
                      <Tag tone={toneForSampleQuality(item.sampleQuality)}>
                        {describeSampleQuality(item.sampleQuality)}
                      </Tag>
                    ) : null}
                    {item.provenance ? (
                      <Tag tone={item.provenance === "manual" ? "warn" : "neutral"}>
                        {item.provenance === "manual" ? "Operator-entered" : humanizeLeadValue(item.provenance)}
                      </Tag>
                    ) : null}
                    <Tag>{item.findingCount} findings</Tag>
                    {item.highSeverityFindings > 0 ? (
                      <Tag tone="danger">{item.highSeverityFindings} high severity</Tag>
                    ) : null}
                  </div>
                </div>

                <div className="lead-inbox-outreach">
                  <div>
                    <div className="section-label">Next Action</div>
                    <div style={{ fontWeight: 700 }}>{item.outreach.nextAction}</div>
                    <div className="muted">
                      {item.outreach.recommendedChannelLabel ??
                        (item.outreach.recommendedChannel
                          ? humanizeLeadValue(item.outreach.recommendedChannel)
                          : "No recommended channel yet")}
                    </div>
                  </div>
                  <div className="lead-inbox-actions">
                    {canAnalyze ? (
                      <button
                        className="secondary-button"
                        disabled={Boolean(pendingKey)}
                        onClick={() => void runLeadAction(item, "analyze_contact")}
                        type="button"
                      >
                        {analyzeBusy ? "Analyzing..." : "Analyze Contact"}
                      </button>
                    ) : null}
                    {canGenerate ? (
                      <button
                        className="secondary-button"
                        disabled={Boolean(pendingKey)}
                        onClick={() => void runLeadAction(item, "generate_draft")}
                        type="button"
                      >
                        {generateBusy ? "Generating..." : "Generate Draft"}
                      </button>
                    ) : null}
                    {canMarkContacted ? (
                      <button
                        className="secondary-button"
                        disabled={Boolean(pendingKey)}
                        onClick={() => void runLeadAction(item, "mark_contacted")}
                        type="button"
                      >
                        {markContactedBusy ? "Marking..." : "Mark Contacted"}
                      </button>
                    ) : null}
                    <Link
                      className="secondary-button"
                      href={`/runs/${encodeURIComponent(item.runId)}`}
                    >
                      Report
                    </Link>
                    <Link
                      className="secondary-button"
                      href={`/leads/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`}
                    >
                      Details
                    </Link>
                    <Link
                      className="link-button"
                      href={`/runs/${encodeURIComponent(item.runId)}#outreach-workspace`}
                    >
                      Outreach
                    </Link>
                  </div>
                </div>

                {item.reasons.length > 0 || item.topIssues.length > 0 ? (
                  <ul className="note-list">
                    {item.topIssues.slice(0, 2).map((issue) => (
                      <li key={`${itemKey}-issue-${issue}`}>{humanizeLeadValue(issue)}</li>
                    ))}
                    {item.reasons.slice(0, 2).map((reason, index) => (
                      <li key={`${itemKey}-reason-${index}`}>{reason}</li>
                    ))}
                  </ul>
                ) : null}

                {item.handoffHistory.length ? (
                  <div className="tag-row">
                    {item.handoffHistory.slice(0, 3).map((entry) => (
                      <Tag
                        key={`${itemKey}-${entry.target}-${entry.traceId}-${entry.exportedAt}`}
                        tone={entry.status === "failed" ? "danger" : "good"}
                      >
                        {entry.target}: {entry.status}
                      </Tag>
                    ))}
                  </div>
                ) : null}

                <div className="lead-inbox-controls">
                  <label className="field-stack">
                    <span className="section-label">State</span>
                    <select
                      className="draft-input"
                      onChange={(event) =>
                        updateLead(item, (annotation) => ({
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
                        updateLead(item, (annotation) => ({
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
                      updateLead(item, (annotation) => ({
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
                    onClick={() => void saveLead(item)}
                    type="button"
                  >
                    {saveBusy ? "Saving..." : "Save"}
                  </button>
                </div>
              </li>
  );
}
