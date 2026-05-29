import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getOutreachConfig,
  getSearchProviderName,
  getWorkerConfig
} from "@scout/config";

import { healthEndpointForProxyShapeEndpoint } from "../handoffs/proxy-receipts.ts";
import { getPostgresClient } from "../storage/postgres-client.ts";
import { checkDatabaseReadiness } from "../storage/schema-readiness.ts";
import { getEvidenceBaseDir } from "../storage/evidence-storage.ts";
import { getLatestScoutWorkerHeartbeat } from "../storage/worker-heartbeats.ts";

export type OperatorReadinessStatus = "ready" | "warn" | "blocked";

export interface OperatorReadinessCheck {
  id: string;
  label: string;
  status: OperatorReadinessStatus;
  message: string;
  evidence?: Record<string, string | number | boolean | null> | undefined;
}

export interface OperatorReadinessReport {
  ok: boolean;
  checkedAt: string;
  checks: OperatorReadinessCheck[];
}

function worseStatus(left: OperatorReadinessStatus, right: OperatorReadinessStatus) {
  if (left === "blocked" || right === "blocked") {
    return "blocked";
  }

  if (left === "warn" || right === "warn") {
    return "warn";
  }

  return "ready";
}

async function runQueueStats() {
  const sql = getPostgresClient();
  const [row] = await sql<
    Array<{
      queued_count: number;
      running_count: number;
      stale_running_count: number;
      latest_running_heartbeat_at: string | Date | null;
    }>
  >`
    select
      count(*) filter (where status = 'queued')::int as queued_count,
      count(*) filter (where status = 'running')::int as running_count,
      count(*) filter (
        where status = 'running'
          and coalesce(heartbeat_at, started_at) < now() - interval '2 minutes'
      )::int as stale_running_count,
      max(heartbeat_at) filter (where status = 'running') as latest_running_heartbeat_at
    from scout_runs
  `;

  return {
    queuedCount: Number(row?.queued_count ?? 0),
    runningCount: Number(row?.running_count ?? 0),
    staleRunningCount: Number(row?.stale_running_count ?? 0),
    latestRunningHeartbeatAt: row?.latest_running_heartbeat_at
      ? new Date(row.latest_running_heartbeat_at).toISOString()
      : null
  };
}

async function checkWorkerReadiness(): Promise<OperatorReadinessCheck> {
  try {
    const [stats, heartbeat] = await Promise.all([
      runQueueStats(),
      getLatestScoutWorkerHeartbeat()
    ]);
    const workerConfig = getWorkerConfig();
    const staleAfterMs = Math.max(workerConfig.pollMs * 4, 30_000);
    const heartbeatAgeMs = heartbeat
      ? Date.now() - Date.parse(heartbeat.heartbeatAt)
      : Number.POSITIVE_INFINITY;

    if (stats.staleRunningCount > 0) {
      return {
        id: "worker",
        label: "Worker",
        status: "blocked",
        message: "A running Scout job has a stale heartbeat. Requeue stale runs or restart the worker.",
        evidence: {
          queued: stats.queuedCount,
          running: stats.runningCount,
          staleRunning: stats.staleRunningCount,
          latestRunningHeartbeatAt: stats.latestRunningHeartbeatAt
        }
      };
    }

    if (heartbeat && heartbeatAgeMs <= staleAfterMs) {
      return {
        id: "worker",
        label: "Worker",
        status: "ready",
        message: "Scout worker heartbeat is current.",
        evidence: {
          workerId: heartbeat.workerId,
          heartbeatAt: heartbeat.heartbeatAt,
          queued: stats.queuedCount,
          running: stats.runningCount
        }
      };
    }

    return {
      id: "worker",
      label: "Worker",
      status: stats.queuedCount > 0 ? "blocked" : "warn",
      message:
        stats.queuedCount > 0
          ? "Queued work exists, but no current worker heartbeat was found."
          : "No current worker heartbeat was found. This is acceptable only when no queued work is waiting.",
      evidence: {
        queued: stats.queuedCount,
        running: stats.runningCount,
        heartbeatAt: heartbeat?.heartbeatAt ?? null
      }
    };
  } catch (error) {
    return {
      id: "worker",
      label: "Worker",
      status: "blocked",
      message: error instanceof Error ? error.message : "Scout worker readiness could not be checked."
    };
  }
}

function checkProviderReadiness(): OperatorReadinessCheck {
  try {
    const provider = getSearchProviderName();

    return {
      id: "provider",
      label: "Live acquisition",
      status: provider === "seeded_stub" ? "warn" : "ready",
      message:
        provider === "seeded_stub"
          ? "Seeded provider is active. Live acquisition is intentionally unavailable."
          : `Search provider ${provider} is configured for live acquisition.`,
      evidence: { provider }
    };
  } catch (error) {
    return {
      id: "provider",
      label: "Live acquisition",
      status: "blocked",
      message: error instanceof Error ? error.message : "Search provider configuration is invalid."
    };
  }
}

function checkOutreachReadiness(): OperatorReadinessCheck {
  const outreach = getOutreachConfig();

  if (outreach.provider === "openai" && outreach.enabled) {
    return {
      id: "outreach",
      label: "OpenAI outreach",
      status: "ready",
      message: "OpenAI outreach drafting is available.",
      evidence: {
        provider: outreach.provider,
        model: outreach.model
      }
    };
  }

  return {
    id: "outreach",
    label: "OpenAI outreach",
    status: outreach.provider === "disabled" ? "blocked" : "warn",
    message:
      outreach.provider === "disabled"
        ? "Outreach drafting is disabled."
        : `OpenAI outreach is not configured; Scout will use ${outreach.provider} drafting.`,
    evidence: {
      provider: outreach.provider,
      model: outreach.model,
      enabled: outreach.enabled
    }
  };
}

async function checkEvidenceReadiness(): Promise<OperatorReadinessCheck> {
  const baseDir = getEvidenceBaseDir();
  const probePath = path.join(baseDir, `.scout-readiness-${process.pid}.tmp`);

  try {
    await mkdir(baseDir, { recursive: true });
    await writeFile(probePath, "ok");
    await unlink(probePath);

    return {
      id: "evidence",
      label: "Evidence directory",
      status: "ready",
      message: "Evidence directory is writable.",
      evidence: { path: baseDir }
    };
  } catch (error) {
    return {
      id: "evidence",
      label: "Evidence directory",
      status: "blocked",
      message: error instanceof Error ? error.message : "Evidence directory is not writable.",
      evidence: { path: baseDir }
    };
  }
}

async function checkEndpoint(
  id: "proxy" | "guardrail",
  label: string,
  endpoint: string | undefined
): Promise<OperatorReadinessCheck> {
  const url = endpoint?.trim();

  if (!url) {
    return {
      id,
      label,
      status: "warn",
      message: "Endpoint is not configured."
    };
  }

  const healthEndpoint = id === "proxy" ? healthEndpointForProxyShapeEndpoint(url) : url;

  try {
    const response = await fetch(healthEndpoint, {
      method: "GET",
      signal: AbortSignal.timeout(3500)
    });

    return {
      id,
      label,
      status: response.ok ? "ready" : "blocked",
      message: response.ok ? "Endpoint responded successfully." : `Endpoint returned ${response.status}.`,
      evidence: {
        endpoint: url,
        healthEndpoint,
        status: response.status
      }
    };
  } catch (error) {
    return {
      id,
      label,
      status: "blocked",
      message: error instanceof Error ? error.message : "Endpoint health check failed.",
      evidence: {
        endpoint: url,
        healthEndpoint
      }
    };
  }
}

export async function buildOperatorReadinessReport(input: {
  proxyEndpoint?: string | undefined;
  guardrailEndpoint?: string | undefined;
} = {}): Promise<OperatorReadinessReport> {
  const database = await checkDatabaseReadiness();
  const checks: OperatorReadinessCheck[] = [
    {
      id: "database",
      label: "Postgres",
      status: database.ok ? "ready" : database.schemaReady ? "warn" : "blocked",
      message: database.message,
      evidence: {
        schemaReady: database.schemaReady,
        schemaPath: database.schemaPath ?? null
      }
    }
  ];

  checks.push(
    await checkWorkerReadiness(),
    checkProviderReadiness(),
    checkOutreachReadiness(),
    await checkEndpoint("proxy", "Proxy", input.proxyEndpoint ?? process.env.SCOUT_PROXY_SHAPE_URL),
    await checkEndpoint("guardrail", "Guardrail", input.guardrailEndpoint ?? process.env.SCOUT_GUARDRAIL_REVIEW_URL),
    await checkEvidenceReadiness()
  );

  const aggregate = checks.reduce<OperatorReadinessStatus>(
    (current, check) => worseStatus(current, check.status),
    "ready"
  );

  return {
    ok: aggregate !== "blocked",
    checkedAt: new Date().toISOString(),
    checks
  };
}
