// Nightly 02:00 UTC: re-enrich open flights older than a day, plus anything
// discovery flagged (enriched_at cleared) and claimed-but-never-enriched
// long-tail flights (brief, Pipeline step 9).

import type { Db } from '../db.ts';
import { enrich } from './enrich.ts';

export async function refreshOpen(db: Db, opts: { limit?: number } = {}): Promise<void> {
  await enrich(db, { limit: opts.limit ?? 3000, includeOpenOlderThanDays: 1 });
}
