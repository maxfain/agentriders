// Bulk outcome classification. Set-based SQL mirroring src/classify.ts
// exactly (a unit test keeps the two in lockstep). Only flights whose
// engagement fields are known (pop detail or enrichment) are classified —
// a long-tail core row stays unclassified (and so unindexed) until a claim
// triggers its enrichment.

import type { Db } from '../db.ts';
import { STALE_DAYS } from '../classify.ts';
import { startRun, finishRun } from '../runlog.ts';

export const CLASSIFY_SQL = `
update flights set outcome = computed.outcome, classified_at = now()
from (
  select id, case
    when state = 'merged' and (coalesce(change_requests,0) >= 1
                               or coalesce(commits_after_first_review,0) >= 2)
      then 'merged_after_rework'
    when state = 'merged' then 'merged_clean'
    when state = 'closed' and (coalesce(human_review_count,0) >= 1
                               or coalesce(human_comment_count,0) >= 1)
      then 'burn'
    when state = 'closed' then 'abandoned'
    when opened_at is not null and opened_at < now() - interval '${STALE_DAYS} days'
      then 'stale'
    else 'open'
  end as outcome
  from flights
  where human_review_count is not null
) computed
where flights.id = computed.id
  and flights.outcome is distinct from computed.outcome`;

export async function classifyJob(db: Db): Promise<void> {
  const run = await startRun(db, 'classify');
  try {
    const eligible = await db.query<{ n: number }>(
      'select count(*)::integer as n from flights where human_review_count is not null',
    );
    const changed = await db.query(CLASSIFY_SQL + ' returning 1');
    await finishRun(db, run, { ok: true, rowsIn: Number(eligible[0].n), rowsOut: changed.length });
  } catch (error) {
    await finishRun(db, run, { ok: false, errors: 1, errorSample: String(error) });
    throw error;
  }
}
