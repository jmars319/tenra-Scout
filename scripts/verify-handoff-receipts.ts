import assert from "node:assert/strict";

import {
  buildProxyHandoffReceipt,
  healthEndpointForProxyShapeEndpoint
} from "../apps/webapp/src/lib/server/handoffs/proxy-receipts.ts";
import { describeProxyReceipt } from "../apps/webapp/src/lib/handoffs/proxy-receipt-copy.ts";
import {
  leadInboxItemSchema,
  persistenceMetadataSchema,
  scoutProxyHandoffReceiptSchema
} from "../packages/validation/src/index.ts";

const receipt = buildProxyHandoffReceipt({
  endpoint: "http://localhost:5173/api/shape-external-output",
  responseStatus: 200,
  traceId: "scout-verify-run-lead-1",
  responseBody: {
    ok: true,
    result: {
      text: "Proxy shaped the Scout opportunity into reviewed outreach grounded in the supplied evidence.",
      validation: {
        valid: true,
        warnings: [],
        violations: []
      },
      guardrailRecommended: false
    }
  }
});

assert.equal(receipt.responseStatus, 200);
assert.equal(receipt.validationResult, "valid");
assert.equal(receipt.validationValid, true);
assert.equal(receipt.guardrailRecommended, false);
assert.equal(receipt.traceId, "scout-verify-run-lead-1");
assert.equal(receipt.endpoint, "http://localhost:5173/api/shape-external-output");
assert.match(receipt.shapedOutputPreview ?? "", /^Proxy shaped the Scout opportunity/);
assert.deepEqual(describeProxyReceipt(receipt), [
  "HTTP 200",
  "Validation valid",
  "Guardrail not recommended"
]);

const entry = {
  exportedAt: "2026-05-29T12:00:00.000Z",
  candidateId: "lead-1",
  target: "proxy",
  mode: "direct-post",
  endpoint: receipt.endpoint,
  traceId: receipt.traceId,
  status: "ok",
  proxyReceipt: receipt
} as const;

scoutProxyHandoffReceiptSchema.parse(receipt);
persistenceMetadataSchema.parse({
  runStorage: "postgres",
  evidenceStorage: "local",
  importedFromLegacyLocal: false,
  handoffHistory: [entry]
});
leadInboxItemSchema.parse({
  runId: "verify-run",
  runCreatedAt: "2026-05-29T12:00:00.000Z",
  runUpdatedAt: "2026-05-29T12:00:00.000Z",
  rawQuery: "verification lead",
  marketTerm: "verification lead",
  candidateId: "lead-1",
  businessName: "Verification Lead",
  primaryUrl: "https://verification.example",
  opportunityTypes: ["repair"],
  findingCount: 1,
  highSeverityFindings: 0,
  topIssues: ["missing_primary_cta"],
  reasons: ["CTA needs review."],
  handoffHistory: [entry],
  outreach: {
    status: "no_draft",
    nextAction: "Analyze contact path."
  },
  annotation: {
    runId: "verify-run",
    candidateId: "lead-1",
    state: "needs_review",
    operatorNote: "",
    createdAt: "2026-05-29T12:00:00.000Z",
    updatedAt: "2026-05-29T12:00:00.000Z"
  }
});

assert.equal(
  healthEndpointForProxyShapeEndpoint("http://localhost:5173/api/shape-external-output"),
  "http://localhost:5173/api/suite-health"
);
assert.equal(
  healthEndpointForProxyShapeEndpoint("http://localhost:5173/api/suite-health"),
  "http://localhost:5173/api/suite-health"
);

console.log("Verified Scout Proxy handoff receipt normalization, schema persistence, and display copy.");
