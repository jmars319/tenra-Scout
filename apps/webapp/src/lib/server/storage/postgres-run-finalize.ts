import type { ScoutRunReport } from "@scout/domain";

import type {
  PersistedRunRecord,
  PersistedRunRecordOptions,
  PersistenceMetadataInput
} from "./persisted-run-record.ts";

export async function buildFinalizedRecordOptions(
  report: ScoutRunReport,
  persistence: PersistenceMetadataInput,
  getRecord: (runId: string) => Promise<PersistedRunRecord | null>
): Promise<PersistedRunRecordOptions> {
  const existing = await getRecord(report.runId);

  const execution = existing
    ? {
        queuedAt: existing.execution.queuedAt,
        attemptCount: existing.execution.attemptCount,
        finishedAt: new Date().toISOString(),
        ...(existing.execution.startedAt ? { startedAt: existing.execution.startedAt } : {}),
        ...(existing.execution.heartbeatAt ? { heartbeatAt: existing.execution.heartbeatAt } : {}),
        ...(existing.execution.stage ? { stage: existing.execution.stage } : {}),
        ...(existing.execution.workerId ? { workerId: existing.execution.workerId } : {}),
        ...(existing.execution.workerNote ? { workerNote: existing.execution.workerNote } : {}),
        ...(report.errorMessage
          ? { lastErrorMessage: report.errorMessage }
          : existing.execution.lastErrorMessage
            ? { lastErrorMessage: existing.execution.lastErrorMessage }
            : {})
      }
    : undefined;

  return {
    ...(execution ? { execution } : {}),
    persistence
  };
}
