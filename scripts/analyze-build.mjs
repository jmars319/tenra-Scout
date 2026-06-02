import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const configPath = path.join(root, "scripts", "maintainability.config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const label = config.label ?? path.basename(root);
const nearBudgetBytes = Number(config.nearBudgetMarginKb ?? 4) * 1024;
const initialBudgetBytes = Number(process.env.BUNDLE_BUDGET_KB ?? config.initialBundleBudgetKb ?? 450) * 1024;
const chunkBudgets = Object.entries(config.chunkBudgetsKb ?? {}).map(([pattern, kb]) => ({
  pattern: new RegExp(pattern),
  bytes: Number(kb) * 1024
}));
const candidateAssetDirs = config.assetDirs ?? [
  "apps/webapp/.next/static/chunks",
  "apps/webapp/.next/static/chunks/app",
  "apps/webapp/dist/assets",
  "dist/assets",
  "build/assets",
  "out/assets"
];

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (entry.name.endsWith(".js")) {
      files.push(absolute);
    }
  }
  return files;
}

function sizeRecord(file) {
  const raw = fs.readFileSync(file);
  return {
    file: relative(file),
    rawBytes: raw.byteLength,
    gzipBytes: zlib.gzipSync(raw).byteLength
  };
}

const assets = candidateAssetDirs.flatMap((dir) => walk(path.join(root, dir))).map(sizeRecord);

if (assets.length === 0) {
  console.log(`${label} build size report`);
  console.log("No built JavaScript assets found. Run the app build first for bundle sizes.");
  if (strict || config.requireBuiltAssets === true) process.exit(1);
  process.exit(0);
}

const sorted = assets.sort((left, right) => right.rawBytes - left.rawBytes);
const initialPattern = config.initialChunkPattern ? new RegExp(config.initialChunkPattern) : /apps\/webapp\/\.next\/static\/chunks\/[^/]+\.js$/;
const initial = sorted.find((asset) => initialPattern.test(asset.file)) ?? sorted[0];
const findings = [];

console.log(`${label} web bundle report`);
console.log(
  `Initial/largest startup chunk: ${initial.file} ${(initial.rawBytes / 1024).toFixed(2)} kB raw / ${(initial.gzipBytes / 1024).toFixed(2)} kB gzip`
);
console.log(`Target: ${(initialBudgetBytes / 1024).toFixed(0)} kB raw`);
console.log("");
console.log("Largest JavaScript chunks:");
for (const asset of sorted.slice(0, 14)) {
  console.log(`- ${asset.file}: ${(asset.rawBytes / 1024).toFixed(2)} kB raw / ${(asset.gzipBytes / 1024).toFixed(2)} kB gzip`);
}

if (initial.rawBytes > initialBudgetBytes) {
  findings.push(`Initial/largest startup chunk exceeds target by ${((initial.rawBytes - initialBudgetBytes) / 1024).toFixed(2)} kB.`);
} else if (initialBudgetBytes - initial.rawBytes <= nearBudgetBytes) {
  findings.push(`Initial/largest startup chunk is within ${(nearBudgetBytes / 1024).toFixed(0)} kB of the budget.`);
}

for (const asset of sorted) {
  for (const budget of chunkBudgets) {
    if (!budget.pattern.test(asset.file)) continue;
    if (asset.rawBytes > budget.bytes) {
      findings.push(`${asset.file} exceeds route chunk budget ${(budget.bytes / 1024).toFixed(0)} kB.`);
    } else if (budget.bytes - asset.rawBytes <= nearBudgetBytes) {
      findings.push(`${asset.file} is within ${(nearBudgetBytes / 1024).toFixed(0)} kB of its route chunk budget.`);
    }
  }
}

if (findings.length > 0) {
  console.log("");
  console.log("Bundle budget findings:");
  for (const finding of findings) console.log(`- ${finding}`);
  if (strict) process.exit(1);
}
