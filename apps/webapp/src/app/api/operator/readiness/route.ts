import { NextResponse } from "next/server";

import { buildOperatorReadinessReport } from "@/lib/server/operator/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const readiness = await buildOperatorReadinessReport({
    proxyEndpoint: url.searchParams.get("proxyEndpoint") ?? undefined,
    guardrailEndpoint: url.searchParams.get("guardrailEndpoint") ?? undefined
  });

  return NextResponse.json(readiness, {
    status: readiness.ok ? 200 : 503
  });
}
