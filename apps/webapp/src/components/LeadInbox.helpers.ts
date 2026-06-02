import type { LeadInboxItem, LeadStatus } from "@scout/domain";

export type LeadInboxFilter =
  | "all"
  | "open"
  | "needs_draft"
  | "ready"
  | "saved"
  | "contacted"
  | "closed"
  | "due";
export type LeadBulkAction = "mark_contacted" | "dismiss" | "mark_not_a_fit" | "set_follow_up";

export interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

export const filterOptions: Array<{ value: LeadInboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "open", label: "Open" },
  { value: "needs_draft", label: "Needs Draft" },
  { value: "ready", label: "Ready" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" }
];

export type LeadAction = "analyze_contact" | "generate_draft" | "mark_contacted";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

export function isDue(item: LeadInboxItem, today: string): boolean {
  return Boolean(
    item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  );
}

export function isReady(item: LeadInboxItem): boolean {
  return item.outreach.status === "draft_ready" || item.outreach.status === "edited_saved";
}

export function needsDraft(item: LeadInboxItem): boolean {
  return (
    !isClosed(item.annotation.state) &&
    item.annotation.state !== "contacted" &&
    !isReady(item)
  );
}

export function dayValue(value: string | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function daysSince(value: string, today: string): number {
  return Math.max(0, Math.floor((dayValue(today) - dayValue(value)) / MS_PER_DAY));
}

export function updatedAgeLabel(item: LeadInboxItem, today: string): string {
  const age = daysSince(item.annotation.updatedAt, today);

  if (age === 0) {
    return "Updated today";
  }

  return `Updated ${age}d ago`;
}

export function urgencyRank(item: LeadInboxItem, today: string): number {
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

export function sortLeadInboxItems(left: LeadInboxItem, right: LeadInboxItem, today: string): number {
  return (
    urgencyRank(left, today) - urgencyRank(right, today) ||
    dayValue(left.annotation.followUpDate) - dayValue(right.annotation.followUpDate) ||
    (right.priorityScore ?? 0) - (left.priorityScore ?? 0) ||
    right.annotation.updatedAt.localeCompare(left.annotation.updatedAt)
  );
}

export function matchesFilter(item: LeadInboxItem, filter: LeadInboxFilter, today: string): boolean {
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

export function dueLabel(item: LeadInboxItem, today: string): string {
  if (!item.annotation.followUpDate) {
    return "Due";
  }

  if (item.annotation.followUpDate < today) {
    return "Overdue";
  }

  return "Due Today";
}

export function matchesSearch(item: LeadInboxItem, query: string): boolean {
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

export function buildExportHref(format: "csv" | "markdown", filter: LeadInboxFilter, query: string): string {
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

export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}
