import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args) {
  const result = spawnSync(pnpmBin, args, {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Node ${process.version}`);
run(["run", "check:env"]);
run(["run", "check:packages"]);
run(["--filter", "@scout/webapp", "exec", "playwright", "--version"]);

console.log("");
console.log("Scout operator readiness:");
console.log("- Run `pnpm run db:prepare` when Postgres/schema readiness is blocked.");
console.log("- Start the worker with `pnpm run worker:start` or launch the desktop app for automatic worker lifecycle.");
console.log("- Open `/api/operator/readiness` while the web app is running to inspect Postgres, worker heartbeat, provider posture, outreach, handoff endpoints, and evidence storage.");
