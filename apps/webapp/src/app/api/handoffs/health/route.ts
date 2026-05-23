import { NextResponse } from "next/server";

type HandoffTarget = "assembly" | "proxy" | "guardrail";

const targetEnv: Record<HandoffTarget, string | undefined> = {
  assembly: process.env.SCOUT_ASSEMBLY_HANDOFF_URL,
  proxy: process.env.SCOUT_PROXY_SHAPE_URL,
  guardrail: process.env.SCOUT_GUARDRAIL_REVIEW_URL
};

async function checkEndpoint(target: HandoffTarget, endpoint?: string) {
  const url = endpoint?.trim() || targetEnv[target];
  if (!url) {
    return {
      target,
      ok: false,
      status: "not-configured",
      message: "No endpoint configured."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
    return {
      target,
      endpoint: url,
      ok: response.ok,
      status: response.status,
      message: response.statusText || (response.ok ? "OK" : "Endpoint returned an error.")
    };
  } catch (error) {
    return {
      target,
      endpoint: url,
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Endpoint health check failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<Record<HandoffTarget, string>>;
  const results = await Promise.all(
    (["assembly", "proxy", "guardrail"] as const).map((target) => checkEndpoint(target, body[target]))
  );

  return NextResponse.json({
    ok: results.every((result) => result.ok || result.status === "not-configured"),
    checkedAt: new Date().toISOString(),
    results
  });
}
