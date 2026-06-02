"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  leadInboxBulkActionResponseSchema,
  leadAnnotationResponseSchema,
  leadInboxItemResponseSchema
} from "@scout/api-contracts";
import type { LeadInboxItem } from "@scout/domain";
import { Tag } from "@scout/ui";

import { LeadInboxCard } from "./LeadInboxCard";

import {
  buildExportHref,
  filterOptions,
  isClosed,
  isDue,
  isReady,
  matchesFilter,
  matchesSearch,
  needsDraft,
  readErrorMessage,
  sortLeadInboxItems,
  updatedAgeLabel,
  type LeadAction,
  type LeadBulkAction,
  type LeadInboxFilter,
  type LeadMessage
} from "./LeadInbox.helpers";

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
          {visibleItems.map((item) => (
            <LeadInboxCard
              item={item}
              key={`${item.runId}:${item.candidateId}`}
              messageByKey={messageByKey}
              pendingKey={pendingKey}
              runLeadAction={runLeadAction}
              saveLead={saveLead}
              selectedKeys={selectedKeys}
              today={today}
              toggleSelected={toggleSelected}
              updateLead={updateLead}
            />
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No leads match this view.
        </p>
      )}
    </div>
  );
}
