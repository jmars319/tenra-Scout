import type { ScoutProxyHandoffReceipt } from "@scout/domain";

export function describeProxyReceipt(receipt: ScoutProxyHandoffReceipt): string[] {
  return [
    `HTTP ${receipt.responseStatus}`,
    `Validation ${receipt.validationResult}`,
    receipt.guardrailRecommended === undefined
      ? "Guardrail unknown"
      : receipt.guardrailRecommended
        ? "Guardrail recommended"
        : "Guardrail not recommended"
  ];
}
