// Verify (ad-hoc sweep): re-validate EVERY indexed flight's debrief the same
// way the publish spot-check validates its 30-row sample, and drop the failures
// from the index (debrief cleared, gate recomputed, views refreshed). The daily
// publish only samples 30, so residue accumulates; this sweeps it out in one
// pass. Idempotent and re-runnable; `--dry-run` reports without changing a row.

import type { Db } from '../db.ts';
import { CHECK_COLUMNS, type CheckRow, flightReasons } from '../debrief-check.ts';
import { refreshCorpusViews } from '../views.ts';
import { startRun, finishRun } from '../runlog.ts';

export async function verify(db: Db, opts: { apply?: boolean; batch?: number } = {}): Promise<void> {
  const apply = opts.apply ?? true;
  const batch = opts.batch ?? 2000;
  const run = await startRun(db, 'verify');
  try {
    const [{ n: total }] = await db.query<{ n: number }>(
      'select count(*)::integer as n from flights where index_ok',
    );
    console.log(`verify: ${total} indexed flights (${apply ? 'apply' : 'dry-run'})`);

    // Read every indexed flight once, paginated by id. The scan is read-only —
    // nothing is dropped until the whole pass is done — so the id cursor stays
    // stable even though index_ok changes at the end.
    const failures: number[] = [];
    let afterId = 0;
    let scanned = 0;
    for (;;) {
      const rows = await db.query<CheckRow>(
        `select ${CHECK_COLUMNS}
         from flights f join repos r on r.id = f.repo_id
         where f.index_ok and f.id > $1
         order by f.id limit $2`,
        [afterId, batch],
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        scanned++;
        const reasons = flightReasons(row);
        if (reasons.length > 0) {
          failures.push(row.id);
          console.log(`  FAIL ${row.owner}/${row.name}#${row.number} (id ${row.id}) — ${reasons.join('; ')}`);
        }
      }
      afterId = rows[rows.length - 1].id;
    }

    const rate = scanned ? ((failures.length / scanned) * 100).toFixed(1) : '0.0';
    console.log(`verify: ${failures.length}/${scanned} indexed flights fail re-validation (${rate}%)`);

    if (apply && failures.length > 0) {
      for (let i = 0; i < failures.length; i += 500) {
        const slice = failures.slice(i, i + 500);
        const placeholders = slice.map((_, k) => `$${k + 1}`).join(',');
        await db.query(
          `update flights set debrief = null, debrief_failed_at = now() where id in (${placeholders})`,
          slice,
        );
      }
      await db.query('select recompute_index_ok()');
      await db.query('analyze flights');
      await refreshCorpusViews(db);
      console.log(`verify: dropped ${failures.length} flight(s); index recomputed, views refreshed`);
    }

    await finishRun(db, run, {
      ok: true,
      rowsIn: scanned,
      rowsOut: apply ? failures.length : 0,
      errors: failures.length,
      errorSample:
        failures.length > 0 ? `${failures.length} flights failed re-validation (${rate}%)` : undefined,
      meta: { scanned, failed: failures.length, applied: apply },
    });
  } catch (error) {
    await finishRun(db, run, { ok: false, errors: 1, errorSample: String(error) });
    throw error;
  }
}
