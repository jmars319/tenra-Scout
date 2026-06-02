# Developer Guide

## Toolchain

- Node `22.21.1`
- pnpm workspace
- TypeScript `5.9.x`
- Next.js `16`
- React `19`
- Playwright plus `@axe-core/playwright`

## First Run

1. Run `pnpm run bootstrap`.
2. Use the default local `DATABASE_URL=postgresql:///scout`, or set a different `DATABASE_URL` in `.env` or your shell. Optional for outreach drafting: set `OPENAI_API_KEY`.
3. Run `pnpm run db:prepare`.
4. If you have older local run files in `data/runs`, run `pnpm run db:import:local-runs`.
5. Start the product with `pnpm run dev:web`.
6. Start the worker with `pnpm run dev:worker`.
7. Open `http://localhost:3000`.

`pnpm run dev:all` starts the web app and worker together in one local shell session.
`pnpm run dev:desktop` starts a local web server plus worker automatically, then opens the same Scout flow inside Electron.
`pnpm run package:desktop` builds a local macOS desktop package under `dist/desktop` with ad-hoc signing when no Apple signing credentials are available.
`pnpm run qa:desktop-install` installs the latest packaged app into `~/Applications`, verifies the app signature, starts the packaged runtime, checks database/schema readiness, and shuts it down.
`pnpm run package:desktop:release` requires Developer ID signing and Apple notarization credentials, then builds release-ready macOS artifacts.
`pnpm run check:desktop-release-env` checks release signing and notarization prerequisites without running the expensive package build.
`pnpm run qa:operator` prints the manual operator QA checklist and current local artifact/install status.
`pnpm run install:desktop` packages Scout, installs `tenra Scout.app` into `/Applications`, and seeds the packaged desktop `.env` file if needed. It does not open Scout automatically.
`pnpm run launch:desktop` opens the installed Scout app from `/Applications` or falls back to the packaged build under `dist/desktop`.
`pnpm run clean:local` prunes the desktop interactive-search browser caches without clearing the saved session.
`pnpm run clean:local:full` removes the local interactive-search profile and local screenshot evidence without touching Postgres.

`bootstrap` installs workspace dependencies, ensures local data directories exist, and installs the Chromium browser used by Playwright.

## How A Scout Run Works

1. The homepage posts `rawQuery` to `POST /api/scout/run`.
2. `apps/webapp/src/lib/server/scout-runner.ts` validates input, resolves market intent, creates a Postgres-backed `queued` run record, and returns the run id promptly.
3. `apps/webapp/src/lib/server/worker/scout-worker.ts` polls Postgres, claims queued runs, moves them to `running`, and executes the real Scout pipeline.
4. `packages/domain` resolves market intent, requests candidates, types presence, audits owned sites, classifies businesses, and builds the report.
5. The webapp server layer supplies the real dependencies:
   search provider, presence detector, Playwright auditor, Postgres run repository, local evidence storage.
6. The worker writes lifecycle state through the repository:
   `queued -> running -> completed|failed`
7. The completed or failed run record is upserted into Postgres with the explicit persisted shape.
8. Screenshot evidence is saved under `data/evidence/<runId>/...`.
9. The run page reads the saved report through the repository and renders either a status view or the final report.

## Search Behavior

- Default provider path: DuckDuckGo HTML scrape, Google Search, and Bing HTML on the same live seam.
- Verification-only provider: seeded deterministic catalog.
- Provider seam: explicit adapters return candidates plus structured attempt diagnostics.
- Query acquisition uses a controlled deterministic variant set:
  raw query
  normalized market plus location form
  singularized variant only when it is safely derivable
  official-website/contact/profile/domain-oriented variants when a location is present
  unquoted local website/reviews variants to improve recall when exact quoted market terms are too narrow
- URLs are canonicalized before final candidate selection.
- Directory and profile snippets can surface lower-confidence extracted leads when Scout sees a business name inside a non-owned result.
- Candidates are deduplicated before presence typing and audit.
- Domain logic never hardcodes provider-specific assumptions.
- Live-provider degradation is classified explicitly when Scout sees:
  empty-result pages
  anti-bot/block-like pages
  parse failures
  transient network or HTTP failures
- Google Search can return either a browser-only JavaScript shell or a reCAPTCHA challenge. Scout treats both as degraded and does not escalate Google into a manual browser-confirmation path.
- Desktop mode can escalate blocked DuckDuckGo searches into a real browser-backed session so the operator can complete a human challenge and let the run continue.
- Seeded fallback is now verification-only. Normal product runs do not backfill live-search failures with seeded candidates.
- Acquisition diagnostics now record:
  provider attempts
  candidate source contribution counts
  verification-only fallback trigger reasons
  caution notes tied to live-provider weakness

If live acquisition is weak, partial, fallback-heavy, or directory-snippet-heavy, Scout records that in acquisition diagnostics and market-confidence notes.
If a desktop DuckDuckGo run needs manual confirmation, Scout records that too.

## Candidate Review

- Completed reports include an acquisition review panel.
- Operators can manually add a known business by name and URL after the run.
- Operators can also add one manual lead from the Lead Inbox through `POST /api/leads/manual`. Supplying `runId` attaches it to an existing completed run; omitting `runId` creates a completed manual run with source `operator-entered` and a lead annotation so it appears in the inbox immediately.
- Operators can promote discarded acquisition results when Scout saved enough detail to reconstruct the candidate.
- Added and promoted candidates are evaluated through the same presence detection, Playwright audit, business classification, and shortlist rules as live-search candidates.
- Provenance labels distinguish live results, directory-snippet leads, manual additions, and promoted discarded results.
- Manual missed-business additions also append acquisition-learning notes so future review can distinguish provider/query coverage gaps, discarded-result filtering, duplicate handling, degraded live search, and narrow samples.

## Audit Behavior

- Audit eligibility is limited to presences typed as `owned_website`.
- Presence typing uses deterministic rules over search-result URLs, redirected destinations, and simple destination-state checks to reduce false owned-site matches.
- Each eligible site gets:
  homepage audit
  one deterministic secondary-page audit if discovered
  desktop and mobile passes
- Secondary-page selection is ranked from obvious same-origin business links such as contact, services, menu, booking, locations, and about.
- Findings are normalized into stable issue types:
  console errors
  failed requests
  broken navigation
  missing primary CTA
  missing contact path
  accessibility issues
  tap target issues
  mobile layout issues
  blocked content
  dead page
  weak trust signal
- Severity and confidence are assigned during normalization instead of directly from raw browser events.

## Storage

- Runs: Postgres-backed persisted records in `scout_runs`
- Outreach packs: Postgres-backed local records in `scout_outreach_drafts`
- Evidence: local screenshots in `data/evidence`
- Legacy local runs: import/read compatibility source in `data/runs`

Run storage and evidence storage both live behind explicit adapters. The worker and the web app both write through the same repository seam.

## Outreach Drafting

- Desktop is the primary operator surface for this workflow. The Next.js app renders the same outreach workspace inside Electron.
- Outreach packs are grounded on stored Scout report data:
  shortlist reasons
  confirmed or high-signal findings
  business breakdown context
- Scout can analyze a shortlisted business's contact paths and recommend the strongest first-contact channel before drafting copy.
- AI generation now returns:
  email subject and body
  short-form outreach suitable for contact forms or DMs
  phone talking points when a call path is viable
- Outreach packs are local-first and saved into Postgres so reopening a run in desktop brings them back.
- `OPENAI_API_KEY` enables draft generation through OpenAI.
- `SCOUT_OUTREACH_MODEL` defaults to `gpt-5-mini`.
- Manual contact analysis, editing, and local save work even when the AI key is absent.
- Scout still does not send outreach automatically. The operator reviews, edits, copies, and sends outside Scout.

## Worker Model

- Queue storage: Postgres `scout_runs` rows with lifecycle timestamps and attempt metadata
- Worker command: `pnpm run dev:worker` or `pnpm run worker:start`
- Combined local start: `pnpm run dev:all`
- Poll configuration:
  `SCOUT_WORKER_POLL_MS`
  `SCOUT_WORKER_STALE_RUN_MS`
- If a worker attempt stalls past the stale-run threshold, the row is re-queued on the next worker loop with a short worker note.
- Run pages also expose operator controls for canceling active runs, retrying failed runs in place, re-running the same raw query as a fresh run, and manually triggering stale-run cleanup.

## Verification

- `pnpm run verify:acquisition`
  Runs a small deterministic check over canonicalization, query variants, deduplication, and live-only acquisition behavior.
- `pnpm run verify:providers`
  Verifies the hardened provider seam directly: DuckDuckGo HTML, Google Search, and Bing parsing success, empty-result detection, block/degradation detection, parse-failure detection, and fallback-trigger diagnostics under degraded live acquisition.
- `pnpm run verify:candidates`
  Seeds a completed run with a promotable discarded candidate, adds a manual candidate, verifies missed-business diagnostics plus acquisition-learning notes, promotes the discarded candidate, verifies the report summary is rebuilt, and cleans up the verification row plus local evidence.
- `pnpm run verify:comparison`
  Builds two deterministic completed report fixtures and verifies saved-market comparison output for new/missing businesses, shortlist rank movement, finding deltas, issue deltas, and sample metadata.
- `pnpm run verify:outreach`
  Seeds a completed verification run, lets Scout analyze a local contact-path fixture, saves a local outreach pack through the desktop-first outreach service layer, reads it back from Postgres, and then cleans up the verification records.
- `pnpm run verify:persistence`
  Applies the schema, creates a queued run record, saves a completed run record, reads it back, checks recent-run retrieval, and deletes the verification row.
- `pnpm run verify:queue`
  Applies the schema, creates queued runs, verifies worker claim behavior, verifies completed and failed lifecycle transitions, and deletes the verification rows.
- `pnpm run verify:run-controls`
  Applies the schema, submits a queued run, verifies cancel, retry, stale-run requeue, and fresh rerun behavior, then deletes the verification rows.
- `pnpm run verify:http-smoke`
  Starts a temporary Next.js dev server plus a one-shot worker on an isolated local port, warms the real API routes, submits a run through `POST /api/scout/run`, confirms the queued response, waits for `queued -> running -> completed`, retrieves the final report through `GET /api/runs/:runId`, verifies lead UI/export paths plus run control actions, and deletes the verification rows plus local evidence.
- `pnpm run verify:web`
  Runs lint, typecheck, acquisition verification, provider verification, candidate-addition verification, market-comparison verification, lead/outreach verification, persistence verification, queue verification, run-control verification, and the web build.

`verify:http-smoke` requires `DATABASE_URL`, local Postgres access, and the Playwright browser installed by `pnpm run bootstrap`. It intentionally forces `SCOUT_SEARCH_PROVIDER=seeded_stub` and smaller candidate limits inside the temporary child processes so the smoke path proves HTTP lifecycle integrity without depending on live-provider stability. That stub path is verification-only; normal Scout runs no longer backfill seeded candidates.

`SCOUT_SEARCH_PROVIDER` is intentionally narrow. Valid values are `duckduckgo_html`, `google_html`, `bing_html`, and `seeded_stub`. `seeded_stub` is reserved for verification; normal product runs should stay live-only.

Desktop shells automatically set:
- `SCOUT_INTERACTIVE_SEARCH=1`
- `SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR=<local desktop profile path>`

That allows blocked DuckDuckGo HTML runs to open a local browser-backed confirmation window without widening the web product surface. Google remains fetch-only.
Desktop startup also prunes cache-heavy folders inside that profile at most once per 24 hours so `.local` does not grow indefinitely while cookies and session storage stay intact.

## Local Tooling

The shared local machine baseline includes a few tools that are useful in this repo:

- Use `actionlint` before changing GitHub Actions workflows.
- Use `shellcheck` and `shfmt` when editing release, package, or verification shell scripts.
- Use `osv-scanner` for dependency advisory checks across package manifests before release work.
- Use `pa11y` and `lighthouse` against the running Next.js surface when UI or accessibility behavior changes.
- Use OrbStack/Docker only when local service parity is needed; the normal Scout verification path still expects local Postgres and the repo scripts above.

## Desktop And Mobile Surfaces

- `pnpm run dev:desktop`
  Starts the local web app and worker on an isolated loopback port, then opens Scout in an Electron shell.
- `pnpm run start:desktop`
  Runs the same desktop shell against a local production Next.js server.
- `pnpm run verify:desktop`
  Typechecks the desktop package and verifies the Electron runtime entrypoint can boot and exit cleanly.
- `pnpm run qa:desktop-install`
  Installs the current local package into `~/Applications`, verifies the app signature, launches the packaged runtime in QA mode, checks local database/schema readiness through the bundled web app, then shuts down without opening the operator window.
- `pnpm run package:desktop`
  Builds a local macOS package that bundles:
  the production Next.js build
  a deployed webapp runtime with its own `node_modules`
  a bundled worker entrypoint
  the Playwright Chromium binaries used by Scout audits
- `pnpm run package:desktop:release`
  Runs a release preflight before packaging. The preflight requires a Developer ID signing identity through `CSC_LINK`, `CSC_NAME`, or the macOS keychain, and one notarization credential set:
  `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`,
  `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`,
  or `APPLE_KEYCHAIN_PROFILE`. After packaging, Scout verifies the built `.app` with `codesign` and `spctl`.
- `pnpm run install:desktop`
  Packages Scout, copies `tenra Scout.app` into `/Applications`, and seeds the packaged desktop env file without opening the app.
- `pnpm run launch:desktop`
  Opens the installed app from `/Applications` without rebuilding it.
- `pnpm run dev:mobile`
  Mobile remains a readiness surface and currently prints a stable message.

Desktop stays product-primary while sharing the same runtime path as the local web app and worker. It should feel like a full operator program without introducing a second persistence model or a forked `input -> run -> report` workflow.

## Packaged Desktop Env

- The packaged app still expects a reachable local Postgres service.
- On first packaged launch, Scout now auto-creates:
  `~/Library/Application Support/tenra Scout/.env`
  with `DATABASE_URL=postgresql:///scout` as the local default.
- You can edit that file later if you need a different Postgres target or want to add `OPENAI_API_KEY`.
- Desktop startup asks the packaged web runtime to connect to Postgres and apply the bundled Scout schema before opening the window. If local Postgres is not running or the `scout` database does not exist, the desktop shell fails with the env file path and a concrete database setup hint.
- The packaged app also checks:
  `Scout.app/Contents/Resources/scout.env`
- `EVIDENCE_LOCAL_DIR` is set automatically for the packaged app to a user-data evidence folder, so screenshot storage stays outside the app bundle.
- The packaged app also auto-prunes cache-heavy interactive-search folders on startup, but preserves the core browser profile so manual provider confirmation can continue working across runs.

## macOS Release Distribution

Use `pnpm run package:desktop` for local builds and internal smoke testing. It can produce working artifacts without Apple credentials, but those artifacts are ad-hoc signed and are not suitable for public distribution.

Use `pnpm run package:desktop:release` when preparing a public macOS build. The script intentionally fails before the expensive packaging step unless Developer ID signing and notarization credentials are present. After packaging, `check:release-artifacts` verifies the app bundle signature, Developer ID authority, and Gatekeeper assessment.

See `docs/RELEASE_DISTRIBUTION.md` for the credential matrix and local-vs-release package commands.
