import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSourceDesktopLocalState,
  maybeAutoCleanupInteractiveSearch
} from "./local-state.mjs";

const require = createRequire(import.meta.url);
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const repoRoot = path.resolve(desktopDir, "../..");
const desktopPackageDir = path.resolve(repoRoot, "apps/desktopapp");
const electronMainScriptPath = path.resolve(desktopPackageDir, "scripts/main.mjs");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const PROCESS_EXIT_TIMEOUT_MS = 5_000;
export const defaultDesktopDatabaseUrl = "postgresql:///scout";

export function getRepoRoot() {
  return repoRoot;
}

export function loadEnvFiles(filePaths) {
  if (typeof process.loadEnvFile !== "function") {
    return;
  }

  for (const filePath of filePaths) {
    if (existsSync(filePath)) {
      process.loadEnvFile(filePath);
    }
  }
}

export function loadWorkspaceEnv() {
  loadEnvFiles(
    [".env", ".env.local"].map((fileName) => {
      return path.resolve(repoRoot, fileName);
    })
  );
}

export function ensureDesktopDatabaseUrl(logger = console) {
  if (process.env.DATABASE_URL?.trim()) {
    return {
      databaseUrl: process.env.DATABASE_URL,
      defaulted: false
    };
  }

  process.env.DATABASE_URL = defaultDesktopDatabaseUrl;
  logger.log(`DATABASE_URL was not set. Scout desktop will use ${defaultDesktopDatabaseUrl}.`);

  return {
    databaseUrl: process.env.DATABASE_URL,
    defaulted: true
  };
}

export function createBaseEnv(baseUrl, localState) {
  return {
    ...process.env,
    NEXT_PUBLIC_APP_URL: baseUrl,
    SCOUT_RUNTIME_ROOT: repoRoot,
    SCOUT_DESKTOP_URL: baseUrl,
    SCOUT_DESKTOP_APP_NAME: "Scout by Tenra",
    SCOUT_DESKTOP_ENV_FILE: path.resolve(repoRoot, ".env"),
    SCOUT_INTERACTIVE_SEARCH: "1",
    SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR: localState.profileDir
  };
}

export function createManagedProcess(name, command, args, env, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env,
    stdio: "inherit"
  });

  const exited = new Promise((resolve) => {
    child.once("exit", (code) => {
      resolve(code ?? 0);
    });
  });

  child.once("error", (error) => {
    console.error(`[desktop:${name}] failed to start: ${error.message}`);
  });

  return {
    name,
    child,
    exited
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function stopManagedProcess(processRef) {
  if (!processRef || processRef.child.exitCode !== null) {
    await processRef?.exited;
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

export async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Failed to allocate a desktop web port."));
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

export async function waitForServerReady(baseUrl, processRef) {
  const deadline = Date.now() + 90_000;
  let lastError = "Scout desktop web surface did not respond yet.";
  const healthUrl = new URL("/api/health", baseUrl).toString();

  while (Date.now() < deadline) {
    if (processRef.child.exitCode !== null) {
      throw new Error("Scout desktop web process exited before becoming ready.");
    }

    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2_000)
      });

      if (response.ok) {
        return;
      }

      lastError = `Scout desktop web surface responded with ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown desktop readiness failure.";
    }

    await delay(500);
  }

  throw new Error(lastError);
}

export async function ensureDesktopWebReadiness(baseUrl, options = {}) {
  const readinessUrl = new URL("/api/desktop/readiness?ensure=1", baseUrl).toString();
  let payload = null;

  try {
    const response = await fetch(readinessUrl, {
      signal: AbortSignal.timeout(15_000)
    });
    payload = await response.json().catch(() => null);

    if (response.ok && payload?.ok) {
      return payload;
    }
  } catch (error) {
    payload = {
      message: error instanceof Error ? error.message : "Unknown readiness request failure."
    };
  }

  const envFileMessage = options.envFilePath
    ? `\nDesktop env file: ${options.envFilePath}`
    : "";
  const databaseUrlMessage = process.env.DATABASE_URL
    ? `\nDATABASE_URL: ${process.env.DATABASE_URL}`
    : "";
  const setupHintMessage = payload?.setupHint ? `\nSetup hint: ${payload.setupHint}` : "";

  throw new Error(
    [
      "Scout desktop could not prepare local storage.",
      payload?.message ?? "The desktop readiness endpoint did not return a usable response.",
      payload?.setupHint
        ? "Follow the setup hint below, then launch Scout again."
        : "Make sure local Postgres is running and that the `scout` database exists.",
      `${envFileMessage}${databaseUrlMessage}${setupHintMessage}`
    ]
      .filter(Boolean)
      .join("\n")
  );
}

function getElectronBinaryPath() {
  return require("electron");
}

async function installElectronBinary() {
  const electronPackageJsonPath = require.resolve("electron/package.json", {
    paths: [desktopPackageDir]
  });
  const installScriptPath = path.resolve(path.dirname(electronPackageJsonPath), "install.js");

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installScriptPath], {
      cwd: desktopPackageDir,
      env: process.env,
      stdio: "inherit"
    });

    child.once("exit", (code) => {
      if ((code ?? 1) === 0) {
        resolve();
        return;
      }

      reject(new Error(`Electron install script exited with code ${code ?? "null"}.`));
    });
    child.once("error", reject);
  });
}

export async function ensureElectronBinary() {
  try {
    return getElectronBinaryPath();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Electron install failure.";
    if (!message.includes("Electron failed to install correctly")) {
      throw error;
    }

    console.log("Electron binary is missing. Installing it now for Scout desktop...");
    await installElectronBinary();
    return getElectronBinaryPath();
  }
}

export async function launchElectron(baseUrl, extraEnv = {}) {
  const electronBinaryPath = await ensureElectronBinary();
  const electronEnv = {
    ...process.env,
    SCOUT_DESKTOP_URL: baseUrl,
    SCOUT_DESKTOP_APP_NAME: "Scout by Tenra",
    ...extraEnv
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  return createManagedProcess("electron", electronBinaryPath, [electronMainScriptPath], electronEnv);
}

export async function runDesktopShell({ webMode }) {
  loadWorkspaceEnv();
  ensureDesktopDatabaseUrl(console);

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const localState = getSourceDesktopLocalState(repoRoot);
  const cleanupResult = await maybeAutoCleanupInteractiveSearch({
    profileDir: localState.profileDir,
    cleanupStateFilePath: localState.cleanupStateFilePath,
    logger: console
  });
  const env = createBaseEnv(baseUrl, localState);

  console.log(`Starting Scout desktop against ${baseUrl}.`);
  if (!cleanupResult.skipped && cleanupResult.removedDirectories.length > 0) {
    console.log(
      `Scout desktop auto-cleaned ${cleanupResult.removedDirectories.length} interactive-search cache directories.`
    );
  }

  const webArgs =
    webMode === "start"
      ? ["--filter", "@scout/webapp", "exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(port)]
      : ["--filter", "@scout/webapp", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)];

  const webProcess = createManagedProcess("web", pnpmBin, webArgs, env);
  const workerProcess = createManagedProcess(
    "worker",
    pnpmBin,
    [
      "--filter",
      "@scout/webapp",
      "exec",
      "node",
      "--no-warnings",
      "--experimental-strip-types",
      "--experimental-specifier-resolution=node",
      "./src/scripts/worker.ts"
    ],
    env
  );

  let electronProcess = null;
  let shuttingDown = false;

  async function shutdown(code = 0) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await stopManagedProcess(electronProcess).catch(() => {});
    await stopManagedProcess(workerProcess).catch(() => {});
    await stopManagedProcess(webProcess).catch(() => {});
    process.exit(code);
  }

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    await waitForServerReady(baseUrl, webProcess);
    await ensureDesktopWebReadiness(baseUrl, {
      envFilePath: path.resolve(repoRoot, ".env")
    });
    electronProcess = await launchElectron(baseUrl);

    webProcess.child.on("exit", (code) => {
      void shutdown(code ?? 0);
    });
    workerProcess.child.on("exit", (code) => {
      void shutdown(code ?? 0);
    });
    electronProcess.child.on("exit", (code) => {
      void shutdown(code ?? 0);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown Scout desktop startup failure.");
    await shutdown(1);
  }
}
