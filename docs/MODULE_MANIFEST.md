# Module Manifest

Generated from `tenra Hub/contracts/handoff-catalog.json` by `tenra Hub/scripts/generate-suite-contract-docs.mjs`.

## Standalone Mode

Runs as a complete lead discovery and opportunity review app with local lead inbox, candidate details, outreach context, and run controls.

## Repository Path

`business/acquisition/Scout by Tenra`

## Required Suite Dependencies

- None

## Optional Suite Dependencies

- tenra Assembly: Optional opportunity-to-draft handoff.
- tenra Proxy: Optional outreach shaping.
- tenra Guardrail: Optional external action review.

## Provides

- opportunity handoff
- candidate evidence
- outbound destination presets

## Consumes

- proxy shaping result
- guardrail decision

## Contracts

Emits:

- `tenra-scout.opportunity-handoff.v1`

Accepts:

- None

## Rules

- Each app must remain complete and usable without another tenra app running.
- Suite integrations are optional module links, not required runtime dependencies.
- Shared functions should be exposed through explicit local APIs, exports, imports, or schemas.
- No app may read another app's private filesystem, database, or localStorage state.
- Registry can index and audit the module graph, but it must not become a hidden runtime bus.
