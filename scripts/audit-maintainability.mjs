import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const configPath = path.join(root, "scripts", "maintainability.config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const label = config.label ?? path.basename(root);
const nearBudgetMargin = Number(config.nearBudgetMarginLines ?? 25);
const ignoredPathIncludes = (config.ignoredPathIncludes ?? []).map((item) => item.replaceAll("\\", "/"));
const ignoredSegments = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", "dist", "dist-bundle", "build", "out",
  "coverage", ".turbo", ".vite", "target", "gen", "release", ".desktop-runtime", ".wrangler",
  ".expo", "web-build", ".cache", ...(config.ignoredSegments ?? [])
]);
const sourceExtensions = new Set(config.sourceExtensions ?? [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs", ".css", ".scss"]);
const styleExtensions = new Set([".css", ".scss", ".sass", ".less"]);
const generatedPatterns = (config.generatedPatterns ?? [
  "dist/", "dist-bundle/", "/dist/", "/build/", "/out/", "/target/", "/gen/", ".desktop-runtime",
  "worker-configuration.d.ts", "vite-env.d.ts", "next-env.d.ts", "*.tsbuildinfo"
]).map((pattern) => pattern.replaceAll("\\", "/"));
const allowedGenerated = new Set((config.allowedGenerated ?? []).map((item) => item.replaceAll("\\", "/")));
const specificFileBudgets = new Map(Object.entries(config.specificFileBudgets ?? {}));
const maxImpl = Number(config.maxImplementationFileLines ?? 700);
const maxStyle = Number(config.maxStyleFileLines ?? 400);
const maxAppShell = Number(config.maxAppShellLines ?? 350);
const maxDesktopMain = Number(config.maxDesktopMainLines ?? 450);
const maxDomainBarrel = Number(config.maxDomainBarrelLines ?? 250);
const importBans = config.importBans ?? [
  { pattern: "/dist/", message: "imports from built dist output are not allowed" },
  { pattern: "/build/", message: "imports from build output are not allowed" },
  { pattern: "node_modules/", message: "imports from dependency internals are not allowed" },
  { pattern: ".next/", message: "imports from Next build output are not allowed" },
  { pattern: ".desktop-runtime/", message: "imports from desktop runtime output are not allowed" }
];

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shouldSkipDirectory(absolute) {
  const rel = relative(absolute);
  if (ignoredPathIncludes.some((item) => rel === item || rel.includes(item))) return true;
  return ignoredSegments.has(path.basename(absolute));
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory) || shouldSkipDirectory(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function walkAllFiles(directory, files = []) {
  if (!fs.existsSync(directory) || shouldSkipDirectory(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkAllFiles(absolute, files);
    } else {
      files.push(absolute);
    }
  }
  return files;
}

function lineCount(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).length;
}

function matchesPattern(file, pattern) {
  if (pattern.startsWith("*.")) return file.endsWith(pattern.slice(1));
  return file === pattern || file.includes(pattern);
}

function budgetFor(record) {
  if (specificFileBudgets.has(record.file)) return Number(specificFileBudgets.get(record.file));
  const isAppShell = /(^|\/)(App|AppRoot)\.(tsx|jsx|ts|js)$/.test(record.file);
  const isDesktopMain = /(^|\/)(main|lib)\.(cjs|mjs|js|ts|rs)$/.test(record.file) && /desktop|tauri|src-tauri/.test(record.file);
  const isDomainBarrel = /(^|\/)packages\/[^/]+\/src\/index\.ts$/.test(record.file) || /(^|\/)packages\/shared-types\/src\/index\.ts$/.test(record.file);
  if (styleExtensions.has(record.ext)) return maxStyle;
  if (isAppShell) return maxAppShell;
  if (isDesktopMain) return maxDesktopMain;
  if (isDomainBarrel) return maxDomainBarrel;
  return maxImpl;
}

function exportedNames(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const match of text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_]+)/g)) names.add(match[1]);
  for (const match of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const cleaned = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (cleaned) names.add(cleaned);
    }
  }
  return [...names].sort();
}

function packageNames() {
  return walkAllFiles(root).filter((file) => path.basename(file) === "package.json").map((file) => {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    return { path: relative(file), name: manifest.name ?? null };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function packageExports() {
  const packagesRoot = path.join(root, "packages");
  return walk(packagesRoot).filter((file) => /packages\/[^/]+\/src\/index\.ts$/.test(relative(file))).map((file) => ({
    path: relative(file),
    exports: exportedNames(file)
  })).sort((a, b) => a.path.localeCompare(b.path));
}

function appRoutes() {
  const appRoot = path.join(root, "apps", "webapp", "src", "app");
  return walk(appRoot).filter((file) => /\/(page|route)\.tsx?$/.test(file)).map((file) =>
    relative(file).replace(/^apps\/webapp\/src\/app\//, "").replace(/\/(page|route)\.tsx?$/, "").replace(/^(page|route)\.tsx?$/, "/")
  ).sort();
}

function desktopMenuLabels() {
  const file = path.join(root, "apps", "desktopapp", "scripts", "main.mjs");
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/label:\s*["']([^"']+)["']/g)].map((match) => match[1]).sort();
}

function readExpectedContracts() {
  const contractPath = path.join(root, config.contractSnapshotPath ?? "scripts/contracts/maintainability-contracts.json");
  if (!fs.existsSync(contractPath)) return null;
  return JSON.parse(fs.readFileSync(contractPath, "utf8"));
}

const sourceRoots = (config.sourceRoots ?? ["src", "app", "apps", "packages", "crates", "server", "desktop", "scripts"])
  .filter((dir) => fs.existsSync(path.join(root, dir)));
const records = sourceRoots
  .flatMap((directory) => walk(path.join(root, directory)))
  .filter((file, index, all) => all.indexOf(file) === index)
  .map((file) => ({ file: relative(file), ext: path.extname(file), lines: lineCount(file) }));
const implementationRecords = records.filter((record) => !styleExtensions.has(record.ext));
const styleRecords = records.filter((record) => styleExtensions.has(record.ext));
const generatedRecords = records.filter((record) =>
  generatedPatterns.some((pattern) => matchesPattern(record.file, pattern)) && !allowedGenerated.has(record.file)
);
const violations = [];
const warnings = [];

for (const record of records) {
  const budget = budgetFor(record);
  if (record.lines > budget) {
    violations.push(`${record.file} has ${record.lines} lines; budget is ${budget}.`);
  } else if (budget - record.lines <= nearBudgetMargin) {
    warnings.push(`${record.file} is ${budget - record.lines} lines below its ${budget}-line budget.`);
  }
}

if (generatedRecords.length > 0 && config.allowGeneratedArtifacts !== true) {
  violations.push("generated/runtime artifacts in source scan: " + generatedRecords.slice(0, 12).map((record) => record.file).join(", "));
}

for (const record of implementationRecords) {
  if (allowedGenerated.has(record.file)) continue;
  const text = fs.readFileSync(path.join(root, record.file), "utf8");
  const imports = [
    ...text.matchAll(/import\s+(?:type\s+)?(?:[^"']+from\s+)?["']([^"']+)["']/g),
    ...text.matchAll(/require\(["']([^"']+)["']\)/g)
  ].map((match) => match[1]);
  for (const ban of importBans) {
    if (imports.some((source) => source.includes(ban.pattern))) {
      violations.push(`${record.file}: ${ban.message}.`);
    }
  }
}

for (const rule of config.startupImportBans ?? []) {
  const file = path.join(root, rule.file);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of rule.bannedPatterns ?? []) {
    if (text.includes(pattern)) violations.push(`${rule.file} imports startup-prohibited surface: ${pattern}`);
  }
}

const expectedContracts = readExpectedContracts();
if (expectedContracts) {
  const actualContracts = { packageNames: packageNames(), packageExports: packageExports(), appRoutes: appRoutes(), desktopMenuLabels: desktopMenuLabels() };
  const actual = JSON.stringify(actualContracts, null, 2);
  const expected = JSON.stringify(expectedContracts, null, 2);
  if (actual !== expected) violations.push(`public contract snapshot drifted; update ${config.contractSnapshotPath ?? "scripts/contracts/maintainability-contracts.json"} intentionally.`);
} else {
  violations.push("public contract snapshot is missing.");
}

console.log(`${label} maintainability audit`);
console.log("");
console.log("Largest implementation files:");
for (const record of implementationRecords.sort((a, b) => b.lines - a.lines).slice(0, 12)) console.log(`- ${record.file}: ${record.lines} lines`);
console.log("");
console.log("Largest style files:");
for (const record of styleRecords.sort((a, b) => b.lines - a.lines).slice(0, 8)) console.log(`- ${record.file}: ${record.lines} lines`);
console.log("");
console.log(`Generated/runtime findings: ${generatedRecords.length}`);
console.log(`Contract snapshot: ${expectedContracts ? "checked" : "missing"}`);

if (warnings.length > 0) {
  console.log("");
  console.log("Near-budget warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
  if (strict) violations.push(...warnings);
}

if (violations.length > 0) {
  console.log("");
  console.log("Maintainability findings:");
  for (const violation of violations) console.log(`- ${violation}`);
  if (strict) process.exit(1);
}
