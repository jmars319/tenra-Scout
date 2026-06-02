import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(desktopDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const buildConfig = packageJson.build ?? {};
const macConfig = buildConfig.mac ?? {};
const runtimeScript = readFileSync(path.join(desktopDir, "scripts/lib/runtime.mjs"), "utf8");
const launcherScript = readFileSync(path.join(desktopDir, "scripts/lib/launcher.mjs"), "utf8");
const prepareRuntimeScript = readFileSync(path.join(desktopDir, "scripts/prepare-runtime.mjs"), "utf8");
const mainScript = readFileSync(path.join(desktopDir, "scripts/main.mjs"), "utf8");

function fail(message) {
  throw new Error(`Scout desktop package readiness failed: ${message}`);
}

function requireFile(relativePath) {
  if (!existsSync(path.join(desktopDir, relativePath))) {
    fail(`Missing ${relativePath}.`);
  }
}

function requireArrayIncludes(value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    fail(`${label} must include ${expected}.`);
  }
}

if (packageJson.main !== "./scripts/main.mjs") {
  fail("package.json main must point at ./scripts/main.mjs.");
}

if (buildConfig.appId !== "co.tenra.scout.desktop") {
  fail("Electron Builder appId is not the expected Scout bundle identifier.");
}

if (buildConfig.productName !== "Scout by Tenra") {
  fail("Electron Builder productName is not Scout by Tenra.");
}

if (buildConfig.asar !== true) {
  fail("Electron Builder should package app code with asar enabled.");
}

if (macConfig.hardenedRuntime !== true) {
  fail("mac release builds must enable hardenedRuntime.");
}

if (macConfig.gatekeeperAssess !== false) {
  fail("Electron Builder gatekeeperAssess should be false during packaging; release artifact checks assess the final app.");
}

if (packageJson.scripts?.["check:release-artifacts"] !== "node ./scripts/check-release-artifacts.mjs") {
  fail("package.json must expose check:release-artifacts for post-package release validation.");
}

if (packageJson.scripts?.["qa:install"] !== "node ./scripts/qa-install-macos.mjs") {
  fail("package.json must expose qa:install for packaged desktop install verification.");
}

requireArrayIncludes(buildConfig.files, "scripts/**/*", "Electron Builder files");
requireArrayIncludes(macConfig.target, "dir", "mac targets");
requireArrayIncludes(macConfig.target, "dmg", "mac targets");
requireArrayIncludes(macConfig.target, "zip", "mac targets");

const desktopRuntimeResource = Array.isArray(buildConfig.extraResources)
  ? buildConfig.extraResources.find(
      (resource) => resource.from === ".desktop-runtime" && resource.to === "desktop-runtime"
    )
  : undefined;

if (!desktopRuntimeResource) {
  fail("Electron Builder extraResources must bundle .desktop-runtime as desktop-runtime.");
}

if (!runtimeScript.includes('defaultDesktopDatabaseUrl = "postgresql:///scout"')) {
  fail("Desktop runtime must define Scout's default local database URL.");
}

if (!launcherScript.includes("DATABASE_URL=postgresql:///scout")) {
  fail("Packaged env template must seed DATABASE_URL=postgresql:///scout.");
}

if (!runtimeScript.includes("/api/desktop/readiness?ensure=1")) {
  fail("Desktop runtime must verify database readiness through the packaged web app.");
}

if (!prepareRuntimeScript.includes("schemaRelativePath")) {
  fail("Packaged desktop runtime manifest must include the database schema path.");
}

if (!mainScript.includes("SCOUT_SCHEMA_PATH")) {
  fail("Packaged desktop runtime must pass SCOUT_SCHEMA_PATH to the web app and worker.");
}

if (!mainScript.includes("SCOUT_DESKTOP_RUNTIME_VERIFY")) {
  fail("Packaged desktop runtime must support install QA verification mode.");
}

for (const relativePath of [
  "scripts/main.mjs",
  "scripts/prepare-runtime.mjs",
  "scripts/check-release-env.mjs",
  "scripts/check-release-artifacts.mjs",
  "scripts/qa-install-macos.mjs",
  "scripts/lib/runtime.mjs",
  "scripts/lib/launcher.mjs",
  "scripts/lib/local-state.mjs"
]) {
  requireFile(relativePath);
}

console.log("Scout desktop package readiness checks passed.");
