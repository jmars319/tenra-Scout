import type { ConfidenceLevel, PresenceRecord, PresenceType, SearchCandidate } from "./model.ts";

const DIRECTORY_DOMAINS = [
  "yellowpages.com",
  "mapquest.com",
  "superpages.com",
  "bbb.org",
  "chamberofcommerce.com",
  "manta.com",
  "yellowbook.com",
  "healthgrades.com",
  "care.com",
  "caredash.com",
  "dexknows.com",
  "find-open.com",
  "foursquare.com",
  "local.yahoo.com",
  "nicelocal.com",
  "showmelocal.com",
  "threebestrated.com",
  "tripadvisor.com",
  "vitals.com",
  "buildzoom.com",
  "restaurantji.com",
  "menupix.com",
  "bdir.in",
  "nearbydonuts.com",
  "donutlocations.com",
  "restaurantguru.com",
  "zmenu.com",
  "allmenus.com",
  "menuism.com",
  "menuwithprice.com",
  "findmeglutenfree.com"
] as const;
const MARKETPLACE_DOMAINS = [
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "seamless.com",
  "etsy.com",
  "amazon.com",
  "booking.com",
  "booksy.com",
  "fresha.com",
  "groupon.com",
  "opentable.com",
  "resy.com",
  "classpass.com",
  "mindbodyonline.com",
  "vagaro.com",
  "styleseat.com",
  "thumbtack.com",
  "angi.com",
  "homeadvisor.com",
  "homeguide.com",
  "lawnstarter.com",
  "zocdoc.com",
  "vrbo.com",
  "airbnb.com",
  "joe.coffee"
] as const;
const ROUNDUP_ONLY_DOMAINS = [
  "threebestrated.com",
  "expertise.com",
  "bestprosintown.com",
  "trustanalytica.com"
] as const;
const FACEBOOK_DOMAINS = ["facebook.com", "m.facebook.com"];
const YELP_DOMAINS = ["yelp.com"];
const COMMUNITY_DISCUSSION_DOMAINS = [
  "reddit.com",
  "redd.it",
  "zhihu.com",
  "quora.com"
] as const;
const SOCIAL_PROFILE_DOMAINS = [
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "pinterest.com",
  "nextdoor.com",
  ...COMMUNITY_DISCUSSION_DOMAINS
] as const;
const OWNED_SITE_HOST_ALLOWLIST = [
  "square.site",
  "wixsite.com",
  "weebly.com",
  "squarespace.com",
  "webflow.io"
] as const;
const DIRECTORY_PATH_PATTERNS = [
  /\/biz(\/|$)/,
  /\/business(\/|$)/,
  /\/company(\/|$)/,
  /\/directory(\/|$)/,
  /\/listing(\/|$)/,
  /\/profile(\/|$)/,
  /\/provider(\/|$)/,
  /\/restaurant(\/|$)/,
  /\/doctor(\/|$)/,
  /\/dentist(\/|$)/
] as const;
const DIRECTORY_TEXT_PATTERNS = [
  "phone number",
  "reviews",
  "review",
  "directions",
  "hours",
  "claim this business"
] as const;
const MARKETPLACE_TEXT_PATTERNS = [
  "book online",
  "reserve",
  "delivery",
  "pickup",
  "appointment",
  "book now",
  "schedule online"
] as const;
const GUIDE_TEXT_PATTERNS = [
  "where to eat the best",
  "must-try",
  "current favorites are",
  "following are the list",
  "latest reviews, photos and ratings",
  "view the menu, hours, phone number, address and map",
  "locally made",
  "treat your taste buds"
] as const;
const GUIDE_TEXT_REGEX_PATTERNS = [
  /\btop\s+\d+\b/,
  /\bbest\b.+\bin\b/,
  /\bnear me\b/,
  /\bbest places?\b/,
  /\bpopular\b.+\bas per\b/
] as const;
const GUIDE_TITLE_REGEX_PATTERNS = [
  /^\d+\s+best\b/,
  /^\d+\s+top\b/,
  /\btop\s+\d+\b/,
  /\bbest\b.+\bin\b/,
  /\bexpert recommended\b/,
  /\bmade the cut\b/,
  /\bdefinitive list\b/
] as const;
const GUIDE_SNIPPET_PATTERNS = [
  "want to see who made the cut",
  "expert recommended",
  "50-point inspection",
  "we've gathered up the best",
  "read real reviews and see ratings",
  "compare providers and book online",
  "the definitive list",
  "our current favorites are listed here"
] as const;
const GUIDE_PATH_PATTERNS = [
  /\/blog(\/|$)/,
  /\/best[-/]/,
  /\/top[-/]/,
  /\/near[-/]me/,
  /\/locations?\//,
  /\/category\//
] as const;

export interface PresenceRuleMatch {
  type: PresenceType;
  reason: string;
  confidence: ConfidenceLevel;
}

function matchesKnownDomain(domain: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

function matchesAnyPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function countMatchingPatterns(value: string, patterns: readonly RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(value)).length;
}

function includesAny(value: string, snippets: readonly string[]): boolean {
  return snippets.some((snippet) => value.includes(snippet));
}

function countIncludes(value: string, snippets: readonly string[]): number {
  return snippets.filter((snippet) => value.includes(snippet)).length;
}

function buildRuleMatch(
  type: PresenceType,
  reason: string,
  confidence: ConfidenceLevel
): PresenceRuleMatch {
  return {
    type,
    reason,
    confidence
  };
}

export function evaluatePresenceUrl(input: {
  url: string;
  title?: string;
  snippet?: string;
}): PresenceRuleMatch {
  const parsedUrl = new URL(input.url);
  const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsedUrl.pathname.toLowerCase();
  const combinedText = `${input.title ?? ""} ${input.snippet ?? ""}`.toLowerCase();
  const guideTextMatchCount =
    countIncludes(combinedText, GUIDE_TEXT_PATTERNS) +
    countMatchingPatterns(combinedText, GUIDE_TEXT_REGEX_PATTERNS);
  const guidePathMatch = matchesAnyPattern(pathname, GUIDE_PATH_PATTERNS);

  if (matchesKnownDomain(domain, FACEBOOK_DOMAINS)) {
    if (pathname.includes("/pages/") || pathname.includes("/profile.php")) {
      return buildRuleMatch("facebook_only", "Result resolves to a Facebook profile page.", "confirmed");
    }

    return buildRuleMatch("facebook_only", "Result resolves to a Facebook page.", "probable");
  }

  if (matchesKnownDomain(domain, YELP_DOMAINS)) {
    return buildRuleMatch("yelp_only", "Result resolves to a Yelp listing.", "probable");
  }

  if (
    matchesKnownDomain(domain, MARKETPLACE_DOMAINS) ||
    includesAny(combinedText, MARKETPLACE_TEXT_PATTERNS) ||
    pathname.includes("/book") ||
    pathname.includes("/reserve")
  ) {
    return buildRuleMatch(
      "marketplace",
      "Result appears to be hosted on a marketplace or booking intermediary.",
      "probable"
    );
  }

  if (
    matchesKnownDomain(domain, DIRECTORY_DOMAINS) ||
    (!matchesKnownDomain(domain, OWNED_SITE_HOST_ALLOWLIST) &&
      matchesAnyPattern(pathname, DIRECTORY_PATH_PATTERNS) &&
      includesAny(combinedText, DIRECTORY_TEXT_PATTERNS)) ||
    (!matchesKnownDomain(domain, OWNED_SITE_HOST_ALLOWLIST) &&
      (guideTextMatchCount >= 2 || (guidePathMatch && guideTextMatchCount >= 1)))
  ) {
    return buildRuleMatch(
      "directory_only",
      "Result appears to be a directory, roundup, or listing page rather than a business-owned website.",
      "probable"
    );
  }

  if (matchesKnownDomain(domain, SOCIAL_PROFILE_DOMAINS)) {
    return buildRuleMatch(
      "unknown",
      "Result resolves to a non-owned social profile rather than a business website.",
      "inferred"
    );
  }

  return buildRuleMatch("owned_website", "Result appears to be an owned website.", "confirmed");
}

export function isAggregatorRoundupResult(input: {
  url: string;
  title?: string;
  snippet?: string;
}): boolean {
  const parsedUrl = new URL(input.url);
  const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsedUrl.pathname.toLowerCase();
  const title = (input.title ?? "").toLowerCase();
  const combinedText = `${input.title ?? ""} ${input.snippet ?? ""}`.toLowerCase();
  const guideTextMatchCount =
    countIncludes(combinedText, GUIDE_TEXT_PATTERNS) +
    countMatchingPatterns(combinedText, GUIDE_TEXT_REGEX_PATTERNS);
  const guideTitleMatchCount = countMatchingPatterns(title, GUIDE_TITLE_REGEX_PATTERNS);
  const guideSnippetMatchCount = countIncludes(combinedText, GUIDE_SNIPPET_PATTERNS);
  const guidePathMatch = matchesAnyPattern(pathname, GUIDE_PATH_PATTERNS);
  const aggregatorDomain =
    matchesKnownDomain(domain, DIRECTORY_DOMAINS) ||
    matchesKnownDomain(domain, MARKETPLACE_DOMAINS) ||
    matchesKnownDomain(domain, ROUNDUP_ONLY_DOMAINS);

  if (!aggregatorDomain) {
    return false;
  }

  return (
    matchesKnownDomain(domain, ROUNDUP_ONLY_DOMAINS) ||
    guideTitleMatchCount >= 1 ||
    guideSnippetMatchCount >= 1 ||
    guideTextMatchCount >= 1 ||
    guidePathMatch
  );
}

export function isCommunityDiscussionResult(input: { url: string }): boolean {
  const parsedUrl = new URL(input.url);
  const domain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  return matchesKnownDomain(domain, COMMUNITY_DISCUSSION_DOMAINS);
}

export function deriveBusinessName(candidate: SearchCandidate): string {
  return candidate.title
    .split(/[-–·•|]/)
    .map((segment) => segment.trim())
    .find(Boolean) || candidate.domain;
}

export function classifyPresenceType(candidate: SearchCandidate): PresenceType {
  return evaluatePresenceUrl({
    url: candidate.url,
    title: candidate.title,
    snippet: candidate.snippet
  }).type;
}

export function isAuditEligiblePresence(presenceType: PresenceType): boolean {
  return presenceType === "owned_website";
}

export function createPresenceRecord(
  candidate: SearchCandidate,
  presenceType: PresenceType,
  detectionNotes: string[]
): PresenceRecord {
  return {
    candidateId: candidate.candidateId,
    businessName: deriveBusinessName(candidate),
    primaryUrl: candidate.url,
    domain: candidate.domain,
    searchRank: candidate.rank,
    presenceType,
    auditEligible: isAuditEligiblePresence(presenceType),
    secondaryUrls: [],
    detectionNotes
  };
}
