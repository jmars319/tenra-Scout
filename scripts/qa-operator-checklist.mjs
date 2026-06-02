import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checklistPath = path.resolve(repoRoot, "docs", "OPERATOR_QA.md");
const desktopAppPath = path.resolve(os.homedir(), "Applications", "Scout by Tenra.app");
const desktopEnvPath = path.resolve(
  os.homedir(),
  "Library",
  "Application Support",
  "Scout by Tenra",
  ".env"
);
const localDmgPath = path.resolve(repoRoot, "dist", "desktop", "tenra-scout-0.1.0-arm64.dmg");
const localZipPath = path.resolve(repoRoot, "dist", "desktop", "tenra-scout-0.1.0-arm64.zip");

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const checks = [
  ["Operator checklist", checklistPath],
  ["Local DMG", localDmgPath],
  ["Local zip", localZipPath],
  ["Installed app", desktopAppPath],
  ["Desktop env file", desktopEnvPath]
];

console.log("Scout operator QA status:");
for (const [label, targetPath] of checks) {
  console.log(`${(await exists(targetPath)) ? "OK" : "Missing"} - ${label}: ${targetPath}`);
}

console.log("");
console.log(await readFile(checklistPath, "utf8"));
