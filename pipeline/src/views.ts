// Refresh the corpus materialized views — one client statement per view.
//
// The SQL function refresh_corpus_views() bundles every REFRESH ... CONCURRENTLY
// into a single server-side function, so the whole set executes as ONE client
// statement under one statement_timeout budget. Supabase's transaction pooler
// silently drops the connection-level statement_timeout we request (see db.ts),
// leaving the 2-minute database default in force, and the eight refreshes over
// ~930k flights outgrew it: the daily publish began failing with "canceling
// statement due to statement timeout". Issuing each refresh as its own
// autocommit statement gives every view a fresh timeout window (each refreshes
// in seconds). The views are independent aggregates of the base tables — no
// matview reads another — so refresh order does not matter; refreshing every
// materialized view in the public schema (all of which are corpus aggregates
// here) means a view added by a later migration is covered without editing
// this list. refresh_corpus_views() stays in the migrations for manual ops.

import type { Db } from './db.ts';

export async function refreshCorpusViews(db: Db): Promise<void> {
  const views = await db.query<{ name: string }>(
    "select matviewname as name from pg_matviews where schemaname = 'public' order by matviewname",
  );
  for (const { name } of views) {
    await db.query(`refresh materialized view concurrently "${name.replace(/"/g, '""')}"`);
  }
}
