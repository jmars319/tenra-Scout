import type {
  AuditFinding,
  LeadAnnotation,
  ScoutRunReport
} from "@scout/domain";

import type { LeadTriageItem } from "./LeadTriagePanel";
import {
  describeSampleQualityMeaning,
  toneForSampleQuality
} from "./sample-quality-copy";

/* Label presentation boundary */

export function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function describeProviderName(value: string): string {
  if (value.includes(" + ")) {
    return value
      .split(" + ")
      .map((part) => describeProviderName(part))
      .join(" + ");
  }

  if (value === "duckduckgo_html") {
    return "DuckDuckGo live";
  }

  if (value === "bing_html") {
    return "Bing live";
  }

  if (value === "google_html") {
    return "Google live";
  }

  if (value === "seeded_stub") {
    return "Seeded fallback";
  }

  return humanize(value);
}

export function describeQueryVariantLabel(label: string): string {
  if (label === "raw") {
    return "As Typed";
  }

  if (label === "normalized") {
    return "Cleaned";
  }

  if (label === "singularized") {
    return "Singular";
  }

  if (label === "official_website") {
    return "Official Site";
  }

  if (label === "contact_path") {
    return "Contact Path";
  }

  if (label === "local_profile") {
    return "Hours/Phone";
  }

  if (label === "service_area") {
    return "Near Location";
  }

  if (label === "owned_domain") {
    return "Owned Domain";
  }

  if (label === "directory_snippet") {
    return "Snippet Leads";
  }

  return humanize(label);
}

export function describeAttemptOutcome(outcome: string): string {
  if (outcome === "parse_error") {
    return "Parse Issue";
  }

  if (outcome === "network_error") {
    return "Network Issue";
  }

  if (outcome === "http_error") {
    return "HTTP Issue";
  }

  if (outcome === "empty") {
    return "No Results";
  }

  return humanize(outcome);
}

export function describeCandidateProvenance(value?: string): string {
  if (value === "directory_snippet") {
    return "Directory snippet";
  }

  if (value === "manual") {
    return "Manual add";
  }

  if (value === "promoted_discarded") {
    return "Promoted result";
  }

  return "Live result";
}

/* Tone mapping boundary */

export function toneForQuality(quality: string): "neutral" | "good" | "warn" | "danger" {
  if (quality === "strong") {
    return "good";
  }

  if (quality === "broken" || quality === "none") {
    return "danger";
  }

  if (quality === "weak") {
    return "warn";
  }

  return "neutral";
}

export function toneForSeverity(severity: string): "neutral" | "good" | "warn" | "danger" {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }

  if (severity === "medium") {
    return "warn";
  }

  return "neutral";
}

export function toneForConfidence(confidence: string): "neutral" | "good" | "warn" | "danger" {
  if (confidence === "confirmed") {
    return "good";
  }

  if (confidence === "probable") {
    return "warn";
  }

  return "neutral";
}

export function toneForAuditStatus(status: "audited" | "skipped"): "neutral" | "good" | "warn" | "danger" {
  return status === "audited" ? "good" : "warn";
}

export function toneForSampleMetric(
  sampleQuality: ScoutRunReport["summary"]["sampleQuality"]
): "neutral" | "good" | "warn" {
  return toneForSampleQuality(sampleQuality) === "good"
    ? "good"
    : toneForSampleQuality(sampleQuality) === "neutral"
      ? "neutral"
      : "warn";
}

/* Acquisition trust boundary */

export function toneForAcquisitionTrust(report: ScoutRunReport): "neutral" | "good" | "warn" | "danger" {
  const degradedLiveAttempt = report.acquisition.providerAttempts.some(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  );

  if (!report.acquisition.fallbackUsed && !degradedLiveAttempt) {
    return "good";
  }

  if (
    report.acquisition.liveCandidateCount === 0 ||
    report.acquisition.fallbackCandidateCount >= Math.max(1, report.acquisition.liveCandidateCount)
  ) {
    return "danger";
  }

  return "warn";
}

export function describeAcquisitionTrust(report: ScoutRunReport): string {
  const degradedLiveAttempt = report.acquisition.providerAttempts.some(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  );

  if (!report.acquisition.fallbackUsed && !degradedLiveAttempt) {
    return "Live acquisition carried this run without seeded help.";
  }

  if (report.acquisition.liveCandidateCount === 0) {
    return "This run is effectively non-live. Scout had to rely on the seeded fallback catalog.";
  }

  if (
    report.acquisition.fallbackCandidateCount >= Math.max(1, report.acquisition.liveCandidateCount)
  ) {
    return "Seeded fallback contributed as much or more of the kept sample as live acquisition.";
  }

  if (degradedLiveAttempt) {
    return "Live acquisition worked only partially. Provider degradation should reduce confidence in the market picture.";
  }

  return "Live acquisition needed seeded help to fill gaps in the final sample.";
}

export function buildAttemptSummary(
  attempts: ScoutRunReport["acquisition"]["providerAttempts"]
): string {
  return attempts
    .map(
      (attempt) =>
        `${describeProviderName(attempt.provider)} ${describeAttemptOutcome(attempt.outcome)}`
    )
    .join(", ");
}

export function buildSampleConfidenceReasons(report: ScoutRunReport): string[] {
  const reasons: string[] = [];
  const degradedLiveAttempts = report.acquisition.providerAttempts.filter(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  );
  const profilePresenceCount = report.businessBreakdowns.filter((business) =>
    ["facebook_only", "yelp_only", "directory_only", "marketplace"].includes(business.presenceType)
  ).length;
  const keptCount = Math.max(report.acquisition.selectedCandidateCount, report.businessBreakdowns.length);

  if (degradedLiveAttempts.length > 0) {
    reasons.push(`Live provider issue: ${buildAttemptSummary(degradedLiveAttempts)}.`);
  }

  if (report.acquisition.discardedCandidateCount > 0) {
    reasons.push(
      `Scout discarded ${report.acquisition.discardedCandidateCount} low-value or non-specific result(s) before keeping ${report.acquisition.selectedCandidateCount}.`
    );
  }

  if (keptCount > 0 && profilePresenceCount / keptCount >= 0.35) {
    reasons.push(
      `${profilePresenceCount} of ${keptCount} kept candidate(s) were directory, marketplace, or social/profile presences.`
    );
  }

  if (report.acquisition.fallbackCandidateCount > 0) {
    reasons.push(
      `${report.acquisition.fallbackCandidateCount} kept candidate(s) came from verification fallback instead of live search.`
    );
  }

  if (report.acquisition.selectedCandidateCount > 0 && report.acquisition.selectedCandidateCount < 10) {
    reasons.push(
      `Only ${report.acquisition.selectedCandidateCount} final candidate(s) survived acquisition filtering.`
    );
  }

  if (reasons.length > 0) {
    return reasons.slice(0, 4);
  }

  return report.acquisition.notes.length > 0
    ? report.acquisition.notes.slice(0, 3)
    : [describeSampleQualityMeaning(report.acquisition.sampleQuality)];
}

/* Sample decision boundary */

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

export function toneForFindingDelta(value: number): "neutral" | "good" | "warn" {
  if (value < 0) {
    return "good";
  }

  if (value > 0) {
    return "warn";
  }

  return "neutral";
}

export function toneForCountDelta(value: number): "neutral" | "good" | "warn" {
  if (value > 0) {
    return "good";
  }

  if (value < 0) {
    return "warn";
  }

  return "neutral";
}

export function buildSampleDecisionRows(report: ScoutRunReport): Array<{
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn" | "danger";
}> {
  const selectedCount = Math.max(report.acquisition.selectedCandidateCount, 0);
  const liveRatio =
    selectedCount > 0 ? report.acquisition.liveCandidateCount / selectedCount : 0;
  const fallbackRatio =
    selectedCount > 0 ? report.acquisition.fallbackCandidateCount / selectedCount : 0;
  const lowSignalCount = report.businessBreakdowns.filter((business) =>
    ["facebook_only", "yelp_only", "directory_only", "marketplace", "unknown"].includes(
      business.presenceType
    )
  ).length;
  const lowSignalRatio =
    selectedCount > 0 ? lowSignalCount / Math.max(selectedCount, report.businessBreakdowns.length) : 0;
  const degradedAttempts = report.acquisition.providerAttempts.filter(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  ).length;

  return [
    {
      label: "Kept candidates",
      value: String(selectedCount),
      tone: selectedCount >= 10 ? "good" : selectedCount >= 5 ? "neutral" : "warn"
    },
    {
      label: "Live share",
      value: formatPercent(liveRatio),
      tone: liveRatio >= 0.75 ? "good" : liveRatio >= 0.5 ? "neutral" : "warn"
    },
    {
      label: "Fallback share",
      value: formatPercent(fallbackRatio),
      tone: fallbackRatio === 0 ? "good" : fallbackRatio < 0.4 ? "warn" : "danger"
    },
    {
      label: "Low-signal share",
      value: formatPercent(lowSignalRatio),
      tone: lowSignalRatio <= 0.35 ? "good" : lowSignalRatio < 0.5 ? "warn" : "danger"
    },
    {
      label: "Provider issues",
      value: String(degradedAttempts),
      tone: degradedAttempts === 0 ? "good" : "warn"
    }
  ];
}

/* Finding grouping boundary */

export function groupFindings(findings: AuditFinding[]): Map<string, AuditFinding[]> {
  const grouped = new Map<string, AuditFinding[]>();

  for (const finding of findings) {
    const current = grouped.get(finding.candidateId) ?? [];
    current.push(finding);
    grouped.set(finding.candidateId, current);
  }

  return grouped;
}

export function severityWeight(severity: AuditFinding["severity"]): number {
  if (severity === "critical") {
    return 4;
  }

  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

export function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort(
    (left, right) =>
      severityWeight(right.severity) - severityWeight(left.severity) ||
      left.pageLabel.localeCompare(right.pageLabel)
  );
}

export function buildListKey(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

/* Lead triage boundary */

export function buildLeadTriageItems(
  report: ScoutRunReport,
  annotations: LeadAnnotation[]
): LeadTriageItem[] {
  const annotationsByCandidate = new Map(
    annotations.map((annotation) => [annotation.candidateId, annotation])
  );
  const shortlistByCandidate = new Map(
    report.shortlist.map((lead, index) => [lead.candidateId, { lead, rank: index + 1 }])
  );
  const items = report.businessBreakdowns.map((business) => {
    const shortlist = shortlistByCandidate.get(business.candidateId);
    const annotation = annotationsByCandidate.get(business.candidateId);

    return {
      candidateId: business.candidateId,
      businessName: business.businessName,
      primaryUrl: business.primaryUrl,
      presenceType: humanize(business.presenceType),
      presenceQuality: humanize(business.presenceQuality),
      confidence: humanize(business.confidence),
      findingCount: business.findingCount,
      highSeverityFindings: business.highSeverityFindings,
      topIssues: business.topIssues.map(humanize),
      reasons: shortlist?.lead.reasons ?? [],
      ...(shortlist ? { shortlistRank: shortlist.rank, priorityScore: shortlist.lead.priorityScore } : {}),
      ...(annotation ? { annotation } : {})
    };
  });
  const knownIds = new Set(items.map((item) => item.candidateId));

  for (const [candidateId, shortlist] of shortlistByCandidate) {
    if (knownIds.has(candidateId)) {
      continue;
    }

    const annotation = annotationsByCandidate.get(candidateId);
    items.push({
      candidateId,
      businessName: shortlist.lead.businessName,
      primaryUrl: shortlist.lead.primaryUrl,
      presenceType: humanize(shortlist.lead.presenceType),
      presenceQuality: humanize(shortlist.lead.presenceQuality),
      confidence: humanize(shortlist.lead.confidence),
      findingCount: 0,
      highSeverityFindings: 0,
      topIssues: [],
      reasons: shortlist.lead.reasons,
      shortlistRank: shortlist.rank,
      priorityScore: shortlist.lead.priorityScore,
      ...(annotation ? { annotation } : {})
    });
  }

  return items;
}
