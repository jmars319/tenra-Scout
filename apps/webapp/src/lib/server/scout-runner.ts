import {
  resolveMarketIntent,
  type ScoutQueryInput,
  type ScoutProxyHandoffReceipt,
  type ScoutRunReport
} from "@scout/domain";

import {
  createRunRepository,
  type PersistedRunRecord,
  type RecentRunSummary,
  type SavedMarketSummary
} from "./storage/run-repository.ts";

export interface ScoutHandoffHistoryInput {
  runId: string;
  candidateId: string;
  target: "assembly" | "proxy" | "guardrail";
  mode: "download" | "direct-post" | "json-fallback" | "decision-return";
  endpoint?: string | undefined;
  traceId: string;
  status: "ok" | "failed";
  message?: string | undefined;
  proxyReceipt?: ScoutProxyHandoffReceipt | undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function createRunId(input: ScoutQueryInput, createdAt: Date): string {
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${slugify(input.rawQuery) || "market"}`;
}

export async function submitScoutRun(input: ScoutQueryInput): Promise<PersistedRunRecord> {
  const createdAt = new Date();
  const runId = createRunId(input, createdAt);
  const repository = createRunRepository();
  const intent = resolveMarketIntent(input);

  return repository.createQueuedRun({
    runId,
    createdAt: createdAt.toISOString(),
    input,
    intent
  });
}

export async function getScoutRun(runId: string): Promise<ScoutRunReport | null> {
  return createRunRepository().get(runId);
}

export async function getScoutRunRecord(runId: string): Promise<PersistedRunRecord | null> {
  return createRunRepository().getRecord(runId);
}

export async function recordScoutHandoffDelivery(input: ScoutHandoffHistoryInput): Promise<PersistedRunRecord | null> {
  const repository = createRunRepository();
  const record = await repository.getRecord(input.runId);
  if (!record) {
    return null;
  }

  const exportedAt = new Date().toISOString();
  return repository.upsertRecord({
    ...record,
    updatedAt: exportedAt,
    persistence: {
      ...record.persistence,
      handoffHistory: [
        {
          exportedAt,
          candidateId: input.candidateId,
          target: input.target,
          mode: input.mode,
          ...(input.endpoint ? { endpoint: input.endpoint } : {}),
          traceId: input.traceId,
          status: input.status,
          ...(input.message ? { message: input.message } : {}),
          ...(input.proxyReceipt ? { proxyReceipt: input.proxyReceipt } : {})
        },
        ...record.persistence.handoffHistory
      ].slice(0, 100)
    }
  });
}

export async function listRecentScoutRuns(limit = 6): Promise<RecentRunSummary[]> {
  return createRunRepository().listRecent(limit);
}

export async function listSavedMarkets(limit = 12): Promise<SavedMarketSummary[]> {
  return createRunRepository().listSavedMarkets(limit);
}

export async function getPreviousCompletedScoutRunForMarket(
  rawQuery: string,
  beforeCreatedAt: string
) {
  return createRunRepository().getPreviousCompletedForMarket(rawQuery, beforeCreatedAt);
}

export async function cancelScoutRun(runId: string) {
  return createRunRepository().cancelRun(runId);
}

export async function retryScoutRun(runId: string) {
  return createRunRepository().retryRun(runId);
}

export async function cleanupStaleScoutRuns(staleRunMs: number) {
  return createRunRepository().requeueStaleRuns(staleRunMs);
}
