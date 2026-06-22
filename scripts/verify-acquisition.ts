import assert from "node:assert/strict";

import {
  buildStructuredScoutQuery,
  buildLeadShortlist,
  classifyBusiness,
  normalizeStructuredBusinessTypeInput,
  resolveMarketIntent,
  SCOUT_BUSINESS_TYPE_SUGGESTIONS
} from "../packages/domain/src/index.ts";
import {
  createPresenceRecord,
  evaluatePresenceUrl,
  isAggregatorRoundupResult,
  isCommunityDiscussionResult
} from "../packages/domain/src/presence.ts";
import {
  normalizeLocationHint,
  normalizeStructuredLocationInput,
  SCOUT_CITY_STATE_SUGGESTIONS
} from "../packages/geo/src/index.ts";
import { acquireCandidates } from "../apps/webapp/src/lib/server/search/acquisition.ts";
import { canonicalizeUrl } from "../apps/webapp/src/lib/server/search/canonicalize.ts";
import { buildQueryVariants } from "../apps/webapp/src/lib/server/search/query-variants.ts";

async function main(): Promise<void> {
  /* Query normalization boundary */

  const canonical = canonicalizeUrl(
    "https://www.example.com/services/index.html?utm_source=ddg&ref=ads#top"
  );
  assert.equal(canonical.canonicalUrl, "https://example.com/services");
  assert(SCOUT_BUSINESS_TYPE_SUGGESTIONS.includes("computer store"));
  assert(SCOUT_CITY_STATE_SUGGESTIONS.includes("Winston-Salem, NC"));
  assert.equal(normalizeStructuredBusinessTypeInput("Computer Store"), "computer store");
  assert.equal(normalizeStructuredLocationInput("winston-salem north carolina"), "Winston-Salem, NC");
  assert.equal(
    buildStructuredScoutQuery({
      businessType: "Computer Store",
      location: "winston-salem north carolina"
    }),
    "computer store in Winston-Salem, NC"
  );
  assert.deepEqual(normalizeLocationHint("landscaping companies in Winston-Salem, North Carolina"), {
    raw: "Winston-Salem, North Carolina",
    normalized: "Winston-Salem, NC",
    city: "Winston-Salem",
    region: "NC",
    proximity: "in"
  });

  const intent = resolveMarketIntent({
    rawQuery: "dentists in Columbus, OH"
  });
  const variants = buildQueryVariants(intent);
  assert(variants.some((variant) => variant.label === "raw"));
  assert(variants.some((variant) => variant.label === "normalized"));
  assert(variants.some((variant) => variant.label === "singularized"));
  assert(variants.some((variant) => variant.label === "official_website"));
  assert(variants.some((variant) => variant.label === "contact_path"));
  assert(variants.some((variant) => variant.label === "local_profile"));
  assert(variants.some((variant) => variant.label === "local_website_unquoted"));
  assert(variants.some((variant) => variant.label === "reviews_website"));
  assert(variants.some((variant) => variant.label === "service_area"));
  assert(variants.some((variant) => variant.label === "owned_domain"));
  assert.equal(
    evaluatePresenceUrl({
      url: "https://www.buildzoom.com/winston-salem-nc/landscape-contractors",
      title: "The 10 Best Landscape contractors in Winston Salem, NC",
      snippet: "Directory of local contractors."
    }).type,
    "directory_only"
  );
  assert.equal(
    evaluatePresenceUrl({
      url: "https://www.lawnstarter.com/winston-salem-nc-landscaping",
      title: "20 Best Landscapers in Winston Salem, NC",
      snippet: "Compare landscapers and book local service."
    }).type,
    "marketplace"
  );
  assert.equal(
    evaluatePresenceUrl({
      url: "https://restaurantji.com/nc/winston-salem/donuts",
      title: "Where to Eat The Best Donuts in Winston Salem, NC - Restaurantji",
      snippet:
        "We've gathered up the best places to find doughnuts in Winston Salem. Our current favorites are listed here."
    }).type,
    "directory_only"
  );
  assert.equal(
    evaluatePresenceUrl({
      url: "https://donutlocations.com/winston-salem-nc.html",
      title: "Best Donuts in Winston-Salem, NC - Must-Try Doughnuts & Donut Shop Guide",
      snippet: "Winston-Salem donut guide and roundup."
    }).type,
    "directory_only"
  );
  assert.equal(
    evaluatePresenceUrl({
      url: "https://reddit.com/r/winstonsalem/comments/1l75jbz/looking_for_donuts",
      title: "Looking for donuts : r/winstonsalem",
      snippet: "Reddit discussion thread."
    }).type,
    "unknown"
  );
  assert.equal(
    evaluatePresenceUrl({
      url: "https://zhihu.com/question/346538664",
      title: "为什么dunking donut (唐恩都乐)在国内火不起来? - 知乎",
      snippet: "Community discussion thread."
    }).type,
    "unknown"
  );
  assert.equal(
    isAggregatorRoundupResult({
      url: "https://threebestrated.com/computer-repair-in-winston-salem-nc",
      title: "3 Best Computer Repair in Winston Salem, NC",
      snippet: "Expert recommended Top 3 Computer Repair in Winston Salem, NC."
    }),
    true
  );
  assert.equal(
    isAggregatorRoundupResult({
      url: "https://thumbtack.com/nc/winston-salem/computer-repair",
      title: "The 10 Best Computer Repair Services in Winston Salem, NC 2026 - Thumbtack",
      snippet: "Want to see who made the cut?"
    }),
    true
  );
  assert.equal(
    isCommunityDiscussionResult({
      url: "https://reddit.com/r/winstonsalem/comments/1l75jbz/looking_for_donuts"
    }),
    true
  );

  /* Acquisition merge boundary */

  const liveResults: Record<
    string,
    Array<{ title: string; url: string; snippet: string; source: string }>
  > = {
    "dentists in Columbus, OH": [
      {
        title: "Aspen Dental",
        url: "https://www.aspendental.com/?utm_source=ddg",
        snippet: "Dental practice website.",
        source: "duckduckgo_html"
      },
      {
        title: "Aspen Dental Official Site",
        url: "https://aspendental.com",
        snippet: "Official website.",
        source: "duckduckgo_html"
      },
      {
        title: "Dentists - Yelp",
        url: "https://www.yelp.com/search?find_desc=dentists",
        snippet: "Yelp search results.",
        source: "duckduckgo_html"
      },
      {
        title: "Gentle Dental - Facebook",
        url: "https://www.facebook.com/gentledental",
        snippet: "Facebook page.",
        source: "duckduckgo_html"
      }
    ],
    "dentists Columbus, OH": [
      {
        title: "Aspen Dental",
        url: "https://www.aspendental.com",
        snippet: "Dental practice website.",
        source: "duckduckgo_html"
      },
      {
        title: "Western Dental",
        url: "https://www.westerndental.com/",
        snippet: "Dental website.",
        source: "duckduckgo_html"
      },
      {
        title: "Perfect Teeth",
        url: "https://www.perfectteeth.com/index.html",
        snippet: "Dental office website.",
        source: "duckduckgo_html"
      }
    ],
    "dentist Columbus, OH": [
      {
        title: "Perfect Teeth",
        url: "https://www.perfectteeth.com/",
        snippet: "Dental office website.",
        source: "duckduckgo_html"
      }
    ]
  };

  const result = await acquireCandidates({
    intent,
    limits: {
      minCandidates: 5,
      maxCandidates: 6
    },
    liveProviders: [
      {
        name: "duckduckgo_html",
        kind: "live",
        executeQuery: (query: string) =>
          Promise.resolve({
            outcome: "success",
            candidates: liveResults[query] ?? []
          })
      }
    ]
  });

  assert.equal(result.diagnostics.mergedDuplicateCount, 3);
  assert.equal(result.diagnostics.discardedCandidateCount, 1);
  assert.equal(result.diagnostics.fallbackUsed, false);
  assert.equal(result.diagnostics.selectedCandidateCount, 4);
  assert.equal(result.diagnostics.liveCandidateCount, 4);
  assert.equal(result.diagnostics.fallbackCandidateCount, 0);
  assert(
    result.candidates.some((candidate) => candidate.url === "https://example.com/services") ===
      false
  );
  assert(
    result.candidates.every((candidate) => !candidate.url.includes("utm_") && !candidate.url.endsWith("/index.html"))
  );
  assert(
    result.diagnostics.notes.some((note) =>
      note.includes("final market sample landed below the minimum target candidate count")
    )
  );
  assert(result.candidates.every((candidate) => candidate.source !== "seeded_stub"));

  const aggregatorIntent = resolveMarketIntent({
    rawQuery: "pc repair shop in Winston-Salem, NC"
  });
  const aggregatorResult = await acquireCandidates({
    intent: aggregatorIntent,
    limits: {
      minCandidates: 2,
      maxCandidates: 8
    },
    liveProviders: [
      {
        name: "bing_html",
        kind: "live",
        executeQuery: () =>
          Promise.resolve({
            outcome: "success",
            candidates: [
              {
                title: "Welcome to Computer Repair Service - Winston-Salem, North Carolina",
                url: "http://crs2000.net/",
                snippet: "Established local computer repair shop.",
                source: "bing_html"
              },
              {
                title: "3 Best Computer Repair in Winston Salem, NC",
                url: "https://threebestrated.com/computer-repair-in-winston-salem-nc",
                snippet:
                  "Expert recommended Top 3 Computer Repair in Winston Salem, NC. 50-Point Inspection.",
                source: "bing_html"
              },
              {
                title: "The 10 Best Computer Repair Services in Winston Salem, NC 2026 - Thumbtack",
                url: "https://thumbtack.com/nc/winston-salem/computer-repair",
                snippet: "Here is the definitive list. Want to see who made the cut?",
                source: "bing_html"
              },
              {
                title: "Best Computer Repair Service in Winston Salem, NC",
                url: "https://chamberofcommerce.com/business-directory/north-carolina/winston-salem/computers-software/computer-services/computer-repair-service",
                snippet: "Business directory category page.",
                source: "bing_html"
              },
              {
                title: "PC 到底是什么？ - 知乎",
                url: "https://zhihu.com/question/24152546",
                snippet: "Community discussion thread.",
                source: "bing_html"
              },
              {
                title: "Affordable PC Services - Computer Repair, Laptop Repair",
                url: "https://affordablepcstore.com/",
                snippet: "Offering computer repair in Winston-Salem.",
                source: "bing_html"
              }
            ]
          })
      }
    ]
  });

  assert(aggregatorResult.diagnostics.discardedCandidateCount >= 4);
  assert(
    aggregatorResult.candidates.some((candidate) => candidate.domain === "affordablepcstore.com")
  );
  assert(aggregatorResult.candidates.some((candidate) => candidate.domain === "crs2000.net"));
  assert(
    aggregatorResult.diagnostics.discardedCandidates.every(
      (candidate) => candidate.reason && candidate.title && candidate.url
    )
  );

  /* Shortlist scoring boundary */

  const shortlistPresences = [
    createPresenceRecord(
      {
        candidateId: "owned-1",
        rank: 1,
        title: "Aspen Dental",
        url: "https://www.aspendental.com",
        domain: "aspendental.com",
        snippet: "Dental practice website.",
        source: "duckduckgo_html"
      },
      "owned_website",
      []
    ),
    createPresenceRecord(
      {
        candidateId: "marketplace-1",
        rank: 2,
        title: "Top Dentists in Columbus, OH",
        url: "https://www.thumbtack.com/oh/columbus/dentists",
        domain: "thumbtack.com",
        snippet: "Compare providers and book online.",
        source: "bing_html"
      },
      "marketplace",
      []
    ),
    createPresenceRecord(
      {
        candidateId: "directory-1",
        rank: 3,
        title: "Dentists near Columbus, OH",
        url: "https://www.yellowpages.com/columbus-oh/dentists",
        domain: "yellowpages.com",
        snippet: "Business listings and reviews.",
        source: "bing_html"
      },
      "directory_only",
      []
    )
  ];
  const shortlistClassifications = shortlistPresences.map((presence) =>
    classifyBusiness(presence, [])
  );
  const shortlist = buildLeadShortlist(shortlistPresences, shortlistClassifications, []);

  assert.equal(shortlist.length, 1);
  assert.equal(shortlist[0]?.candidateId, "owned-1");

  console.log("Acquisition verification passed.");
}

await main();
