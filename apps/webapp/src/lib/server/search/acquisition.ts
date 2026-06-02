import type {
  AcquisitionDiagnostics,
  AcquisitionDiscardRecord,
  AcquisitionDuplicateRecord,
  ResolvedMarketIntent,
  ScoutAcquisitionResult
} from "../../../../../../packages/domain/src/model.ts";

import type { SearchProviderAdapter } from "./provider-types.ts";
import { buildQueryVariants } from "./query-variants.ts";
import {
  buildDirectorySnippetCandidates,
  buildDiscardRecord,
  buildRawCandidate,
  ensureVariantAccumulator,
  getDiscardReason,
  getDuplicateReason,
  getPreferenceScore,
  recordProviderAttempt,
  shouldDeferLowSignalCandidate,
  shouldQueryProviderVariant,
  toSearchCandidate,
  type RawAcquisitionCandidate,
  type SearchLimits,
  type VariantAccumulator
} from "./acquisition-helpers.ts";
import {
  buildCandidateSourceBreakdown,
  buildDiagnosticsNotes,
  determineSampleQuality,
  summarizeFallbackTriggers
} from "./acquisition-diagnostics.ts";

export async function acquireCandidates(input: {
  intent: ResolvedMarketIntent;
  liveProviders: SearchProviderAdapter[];
  limits: SearchLimits;
  useFallbackOnly?: boolean;
  fallbackProvider?: SearchProviderAdapter;
  onProgress?: (workerNote: string) => Promise<void> | void;
}): Promise<ScoutAcquisitionResult> {
  const queryVariants = buildQueryVariants(input.intent);
  const variantStats = new Map<string, VariantAccumulator>(
    queryVariants.map((variant) => [
      variant.label,
      {
        label: variant.label,
        query: variant.query,
        rawResultCount: 0,
        acceptedResultCount: 0,
        sources: new Set<string>()
      }
    ])
  );
  const rawCandidates: RawAcquisitionCandidate[] = [];
  const discardedCandidates: AcquisitionDiscardRecord[] = [];
  const mergedDuplicates: AcquisitionDuplicateRecord[] = [];
  const providerAttempts: AcquisitionDiagnostics["providerAttempts"] = [];
  let rawSequence = 0;

  if (!input.useFallbackOnly) {
    for (const variant of queryVariants) {
      const variantStat = ensureVariantAccumulator(variantStats, variant.label, variant.query);

      for (const provider of input.liveProviders) {
        if (!shouldQueryProviderVariant(provider, variant.label)) {
          continue;
        }

        await input.onProgress?.(
          `Querying ${provider.name} for the ${variant.label.replace(/_/g, " ")} search variant.`
        );
        const response = await provider.executeQuery(
          variant.query,
          input.limits.maxCandidates,
          input.onProgress
        );
        recordProviderAttempt({
          attempts: providerAttempts,
          provider,
          variantLabel: variant.label,
          query: variant.query,
          response
        });

        variantStat.sources.add(provider.name);
        variantStat.rawResultCount += response.candidates.length;

        if (response.outcome !== "success") {
          continue;
        }

        for (const [index, result] of response.candidates.entries()) {
          rawCandidates.push(
            buildRawCandidate(result, rawSequence + index, provider.kind, variant.query, variant.label)
          );
        }

        rawSequence += response.candidates.length;
      }
    }
  }

  const snippetStat = ensureVariantAccumulator(
    variantStats,
    "directory_snippet",
    "extracted from directory/profile snippets"
  );
  const directorySnippetCandidates: RawAcquisitionCandidate[] = [];

  for (const candidate of rawCandidates) {
    const extracted = buildDirectorySnippetCandidates(
      candidate,
      rawSequence + directorySnippetCandidates.length
    );
    if (extracted.length === 0) {
      continue;
    }

    snippetStat.sources.add(`${candidate.source}_directory_snippet`);
    directorySnippetCandidates.push(...extracted);
  }

  if (directorySnippetCandidates.length > 0) {
    rawCandidates.push(...directorySnippetCandidates);
    snippetStat.rawResultCount += directorySnippetCandidates.length;
    rawSequence += directorySnippetCandidates.length;
  }

  const uniqueCandidates: RawAcquisitionCandidate[] = [];

  for (const candidate of rawCandidates) {
    const discardReason = getDiscardReason(candidate);
    if (discardReason) {
      discardedCandidates.push(buildDiscardRecord(candidate, discardReason));
      continue;
    }

    const duplicateIndex = uniqueCandidates.findIndex((existing) =>
      Boolean(getDuplicateReason(existing, candidate))
    );

    if (duplicateIndex >= 0) {
      const existing = uniqueCandidates[duplicateIndex]!;
      const reason = getDuplicateReason(existing, candidate) ?? "Duplicate candidate.";
      const preferred = getPreferenceScore(candidate) > getPreferenceScore(existing) ? candidate : existing;
      const duplicate = preferred === candidate ? existing : candidate;

      uniqueCandidates[duplicateIndex] = preferred;
      mergedDuplicates.push({
        keptCandidateId: preferred.candidateId,
        duplicateCandidateId: duplicate.candidateId,
        reason
      });
      continue;
    }

    uniqueCandidates.push(candidate);
  }

  let fallbackUsed = Boolean(input.useFallbackOnly && input.fallbackProvider);

  if (
    input.fallbackProvider &&
    (uniqueCandidates.length < input.limits.minCandidates || input.useFallbackOnly)
  ) {
    const fallbackVariantLabel = "fallback_catalog";
    const fallbackQuery = input.intent.searchQuery;
    const fallbackStat = ensureVariantAccumulator(
      variantStats,
      fallbackVariantLabel,
      fallbackQuery
    );
    const fallbackResponse = await input.fallbackProvider.executeQuery(
      fallbackQuery,
      input.limits.maxCandidates,
      input.onProgress
    );

    recordProviderAttempt({
      attempts: providerAttempts,
      provider: input.fallbackProvider,
      variantLabel: fallbackVariantLabel,
      query: fallbackQuery,
      response: fallbackResponse
    });

    fallbackUsed = true;
    fallbackStat.sources.add(input.fallbackProvider.name);
    fallbackStat.rawResultCount += fallbackResponse.candidates.length;

    for (const [index, result] of fallbackResponse.candidates.entries()) {
      const candidate = buildRawCandidate(
        result,
        rawSequence + index,
        input.fallbackProvider.kind,
        fallbackQuery,
        fallbackVariantLabel
      );
      rawCandidates.push(candidate);
      const discardReason = getDiscardReason(candidate);
      if (discardReason) {
        discardedCandidates.push(buildDiscardRecord(candidate, discardReason));
        continue;
      }

      const duplicateIndex = uniqueCandidates.findIndex((existing) =>
        Boolean(getDuplicateReason(existing, candidate))
      );

      if (duplicateIndex >= 0) {
        const existing = uniqueCandidates[duplicateIndex]!;
        const reason = getDuplicateReason(existing, candidate) ?? "Duplicate candidate.";
        const preferred = getPreferenceScore(candidate) > getPreferenceScore(existing) ? candidate : existing;
        const duplicate = preferred === candidate ? existing : candidate;

        uniqueCandidates[duplicateIndex] = preferred;
        mergedDuplicates.push({
          keptCandidateId: preferred.candidateId,
          duplicateCandidateId: duplicate.candidateId,
          reason
        });
        continue;
      }

      uniqueCandidates.push(candidate);
    }

    rawSequence += fallbackResponse.candidates.length;
  }

  const rankedCandidates = [...uniqueCandidates].sort(
    (left, right) =>
      getPreferenceScore(right) - getPreferenceScore(left) || left.title.localeCompare(right.title)
  );
  const selected: RawAcquisitionCandidate[] = [];
  const deferred: RawAcquisitionCandidate[] = [];

  for (const [index, candidate] of rankedCandidates.entries()) {
    const remaining = rankedCandidates.slice(index + 1);

    if (shouldDeferLowSignalCandidate(candidate, selected, remaining, input.limits)) {
      deferred.push(candidate);
      continue;
    }

    selected.push(candidate);
    if (selected.length >= input.limits.maxCandidates) {
      break;
    }
  }

  for (const candidate of deferred) {
    if (selected.length >= input.limits.maxCandidates) {
      break;
    }

    selected.push(candidate);
  }

  for (const candidate of uniqueCandidates) {
    const stat = variantStats.get(candidate.variantLabel);
    if (stat) {
      stat.acceptedResultCount += 1;
    }
  }

  const fallbackTriggers = summarizeFallbackTriggers({
    liveAttempts: providerAttempts.filter((attempt) => attempt.kind === "live"),
    useFallbackOnly: Boolean(input.useFallbackOnly),
    liveCandidateCount: uniqueCandidates.filter((candidate) => candidate.acquisitionKind === "live").length,
    limits: input.limits
  });
  const diagnosticsNotes = buildDiagnosticsNotes({
    intent: input.intent,
    limits: input.limits,
    selected,
    rawCandidateCount: rawSequence,
    fallbackUsed,
    mergedCount: mergedDuplicates.length,
    discardedCount: discardedCandidates.length,
    providerAttempts,
    fallbackTriggers
  });
  const diagnostics: AcquisitionDiagnostics = {
    provider: input.liveProviders[0]?.name ?? input.fallbackProvider?.name ?? "unresolved",
    fallbackUsed,
    rawCandidateCount: rawSequence,
    selectedCandidateCount: selected.length,
    liveCandidateCount: selected.filter((candidate) => candidate.acquisitionKind === "live").length,
    fallbackCandidateCount: selected.filter((candidate) => candidate.acquisitionKind === "fallback").length,
    mergedDuplicateCount: mergedDuplicates.length,
    discardedCandidateCount: discardedCandidates.length,
    sampleQuality: determineSampleQuality({
      limits: input.limits,
      selected,
      fallbackUsed,
      notes: diagnosticsNotes,
      providerAttempts
    }),
    queryVariants: [...variantStats.values()].map((variant) => ({
      label: variant.label,
      query: variant.query,
      source:
        variant.sources.size > 1
          ? [...variant.sources].sort().join(" + ")
          : [...variant.sources][0] ?? "unresolved",
      rawResultCount: variant.rawResultCount,
      acceptedResultCount: variant.acceptedResultCount
    })),
    providerAttempts,
    candidateSources: buildCandidateSourceBreakdown(rawCandidates, selected),
    fallbackTriggers,
    mergedDuplicates,
    discardedCandidates,
    notes: diagnosticsNotes
  };

  return {
    candidates: selected.map((candidate, index) => toSearchCandidate(candidate, index + 1)),
    diagnostics
  };
}
