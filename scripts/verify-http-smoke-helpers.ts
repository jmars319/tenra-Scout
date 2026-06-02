import { spawn } from "node:child_process";

export const SMOKE_QUERY = {
  rawQuery: "dentists in Columbus, OH"
};
export const SUBMIT_RESPONSE_MAX_MS = 8_000;
export const RUN_TIMEOUT_MS = 240_000;
export const PROCESS_EXIT_TIMEOUT_MS = 5_000;
export const RECENT_LOG_LINES = 80;

export interface ManagedProcess {
  name: string;
  child: ReturnType<typeof spawn>;
  logs: string[];
  exited: Promise<number | null>;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function pushLog(logs: string[], line: string): void {
  if (!line) {
    return;
  }

  logs.push(line);
  if (logs.length > RECENT_LOG_LINES) {
    logs.splice(0, logs.length - RECENT_LOG_LINES);
  }
}

export function captureOutput(processRef: ManagedProcess, source: "stdout" | "stderr", chunk: Buffer): void {
  const lines = chunk
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    pushLog(processRef.logs, `[${processRef.name}:${source}] ${line}`);
  }
}

export function formatLogs(processRef: ManagedProcess | null): string {
  if (!processRef) {
    return "(process was not started)";
  }

  if (processRef.logs.length === 0) {
    return "(no output captured)";
  }

  return processRef.logs.join("\n");
}
