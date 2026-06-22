"use client";

import { useMemo, useState } from "react";

import { leadAnnotationResponseSchema } from "@scout/api-contracts";
import type { LeadAnnotation, LeadStatus } from "@scout/domain";
import { Tag } from "@scout/ui";

import {
  formatLeadUpdatedAt,
  labelForLeadStatus,
  leadStatusOptions,
  toneForLeadStatus
} from "./lead-workflow-copy";

/* Triage item contract */

export interface LeadTriageItem {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  presenceType: string;
  presenceQuality: string;
  confidence: string;
  findingCount: number;
  highSeverityFindings: number;
  topIssues: string[];
  reasons: string[];
  shortlistRank?: number | undefined;
  priorityScore?: number | undefined;
  annotation?: LeadAnnotation | undefined;
}

type LeadFilter = "all" | "open" | "saved" | "contacted" | "closed";

interface EditableLeadAnnotation {
  state: LeadStatus;
  operatorNote: string;
  followUpDate: string;
  updatedAt?: string | undefined;
}

interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

const statusOptions: Array<{ value: LeadStatus; label: string }> = [
  ...leadStatusOptions
];

const filterOptions: Array<{ value: LeadFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" }
];

function buildInitialState(items: LeadTriageItem[]): Record<string, EditableLeadAnnotation> {
  return Object.fromEntries(
    items.map((item) => [
      item.candidateId,
      {
        state: item.annotation?.state ?? "needs_review",
        operatorNote: item.annotation?.operatorNote ?? "",
        followUpDate: item.annotation?.followUpDate ?? "",
        updatedAt: item.annotation?.updatedAt
      }
    ])
  );
}

function matchesFilter(state: LeadStatus, filter: LeadFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return state === "needs_review";
  }

  if (filter === "closed") {
    return state === "dismissed" || state === "not_a_fit";
  }

  return state === filter;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}

export function LeadTriagePanel({
  runId,
  items
}: {
  runId: string;
  items: LeadTriageItem[];
}) {
  const [annotationsByCandidate, setAnnotationsByCandidate] = useState(() =>
    buildInitialState(items)
  );
  const [filter, setFilter] = useState<LeadFilter>("all");
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);
  const [messageByCandidate, setMessageByCandidate] = useState<Record<string, LeadMessage>>({});

  /* Triage state boundary */

  const counts = useMemo(() => {
    const next = Object.fromEntries(
      statusOptions.map((option) => [option.value, 0])
    ) as Record<LeadStatus, number>;

    for (const item of items) {
      const state = annotationsByCandidate[item.candidateId]?.state ?? "needs_review";
      next[state] += 1;
    }

    return next;
  }, [annotationsByCandidate, items]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const isUnsaved = messageByCandidate[item.candidateId]?.text === "Unsaved";
        return (
          isUnsaved ||
          matchesFilter(annotationsByCandidate[item.candidateId]?.state ?? "needs_review", filter)
        );
      }),
    [annotationsByCandidate, filter, items, messageByCandidate]
  );

  /* Annotation save boundary */

  function updateAnnotation(
    candidateId: string,
    apply: (current: EditableLeadAnnotation) => EditableLeadAnnotation
  ) {
    setAnnotationsByCandidate((current) => ({
      ...current,
      [candidateId]: apply(
        current[candidateId] ?? {
          state: "needs_review",
          operatorNote: "",
          followUpDate: ""
        }
      )
    }));
    setMessageByCandidate((current) => ({
      ...current,
      [candidateId]: { text: "Unsaved", tone: "neutral" }
    }));
  }

  async function saveAnnotation(candidateId: string) {
    const annotation = annotationsByCandidate[candidateId];
    if (!annotation || pendingCandidateId) {
      return;
    }

    setPendingCandidateId(candidateId);

    const response = await fetch(
      `/api/runs/${encodeURIComponent(runId)}/leads/${encodeURIComponent(candidateId)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          state: annotation.state,
          operatorNote: annotation.operatorNote,
          followUpDate: annotation.followUpDate || null
        })
      }
    );

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: { text: errorMessage, tone: "danger" }
      }));
      setPendingCandidateId(null);
      return;
    }

    const body = leadAnnotationResponseSchema.parse(await response.json());
    if (body.annotation) {
      setAnnotationsByCandidate((current) => ({
        ...current,
        [candidateId]: {
          state: body.annotation!.state,
          operatorNote: body.annotation!.operatorNote,
          followUpDate: body.annotation!.followUpDate ?? "",
          updatedAt: body.annotation!.updatedAt
        }
      }));
    }

    setMessageByCandidate((current) => ({
      ...current,
      [candidateId]: { text: "Saved", tone: "good" }
    }));
    setPendingCandidateId(null);
  }

  /* Triage layout boundary */

  return (
    <div className="lead-triage">
      <div className="lead-triage-toolbar">
        <div className="tag-row">
          <Tag>{items.length} Leads</Tag>
          <Tag>{counts.needs_review} Open</Tag>
          <Tag tone="good">{counts.saved} Saved</Tag>
          <Tag tone="warn">{counts.contacted} Contacted</Tag>
          <Tag tone="danger">{counts.dismissed + counts.not_a_fit} Closed</Tag>
        </div>

        <div className="lead-triage-actions">
          <a
            className="secondary-button"
            href={`/api/runs/${encodeURIComponent(runId)}/leads/export?format=csv`}
          >
            CSV
          </a>
          <a
            className="secondary-button"
            href={`/api/runs/${encodeURIComponent(runId)}/leads/export?format=markdown`}
          >
            Markdown
          </a>
        </div>
      </div>

      <div className="outreach-toolbar" role="tablist" aria-label="Lead filter">
        {filterOptions.map((option) => (
          <button
            aria-selected={filter === option.value}
            className={`pill-button${filter === option.value ? " active" : ""}`}
            key={option.value}
            onClick={() => setFilter(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {visibleItems.length > 0 ? (
        <ul className="lead-triage-list">
          {visibleItems.map((item) => {
            const annotation = annotationsByCandidate[item.candidateId] ?? {
              state: "needs_review",
              operatorNote: "",
              followUpDate: ""
            };
            const message = messageByCandidate[item.candidateId];
            const busy = pendingCandidateId === item.candidateId;

            return (
              <li className="report-card lead-triage-card" key={item.candidateId}>
                <div className="lead-triage-card-head">
                  <div className="lead-triage-title">
                    <div style={{ fontSize: "1.04rem", fontWeight: 700 }}>{item.businessName}</div>
                    <a className="inline-link" href={item.primaryUrl} target="_blank">
                      {item.primaryUrl}
                    </a>
                  </div>
                  <div className="tag-row">
                    <Tag tone={toneForLeadStatus(annotation.state)}>
                      {labelForLeadStatus(annotation.state)}
                    </Tag>
                    {item.shortlistRank ? <Tag tone="warn">Shortlist #{item.shortlistRank}</Tag> : null}
                    {item.priorityScore ? <Tag>{item.priorityScore} pts</Tag> : null}
                  </div>
                </div>

                <div className="tag-row">
                  <Tag>{item.presenceType}</Tag>
                  <Tag>{item.presenceQuality}</Tag>
                  <Tag>{item.confidence}</Tag>
                  <Tag>{item.findingCount} findings</Tag>
                  {item.highSeverityFindings > 0 ? (
                    <Tag tone="danger">{item.highSeverityFindings} high severity</Tag>
                  ) : null}
                  {item.topIssues.slice(0, 3).map((issue) => (
                    <Tag key={issue} tone="warn">
                      {issue}
                    </Tag>
                  ))}
                </div>

                {item.reasons.length > 0 ? (
                  <ul className="note-list">
                    {item.reasons.slice(0, 2).map((reason, index) => (
                      <li key={`${item.candidateId}-lead-reason-${index}`}>{reason}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="lead-triage-controls">
                  <label className="field-stack">
                    <span className="section-label">State</span>
                    <select
                      className="draft-input"
                      onChange={(event) =>
                        updateAnnotation(item.candidateId, (current) => ({
                          ...current,
                          state: event.target.value as LeadStatus
                        }))
                      }
                      value={annotation.state}
                    >
                      {statusOptions.map((option) => (
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
                        updateAnnotation(item.candidateId, (current) => ({
                          ...current,
                          followUpDate: event.target.value
                        }))
                      }
                      type="date"
                      value={annotation.followUpDate}
                    />
                  </label>
                </div>

                <label className="field-stack">
                  <span className="section-label">Operator Note</span>
                  <textarea
                    className="draft-textarea lead-note-textarea"
                    maxLength={1600}
                    onChange={(event) =>
                      updateAnnotation(item.candidateId, (current) => ({
                        ...current,
                        operatorNote: event.target.value
                      }))
                    }
                    value={annotation.operatorNote}
                  />
                </label>

                <div className="lead-triage-save-row">
                  {message ? (
                    <span className={`status-note ${message.tone}`}>{message.text}</span>
                  ) : annotation.updatedAt ? (
                    <span className="muted">Updated {formatLeadUpdatedAt(annotation.updatedAt)}</span>
                  ) : null}
                  <button
                    className="link-button"
                    disabled={Boolean(pendingCandidateId)}
                    onClick={() => void saveAnnotation(item.candidateId)}
                    type="button"
                  >
                    {busy ? "Saving..." : "Save"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No leads match this filter.
        </p>
      )}
    </div>
  );
}
