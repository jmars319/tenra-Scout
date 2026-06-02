import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import {
  createScoutRunResponseSchema,
  getScoutRunResponseSchema,
  leadAnnotationResponseSchema,
  leadInboxBulkActionResponseSchema,
  listLeadInboxResponseSchema,
  runControlActionResponseSchema,
  type CreateScoutRunResponse,
  type GetScoutRunResponse
} from "../packages/api-contracts/src/index.ts";
import { getEvidenceStorageConfig } from "../packages/config/src/index.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { loadWorkspaceEnv, getRepoRoot } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";
import {
  captureOutput,
  delay,
  formatLogs,
  ManagedProcess,
  PROCESS_EXIT_TIMEOUT_MS,
  pushLog,
  RUN_TIMEOUT_MS,
  SMOKE_QUERY,
  SUBMIT_RESPONSE_MAX_MS
} from "./verify-http-smoke-helpers.ts";

loadWorkspaceEnv();

function startManagedProcess(
  name: string,
  args: string[],
  env: Record<string, string>
): ManagedProcess {
  const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpmBin, args, {
    cwd: getRepoRoot(),
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs: string[] = [];
  const processRef: ManagedProcess = {
    name,
    child,
    logs,
    exited: new Promise((resolve) => {
      child.once("exit", (code) => {
        pushLog(logs, `[${name}:process] exited with code ${code ?? "null"}`);
        resolve(code);
      });
    })
  };

  child.once("error", (error) => {
    pushLog(logs, `[${name}:process] failed to start: ${error.message}`);
  });
  child.stdout?.on("data", (chunk: Buffer) => captureOutput(processRef, "stdout", chunk));
  child.stderr?.on("data", (chunk: Buffer) => captureOutput(processRef, "stderr", chunk));

  return processRef;
}

async function stopManagedProcessInner(processRef: ManagedProcess): Promise<void> {
  if (processRef.child.exitCode !== null) {
    await processRef.exited;
    return;
  }

  processRef.child.kill("SIGTERM");
  const exited = await Promise.race([
    processRef.exited.then(() => true),
    delay(PROCESS_EXIT_TIMEOUT_MS).then(() => false)
  ]);

  if (exited) {
    return;
  }

  processRef.child.kill("SIGKILL");
  await processRef.exited;
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Failed to allocate a port for the HTTP smoke verifier."));
        });
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  parse: (input: unknown) => T
): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000)
  });
  const payload: unknown = await response.json();

  return {
    status: response.status,
    body: parse(payload)
  };
}

function parseCreateScoutRunResponse(value: unknown): CreateScoutRunResponse {
  return createScoutRunResponseSchema.parse(value);
}

function parseGetScoutRunResponse(value: unknown): GetScoutRunResponse {
  return getScoutRunResponseSchema.parse(value);
}

function chooseLeadCandidate(report: NonNullable<GetScoutRunResponse["report"]>): string {
  return (
    report.shortlist[0]?.candidateId ??
    report.businessBreakdowns[0]?.candidateId ??
    report.candidates[0]?.candidateId ??
    ""
  );
}

async function verifyLeadUiFlow(baseUrl: string, runId: string, report: NonNullable<GetScoutRunResponse["report"]>) {
  const candidateId = chooseLeadCandidate(report);

  if (!candidateId) {
    throw new Error("HTTP smoke report did not include any candidate to use for the lead UI flow.");
  }

  const savedLead = await fetchJson(
    `${baseUrl}/api/runs/${runId}/leads/${candidateId}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        state: "saved",
        operatorNote: "HTTP smoke saved this lead from the UI flow.",
        followUpDate: "2026-05-10"
      })
    },
    (value) => leadAnnotationResponseSchema.parse(value)
  );
  assert.equal(savedLead.status, 200);
  assert.equal(savedLead.body.annotation?.state, "saved");

  const inbox = await fetchJson(
    `${baseUrl}/api/leads?filter=saved`,
    {
      method: "GET"
    },
    (value) => listLeadInboxResponseSchema.parse(value)
  );
  assert.equal(inbox.status, 200);
  assert(inbox.body.items.some((item) => item.runId === runId && item.candidateId === candidateId));

  const bulk = await fetchJson(
    `${baseUrl}/api/leads/bulk-actions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        items: [
          {
            runId,
            candidateId
          }
        ],
        action: {
          action: "mark_contacted"
        }
      })
    },
    (value) => leadInboxBulkActionResponseSchema.parse(value)
  );
  assert.equal(bulk.status, 200);
  assert.equal(bulk.body.items[0]?.annotation.state, "contacted");

  for (const pathName of [
    "/",
    "/runs",
    "/leads",
    `/runs/${runId}`,
    `/leads/${runId}/${candidateId}`
  ]) {
    const response = await fetch(`${baseUrl}${pathName}`, {
      signal: AbortSignal.timeout(10_000)
    });
    assert.equal(response.status, 200, `${pathName} should render over HTTP.`);
  }

  const exportResponse = await fetch(`${baseUrl}/api/leads/export?format=markdown`, {
    signal: AbortSignal.timeout(10_000)
  });
  assert.equal(exportResponse.status, 200);
  assert.match(await exportResponse.text(), /# Scout Lead Inbox/);

  const packResponse = await fetch(
    `${baseUrl}/api/runs/${runId}/leads/${candidateId}/export?format=markdown`,
    {
      signal: AbortSignal.timeout(10_000)
    }
  );
  assert.equal(packResponse.status, 200);
  assert.match(await packResponse.text(), /# Scout Lead Pack/);

  const readinessResponse = await fetch(`${baseUrl}/api/operator/readiness`, {
    signal: AbortSignal.timeout(10_000)
  });
  assert([200, 503].includes(readinessResponse.status));
  const readiness = (await readinessResponse.json()) as {
    checks?: Array<{ id: string }>;
  };
  assert(readiness.checks?.some((check) => check.id === "database"));
}

async function verifyRunControls(baseUrl: string): Promise<string[]> {
  const submitted = await fetchJson<CreateScoutRunResponse>(
    `${baseUrl}/api/scout/run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        rawQuery: "run controls smoke market"
      })
    },
    parseCreateScoutRunResponse
  );
  assert.equal(submitted.status, 202);
  assert.equal(submitted.body.status, "queued");

  const runId = submitted.body.runId;
  const cancel = await fetchJson(
    `${baseUrl}/api/runs/${runId}/actions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ action: "cancel" })
    },
    (value) => runControlActionResponseSchema.parse(value)
  );
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.status, "failed");

  const retry = await fetchJson(
    `${baseUrl}/api/runs/${runId}/actions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ action: "retry" })
    },
    (value) => runControlActionResponseSchema.parse(value)
  );
  assert.equal(retry.status, 200);
  assert.equal(retry.body.status, "queued");

  const cleanup = await fetchJson(
    `${baseUrl}/api/runs/${runId}/actions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ action: "cleanup_stale" })
    },
    (value) => runControlActionResponseSchema.parse(value)
  );
  assert.equal(cleanup.status, 200);
  assert.equal(cleanup.body.status, "queued");
  assert.equal(typeof cleanup.body.requeuedCount, "number");

  const rerun = await fetchJson(
    `${baseUrl}/api/runs/${runId}/actions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ action: "rerun" })
    },
    (value) => runControlActionResponseSchema.parse(value)
  );
  assert.equal(rerun.status, 202);
  assert(rerun.body.newRunId);

  return rerun.body.newRunId ? [runId, rerun.body.newRunId] : [runId];
}

async function waitForServerReady(baseUrl: string, processRef: ManagedProcess): Promise<void> {
  const deadline = Date.now() + 90_000;
  let lastError = "Scout web server did not respond yet.";

  while (Date.now() < deadline) {
    if (processRef.child.exitCode !== null) {
      throw new Error("Scout web server exited before becoming ready.");
    }

    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(2_000)
      });

      if (response.ok) {
        return;
      }

      lastError = `Scout web server responded with ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown server readiness failure.";
    }

    await delay(500);
  }

  throw new Error(lastError);
}

async function warmRoutes(baseUrl: string): Promise<void> {
  const warmGet: { status: number; body: GetScoutRunResponse } = await fetchJson<GetScoutRunResponse>(
    `${baseUrl}/api/runs/http-smoke-probe`,
    {
      method: "GET"
    },
    parseGetScoutRunResponse
  );
  assert.equal(warmGet.status, 404);
  assert.equal(warmGet.body.status, "not_found");

  const warmPost = await fetch(`${baseUrl}/api/scout/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10_000)
  });
  assert.equal(warmPost.status, 400);
}

async function removeSmokeArtifacts(runIds: string[], processEnv: Record<string, string>): Promise<void> {
  const uniqueRunIds = [...new Set(runIds.filter(Boolean))];

  if (uniqueRunIds.length === 0) {
    return;
  }

  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = any(${sql.array(uniqueRunIds)})`;

  const evidenceConfig = getEvidenceStorageConfig(processEnv);
  await Promise.all(
    uniqueRunIds.map((runId) =>
      rm(path.resolve(getRepoRoot(), evidenceConfig.localDir, runId), {
        recursive: true,
        force: true
      })
    )
  );
}

function createProcessEnv(baseUrl: string): Record<string, string> {
  return {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    NEXT_PUBLIC_APP_URL: baseUrl,
    SCOUT_SEARCH_PROVIDER: "seeded_stub",
    SCOUT_MIN_CANDIDATES: "3",
    SCOUT_MAX_CANDIDATES: "4",
    SCOUT_WORKER_POLL_MS: "500",
    SCOUT_WORKER_STALE_RUN_MS: "60000",
    EVIDENCE_STORAGE_DRIVER: "local",
    EVIDENCE_LOCAL_DIR: process.env.EVIDENCE_LOCAL_DIR ?? "./data/evidence",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1"
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for verify:http-smoke.");
  }

  await applyScoutSchema();

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const processEnv = createProcessEnv(baseUrl);
  let runId: string | null = null;
  const runIdsToRemove: string[] = [];
  let lastObservedStatus = "not_submitted";
  let webProcess: ManagedProcess | null = null;
  let workerProcess: ManagedProcess | null = null;
  const observedStatuses = new Set<string>();

  try {
    console.log(`Starting Scout web smoke server on ${baseUrl}.`);
    webProcess = startManagedProcess(
      "web",
      ["--filter", "@scout/webapp", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      processEnv
    );

    await waitForServerReady(baseUrl, webProcess);
    await warmRoutes(baseUrl);

    const submitStartedAt = Date.now();
    const submitted: { status: number; body: CreateScoutRunResponse } =
      await fetchJson<CreateScoutRunResponse>(
      `${baseUrl}/api/scout/run`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(SMOKE_QUERY)
      },
      parseCreateScoutRunResponse
    );
    const submitDurationMs = Date.now() - submitStartedAt;

    assert.equal(submitted.status, 202);
    assert.equal(submitted.body.status, "queued");
    assert.ok(
      submitDurationMs <= SUBMIT_RESPONSE_MAX_MS,
      `Run submission took ${submitDurationMs}ms, which exceeds the ${SUBMIT_RESPONSE_MAX_MS}ms smoke threshold.`
    );
    runId = submitted.body.runId;
    runIdsToRemove.push(runId);
    observedStatuses.add(submitted.body.status);
    lastObservedStatus = submitted.body.status;

    const queued: { status: number; body: GetScoutRunResponse } = await fetchJson<GetScoutRunResponse>(
      `${baseUrl}/api/runs/${runId}`,
      {
        method: "GET"
      },
      parseGetScoutRunResponse
    );

    assert.equal(queued.status, 200);
    assert.equal(queued.body.runId, runId);
    assert.equal(queued.body.status, "queued");
    assert.equal(queued.body.report, undefined);

    console.log(`Queued Scout run ${runId} in ${submitDurationMs}ms. Starting one-shot worker.`);
    workerProcess = startManagedProcess(
      "worker",
      [
        "--filter",
        "@scout/webapp",
        "exec",
        "node",
        "--no-warnings",
        "--experimental-strip-types",
        "--experimental-specifier-resolution=node",
        "./src/scripts/worker.ts",
        "--once"
      ],
      processEnv
    );

    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let finalResponse: GetScoutRunResponse | null = null;
    let sawRunning = false;

    while (Date.now() < deadline) {
      if (webProcess.child.exitCode !== null) {
        throw new Error("Scout web process exited during the HTTP smoke run.");
      }

      const polled: { status: number; body: GetScoutRunResponse } =
        await fetchJson<GetScoutRunResponse>(
        `${baseUrl}/api/runs/${runId}`,
        {
          method: "GET"
        },
        parseGetScoutRunResponse
      );
      assert.equal(polled.status, 200);

      lastObservedStatus = polled.body.status;
      observedStatuses.add(polled.body.status);

      if (polled.body.status === "running") {
        sawRunning = true;
      }

      if (polled.body.status === "completed" || polled.body.status === "failed") {
        finalResponse = polled.body;
        break;
      }

      await delay(1_000);
    }

    if (!finalResponse) {
      throw new Error(
        `Timed out after ${RUN_TIMEOUT_MS}ms waiting for Scout run ${runId}. Last observed status: ${lastObservedStatus}.`
      );
    }

    const report = finalResponse.report;
    if (!report) {
      throw new Error(
        `Scout run ${runId} reached ${finalResponse.status} but no report payload was retrievable over HTTP.`
      );
    }

    if (finalResponse.status === "failed") {
      throw new Error(
        `Scout run ${runId} failed over the HTTP smoke path: ${
          finalResponse.errorMessage ?? report.errorMessage ?? "Unknown Scout run failure."
        }`
      );
    }

    if (!sawRunning) {
      throw new Error(
        `Scout run ${runId} never entered running. Observed statuses: ${[...observedStatuses].join(" -> ")}.`
      );
    }

    assert.equal(report.runId, runId);
    assert.equal(report.status, "completed");
    assert.equal(report.query.rawQuery, SMOKE_QUERY.rawQuery);
    assert.ok(report.intent.marketTerm.length > 0);
    assert.equal(report.acquisition.provider, "seeded_stub");
    assert.equal(report.searchSource, "seeded_stub");
    assert.ok(report.candidates.length >= 1);
    assert.equal(report.summary.totalCandidates, report.presences.length);
    assert.ok(Array.isArray(report.businessBreakdowns));
    assert.ok(Array.isArray(report.shortlist));
    assert.ok(Array.isArray(report.notes));

    await verifyLeadUiFlow(baseUrl, runId, report);
    runIdsToRemove.push(...(await verifyRunControls(baseUrl)));

    console.log(
      `HTTP smoke verification passed for ${runId}. Observed statuses: ${[...observedStatuses].join(" -> ")}.`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Scout HTTP smoke verification failure.";

    console.error(message);
    console.error(`Last observed status: ${lastObservedStatus}`);
    if (runId) {
      console.error(`Run id: ${runId}`);
    }

    console.error("\nRecent web output:");
    console.error(formatLogs(webProcess));
    console.error("\nRecent worker output:");
    console.error(formatLogs(workerProcess));

    process.exitCode = 1;
  } finally {
    await stopManagedProcessIfNeeded(workerProcess).catch(() => {});
    await stopManagedProcessIfNeeded(webProcess).catch(() => {});
    await removeSmokeArtifacts(runIdsToRemove, processEnv).catch(() => {});
    await closeScoutSchemaClient();
  }
}

async function stopManagedProcessIfNeeded(processRef: ManagedProcess | null): Promise<void> {
  if (!processRef) {
    return;
  }

  await stopManagedProcessInner(processRef);
}

await main().catch(async (error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown Scout HTTP smoke verification failure."
  );
  await closeScoutSchemaClient().catch(() => {});
  process.exit(1);
});
