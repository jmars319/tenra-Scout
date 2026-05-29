# tenra Scout Handoffs

tenra Scout stays unique because live acquisition, audit evidence, worker execution, and operator shortlist review are a distinct product workflow.

## Produces

- `tenra-scout.opportunity-handoff.v1` for Assembly and Proxy.
- Local outreach packs grounded in stored Scout evidence.
- Market reports and screenshot evidence paths.

## Consumes

- Proxy-shaped outreach drafts and operator briefs.
- Assembly-polished opportunity briefs when a lead or market report needs more editorial work.
- Guardrail review before any future automated outreach.

## Proxy Delivery Receipt

When a lead is sent directly to Proxy, Scout posts the `proxyShapeRequest` to the configured
shape endpoint, usually `http://localhost:5173/api/shape-external-output`. The lead handoff
history stores the direct-post receipt with the HTTP response status, Proxy validation result,
`guardrailRecommended`, trace id, endpoint, and a short shaped-output preview.

When a Proxy receipt needs review, Scout can send that exact receipt to Tenra Guardrail from
the lead handoff history. The Guardrail review includes Scout lead context, Proxy validation,
the delivery endpoint, the shaped-output preview, and a callback URL for returning the
Guardrail decision to Scout. The existing direct Guardrail send remains available for reviewing
Scout evidence without a Proxy receipt.

Scout health checks keep the delivery URL unchanged but test Proxy shape destinations through
Proxy's read-only health endpoint. A configured `/api/shape-external-output` URL is checked at
the same origin's `/api/suite-health` endpoint, so operators can verify Proxy is reachable
without sending a shape request.

Scout should not become a campaign system or generic content editor. It should identify opportunities and hand them off.
