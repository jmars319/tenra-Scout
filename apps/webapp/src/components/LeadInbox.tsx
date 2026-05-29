"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  leadInboxBulkActionResponseSchema,
  leadAnnotationResponseSchema,
  leadInboxItemResponseSchema
} from "@scout/api-contracts";
import type { LeadInboxItem, LeadStatus } from "@scout/domain";
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

type LeadInboxFilter =
  | "all"
  | "open"
  | "needs_draft"
  | "ready"
  | "saved"
  | "contacted"
  | "closed"
  | "due";
type LeadBulkAction = "mark_contacted" | "dismiss" | "mark_not_a_fit" | "set_follow_up";

interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

const filterOptions: Array<{ value: LeadInboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "open", label: "Open" },
  { value: "needs_draft", label: "Needs Draft" },
  { value: "ready", label: "Ready" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" }
];

type LeadAction = "analyze_contact" | "generate_draft" | "mark_contacted";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function isDue(item: LeadInboxItem, today: string): boolean {
  return Boolean(
    item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  );
}

function isReady(item: LeadInboxItem): boolean {
  return item.outreach.status === "draft_ready" || item.outreach.status === "edited_saved";
}

function needsDraft(item: LeadInboxItem): boolean {
  return (
    !isClosed(item.annotation.state) &&
    item.annotation.state !== "contacted" &&
    !isReady(item)
  );
}

function dayValue(value: string | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function daysSince(value: string, today: string): number {
  return Math.max(0, Math.floor((dayValue(today) - dayValue(value)) / MS_PER_DAY));
}

function updatedAgeLabel(item: LeadInboxItem, today: string): string {
  const age = daysSince(item.annotation.updatedAt, today);

  if (age === 0) {
    return "Updated today";
  }

  return `Updated ${age}d ago`;
}

function urgencyRank(item: LeadInboxItem, today: string): number {
  if (isDue(item, today)) {
    return 0;
  }

  if (isReady(item) && item.annotation.state !== "contacted") {
    return 1;
  }

  if (needsDraft(item)) {
    return 2;
  }

  if (item.annotation.state === "contacted") {
    return 3;
  }

  if (item.annotation.state === "saved") {
    return 4;
  }

  return 5;
}

function sortLeadInboxItems(left: LeadInboxItem, right: LeadInboxItem, today: string): number {
  return (
    urgencyRank(left, today) - urgencyRank(right, today) ||
    dayValue(left.annotation.followUpDate) - dayValue(right.annotation.followUpDate) ||
    (right.priorityScore ?? 0) - (left.priorityScore ?? 0) ||
    right.annotation.updatedAt.localeCompare(left.annotation.updatedAt)
  );
}

function matchesFilter(item: LeadInboxItem, filter: LeadInboxFilter, today: string): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return item.annotation.state === "needs_review";
  }

  if (filter === "needs_draft") {
    return needsDraft(item);
  }

  if (filter === "ready") {
    return (
      !isClosed(item.annotation.state) &&
      item.annotation.state !== "contacted" &&
      isReady(item)
    );
  }

  if (filter === "closed") {
    return isClosed(item.annotation.state);
  }

  if (filter === "due") {
    return isDue(item, today);
  }

  return item.annotation.state === filter;
}

function dueLabel(item: LeadInboxItem, today: string): string {
  if (!item.annotation.followUpDate) {
    return "Due";
  }

  if (item.annotation.followUpDate < today) {
    return "Overdue";
  }

  return "Due Today";
}

function matchesSearch(item: LeadInboxItem, query: string): boolean {
  const search = query.trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [
    item.businessName,
    item.primaryUrl,
    item.rawQuery,
    item.marketTerm,
    item.locationLabel ?? "",
    item.annotation.operatorNote,
    ...item.reasons
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function buildExportHref(format: "csv" | "markdown", filter: LeadInboxFilter, query: string): string {
  const params = new URLSearchParams({ format });
  const trimmed = query.trim();

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (trimmed) {
    params.set("q", trimmed);
  }

  return `/api/leads/export?${params.toString()}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}

export function LeadInbox({
  initialItems,
  initialFilter,
  initialSearch = "",
  today
}: {
  initialItems: LeadInboxItem[];
  initialFilter?: LeadInboxFilter | undefined;
  initialSearch?: string | undefined;
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<LeadInboxFilter>(() =>
    initialFilter ?? (initialItems.some((item) => isDue(item, today)) ? "due" : "all")
  );
  const [query, setQuery] = useState(initialSearch);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [messageByKey, setMessageByKey] = useState<Record<string, LeadMessage>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState(today);
  const [bulkMessage, setBulkMessage] = useState<LeadMessage | null>(null);

  const counts = useMemo(() => {
    return {
      total: items.length,
      due: items.filter((item) => isDue(item, today)).length,
      open: items.filter((item) => item.annotation.state === "needs_review").length,
      needsDraft: items.filter(needsDraft).length,
      ready: items.filter(
        (item) =>
          !isClosed(item.annotation.state) &&
          item.annotation.state !== "contacted" &&
          isReady(item)
      ).length,
      saved: items.filter((item) => item.annotation.state === "saved").length,
      contacted: items.filter((item) => item.annotation.state === "contacted").length,
      closed: items.filter((item) => isClosed(item.annotation.state)).length
    };
  }, [items, today]);

  const visibleItems = useMemo(
    () => {
      const filtered = items.filter((item) => {
        const itemKey = `${item.runId}:${item.candidateId}`;
        const isUnsaved = messageByKey[itemKey]?.text === "Unsaved";
        return (isUnsaved || matchesFilter(item, filter, today)) && matchesSearch(item, query);
      });

      return filtered.sort((left, right) => sortLeadInboxItems(left, right, today));
    },
    [filter, items, messageByKey, query, today]
  );
  const nextLead = useMemo(
    () => visibleItems.find((item) => !isClosed(item.annotation.state)) ?? null,
    [visibleItems]
  );
  const visibleKeys = useMemo(
    () => visibleItems.map((item) => `${item.runId}:${item.candidateId}`),
    [visibleItems]
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(`${item.runId}:${item.candidateId}`)),
    [items, selectedKeys]
  );
  const selectedVisibleCount = visibleKeys.filter((key) => selectedKeys.has(key)).length;
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;

  function updateLead(
    item: LeadInboxItem,
    apply: (annotation: LeadInboxItem["annotation"]) => LeadInboxItem["annotation"]
  ) {
    const itemKey = `${item.runId}:${item.candidateId}`;
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.runId === item.runId && currentItem.candidateId === item.candidateId
          ? { ...currentItem, annotation: apply(currentItem.annotation) }
          : currentItem
      )
    );
    setMessageByKey((current) => ({
      ...current,
      [itemKey]: { text: "Unsaved", tone: "neutral" }
    }));
  }

  function replaceLead(item: LeadInboxItem) {
    replaceLeads([item]);
  }

  function replaceLeads(updatedItems: LeadInboxItem[]) {
    const updatedByKey = new Map(
      updatedItems.map((item) => [`${item.runId}:${item.candidateId}`, item])
    );

    setItems((current) =>
      current.map(
        (currentItem) =>
          updatedByKey.get(`${currentItem.runId}:${currentItem.candidateId}`) ?? currentItem
      )
    );
  }

  function toggleSelected(item: LeadInboxItem) {
    const itemKey = `${item.runId}:${item.candidateId}`;

    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }

      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const key of visibleKeys) {
          next.delete(key);
        }
      } else {
        for (const key of visibleKeys) {
          next.add(key);
        }
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  async function saveLead(item: LeadInboxItem) {
    const itemKey = `${item.runId}:${item.candidateId}`;
    const actionKey = `${itemKey}:save`;

    if (pendingKey) {
      return;
    }

    setPendingKey(actionKey);

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
      const errorMessage = await readErrorMessage(response);
      setMessageByKey((current) => ({
        ...current,
        [itemKey]: { text: errorMessage, tone: "danger" }
      }));
      setPendingKey(null);
      return;
    }

    const body = leadAnnotationResponseSchema.parse(await response.json());
    if (body.annotation) {
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.runId === item.runId && currentItem.candidateId === item.candidateId
            ? { ...currentItem, annotation: body.annotation! }
            : currentItem
        )
      );
    }

    setMessageByKey((current) => ({
      ...current,
      [itemKey]: { text: "Saved", tone: "good" }
    }));
    setPendingKey(null);
  }

  async function runBulkAction(action: LeadBulkAction) {
    if (pendingKey || selectedItems.length === 0) {
      return;
    }

    const actionKey = `bulk:${action}`;
    setPendingKey(actionKey);
    setBulkMessage({
      text:
        action === "mark_contacted"
          ? "Marking selected leads contacted..."
          : action === "dismiss"
            ? "Dismissing selected leads..."
            : action === "mark_not_a_fit"
              ? "Closing selected leads..."
              : "Saving selected follow-ups...",
      tone: "neutral"
    });

    const response = await fetch("/api/leads/bulk-actions", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        items: selectedItems.map((item) => ({
          runId: item.runId,
          candidateId: item.candidateId
        })),
        action:
          action === "set_follow_up"
            ? { action, followUpDate: bulkFollowUpDate || null }
            : { action }
      })
    });

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      setBulkMessage({ text: errorMessage, tone: "danger" });
      setPendingKey(null);
      return;
    }

    const body = leadInboxBulkActionResponseSchema.parse(await response.json());
    replaceLeads(body.items);
    setBulkMessage({
      text: `Updated ${body.items.length} selected lead${body.items.length === 1 ? "" : "s"}`,
      tone: "good"
    });
    clearSelection();
    setPendingKey(null);
  }

  async function runLeadAction(item: LeadInboxItem, action: LeadAction) {
    const itemKey = `${item.runId}:${item.candidateId}`;
    const actionKey = `${itemKey}:${action}`;

    if (pendingKey) {
      return;
    }

    setPendingKey(actionKey);
    setMessageByKey((current) => ({
      ...current,
      [itemKey]: {
        text:
          action === "analyze_contact"
            ? "Analyzing contact..."
            : action === "generate_draft"
              ? "Generating draft..."
              : "Marking contacted...",
        tone: "neutral"
      }
    }));

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
      const errorMessage = await readErrorMessage(response);
      setMessageByKey((current) => ({
        ...current,
        [itemKey]: { text: errorMessage, tone: "danger" }
      }));
      setPendingKey(null);
      return;
    }

    const body = leadInboxItemResponseSchema.parse(await response.json());
    if (body.item) {
      replaceLead(body.item);
    }

    setMessageByKey((current) => ({
      ...current,
      [itemKey]: {
        text:
          action === "analyze_contact"
            ? "Contact analyzed"
            : action === "generate_draft"
              ? "Draft ready"
              : "Marked contacted",
        tone: "good"
      }
    }));
    setPendingKey(null);
  }

  return (
    <div className="lead-inbox">
      <div className="lead-inbox-toolbar">
        <div className="tag-row">
          <Tag>{counts.total} Leads</Tag>
          <Tag tone={counts.due > 0 ? "warn" : "neutral"}>{counts.due} Due</Tag>
          <Tag>{counts.open} Open</Tag>
          <Tag>{counts.needsDraft} Needs Draft</Tag>
          <Tag tone="good">{counts.ready} Ready</Tag>
          <Tag tone="good">{counts.saved} Saved</Tag>
          <Tag tone="warn">{counts.contacted} Contacted</Tag>
          <Tag tone="danger">{counts.closed} Closed</Tag>
        </div>

        <div className="lead-inbox-actions">
          <a className="secondary-button" href={buildExportHref("csv", filter, query)}>
            CSV
          </a>
          <a className="secondary-button" href={buildExportHref("markdown", filter, query)}>
            Markdown
          </a>
        </div>
      </div>

      <div className="lead-inbox-search">
        <input
          aria-label="Search leads"
          className="draft-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search leads"
          value={query}
        />
        <div className="outreach-toolbar" role="tablist" aria-label="Lead inbox filter">
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
      </div>

      <div className="lead-inbox-bulk-bar">
        <div className="lead-inbox-selection-summary">
          <label className="lead-select-row">
            <input
              checked={allVisibleSelected}
              disabled={visibleItems.length === 0 || Boolean(pendingKey)}
              onChange={toggleVisibleSelection}
              type="checkbox"
            />
            <span>{allVisibleSelected ? "Clear Visible" : "Select Visible"}</span>
          </label>
          <span className="muted">
            {selectedItems.length} selected
            {filter === "due" && counts.due > 0 ? ` from the due queue` : ""}
          </span>
          {selectedItems.length > 0 ? (
            <button
              className="secondary-button"
              disabled={Boolean(pendingKey)}
              onClick={clearSelection}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="lead-inbox-actions">
          <input
            aria-label="Bulk follow-up date"
            className="draft-input bulk-date-input"
            disabled={Boolean(pendingKey)}
            onChange={(event) => setBulkFollowUpDate(event.target.value)}
            type="date"
            value={bulkFollowUpDate}
          />
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey) || selectedItems.length === 0 || !bulkFollowUpDate}
            onClick={() => void runBulkAction("set_follow_up")}
            type="button"
          >
            {pendingKey === "bulk:set_follow_up" ? "Saving..." : "Set Follow-up"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey) || selectedItems.length === 0}
            onClick={() => void runBulkAction("mark_contacted")}
            type="button"
          >
            {pendingKey === "bulk:mark_contacted" ? "Marking..." : "Mark Contacted"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey) || selectedItems.length === 0}
            onClick={() => void runBulkAction("dismiss")}
            type="button"
          >
            {pendingKey === "bulk:dismiss" ? "Dismissing..." : "Dismiss"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey) || selectedItems.length === 0}
            onClick={() => void runBulkAction("mark_not_a_fit")}
            type="button"
          >
            {pendingKey === "bulk:mark_not_a_fit" ? "Closing..." : "Not a Fit"}
          </button>
        </div>
        {bulkMessage ? (
          <span className={`status-note ${bulkMessage.tone}`}>{bulkMessage.text}</span>
        ) : null}
      </div>

      {nextLead ? (
        <div className="lead-next-up">
          <div>
            <div className="tag-row">
              <Tag tone={isDue(nextLead, today) ? "warn" : "good"}>Next Up</Tag>
              <Tag>{nextLead.outreach.nextAction}</Tag>
              <Tag>{updatedAgeLabel(nextLead, today)}</Tag>
            </div>
            <div className="lead-next-up-title">{nextLead.businessName}</div>
            <div className="muted">{nextLead.marketTerm}</div>
          </div>
          <div className="lead-inbox-actions">
            <Link
              className="secondary-button"
              href={`/leads/${encodeURIComponent(nextLead.runId)}/${encodeURIComponent(nextLead.candidateId)}`}
            >
              Details
            </Link>
            <Link
              className="link-button"
              href={`/runs/${encodeURIComponent(nextLead.runId)}#outreach-workspace`}
            >
              Outreach
            </Link>
          </div>
        </div>
      ) : null}

      {visibleItems.length > 0 ? (
        <ul className="lead-inbox-list">
          {visibleItems.map((item) => {
            const itemKey = `${item.runId}:${item.candidateId}`;
            const message = messageByKey[itemKey];
            const selected = selectedKeys.has(itemKey);
            const saveBusy = pendingKey === `${itemKey}:save`;
            const analyzeBusy = pendingKey === `${itemKey}:analyze_contact`;
            const generateBusy = pendingKey === `${itemKey}:generate_draft`;
            const markContactedBusy = pendingKey === `${itemKey}:mark_contacted`;
            const canAnalyze = item.outreach.status === "no_draft";
            const canGenerate =
              item.outreach.status === "no_draft" ||
              item.outreach.status === "contact_analyzed";
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
          })}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No leads match this view.
        </p>
      )}
    </div>
  );
}
