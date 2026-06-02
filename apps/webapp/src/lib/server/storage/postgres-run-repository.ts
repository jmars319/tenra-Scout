import type { MarketSampleQuality, ScoutRunReport } from "@scout/domain";
import {
  createPersistedRunRecord,
  createQueuedPersistedRunRecord,
  type PersistedRunRecord,
  type PersistenceMetadataInput,
  type QueuedRunRecordInput,
  toScoutRunReport
} from "./persisted-run-record.ts";
import { buildFinalizedRecordOptions } from "./postgres-run-finalize.ts";
import { mapRowToRecord, toIsoString, type ScoutRunRow } from "./postgres-run-record-mapper.ts";
import { getPostgresClient } from "./postgres-client.ts";

const CANCELED_RUN_MESSAGE = "Run canceled by operator.";

export interface RecentRunSummary {
  runId: string;
  status: PersistedRunRecord["status"];
  createdAt: string;
  updatedAt: string;
  rawQuery: string;
  marketTerm: string;
  sampleQuality?: MarketSampleQuality;
}

export interface SavedMarketSummary {
  marketKey: string;
  rawQuery: string;
  marketTerm: string;
  locationLabel?: string;
  latestRunId: string;
  latestRunAt: string;
  runCount: number;
  latestSampleQuality?: MarketSampleQuality;
}


export function createPostgresRunRepository() {
  const sql = getPostgresClient();

  async function upsertRecord(record: PersistedRunRecord): Promise<PersistedRunRecord> {
    const [row] = await sql<ScoutRunRow[]>`
      insert into scout_runs (
        run_id,
        schema_version,
        status,
        created_at,
        updated_at,
        queued_at,
        started_at,
        finished_at,
        heartbeat_at,
        attempt_count,
        worker_stage,
        worker_id,
        worker_note,
        last_error_message,
        raw_query,
        normalized_query,
        market_term,
        categories,
        location_label,
        location_city,
        location_region,
        search_query,
        search_provider,
        search_source,
        sample_quality,
        acquisition,
        selected_candidates,
        business_results,
        shortlist,
        notes,
        error_message,
        persistence_metadata
      )
      values (
        ${record.runId},
        ${record.schemaVersion},
        ${record.status},
        ${record.createdAt},
        ${record.updatedAt},
        ${record.execution.queuedAt},
        ${record.execution.startedAt ?? null},
        ${record.execution.finishedAt ?? null},
        ${record.execution.heartbeatAt ?? null},
        ${record.execution.attemptCount},
        ${record.execution.stage ?? null},
        ${record.execution.workerId ?? null},
        ${record.execution.workerNote ?? null},
        ${record.execution.lastErrorMessage ?? null},
        ${record.input.rawQuery},
        ${record.intent.normalizedQuery},
        ${record.intent.marketTerm},
        ${sql.array(record.intent.categories)},
        ${record.intent.locationLabel ?? null},
        ${record.intent.locationCity ?? null},
        ${record.intent.locationRegion ?? null},
        ${record.intent.searchQuery},
        ${record.acquisition?.provider ?? null},
        ${
          record.acquisition
            ? (() => {
                const selectedSources = [
                  ...new Set(
                    record.acquisition.candidateSources
                      .filter((source) => source.selectedCandidateCount > 0)
                      .map((source) => source.source)
                  )
                ];

                if (selectedSources.length > 0) {
                  return selectedSources.join(" + ");
                }

                return record.acquisition.fallbackUsed
                  ? `${record.acquisition.provider} + seeded_stub`
                  : record.acquisition.provider;
              })()
            : null
        },
        ${record.acquisition?.sampleQuality ?? record.businessResults?.summary.sampleQuality ?? null},
        ${record.acquisition ? sql.json(record.acquisition) : null},
        ${sql.json(record.selectedCandidates)},
        ${record.businessResults ? sql.json(record.businessResults) : null},
        ${sql.json(record.shortlist)},
        ${sql.json(record.notes)},
        ${record.errorMessage ?? null},
        ${sql.json(record.persistence)}
      )
      on conflict (run_id) do update
      set
        schema_version = excluded.schema_version,
        status = excluded.status,
        updated_at = excluded.updated_at,
        queued_at = excluded.queued_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        heartbeat_at = excluded.heartbeat_at,
        attempt_count = excluded.attempt_count,
        worker_stage = excluded.worker_stage,
        worker_id = excluded.worker_id,
        worker_note = excluded.worker_note,
        last_error_message = excluded.last_error_message,
        raw_query = excluded.raw_query,
        normalized_query = excluded.normalized_query,
        market_term = excluded.market_term,
        categories = excluded.categories,
        location_label = excluded.location_label,
        location_city = excluded.location_city,
        location_region = excluded.location_region,
        search_query = excluded.search_query,
        search_provider = excluded.search_provider,
        search_source = excluded.search_source,
        sample_quality = excluded.sample_quality,
        acquisition = excluded.acquisition,
        selected_candidates = excluded.selected_candidates,
        business_results = excluded.business_results,
        shortlist = excluded.shortlist,
        notes = excluded.notes,
        error_message = excluded.error_message,
        persistence_metadata = excluded.persistence_metadata
      returning
        run_id,
        schema_version,
        status,
        created_at,
        updated_at,
        queued_at,
        started_at,
        finished_at,
        heartbeat_at,
        attempt_count,
        worker_stage,
        worker_id,
        worker_note,
        last_error_message,
        raw_query,
        normalized_query,
        market_term,
        categories,
        location_label,
        location_city,
        location_region,
        search_query,
        search_provider,
        search_source,
        sample_quality,
        acquisition,
        selected_candidates,
        business_results,
        shortlist,
        notes,
        error_message,
        persistence_metadata
    `;

    if (!row) {
      throw new Error(`Failed to persist Scout run ${record.runId} to Postgres.`);
    }

    return mapRowToRecord(row);
  }

  const repository = {
    async createQueuedRun(input: QueuedRunRecordInput): Promise<PersistedRunRecord> {
      return upsertRecord(createQueuedPersistedRunRecord(input));
    },

    async save(
      report: ScoutRunReport,
      persistence: PersistenceMetadataInput = {}
    ): Promise<PersistedRunRecord> {
      const existing = await repository.getRecord(report.runId);
      if (
        existing?.status === "failed" &&
        existing.execution.lastErrorMessage === CANCELED_RUN_MESSAGE
      ) {
        return existing;
      }

      return upsertRecord(
        createPersistedRunRecord(
          report,
          await buildFinalizedRecordOptions(report, persistence, (runId) => repository.getRecord(runId))
        )
      );
    },

    upsertRecord,

    async claimNextQueuedRun(workerId: string): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        with next_run as (
          select run_id
          from scout_runs
          where status = 'queued'
          order by queued_at asc, created_at asc
          for update skip locked
          limit 1
        )
        update scout_runs
        set
          status = 'running',
          updated_at = now(),
          started_at = now(),
          finished_at = null,
          heartbeat_at = now(),
          attempt_count = attempt_count + 1,
          worker_stage = 'starting',
          worker_id = ${workerId},
          worker_note = 'Worker claimed the run and is preparing Scout dependencies.',
          last_error_message = null
        where run_id in (select run_id from next_run)
        returning
          run_id,
          schema_version,
          status,
          created_at,
          updated_at,
          queued_at,
          started_at,
          finished_at,
          heartbeat_at,
          attempt_count,
          worker_stage,
          worker_id,
          worker_note,
          last_error_message,
          raw_query,
          normalized_query,
          market_term,
          categories,
          location_label,
          location_city,
          location_region,
          search_query,
          search_provider,
          search_source,
          sample_quality,
          acquisition,
          selected_candidates,
          business_results,
          shortlist,
          notes,
          error_message,
          persistence_metadata
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async requeueStaleRuns(staleRunMs: number): Promise<number> {
      const rows = await sql<Array<{ run_id: string }>>`
        update scout_runs
        set
          status = 'queued',
          updated_at = now(),
          queued_at = now(),
          finished_at = null,
          heartbeat_at = now(),
          worker_stage = 'queued',
          worker_id = null,
          worker_note = 'Scout worker did not finish the previous attempt. The run was re-queued.',
          last_error_message = coalesce(
            last_error_message,
            'Scout worker did not finish the previous attempt. The run was re-queued.'
          )
        where status = 'running'
          and coalesce(heartbeat_at, started_at) is not null
          and coalesce(heartbeat_at, started_at) < now() - (${Math.max(staleRunMs, 1000)} * interval '1 millisecond')
        returning run_id
      `;

      return rows.length;
    },

    async cancelRun(runId: string): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        update scout_runs
        set
          status = 'failed',
          updated_at = now(),
          finished_at = now(),
          heartbeat_at = now(),
          worker_stage = 'failed',
          worker_note = ${CANCELED_RUN_MESSAGE},
          last_error_message = ${CANCELED_RUN_MESSAGE},
          error_message = ${CANCELED_RUN_MESSAGE}
        where run_id = ${runId}
          and status in ('queued', 'running')
        returning *
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async retryRun(runId: string): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        update scout_runs
        set
          status = 'queued',
          updated_at = now(),
          queued_at = now(),
          started_at = null,
          finished_at = null,
          heartbeat_at = now(),
          attempt_count = 0,
          worker_stage = 'queued',
          worker_id = null,
          worker_note = 'Run manually re-queued by operator.',
          last_error_message = null,
          search_provider = null,
          search_source = null,
          sample_quality = null,
          acquisition = null,
          selected_candidates = ${sql.json([])},
          business_results = null,
          shortlist = ${sql.json([])},
          notes = ${sql.json([])},
          error_message = null
        where run_id = ${runId}
          and status = 'failed'
        returning *
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async updateProgress(
      runId: string,
      progress: {
        stage?: PersistedRunRecord["execution"]["stage"];
        workerNote?: string;
      }
    ) {
      const [row] = await sql<ScoutRunRow[]>`
        update scout_runs
        set
          updated_at = now(),
          heartbeat_at = now(),
          worker_stage = ${progress.stage ?? null},
          worker_note = ${progress.workerNote ?? null}
        where run_id = ${runId}
          and status = 'running'
        returning
          run_id,
          schema_version,
          status,
          created_at,
          updated_at,
          queued_at,
          started_at,
          finished_at,
          heartbeat_at,
          attempt_count,
          worker_stage,
          worker_id,
          worker_note,
          last_error_message,
          raw_query,
          normalized_query,
          market_term,
          categories,
          location_label,
          location_city,
          location_region,
          search_query,
          search_provider,
          search_source,
          sample_quality,
          acquisition,
          selected_candidates,
          business_results,
          shortlist,
          notes,
          error_message,
          persistence_metadata
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async getRecord(runId: string): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        select
          run_id,
          schema_version,
          status,
          created_at,
          updated_at,
          queued_at,
          started_at,
          finished_at,
          heartbeat_at,
          attempt_count,
          worker_stage,
          worker_id,
          worker_note,
          last_error_message,
          raw_query,
          normalized_query,
          market_term,
          categories,
          location_label,
          location_city,
          location_region,
          search_query,
          search_provider,
          search_source,
          sample_quality,
          acquisition,
          selected_candidates,
          business_results,
          shortlist,
          notes,
          error_message,
          persistence_metadata
        from scout_runs
        where run_id = ${runId}
        limit 1
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async getPreviousCompletedForMarket(
      rawQuery: string,
      beforeCreatedAt: string
    ): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        select
          run_id,
          schema_version,
          status,
          created_at,
          updated_at,
          queued_at,
          started_at,
          finished_at,
          heartbeat_at,
          attempt_count,
          worker_stage,
          worker_id,
          worker_note,
          last_error_message,
          raw_query,
          normalized_query,
          market_term,
          categories,
          location_label,
          location_city,
          location_region,
          search_query,
          search_provider,
          search_source,
          sample_quality,
          acquisition,
          selected_candidates,
          business_results,
          shortlist,
          notes,
          error_message,
          persistence_metadata
        from scout_runs
        where lower(raw_query) = lower(${rawQuery})
          and status = 'completed'
          and created_at < ${beforeCreatedAt}
        order by created_at desc
        limit 1
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async get(runId: string): Promise<ScoutRunReport | null> {
      const record = await repository.getRecord(runId);
      return record ? toScoutRunReport(record) : null;
    },

    async listRecent(limit = 6): Promise<RecentRunSummary[]> {
      const rows = await sql<
        Array<{
          run_id: string;
          status: PersistedRunRecord["status"];
          created_at: string | Date;
          updated_at: string | Date;
          raw_query: string;
          market_term: string;
          sample_quality: MarketSampleQuality | null;
        }>
      >`
        select
          run_id,
          status,
          created_at,
          updated_at,
          raw_query,
          market_term,
          sample_quality
        from scout_runs
        order by created_at desc
        limit ${Math.max(1, Math.min(limit, 20))}
      `;

      return rows.map((row) => ({
        runId: row.run_id,
        status: row.status,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
        rawQuery: row.raw_query,
        marketTerm: row.market_term,
        ...(row.sample_quality ? { sampleQuality: row.sample_quality } : {})
      }));
    },

    async listSavedMarkets(limit = 12): Promise<SavedMarketSummary[]> {
      const rows = await sql<
        Array<{
          market_key: string;
          raw_query: string;
          market_term: string;
          location_label: string | null;
          latest_run_id: string;
          latest_run_at: string | Date;
          run_count: number;
          latest_sample_quality: MarketSampleQuality | null;
        }>
      >`
        with ranked_runs as (
          select
            lower(raw_query) as market_key,
            raw_query,
            market_term,
            location_label,
            run_id,
            created_at,
            sample_quality,
            count(*) over (partition by lower(raw_query)) as run_count,
            row_number() over (partition by lower(raw_query) order by created_at desc) as row_rank
          from scout_runs
          where status = 'completed'
        )
        select
          market_key,
          raw_query,
          market_term,
          location_label,
          run_id as latest_run_id,
          created_at as latest_run_at,
          run_count,
          sample_quality as latest_sample_quality
        from ranked_runs
        where row_rank = 1
        order by created_at desc
        limit ${Math.max(1, Math.min(limit, 50))}
      `;

      return rows.map((row) => ({
        marketKey: row.market_key,
        rawQuery: row.raw_query,
        marketTerm: row.market_term,
        ...(row.location_label ? { locationLabel: row.location_label } : {}),
        latestRunId: row.latest_run_id,
        latestRunAt: toIsoString(row.latest_run_at),
        runCount: Number(row.run_count),
        ...(row.latest_sample_quality ? { latestSampleQuality: row.latest_sample_quality } : {})
      }));
    }
  };

  return repository;
}
