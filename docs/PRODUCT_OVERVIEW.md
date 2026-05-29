# Product Overview

tenra Scout is a search-seeded market scanner for business web presence.

The product loop is:

`input -> market -> evidence -> classification -> opportunity`

A useful Scout run answers four things clearly:

1. Who exists in this search space?
2. What kind of presence do they have?
3. What is wrong or missing?
4. Which ones are worth acting on?

## Product Shape

Scout is intentionally narrow.

- One query
- One run
- One report

The report is the product, not a dashboard maze.

The run is now executed asynchronously:

- the web app stores a queued run
- a worker process claims it and performs the scan
- the report page reads the lifecycle state and final report from Postgres
- operators can cancel, retry, re-run, and clean up stale run state from the run page

## Deterministic Posture

- Search is provider-based.
- The live provider seam is intentionally narrow and explicit: Scout isolates provider mechanics, attempt outcomes, and fallback triggers from domain logic.
- Search acquisition uses controlled query variants, URL canonicalization, directory-snippet extraction, and explicit deduplication before presence typing.
- Presence typing happens before audit.
- Presence typing uses URL, domain, redirect, and destination-state rules to reduce false owned-site calls.
- Audits are browser-based and rule-based.
- Evidence is attached to findings through screenshots, page URLs, viewport context, severity, confidence, and reproduction notes.
- Confidence is explicit:
  confirmed for direct browser/state evidence
  probable for strong deterministic heuristics
  inferred for weaker non-owned/social interpretation

## Business Value

Scout is designed to surface opportunities such as:

- no owned website
- broken owned website
- weak conversion path
- accessibility issues
- visible browser/runtime failures

Those opportunities become a shortlist the operator can act on.

## Report Shape

The report is intended to make operator judgment faster, not broader.

- acquisition diagnostics explain how the candidate set was assembled, which provider attempts degraded, which sources supplied the kept sample, and whether fallback was involved
- repeat scans of the same saved market compare against the previous completed run, including new/missing businesses, shortlist movement, and finding deltas
- market confidence is called out in operator-facing language and backed by concrete acquisition reasons
- market summary explains the search space and the audit/skipped split
- presence breakdown keeps non-owned, dead, blocked, and unknown presences visible
- findings are normalized into stable issue types such as dead page, blocked content, missing contact path, missing primary CTA, accessibility issues, failed requests, and mobile layout issues
- shortlist entries explain why the business matters, not only what broke
- operator-added and promoted candidates are evaluated through the same presence, audit, classification, and shortlist rules while retaining their provenance labels, missed-business diagnostics, and acquisition-learning notes
- the Lead Inbox includes a single manual lead fallback; `POST /api/leads/manual` can attach an operator-entered lead to an existing completed run or create a completed manual run with explicit operator-entered provenance
- lead work is managed through both a pipeline board and a detailed inbox/detail view, with pipeline stages linking directly into matching inbox filters and a `Next Up` cue for the most urgent visible lead
- structured run retrieval and queue state are Postgres-backed, while screenshot evidence remains local
