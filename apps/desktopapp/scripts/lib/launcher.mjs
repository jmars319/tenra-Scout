import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(desktopDir, "../..");

export const appName = process.env.SCOUT_DESKTOP_APP_NAME || "Scout by Tenra";
const legacyAppNames = ["Tenra Scout"];
export const userApplicationsDirPath = path.resolve(os.homedir(), "Applications");
export const systemApplicationsDirPath = "/Applications";
export const distDesktopDirPath = path.resolve(repoRoot, "dist", "desktop");

export function getUserDataDirPath(name = appName) {
  return path.resolve(os.homedir(), "Library", "Application Support", name);
}

export function getPackagedEnvFilePath(name = appName) {
  return path.resolve(getUserDataDirPath(name), ".env");
}

export function getInstalledAppPath(installDir, name = appName) {
  return path.resolve(installDir, `${name}.app`);
}

export function buildDefaultPackagedEnvTemplate(name = appName) {
  return `# Scout desktop local environment
APP_NAME=${name}
NODE_ENV=production

# Scout currently uses a local Postgres database by default.
DATABASE_URL=postgresql:///scout

# Optional AI-assisted outreach
OPENAI_API_KEY=
SCOUT_OUTREACH_MODEL=gpt-5-mini
SCOUT_OUTREACH_DEFAULT_TONE=calm
SCOUT_OUTREACH_DEFAULT_LENGTH=standard

# Optional acquisition tuning
SCOUT_SEARCH_PROVIDER=duckduckgo_html
SCOUT_MIN_CANDIDATES=10
SCOUT_MAX_CANDIDATES=15
`;
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if ((code ?? 1) === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}.`));
    });
  });
}

function buildLauncherEnv() {
  const env = {
    ...process.env
  };

  delete env.ELECTRON_RUN_AS_NODE;

  return env;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertWritableDirectory(targetPath) {
  await mkdir(targetPath, {
    recursive: true
  });
  await access(targetPath, constants.W_OK);
}

async function findAppBundleInDirectory(rootDir, name = appName) {
  if (!(await pathExists(rootDir))) {
    return null;
  }

  const directMatch = path.resolve(rootDir, `${name}.app`);
  if (await pathExists(directMatch)) {
    return directMatch;
  }

  const entries = await readdir(rootDir, {
    withFileTypes: true
  });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidatePath = path.resolve(rootDir, entry.name, `${name}.app`);
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

export async function ensurePackagedUserEnvFile({
  name = appName,
  userDataDirPath = getUserDataDirPath(name),
  logger = console
} = {}) {
  const envFilePath = path.resolve(userDataDirPath, ".env");
  await mkdir(userDataDirPath, {
    recursive: true
  });

  if (existsSync(envFilePath)) {
    return {
      envFilePath,
      created: false
    };
  }

  for (const legacyName of legacyAppNames) {
    const legacyEnvFilePath = getPackagedEnvFilePath(legacyName);
    if (!existsSync(legacyEnvFilePath)) {
      continue;
    }

    const legacyEnv = await readFile(legacyEnvFilePath, "utf8");
    const nextEnv = legacyEnv.includes("APP_NAME=")
      ? legacyEnv.replace(/^APP_NAME=.*$/m, `APP_NAME=${name}`)
      : `APP_NAME=${name}\n${legacyEnv}`;
    await writeFile(envFilePath, nextEnv);
    logger.log(`Migrated Scout desktop env file from ${legacyEnvFilePath} to ${envFilePath}.`);

    return {
      envFilePath,
      created: true,
      migratedFrom: legacyEnvFilePath
    };
  }

  await writeFile(envFilePath, buildDefaultPackagedEnvTemplate(name));
  logger.log(`Created Scout desktop env file at ${envFilePath}.`);

  return {
    envFilePath,
    created: true
  };
}

export async function findPackagedAppBundle(name = appName) {
  return findAppBundleInDirectory(distDesktopDirPath, name);
}

export async function findInstalledAppBundle(name = appName) {
  for (const installDir of [userApplicationsDirPath, systemApplicationsDirPath]) {
    const candidatePath = getInstalledAppPath(installDir, name);
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

export async function installPackagedApp({
  installDirPath = userApplicationsDirPath,
  name = appName,
  logger = console
} = {}) {
  await assertWritableDirectory(installDirPath);

  const sourceAppPath = await findPackagedAppBundle(name);
  if (!sourceAppPath) {
    throw new Error(
      "Scout desktop package was not found under dist/desktop. Run the packaging step before install."
    );
  }

  const targetAppPath = getInstalledAppPath(installDirPath, name);
  await rm(targetAppPath, {
    recursive: true,
    force: true
  });
  for (const directoryPath of [userApplicationsDirPath, systemApplicationsDirPath]) {
    if (path.resolve(directoryPath) !== path.resolve(installDirPath)) {
      await rm(getInstalledAppPath(directoryPath, name), {
        recursive: true,
        force: true
      });
    }

    for (const legacyName of legacyAppNames) {
      await rm(getInstalledAppPath(directoryPath, legacyName), {
        recursive: true,
        force: true
      });
    }
  }
  await run("/usr/bin/ditto", [sourceAppPath, targetAppPath], {
    stdio: "inherit"
  });
  await rm(sourceAppPath, {
    recursive: true,
    force: true
  });

  const envResult = await ensurePackagedUserEnvFile({
    name,
    logger
  });

  return {
    sourceAppPath,
    targetAppPath,
    envFilePath: envResult.envFilePath,
    createdEnvFile: envResult.created
  };
}

export async function openMacApp(appBundlePath) {
  await run("open", ["-na", appBundlePath], {
    env: buildLauncherEnv(),
    stdio: "inherit"
  });
}

export async function revealMacApp(appBundlePath) {
  await run("open", ["-R", appBundlePath], {
    env: buildLauncherEnv(),
    stdio: "inherit"
  });
}
