# MVP Scope

## In Scope For v1

- Single query input
- Deterministic query normalization into market intent
- 10 to 15 collected candidates
- Presence typing before heavy audit work
- Retaining non-owned presences as part of the report
- Owned-site audit of:
  homepage
  one deterministic secondary page
  desktop viewport
  mobile viewport
- Deterministic checks for:
  console errors
  failed network requests
  broken navigation
  missing primary CTA
  missing contact path
  accessibility violations via axe
  simple mobile layout issues
  obvious blocked or dead pages
  basic trust-signal weakness where the heuristic is clear
- Screenshot evidence capture
- Business classification
- Market summary and shortlist report
- Postgres-backed storage for structured run data
- Local screenshot evidence storage
- Postgres-backed queue lifecycle for local run execution
- Desktop-first local outreach pack drafting and persistence
- Operator-added and promoted candidates on completed reports
- Lower-confidence directory-snippet lead extraction

## Explicitly Out Of Scope For v1

- Deep crawling
- Login flows
- Outreach automation
- Multi-step campaign systems
- AI-generated discovery
- AI replacing deterministic checks
- Heavy admin or dashboard surfaces
- Fully self-contained local database packaging
- Mobile runtime beyond readiness verification
- Fully automated lead enrichment from directories

## Current Product Boundaries

- Search verification provider
  A seeded provider exists for deterministic verification only. Normal product runs stay live-only and fail honestly when live acquisition returns no usable candidates.
- Persistence
  Legacy local JSON runs remain import-compatible through `data/runs`, but Postgres is now the structured source of truth.
- Queueing
  The current queue is intentionally simple and Postgres-backed. There is no Redis, BullMQ, or cloud worker system in v1.
