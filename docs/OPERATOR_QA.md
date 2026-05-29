# Scout Operator QA

Use this checklist before calling a local build beta-ready.

## Packaged Desktop

1. Run `pnpm run package:desktop`.
2. Run `pnpm run qa:desktop-install`.
3. Confirm the QA app exists at `~/Applications/tenra Scout.app`. The normal `install:desktop` path is `/Applications/tenra Scout.app`.
4. Confirm the desktop env file exists at `~/Library/Application Support/tenra Scout/.env`.
5. Confirm first launch reaches the Scout home screen without a database setup dialog.

## Scan Workflow

1. Start a new scan for a known market and city.
2. Confirm the run page shows `queued`, then `running`, then `completed`.
3. Confirm acquisition diagnostics list provider attempts, query variants, source counts, and sample quality.
4. Confirm screenshot evidence links open for audited findings.
5. Re-run the same market and confirm the saved-market comparison appears.

## Recall Check

1. Pick one known business in the target city before starting the scan.
2. After completion, search the run candidates, discarded candidates, and lead inbox for that business.
3. If Scout missed it, add it manually with the expected-reason field.
4. Confirm the report notes include `Miss diagnostic`.
5. Confirm acquisition notes include `Miss learning`.

## Lead Workflow

1. Save at least two leads from a completed report.
2. Open `/leads` and confirm the pipeline board counts match the inbox filters.
3. Open each pipeline `more` link and confirm the matching filter is selected.
4. Confirm `Next Up` points at the most urgent visible non-closed lead.
5. Analyze contact, generate a draft, mark contacted, set a follow-up, and save an operator note.
6. Confirm the detail checklist calls out triage, contact analysis, draft readiness, Proxy receipt, Guardrail request, decision return, and contacted/closed state.
7. Export CSV and Markdown from both a run-specific lead view and the global inbox, then export a single-lead pack from the lead detail view.

## Operator Readiness

1. Open Scout home and confirm the Operator Readiness panel renders.
2. Confirm Postgres/schema readiness is green before starting a scan.
3. Confirm the worker heartbeat is current when a worker or desktop app is running.
4. Confirm Provider and Outreach checks clearly show live provider versus seeded fallback and OpenAI versus local-template drafting.
5. Confirm Proxy/Guardrail are either reachable or clearly marked as unconfigured/blocked.

## Run Controls

1. Start a run and cancel it before completion.
2. Retry the failed run in place.
3. Re-run the same raw query as a fresh run.
4. Trigger stale cleanup and confirm no healthy completed runs are modified.

## Release Readiness

1. Run `pnpm run check:desktop-release-env`.
2. If it fails, confirm the output names the missing Developer ID or notarization credential.
3. Once credentials exist, run `pnpm run package:desktop:release`.
4. Confirm `check:release-artifacts` validates the built `.app` signature and Gatekeeper assessment.
