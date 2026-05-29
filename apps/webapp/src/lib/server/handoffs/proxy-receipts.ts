import type { ScoutProxyHandoffReceipt } from "@scout/domain";

const shapeEndpointPattern = /\/api\/shape-external-output\/?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function previewText(value: unknown): string | undefined {
  const text = readString(value)?.replace(/\s+/g, " ");
  if (!text) {
    return undefined;
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function healthEndpointForProxyShapeEndpoint(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    if (!shapeEndpointPattern.test(parsed.pathname)) {
      return endpoint;
    }

    parsed.pathname = parsed.pathname.replace(shapeEndpointPattern, "/api/suite-health");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return endpoint;
  }
}

export function buildProxyHandoffReceipt({
  endpoint,
  responseBody,
  responseStatus,
  traceId
}: {
  endpoint: string;
  responseBody: unknown;
  responseStatus: number;
  traceId: string;
}): ScoutProxyHandoffReceipt {
  const response = isRecord(responseBody) ? responseBody : {};
  const result = isRecord(response.result) ? response.result : response;
  const validation = isRecord(result.validation) ? result.validation : undefined;
  const validationValid = readBoolean(validation?.valid);
  const guardrailRecommended = readBoolean(result.guardrailRecommended);
  const shapedOutputPreview = previewText(result.text);

  return {
    responseStatus,
    validationResult:
      validationValid === undefined ? "unknown" : validationValid ? "valid" : "invalid",
    ...(validationValid === undefined ? {} : { validationValid }),
    ...(guardrailRecommended === undefined ? {} : { guardrailRecommended }),
    traceId,
    endpoint,
    ...(shapedOutputPreview ? { shapedOutputPreview } : {})
  };
}
