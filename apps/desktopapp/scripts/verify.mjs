import path from "node:path";
import { ensureElectronBinary } from "./lib/runtime.mjs";
import { fileURLToPath } from "node:url";

const electronBinaryPath = await ensureElectronBinary();

const { spawn } = await import("node:child_process");
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronEnv = {
  ...process.env,
  SCOUT_DESKTOP_VERIFY: "1",
  SCOUT_DESKTOP_APP_NAME: "Scout by Tenra"
};
delete electronEnv.ELECTRON_RUN_AS_NODE;

await new Promise((resolve, reject) => {
  const child = spawn(electronBinaryPath, ["./scripts/main.mjs", "--verify"], {
    cwd: desktopDir,
    env: electronEnv,
    stdio: "inherit"
  });

  child.once("exit", (code) => {
    if ((code ?? 1) === 0) {
      resolve();
      return;
    }

    reject(new Error(`Scout desktop verification exited with code ${code ?? "null"}.`));
  });
  child.once("error", reject);
});
