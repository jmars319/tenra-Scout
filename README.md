# Scout by Tenra

Scout by Tenra is a local-first market scanner for finding, auditing, and classifying business web presences. It turns a narrow market query into a queued acquisition run, deterministic website audit, evidence set, and operator-readable opportunity report.

Scout is not an SEO platform or a general crawler. The product shape is intentionally operational: define the market, run the scan, inspect evidence, and decide what outreach or follow-up is justified.

## Operational Purpose

- Identify local or vertical-market businesses with weak or missing web presence.
- Preserve enough evidence for a human operator to understand why each candidate was surfaced.
- Separate acquisition, presence typing, audit, shortlist ranking, and outreach drafting into reviewable steps.
- Keep AI assistance optional and grounded in stored Scout evidence.

## Design Posture

- Deterministic audit logic before generative assistance.
- Local desktop workflow as the primary operator surface.
- Postgres-backed run queue and repository layer for repeatable runs.
- Explicit confidence and evidence instead of opaque lead scoring.
- Thin app surfaces with shared domain, validation, privacy, and UI packages.

## Architecture

```text
apps/
  webapp/       Next.js runtime, reports, run control, and local web surface
  desktopapp/   Electron shell that runs the local web app and worker
  mobileapp/    Scaffold for later lightweight review

packages/
  domain/       Market, candidate, audit, and shortlist models
  api-contracts/ Request and response contracts
  validation/   Runtime schemas
  privacy/      Redaction and safe-display helpers
  ui/           Shared interface primitives
  config/       Product identity and environment helpers

scripts/        Bootstrap, worker, verification, and packaging flows
docs/           Repo map, developer guide, handoffs, and stability notes
```

## Current State

- The desktop app is the primary product surface.
- Search acquisition uses bounded provider adapters rather than open crawling.
- Runs are queued and stored through Postgres.
- Audits use Playwright and accessibility checks with locally stored screenshot evidence.
- Outreach packs are supported for shortlisted businesses, with deterministic local drafting and optional Ollama or OpenAI assistance.
- The mobile app is present as a future surface and is not the active product.

## Deployment Posture

Scout is currently developed as a local desktop and local web workflow. Packaged desktop builds are supported for local macOS use, with ad-hoc signing when Apple signing and notarization credentials are not present. The project is not positioned as a hosted SaaS service.

## Working Locally

```bash
pnpm run bootstrap
pnpm run db:prepare
pnpm run dev:all
pnpm run dev:desktop
pnpm run verify:all
pnpm run doctor
```

Use `pnpm run worker:start` when running the queue worker separately from the managed desktop development flow.

## Direction

- Keep acquisition narrow and explainable.
- Improve evidence quality and operator review ergonomics.
- Strengthen persistence, import, and export workflows.
- Keep AI-generated outreach clearly marked as assistance, not automated authority.

## Related Documentation

- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Product Overview](docs/PRODUCT_OVERVIEW.md)
- [Repo Map](docs/REPO_MAP.md)
- [Stability Checklist](docs/STABILITY_CHECKLIST.md)
