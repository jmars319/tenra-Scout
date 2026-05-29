import { buildScoutOpportunityHandoff } from "@scout/api-contracts";
import { NextResponse } from "next/server";
import {
  getScoutRun,
  getScoutRunRecord,
  recordScoutHandoffDelivery
} from "../../../../../../lib/server/scout-runner.ts";
import { buildProxyHandoffReceipt } from "../../../../../../lib/server/handoffs/proxy-receipts.ts";
import {
  buildScoutGuardrailReviewRequest,
  findProxyReceiptForGuardrail
} from "../../../../../../lib/server/handoffs/guardrail-reviews.ts";

interface Params {
  params: Promise<{
    runId: string;
    candidateId: string;
  }>;
}

function defaultEndpoint(target: "assembly" | "proxy" | "guardrail"): string | undefined {
  if (target === "assembly") return process.env.SCOUT_ASSEMBLY_HANDOFF_URL;
  if (target === "guardrail") return process.env.SCOUT_GUARDRAIL_REVIEW_URL;
  return process.env.SCOUT_PROXY_SHAPE_URL;
}

export async function POST(request: Request, { params }: Params) {
  const { runId, candidateId } = await params;
  try {
    const body = (await request.json()) as {
      target?: "assembly" | "proxy" | "guardrail";
      endpoint?: string;
      guardrailSourceTraceId?: string;
    };
    const target = body.target === "proxy" ? "proxy" : body.target === "guardrail" ? "guardrail" : "assembly";
    const endpoint = body.endpoint || defaultEndpoint(target);
    const report = await getScoutRun(runId);

    if (!report) {
      return NextResponse.json({ errorMessage: "Scout run not found." }, { status: 404 });
    }

    const handoff = buildScoutOpportunityHandoff({ report, candidateId });
    const runRecord = target === "guardrail" ? await getScoutRunRecord(runId) : null;
    const guardrailSourceReceipt = findProxyReceiptForGuardrail(
      runRecord?.persistence.handoffHistory ?? [],
      body.guardrailSourceTraceId?.trim()
    );
    if (target === "guardrail" && body.guardrailSourceTraceId?.trim() && !guardrailSourceReceipt) {
      return NextResponse.json({ errorMessage: "Proxy receipt not found for Guardrail review." }, { status: 404 });
    }
    const traceId =
      target === "guardrail"
        ? guardrailSourceReceipt
          ? `${guardrailSourceReceipt.traceId}-guardrail-review`
          : `${handoff.proxyShapeRequest.traceId}-guardrail`
        : handoff.proxyShapeRequest.traceId;
    const payload =
      target === "proxy"
        ? handoff.proxyShapeRequest
        : target === "guardrail"
          ? buildScoutGuardrailReviewRequest({
              handoff,
              traceId,
              proxyReceipt: guardrailSourceReceipt,
              callbackUrl: new URL(
                `/api/handoffs/guardrail-decision/${encodeURIComponent(runId)}/${encodeURIComponent(candidateId)}`,
                request.url
              ).toString()
            })
          : handoff;
    const deliveryMessage =
      target === "guardrail" && guardrailSourceReceipt
        ? `Guardrail review created from Proxy receipt ${guardrailSourceReceipt.traceId}.`
        : undefined;

    if (!endpoint) {
      const record = await recordScoutHandoffDelivery({
        runId,
        candidateId,
        target,
        mode: "json-fallback",
        traceId,
        status: "ok",
        message: deliveryMessage ?? "No endpoint configured; returned JSON fallback."
      });
      return NextResponse.json({
        ok: true,
        delivered: false,
        deliveryMode: "json-fallback",
        fallback: payload,
        handoffHistory: record?.persistence.handoffHistory ?? []
      });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await response.text();
      const record = await recordScoutHandoffDelivery({
        runId,
        candidateId,
        target,
        mode: "json-fallback",
        endpoint,
        traceId,
        status: "failed",
        message
      });
      return NextResponse.json({
        ok: true,
        delivered: false,
        deliveryMode: "json-fallback",
        errorMessage: message,
        fallback: payload,
        handoffHistory: record?.persistence.handoffHistory ?? []
      });
    }

    const responseBody = (await response.json().catch(() => ({}))) as unknown;
    const directPostProxyReceipt =
      target === "proxy"
        ? buildProxyHandoffReceipt({
            endpoint,
            responseBody,
            responseStatus: response.status,
            traceId
          })
        : undefined;
    const record = await recordScoutHandoffDelivery({
      runId,
      candidateId,
      target,
      mode: "direct-post",
      endpoint,
      traceId,
      status: "ok",
      ...(deliveryMessage ? { message: deliveryMessage } : {}),
      ...(directPostProxyReceipt ? { proxyReceipt: directPostProxyReceipt } : {})
    });
    return NextResponse.json({
      ok: true,
      delivered: true,
      deliveryMode: "direct-post",
      response: responseBody,
      handoffHistory: record?.persistence.handoffHistory ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, errorMessage: error instanceof Error ? error.message : "Scout handoff delivery failed." },
      { status: 400 }
    );
  }
}
