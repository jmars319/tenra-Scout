import type { OutreachLength, OutreachTone, ViewportKind } from "@scout/domain";

export const APP_NAME = "Scout by Tenra";
export const DEFAULT_DATABASE_URL = "postgresql:///scout";

export interface ViewportPreset {
  kind: ViewportKind;
  label: string;
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: Record<ViewportKind, ViewportPreset> = {
  desktop: {
    kind: "desktop",
    label: "Desktop 1440x900",
    width: 1440,
    height: 900
  },
  mobile: {
    kind: "mobile",
    label: "Mobile 390x844",
    width: 390,
    height: 844
  }
};

export interface ScoutLimits {
  minCandidates: number;
  maxCandidates: number;
}

export type SearchProviderName = "duckduckgo_html" | "google_html" | "bing_html" | "seeded_stub";

export interface EvidenceStorageConfig {
  driver: "local" | "s3";
  localDir: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface WorkerConfig {
  pollMs: number;
  staleRunMs: number;
}

export interface InteractiveSearchConfig {
  enabled: boolean;
  timeoutMs: number;
  profileDir?: string;
}

export interface OutreachConfig {
  enabled: boolean;
  provider: "openai" | "ollama" | "local_template" | "disabled";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  defaultTone: OutreachTone;
  defaultLength: OutreachLength;
}

export function getAppName(source: Record<string, string | undefined> = process.env): string {
  return source.APP_NAME?.trim() || APP_NAME;
}

export function getScoutLimits(source: Record<string, string | undefined> = process.env): ScoutLimits {
  const minCandidates = Number(source.SCOUT_MIN_CANDIDATES ?? 10);
  const maxCandidates = Number(source.SCOUT_MAX_CANDIDATES ?? 15);

  return {
    minCandidates: Number.isFinite(minCandidates) ? minCandidates : 10,
    maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 15
  };
}

export function getSearchProviderName(
  source: Record<string, string | undefined> = process.env
): SearchProviderName {
  const providerName = source.SCOUT_SEARCH_PROVIDER?.trim() || "duckduckgo_html";

  if (
    providerName !== "duckduckgo_html" &&
    providerName !== "google_html" &&
    providerName !== "bing_html" &&
    providerName !== "seeded_stub"
  ) {
    throw new Error(
      `SCOUT_SEARCH_PROVIDER must be "duckduckgo_html", "google_html", "bing_html", or "seeded_stub", received "${providerName}".`
    );
  }

  return providerName;
}

export function getEvidenceStorageConfig(
  source: Record<string, string | undefined> = process.env
): EvidenceStorageConfig {
  const driver = source.EVIDENCE_STORAGE_DRIVER === "s3" ? "s3" : "local";
  return {
    driver,
    localDir: source.EVIDENCE_LOCAL_DIR?.trim() || "./data/evidence"
  };
}

export function getPublicAppUrl(source: Record<string, string | undefined> = process.env): string {
  return source.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

export function getDatabaseConfig(
  source: Record<string, string | undefined> = process.env
): DatabaseConfig {
  const url = source.DATABASE_URL?.trim();

  return { url: url || DEFAULT_DATABASE_URL };
}

export function getWorkerConfig(
  source: Record<string, string | undefined> = process.env
): WorkerConfig {
  const pollMs = Number(source.SCOUT_WORKER_POLL_MS ?? 2000);
  const staleRunMs = Number(source.SCOUT_WORKER_STALE_RUN_MS ?? 2_700_000);

  return {
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 2000,
    staleRunMs: Number.isFinite(staleRunMs) && staleRunMs > 0 ? staleRunMs : 2_700_000
  };
}

export function getInteractiveSearchConfig(
  source: Record<string, string | undefined> = process.env
): InteractiveSearchConfig {
  const enabledValue = source.SCOUT_INTERACTIVE_SEARCH?.trim().toLowerCase();
  const timeoutMs = Number(source.SCOUT_INTERACTIVE_SEARCH_TIMEOUT_MS ?? 420_000);
  const profileDir = source.SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR?.trim();

  return {
    enabled: enabledValue === "1" || enabledValue === "true" || enabledValue === "yes",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 30_000 ? timeoutMs : 420_000,
    ...(profileDir ? { profileDir } : {})
  };
}

export function getOutreachConfig(
  source: Record<string, string | undefined> = process.env
): OutreachConfig {
  const apiKey = source.OPENAI_API_KEY?.trim();
  const requestedProvider = source.SCOUT_OUTREACH_PROVIDER?.trim().toLowerCase();
  const provider =
    requestedProvider === "disabled"
      ? "disabled"
      : requestedProvider === "ollama"
        ? "ollama"
        : requestedProvider === "openai"
          ? "openai"
          : apiKey
            ? "openai"
            : "local_template";
  const model = source.SCOUT_OUTREACH_MODEL?.trim() || (provider === "ollama" ? "llama3.2" : "gpt-5-mini");
  const baseUrl = source.SCOUT_OUTREACH_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const defaultTone = (source.SCOUT_OUTREACH_DEFAULT_TONE?.trim() || "calm") as OutreachTone;
  const defaultLength = (source.SCOUT_OUTREACH_DEFAULT_LENGTH?.trim() || "standard") as OutreachLength;

  return {
    enabled: provider !== "disabled" && (provider !== "openai" || Boolean(apiKey)),
    provider,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(provider === "ollama" ? { baseUrl } : {}),
    defaultTone:
      defaultTone === "calm" || defaultTone === "direct" || defaultTone === "friendly"
        ? defaultTone
        : "calm",
    defaultLength: defaultLength === "brief" || defaultLength === "standard" ? defaultLength : "standard"
  };
}
