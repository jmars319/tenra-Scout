import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log("Desktop is now an active Scout shell.");
console.log("dev:both delegates to dev:desktop while mobile remains a readiness surface.");

const child = spawn(pnpmBin, ["run", "dev:desktop"], {
  cwd: rootDir,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
