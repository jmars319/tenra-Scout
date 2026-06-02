import type { MarketSampleQuality } from "@scout/domain";
import { persistedRunRecordSchema } from "@scout/validation";

import type { PersistedRunRecord } from "./persisted-run-record.ts";

export interface ScoutRunRow {
  run_id: string;
  schema_version: number;
  status: PersistedRunRecord["status"];
  created_at: string | Date;
  updated_at: string | Date;
  queued_at: string | Date;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  heartbeat_at: string | Date | null;
  attempt_count: number;
  worker_stage: PersistedRunRecord["execution"]["stage"] | null;
  worker_id: string | null;
  worker_note: string | null;
  last_error_message: string | null;
  raw_query: string;
  normalized_query: string;
  market_term: string;
  categories: string[];
  location_label: string | null;
  location_city: string | null;
  location_region: string | null;
  search_query: string;
  search_provider: string | null;
  search_source: string | null;
  sample_quality: MarketSampleQuality | null;
  acquisition: PersistedRunRecord["acquisition"] | null;
  selected_candidates: PersistedRunRecord["selectedCandidates"];
  business_results: PersistedRunRecord["businessResults"] | null;
  shortlist: PersistedRunRecord["shortlist"];
  notes: PersistedRunRecord["notes"];
  error_message: string | null;
  persistence_metadata: PersistedRunRecord["persistence"];
}

export function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapRowToRecord(row: ScoutRunRow): PersistedRunRecord {
  const record = persistedRunRecordSchema.parse({
    schemaVersion: row.schema_version,
    runId: row.run_id,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    execution: {
      queuedAt: toIsoString(row.queued_at),
      attemptCount: row.attempt_count,
      ...(row.started_at ? { startedAt: toIsoString(row.started_at) } : {}),
      ...(row.finished_at ? { finishedAt: toIsoString(row.finished_at) } : {}),
      ...(row.heartbeat_at ? { heartbeatAt: toIsoString(row.heartbeat_at) } : {}),
      ...(row.worker_stage ? { stage: row.worker_stage } : {}),
      ...(row.worker_id ? { workerId: row.worker_id } : {}),
      ...(row.worker_note ? { workerNote: row.worker_note } : {}),
      ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {})
    },
    input: {
      rawQuery: row.raw_query
    },
    intent: {
      originalQuery: row.raw_query,
      normalizedQuery: row.normalized_query,
      marketTerm: row.market_term,
      categories: row.categories,
      locationLabel: row.location_label ?? undefined,
      locationCity: row.location_city ?? undefined,
      locationRegion: row.location_region ?? undefined,
      searchQuery: row.search_query
    },
    acquisition: row.acquisition,
    selectedCandidates: row.selected_candidates,
    businessResults: row.business_results,
    shortlist: row.shortlist,
    notes: row.notes,
    errorMessage: row.error_message ?? undefined,
    persistence: row.persistence_metadata
  });

  return record;
}
