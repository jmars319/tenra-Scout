import { getPostgresClient } from "./postgres-client.ts";

export interface ScoutWorkerHeartbeat {
  workerId: string;
  heartbeatAt: string;
  note: string;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function recordScoutWorkerHeartbeat(
  workerId: string,
  note: string
): Promise<ScoutWorkerHeartbeat> {
  const sql = getPostgresClient();
  const [row] = await sql<Array<{ worker_id: string; heartbeat_at: string | Date; note: string }>>`
    insert into scout_worker_heartbeats (
      worker_id,
      heartbeat_at,
      note
    )
    values (
      ${workerId},
      now(),
      ${note}
    )
    on conflict (worker_id) do update
    set
      heartbeat_at = excluded.heartbeat_at,
      note = excluded.note
    returning worker_id, heartbeat_at, note
  `;

  if (!row) {
    throw new Error("Scout worker heartbeat could not be recorded.");
  }

  return {
    workerId: row.worker_id,
    heartbeatAt: toIsoString(row.heartbeat_at),
    note: row.note
  };
}

export async function getLatestScoutWorkerHeartbeat(): Promise<ScoutWorkerHeartbeat | null> {
  const sql = getPostgresClient();
  const [row] = await sql<Array<{ worker_id: string; heartbeat_at: string | Date; note: string }>>`
    select worker_id, heartbeat_at, note
    from scout_worker_heartbeats
    order by heartbeat_at desc
    limit 1
  `;

  return row
    ? {
        workerId: row.worker_id,
        heartbeatAt: toIsoString(row.heartbeat_at),
        note: row.note
      }
    : null;
}
