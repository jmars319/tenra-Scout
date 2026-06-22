import {
  evaluatePresenceUrl,
  isAggregatorRoundupResult,
  isCommunityDiscussionResult
} from "../../../../../../packages/domain/src/presence.ts";
import type {
  AcquisitionAttemptOutcome,
  AcquisitionDiagnostics,
  AcquisitionDiscardRecord,
  AcquisitionFallbackTrigger,
  CandidateProvenanceKind,
  SearchCandidate
} from "../../../../../../packages/domain/src/model.ts";

import {
  buildBusinessKey,
  canonicalizeUrl,
  titlesLookEquivalent
} from "./canonicalize.ts";
import type {
  ProviderSearchCandidate,
  ProviderSearchResponse,
  SearchProviderAdapter
} from "./provider-types.ts";

/* Search contract boundary */

export interface SearchLimits {
  minCandidates: number;
  maxCandidates: number;
}

export interface RawAcquisitionCandidate extends ProviderSearchCandidate {
  candidateId: string;
  rawRank: number;
  acquisitionKind: "live" | "fallback";
  variantLabel: string;
  acquisitionQuery: string;
  canonicalUrl: string;
  canonicalHost: string;
  comparisonKey: string;
  businessKey: string;
  presenceHint: ReturnType<typeof evaluatePresenceUrl>["type"];
  provenance: CandidateProvenanceKind;
  provenanceNote?: string;
  extractedFromCandidateId?: string;
}

export interface VariantAccumulator {
  label: string;
  query: string;
  rawResultCount: number;
  acceptedResultCount: number;
  sources: Set<string>;
}

/* Candidate filtering boundary */

export function shouldQueryProviderVariant(
  provider: SearchProviderAdapter,
  variantLabel: string
): boolean {
  if (provider.name === "bing_html" || provider.name === "google_html") {
    return (
      variantLabel === "raw" ||
      variantLabel === "official_website" ||
      variantLabel === "contact_path"
    );
  }

  return true;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isLowSignalPresence(presenceType: RawAcquisitionCandidate["presenceHint"]): boolean {
  return (
    presenceType === "directory_only" ||
    presenceType === "facebook_only" ||
    presenceType === "yelp_only" ||
    presenceType === "marketplace" ||
    presenceType === "unknown"
  );
}

export function isGenericDirectorySearchPage(candidate: RawAcquisitionCandidate): boolean {
  const url = new URL(candidate.canonicalUrl);
  const path = url.pathname.toLowerCase();

  if (candidate.presenceHint !== "directory_only" && candidate.presenceHint !== "yelp_only") {
    return false;
  }

  return (
    path === "/" ||
    path === "/search" ||
    path.startsWith("/search/") ||
    path.startsWith("/results") ||
    url.searchParams.has("search_terms") ||
    url.searchParams.has("find_desc")
  );
}

export function getDiscardReason(candidate: RawAcquisitionCandidate): string | null {
  if (isCommunityDiscussionResult({ url: candidate.canonicalUrl })) {
    return "Community discussion or non-business forum page, not a direct business presence.";
  }

  if (
    (candidate.presenceHint === "directory_only" || candidate.presenceHint === "marketplace") &&
    isAggregatorRoundupResult({
      url: candidate.canonicalUrl,
      title: candidate.title,
      snippet: candidate.snippet
    })
  ) {
    return 'Aggregator, roundup, or "best of" page, not a direct business presence.';
  }

  if (isGenericDirectorySearchPage(candidate)) {
    return "Generic directory or search page, not a business-specific presence.";
  }

  if (candidate.businessKey.length < 2) {
    return "Candidate title was too weak to treat as a business presence.";
  }

  return null;
}

export function buildDiscardRecord(
  candidate: RawAcquisitionCandidate,
  reason: string
): AcquisitionDiscardRecord {
  return {
    candidateId: candidate.candidateId,
    reason,
    title: candidate.title,
    url: candidate.canonicalUrl,
    domain: candidate.canonicalHost,
    snippet: candidate.snippet,
    source: candidate.source
  };
}

export function buildRawCandidate(
  input: ProviderSearchCandidate,
  index: number,
  acquisitionKind: "live" | "fallback",
  acquisitionQuery: string,
  variantLabel: string,
  provenance: CandidateProvenanceKind = "live_search_result",
  provenanceNote?: string,
  extractedFromCandidateId?: string
): RawAcquisitionCandidate {
  const canonical = canonicalizeUrl(input.url);
  const businessKey = buildBusinessKey(input.title) || canonical.canonicalHost;

  return {
    ...input,
    candidateId: `${acquisitionKind}-${index + 1}-${slugify(`${businessKey}-${canonical.canonicalHost}`) || "candidate"}`,
    rawRank: index + 1,
    acquisitionKind,
    variantLabel,
    acquisitionQuery,
    canonicalUrl: canonical.canonicalUrl,
    canonicalHost: canonical.canonicalHost,
    comparisonKey: canonical.comparisonKey,
    businessKey,
    presenceHint: evaluatePresenceUrl({
      url: canonical.canonicalUrl,
      title: input.title,
      snippet: input.snippet
    }).type,
    provenance,
    ...(provenanceNote ? { provenanceNote } : {}),
    ...(extractedFromCandidateId ? { extractedFromCandidateId } : {})
  };
}

/* Directory extraction boundary */

export function isDirectorySnippetSource(candidate: RawAcquisitionCandidate): boolean {
  return (
    candidate.presenceHint === "directory_only" ||
    candidate.presenceHint === "marketplace" ||
    candidate.presenceHint === "yelp_only"
  );
}

export function cleanupExtractedBusinessName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/\s+(is|are|provides?|offers?|located|serves?|specializes?)\b.*$/i, "")
    .replace(/\s+-\s+.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "")
    .trim();
}

export function extractBusinessNamesFromSnippet(candidate: RawAcquisitionCandidate): string[] {
  if (!isDirectorySnippetSource(candidate)) {
    return [];
  }

  const snippets = candidate.snippet
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanupExtractedBusinessName)
    .filter((part) => part.length >= 4 && part.length <= 90);
  const candidates: string[] = [];

  for (const part of snippets) {
    const match = part.match(
      /^([A-Z0-9][A-Za-z0-9&'., ]{2,70}?)(?:\s+(?:is|are|provides?|offers?|located|serves?|specializes?)\b|$)/
    );
    const extracted = cleanupExtractedBusinessName(match?.[1] ?? part);
    if (
      extracted &&
      /[a-z]/i.test(extracted) &&
      !/\b(best|near|reviews?|directions?|results?|search|category|undefined)\b/i.test(extracted) &&
      !titlesLookEquivalent(extracted, candidate.title)
    ) {
      candidates.push(extracted);
    }
  }

  return [...new Set(candidates)].slice(0, 2);
}

export function buildDirectorySnippetCandidates(
  sourceCandidate: RawAcquisitionCandidate,
  startIndex: number
): RawAcquisitionCandidate[] {
  return extractBusinessNamesFromSnippet(sourceCandidate).map((businessName, index) =>
    buildRawCandidate(
      {
        title: businessName,
        url: sourceCandidate.canonicalUrl,
        snippet: sourceCandidate.snippet,
        source: `${sourceCandidate.source}_directory_snippet`
      },
      startIndex + index,
      sourceCandidate.acquisitionKind,
      sourceCandidate.acquisitionQuery,
      "directory_snippet",
      "directory_snippet",
      `Extracted from a ${describeProviderSource(sourceCandidate.source)} directory/profile snippet. Verify before treating as an owned web presence.`,
      sourceCandidate.candidateId
    )
  );
}

export function describeProviderSource(source: string): string {
  return source.replace(/_/g, " ");
}

/* Dedup scoring boundary */

export function getPreferenceScore(candidate: RawAcquisitionCandidate): number {
  let score = candidate.acquisitionKind === "live" ? 100 : 0;
  score += Math.max(0, 18 - candidate.rawRank);

  if (candidate.provenance === "directory_snippet") {
    score -= 8;
  }

  if (candidate.presenceHint === "owned_website") {
    score += 30;
  } else if (candidate.presenceHint === "dead" || candidate.presenceHint === "blocked") {
    score += 24;
  } else if (candidate.presenceHint === "marketplace") {
    score += 12;
  } else if (candidate.presenceHint === "facebook_only" || candidate.presenceHint === "yelp_only") {
    score += 10;
  } else if (candidate.presenceHint === "directory_only") {
    score += 8;
  } else {
    score += 6;
  }

  if (candidate.variantLabel === "normalized") {
    score += 4;
  }

  if (candidate.variantLabel === "raw") {
    score += 2;
  }

  if (candidate.variantLabel === "local_profile" || candidate.variantLabel === "service_area") {
    score += 2;
  }

  return score;
}

export function getDuplicateReason(
  left: RawAcquisitionCandidate,
  right: RawAcquisitionCandidate
): string | null {
  if (left.comparisonKey === right.comparisonKey) {
    if (
      (left.provenance === "directory_snippet" || right.provenance === "directory_snippet") &&
      left.businessKey !== right.businessKey
    ) {
      return null;
    }

    return "Same canonical URL after normalization.";
  }

  if (
    left.canonicalHost === right.canonicalHost &&
    left.presenceHint === right.presenceHint &&
    titlesLookEquivalent(left.title, right.title)
  ) {
    return "Same host and business title across query variants.";
  }

  if (
    left.canonicalHost === right.canonicalHost &&
    left.presenceHint === "owned_website" &&
    right.presenceHint === "owned_website" &&
    titlesLookEquivalent(left.title, right.title)
  ) {
    return "Owned website duplicate across query variants.";
  }

  return null;
}

export function shouldDeferLowSignalCandidate(
  candidate: RawAcquisitionCandidate,
  selected: RawAcquisitionCandidate[],
  remaining: RawAcquisitionCandidate[],
  limits: SearchLimits
): boolean {
  if (!isLowSignalPresence(candidate.presenceHint)) {
    return false;
  }

  const lowSignalCap = Math.max(3, Math.floor(limits.maxCandidates * 0.35));
  const selectedLowSignalCount = selected.filter((entry) =>
    isLowSignalPresence(entry.presenceHint)
  ).length;
  const remainingHigherValue = remaining.some((entry) => !isLowSignalPresence(entry.presenceHint));

  return selectedLowSignalCount >= lowSignalCap && remainingHigherValue;
}

/* Fallback diagnostics boundary */

export function isProviderDegraded(outcome: AcquisitionAttemptOutcome): boolean {
  return outcome !== "success" && outcome !== "empty";
}

export function mapOutcomeToFallbackReason(
  outcome: AcquisitionAttemptOutcome
): AcquisitionFallbackTrigger["reason"] | null {
  if (outcome === "empty") {
    return "provider_empty";
  }

  if (outcome === "blocked") {
    return "provider_blocked";
  }

  if (outcome === "parse_error") {
    return "provider_parse_failure";
  }

  if (outcome === "network_error") {
    return "provider_network_error";
  }

  if (outcome === "http_error") {
    return "provider_http_error";
  }

  return null;
}

export function toSearchCandidate(candidate: RawAcquisitionCandidate, rank: number): SearchCandidate {
  return {
    candidateId: candidate.candidateId,
    rank,
    title: candidate.title,
    url: candidate.canonicalUrl,
    domain: candidate.canonicalHost,
    snippet: candidate.snippet,
    source: candidate.source,
    provenance: candidate.provenance,
    ...(candidate.provenanceNote ? { provenanceNote: candidate.provenanceNote } : {}),
    ...(candidate.extractedFromCandidateId
      ? { extractedFromCandidateId: candidate.extractedFromCandidateId }
      : {})
  };
}

/* Provider attempt boundary */

export function ensureVariantAccumulator(
  variantStats: Map<string, VariantAccumulator>,
  label: string,
  query: string
): VariantAccumulator {
  const existing = variantStats.get(label);
  if (existing) {
    return existing;
  }

  const created: VariantAccumulator = {
    label,
    query,
    rawResultCount: 0,
    acceptedResultCount: 0,
    sources: new Set()
  };
  variantStats.set(label, created);
  return created;
}

export function recordProviderAttempt(input: {
  attempts: AcquisitionDiagnostics["providerAttempts"];
  provider: SearchProviderAdapter;
  variantLabel: string;
  query: string;
  response: ProviderSearchResponse;
}): void {
  input.attempts.push({
    provider: input.provider.name,
    kind: input.provider.kind,
    variantLabel: input.variantLabel,
    query: input.query,
    outcome: input.response.outcome,
    rawResultCount: input.response.candidates.length,
    ...(input.response.httpStatus ? { httpStatus: input.response.httpStatus } : {}),
    ...(input.response.detail ? { detail: input.response.detail } : {})
  });
}
