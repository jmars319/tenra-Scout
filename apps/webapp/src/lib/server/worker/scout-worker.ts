import os from "node:os";

import type { ScoutRunReport } from "@scout/domain";

import { buildFailedReport } from "../report/failed-report.ts";
import { normalizePersistedIntent } from "../storage/persisted-run-record.ts";
import { createRunRepository, type RunRepository } from "../storage/run-repository.ts";
import type { PersistedRunRecord } from "../storage/persisted-run-record.ts";
import { recordScoutWorkerHeartbeat } from "../storage/worker-heartbeats.ts";
import { executeScoutRunRecord } from "./scout-executor.ts";

type WorkerExecutionResult = "idle" | "completed" | "failed";
const RUN_HEARTBEAT_MS = 8_000;

export interface ProcessNextQueuedRunInput {
  workerId: string;
  repository?: RunRepository;
  executeRun?: (
    record: Pick<PersistedRunRecord, "runId" | "createdAt" | "input" | "intent">,
    onProgress?: (update: {
      stage: PersistedRunRecord["execution"]["stage"];
      workerNote: string;
    }) => Promise<void>
  ) => Promise<ScoutRunReport>;
}

export interface ScoutWorkerOptions {
  workerId?: string;
  pollMs: number;
  staleRunMs: number;
  once?: boolean;
  repository?: RunRepository;
  executeRun?: (
    record: Pick<PersistedRunRecord, "runId" | "createdAt" | "input" | "intent">,
    onProgress?: (update: {
      stage: PersistedRunRecord["execution"]["stage"];
      workerNote: string;
    }) => Promise<void>
  ) => Promise<ScoutRunReport>;
}

function defaultWorkerId(): string {
  return `${os.hostname()}-${process.pid}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function processNextQueuedRun(
  input: ProcessNextQueuedRunInput
): Promise<{ outcome: WorkerExecutionResult; runId?: string }> {
  const repository = input.repository ?? createRunRepository();
  const executeRun = input.executeRun ?? executeScoutRunRecord;
  const claimed = await repository.claimNextQueuedRun(input.workerId);

  if (!claimed) {
    return { outcome: "idle" };
  }

  try {
    let currentProgress: {
      stage?: PersistedRunRecord["execution"]["stage"];
      workerNote?: string;
    } = {
      ...(claimed.execution.stage ? { stage: claimed.execution.stage } : {}),
      ...(claimed.execution.workerNote ? { workerNote: claimed.execution.workerNote } : {})
    };
    const heartbeatId = setInterval(() => {
      void repository.updateProgress(claimed.runId, currentProgress);
    }, RUN_HEARTBEAT_MS);
    try {
      const report = await executeRun(claimed, async (update) => {
        currentProgress = {
          stage: update.stage,
          workerNote: update.workerNote
        };
        await repository.updateProgress(claimed.runId, currentProgress);
      });
      await repository.save(report);
      return {
        outcome: report.status === "failed" ? "failed" : "completed",
        runId: claimed.runId
      };
    } finally {
      clearInterval(heartbeatId);
    }
  } catch (error) {
    const failure = buildFailedReport({
      runId: claimed.runId,
      query: claimed.input,
      intent: normalizePersistedIntent(claimed.intent),
      errorMessage: error instanceof Error ? error.message : "Unknown Scout worker failure.",
      createdAt: new Date(claimed.createdAt)
    });

    await repository.save(failure);
    return { outcome: "failed", runId: claimed.runId };
  }
}

export async function startScoutWorker(options: ScoutWorkerOptions): Promise<void> {
  const repository = options.repository ?? createRunRepository();
  const workerId = options.workerId ?? defaultWorkerId();
  const pollMs = Math.max(options.pollMs, 250);
  const staleRunMs = Math.max(options.staleRunMs, pollMs);
  let stopped = false;

  const stop = () => {
    stopped = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    await recordScoutWorkerHeartbeat(workerId, "Scout worker started and is polling the queue.");
    while (!stopped) {
      await recordScoutWorkerHeartbeat(workerId, "Scout worker is polling the queue.");
      await repository.requeueStaleRuns(staleRunMs);
      const result = await processNextQueuedRun({
        workerId,
        repository,
        ...(options.executeRun ? { executeRun: options.executeRun } : {})
      });

      if (result.outcome !== "idle") {
        await recordScoutWorkerHeartbeat(
          workerId,
          `Scout worker ${result.outcome} run ${result.runId ?? "unknown"}.`
        );
      }

      if (options.once) {
        return;
      }

      await delay(result.outcome === "idle" ? pollMs : 250);
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
