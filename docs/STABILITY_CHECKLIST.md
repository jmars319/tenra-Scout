# Stability Checklist

## Baseline Commands

- `pnpm run check:env`
- `pnpm run check:packages`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run db:prepare`
- `pnpm run verify:providers`
- `pnpm run verify:candidates`
- `pnpm run verify:comparison`
- `pnpm run verify:outreach`
- `pnpm run verify:persistence`
- `pnpm run verify:queue`
- `pnpm run verify:run-controls`
- `pnpm run verify:http-smoke`
- `pnpm run build:web`
- `pnpm run verify:desktop`
- `pnpm run package:desktop`
- `pnpm run qa:desktop-install`
- `pnpm run verify:mobile`
- `pnpm run qa:operator`
- `pnpm run doctor`

## Release-Only Command

- `pnpm run check:desktop-release-env`
- `pnpm run package:desktop:release`

## What They Guarantee

- `check:env`
  Confirms Scout’s current env shape is valid for the implemented v1 slice.
- `check:packages`
  Confirms the expected workspace package map is present.
- `lint`
  Catches workspace-wide code issues.
- `typecheck`
  Validates the shared packages and all three app surfaces.
- `db:prepare`
  Applies the explicit `scout_runs` schema, including queue lifecycle columns, to the configured Postgres database.
- `verify:providers`
  Confirms the live-provider seam classifies success, empty-result pages, provider degradation, parse failure, and manual-confirmation diagnostics deterministically.
- `verify:candidates`
  Confirms completed reports can accept a manual candidate, retain missed-business diagnostics as acquisition-learning notes, promote a saved discarded result, rerun candidate evaluation, rebuild summaries, and clean up verification evidence.
- `verify:comparison`
  Confirms saved-market comparison logic for new/missing businesses, shortlist rank movement, finding deltas, issue deltas, and sample metadata.
- `verify:outreach`
  Confirms Scout can persist a local outreach draft against a completed run and retrieve it back through the outreach workspace seam.
- `verify:persistence`
  Confirms Postgres connectivity, schema readiness, run write/read behavior, and recent-run retrieval.
- `verify:queue`
  Confirms queued run creation, worker claim behavior, lifecycle transitions, and failure-note persistence.
- `verify:run-controls`
  Confirms submitted run records can be canceled, retried in place, re-queued after a stale worker, and rerun as a fresh queued run.
- `verify:http-smoke`
  Confirms the real HTTP submit and retrieval path: the web server returns a queued response promptly, a worker picks the run up, lifecycle state moves through `queued -> running -> completed`, the final persisted report is retrievable from the real API, lead inbox/detail/export flows render over HTTP, and run cancel/retry/re-run controls work through the API.
- `verify:ui-smoke`
  Alias for `verify:http-smoke`, used when validating the browser-facing flow names rather than the lower-level HTTP lifecycle name.
- `build:web`
  Confirms the active Next.js app builds successfully.
- `verify:desktop`
  Confirms the desktop package typechecks, validates the Electron Builder package settings, and verifies Electron can launch Scout's desktop runtime entrypoint.
- `check:desktop-package`
  Performs a fast, non-credential package-readiness check for the desktop bundle config, hardened runtime setting, required runtime resources, packaged schema readiness, and packaging entrypoints.
- `package:desktop`
  Confirms Scout can build a local macOS desktop package with a bundled production web runtime, bundled worker entrypoint, and bundled Chromium assets.
- `qa:desktop-install`
  Confirms the latest local package can be installed into `~/Applications` for QA, has a valid local signature, can start its packaged web runtime and worker, can reach/apply the local database schema, and can shut down cleanly without opening the operator window.
- `check:desktop-release-env`
  Confirms Developer ID signing and Apple notarization credentials are present before the release package build is attempted. This command is expected to fail on local-only machines.
- `package:desktop:release`
  Confirms the release environment has Developer ID signing and Apple notarization credentials before building, then validates the built `.app` with `codesign` and Gatekeeper assessment. This command is expected to fail on machines that are only configured for local ad-hoc packages.
- `verify:mobile`
  Confirms the remaining mobile scaffold does not break workspace integrity.
- `qa:operator`
  Prints the manual operator QA checklist and reports whether local desktop artifacts, the installed app, and the desktop env file are present.
- `doctor`
  Prints Node version, checks env and package map, confirms Playwright CLI availability in the web app, and points operators to the runtime readiness endpoint.

## Practical Smoke Coverage

The repo has been exercised with:

- a Postgres round-trip verification run
- a bulk import of one legacy local JSON run into Postgres
- an existing live end-to-end run with screenshots still present in root `data/evidence`

That coverage verifies schema bootstrap, repository persistence, legacy-import handling, screenshot storage, and report retrieval path.
That coverage also verifies the Postgres-backed queue loop and repository-driven lifecycle updates.
`verify:http-smoke` adds a real HTTP boundary check without introducing a larger end-to-end framework. It now covers run submission, report retrieval, lead save, bulk lead update, lead inbox, lead detail, run pages, lead export, lead-pack export, operator readiness, and run control actions.
`verify:providers` adds direct protection for the hardened DuckDuckGo, Google, and Bing adapters plus manual-confirmation diagnostics without introducing a heavier test harness.

## Expected Limitations

- Live search stability still depends on upstream HTML providers.
- Run execution depends on a separate local worker process being started.
- The queue is intentionally simple and Postgres-backed, not a distributed job system.
- The desktop app is the primary operator program. It packages the local web app and worker instead of maintaining a second independent runtime architecture.
- The packaged desktop build now seeds/defaults `DATABASE_URL=postgresql:///scout` and applies the bundled schema on startup, but it still expects a local Postgres service and database to be available. It is not yet an embedded single-file database runtime.
- Screenshot evidence is still local-only.
