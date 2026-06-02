import type {
  AcquisitionDiagnostics,
  AcquisitionFallbackTrigger,
  AcquisitionSourceCount,
  MarketSampleQuality,
  ResolvedMarketIntent
} from "../../../../../../packages/domain/src/model.ts";
import {
  isProviderDegraded,
  isLowSignalPresence,
  mapOutcomeToFallbackReason,
  type RawAcquisitionCandidate,
  type SearchLimits
} from "./acquisition-helpers.ts";

export function summarizeFallbackTriggers(input: {
  liveAttempts: AcquisitionDiagnostics["providerAttempts"];
  useFallbackOnly: boolean;
  liveCandidateCount: number;
  limits: SearchLimits;
}): AcquisitionFallbackTrigger[] {
  const triggers: AcquisitionFallbackTrigger[] = [];

  if (input.useFallbackOnly) {
    triggers.push({
      reason: "fallback_only_mode",
      detail: "Scout was configured to skip live acquisition for this run."
    });
    return triggers;
  }

  if (input.liveCandidateCount < input.limits.minCandidates) {
    triggers.push({
      reason: "insufficient_live_candidates",
      detail: `Live acquisition kept ${input.liveCandidateCount} candidates before the seeded fallback catalog was used.`
    });
  }

  const seenDegradations = new Set<string>();
  for (const attempt of input.liveAttempts) {
    const reason = mapOutcomeToFallbackReason(attempt.outcome);
    if (!reason) {
      continue;
    }

    const key = `${attempt.provider}:${reason}`;
    if (seenDegradations.has(key)) {
      continue;
    }

    seenDegradations.add(key);
    triggers.push({
      reason,
      provider: attempt.provider,
      ...(attempt.detail ? { detail: attempt.detail } : {})
    });
  }

  return triggers;
}

export function determineSampleQuality(input: {
  limits: SearchLimits;
  selected: RawAcquisitionCandidate[];
  fallbackUsed: boolean;
  notes: string[];
  providerAttempts: AcquisitionDiagnostics["providerAttempts"];
}): MarketSampleQuality {
  const selectedCount = input.selected.length;
  const liveCount = input.selected.filter((candidate) => candidate.acquisitionKind === "live").length;
  const fallbackCount = input.selected.filter(
    (candidate) => candidate.acquisitionKind === "fallback"
  ).length;
  const lowSignalRatio =
    selectedCount > 0
      ? input.selected.filter((candidate) => isLowSignalPresence(candidate.presenceHint)).length /
        selectedCount
      : 1;
  const fallbackRatio = selectedCount > 0 ? fallbackCount / selectedCount : 0;
  const providerDegraded = input.providerAttempts.some(
    (attempt) => attempt.kind === "live" && isProviderDegraded(attempt.outcome)
  );
  const successfulLiveProviderCount = new Set(
    input.providerAttempts
      .filter((attempt) => attempt.kind === "live" && attempt.outcome === "success")
      .map((attempt) => attempt.provider)
  ).size;
  const degradationShouldLimitConfidence =
    providerDegraded &&
    (successfulLiveProviderCount === 0 ||
      selectedCount < input.limits.minCandidates + 2 ||
      lowSignalRatio > 0.35);

  if (
    selectedCount < Math.ceil(input.limits.minCandidates / 2) ||
    (liveCount === 0 && input.fallbackUsed) ||
    fallbackRatio >= 0.7 ||
    lowSignalRatio >= 0.7
  ) {
    return "weak_sample";
  }

  if (
    selectedCount < input.limits.minCandidates ||
    liveCount / Math.max(selectedCount, 1) < 0.5 ||
    fallbackRatio >= 0.4 ||
    lowSignalRatio >= 0.5 ||
    degradationShouldLimitConfidence
  ) {
    return "partial_sample";
  }

  if (
    selectedCount >= Math.min(input.limits.maxCandidates, input.limits.minCandidates + 2) &&
    liveCount / selectedCount >= 0.75 &&
    fallbackCount === 0 &&
    !providerDegraded &&
    lowSignalRatio <= 0.35 &&
    input.notes.length <= 1
  ) {
    return "strong_sample";
  }

  return "adequate_sample";
}

export function buildCandidateSourceBreakdown(
  rawCandidates: RawAcquisitionCandidate[],
  selected: RawAcquisitionCandidate[]
): AcquisitionSourceCount[] {
  const sourceCounts = new Map<string, AcquisitionSourceCount>();

  const ensureSource = (candidate: RawAcquisitionCandidate): AcquisitionSourceCount => {
    const existing = sourceCounts.get(candidate.source);
    if (existing) {
      return existing;
    }

    const created: AcquisitionSourceCount = {
      source: candidate.source,
      kind: candidate.acquisitionKind,
      rawCandidateCount: 0,
      selectedCandidateCount: 0
    };
    sourceCounts.set(candidate.source, created);
    return created;
  };

  for (const candidate of rawCandidates) {
    ensureSource(candidate).rawCandidateCount += 1;
  }

  for (const candidate of selected) {
    ensureSource(candidate).selectedCandidateCount += 1;
  }

  return [...sourceCounts.values()].sort(
    (left, right) =>
      Number(left.kind === "fallback") - Number(right.kind === "fallback") ||
      right.selectedCandidateCount - left.selectedCandidateCount ||
      right.rawCandidateCount - left.rawCandidateCount ||
      left.source.localeCompare(right.source)
  );
}

export function buildDiagnosticsNotes(input: {
  intent: ResolvedMarketIntent;
  limits: SearchLimits;
  selected: RawAcquisitionCandidate[];
  rawCandidateCount: number;
  fallbackUsed: boolean;
  mergedCount: number;
  discardedCount: number;
  providerAttempts: AcquisitionDiagnostics["providerAttempts"];
  fallbackTriggers: AcquisitionFallbackTrigger[];
}): string[] {
  const notes: string[] = [];
  const liveCount = input.selected.filter((candidate) => candidate.acquisitionKind === "live").length;
  const fallbackCount = input.selected.filter(
    (candidate) => candidate.acquisitionKind === "fallback"
  ).length;
  const lowSignalCount = input.selected.filter((candidate) =>
    isLowSignalPresence(candidate.presenceHint)
  ).length;
  const directorySnippetCount = input.selected.filter(
    (candidate) => candidate.provenance === "directory_snippet"
  ).length;

  if (!input.intent.locationLabel) {
    notes.push(
      "No explicit location was resolved from the query, so the market slice may be broader than intended."
    );
  }

  if (input.intent.categories.includes("general_local_business")) {
    notes.push(
      "Scout could not resolve a strong vertical from the query and used a generic local-business interpretation."
    );
  }

  if (input.fallbackTriggers.some((trigger) => trigger.reason === "fallback_only_mode")) {
    notes.push("Scout was configured to use only the seeded fallback catalog for this run.");
  }

  if (input.providerAttempts.some((attempt) => attempt.kind === "live" && attempt.outcome === "blocked")) {
    notes.push("The live provider showed signs of blocking or degraded access during acquisition.");
  }

  if (
    input.providerAttempts.some((attempt) =>
      attempt.detail?.includes("manual human confirmation")
    )
  ) {
    notes.push("At least one live provider required in-browser human confirmation before Scout could keep results.");
  }

  if (
    input.providerAttempts.some((attempt) =>
      attempt.detail?.includes("not completed before timeout")
    )
  ) {
    notes.push("Scout opened a browser confirmation window for a blocked live provider, but the challenge was not completed in time.");
  }

  if (
    input.providerAttempts.some((attempt) => attempt.kind === "live" && attempt.outcome === "parse_error")
  ) {
    notes.push("Scout received at least one live provider page it could not parse cleanly.");
  }

  if (
    input.providerAttempts.some((attempt) =>
      attempt.kind === "live" &&
      (attempt.outcome === "network_error" || attempt.outcome === "http_error")
    )
  ) {
    notes.push("At least one live provider attempt failed before Scout could gather a stable result set.");
  }

  if (
    input.providerAttempts.some((attempt) => attempt.kind === "live" && attempt.outcome === "empty")
  ) {
    notes.push("At least one live provider attempt returned no results for its query variant.");
  }

  if (input.fallbackUsed && liveCount === 0) {
    notes.push("No usable live results survived acquisition. Interpret this run as fallback-driven.");
  } else if (input.fallbackUsed && fallbackCount > 0) {
    notes.push("Fallback candidates were used to fill gaps after live acquisition and consolidation.");
  }

  if (fallbackCount > 0 && fallbackCount >= Math.max(1, liveCount)) {
    notes.push(
      "Seeded fallback contributed as much or more of the kept sample as live acquisition, so treat the market picture cautiously."
    );
  }

  if (input.selected.length < input.limits.minCandidates) {
    notes.push("The final market sample landed below the minimum target candidate count.");
  }

  if (input.rawCandidateCount > 0 && input.discardedCount / input.rawCandidateCount >= 0.35) {
    notes.push(
      "A meaningful share of gathered results were discarded as low-value or non-specific search pages."
    );
  }

  if (input.selected.length > 0 && lowSignalCount / input.selected.length >= 0.5) {
    notes.push("The final sample still leans heavily on directory, marketplace, or profile-style presences.");
  }

  if (directorySnippetCount > 0) {
    notes.push(
      `${directorySnippetCount} kept candidate(s) were extracted from directory/profile snippets and should be treated as lower-confidence until Scout finds a direct owned presence.`
    );
  }

  if (input.mergedCount >= Math.max(3, Math.floor(input.rawCandidateCount * 0.2))) {
    notes.push("Multiple overlapping candidates were merged across query variants before final selection.");
  }

  return [...new Set(notes)];
}
