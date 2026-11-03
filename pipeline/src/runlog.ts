// Every job writes a run row so a bad run is visible: counts in and out,
// errors, and job-specific meta (e.g. GraphQL points remaining). The admin
// status page reads the latest row per job.

import type { Db } from './db.ts';

export type RunHandle = { id: number; job: string; startedAt: number };

export async function startRun(db: Db, job: string, meta?: unknown): Promise<RunHandle> {
  const rows = await db.query<{ id: number }>(
    'insert into pipeline_runs (job, meta) values ($1, $2) returning id',
    [job, meta === undefined ? null : JSON.stringify(meta)],
  );
  return { id: Number(rows[0].id), job, startedAt: Date.now() };
}

export async function finishRun(
  db: Db,
  run: RunHandle,
  result: {
    ok: boolean;
    rowsIn?: number;
    rowsOut?: number;
    errors?: number;
    errorSample?: string;
    meta?: unknown;
  },
): Promise<void> {
  await db.query(
    `update pipeline_runs
     set finished_at = now(), ok = $2, rows_in = $3, rows_out = $4,
         errors = coalesce($5, 0), error_sample = $6,
         meta = coalesce($7::jsonb, meta)
     where id = $1`,
    [
      run.id,
      result.ok,
      result.rowsIn ?? null,
      result.rowsOut ?? null,
      result.errors ?? 0,
      result.errorSample?.slice(0, 2000) ?? null,
      result.meta === undefined ? null : JSON.stringify(result.meta),
    ],
  );
  const secs = ((Date.now() - run.startedAt) / 1000).toFixed(1);
  console.log(
    `[${run.job}] ${result.ok ? 'ok' : 'FAILED'} in ${secs}s ` +
      `in=${result.rowsIn ?? '-'} out=${result.rowsOut ?? '-'} errors=${result.errors ?? 0}`,
  );
}
