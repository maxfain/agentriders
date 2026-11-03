// Repo metadata through GraphQL, 50 repos per query by alias (brief, step 3).
// Backfill mode fills repos that have flights but no fetched_at; weekly mode
// (onlyIndexed) refreshes repos that currently have indexed flights.

import type { Db } from '../db.ts';
import { GraphqlClient, buildRepoBatchQuery } from '../github-graphql.ts';
import { required } from '../env.ts';
import { startRun, finishRun } from '../runlog.ts';

type RepoRow = { id: number; owner: string; name: string };

export async function repoMetadata(
  db: Db,
  opts: { limit?: number; onlyIndexed?: boolean; client?: GraphqlClient } = {},
): Promise<void> {
  const run = await startRun(db, opts.onlyIndexed ? 'refresh-repos' : 'repo-metadata');
  const client = opts.client ?? new GraphqlClient({ token: required('FLIGHTLOG_GITHUB_TOKEN') });
  let updated = 0;
  let errors = 0;
  let errorSample: string | undefined;
  try {
    const repos = await db.query<RepoRow>(
      opts.onlyIndexed
        ? `select r.id, r.owner, r.name from repos r
           where r.excluded is not true
             and exists (select 1 from flights f where f.repo_id = r.id and f.index_ok)
           order by r.id limit $1`
        : `select r.id, r.owner, r.name from repos r
           where r.fetched_at is null and r.excluded is not true
             and exists (select 1 from flights f where f.repo_id = r.id)
           order by r.id limit $1`,
      [opts.limit ?? 5000],
    );
    for (let i = 0; i < repos.length; i += 50) {
      const batch = repos.slice(i, i + 50);
      const result = await client.request(buildRepoBatchQuery(batch));
      for (let j = 0; j < batch.length; j++) {
        const node = result.data?.[`r${j}`] as {
          databaseId: number | null;
          stargazerCount: number;
          isFork: boolean;
          primaryLanguage: { name: string } | null;
          licenseInfo: { spdxId: string } | null;
        } | null;
        if (!node) {
          errors++;
          errorSample ??= (result.errors ?? []).find((e) => e.path?.[0] === `r${j}`)?.message;
          // Gone repos still get a fetched_at so they stop re-queueing.
          await db.query('update repos set fetched_at = now() where id = $1', [batch[j].id]);
          continue;
        }
        await db.query(
          `update repos set github_repo_id = coalesce($2, github_repo_id), stars = $3,
             primary_language = $4, license = $5, is_fork = $6, fetched_at = now()
           where id = $1`,
          [
            batch[j].id,
            node.databaseId,
            node.stargazerCount,
            node.primaryLanguage?.name ?? null,
            node.licenseInfo?.spdxId ?? null,
            node.isFork,
          ],
        );
        updated++;
      }
      console.log(`  repo metadata ${Math.min(i + 50, repos.length)}/${repos.length}`);
    }
    await finishRun(db, run, {
      ok: true,
      rowsIn: repos.length,
      rowsOut: updated,
      errors,
      errorSample,
      meta: { graphqlRemaining: client.lastRemaining },
    });
  } catch (error) {
    await finishRun(db, run, { ok: false, rowsOut: updated, errors: errors + 1, errorSample: String(error) });
    throw error;
  }
}
