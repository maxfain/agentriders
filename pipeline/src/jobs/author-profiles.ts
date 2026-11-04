// Author profiles: the public profile fields a corpus page shows next to a
// person's own public pull request (docs/flight-log-corpus.md, Consent and
// footprint) — name, bio, company, website, social links and a ≤25-word
// excerpt of the profile README — from GraphQL user(login:), 25 per query.
//
// Scope: human accounts, not opted out, with at least one indexed flight.
// Backfill mode takes rows never fetched; --refresh re-fetches rows older
// than 30 days. Weekly and daily schedules in .github/workflows/.
//
// Identity: authors.login is rewritten on every enrichment and renames
// happen, so a login can now belong to a different account than the row's
// github_user_id. A node whose databaseId is not the row's id is discarded
// and the row cleared and stamped — nothing from someone else's profile may
// touch it. Every field is written from the response (null when absent,
// never kept from a previous fetch), and only while the row is not opted
// out: an opt-out racing this job wins.

import type { Db } from '../db.ts';
import { GraphqlClient, USER_BATCH, buildUserBatchQuery, parseUserNode } from '../github-graphql.ts';
import { readmeExcerpt } from '../text.ts';
import { required } from '../env.ts';
import { startRun, finishRun } from '../runlog.ts';
import { pgTextArray } from './load-aidev.ts';

const BIO_MAX = 160;

type Row = { id: number; login: string; github_user_id: number | string };

export type ProfileClient = Pick<GraphqlClient, 'request' | 'lastRemaining'>;

const WRITE_SQL = `
  update authors set
    name = nullif(trim($2), ''), bio = $3, company = $4, website_url = $5,
    social_urls = $6::text[], readme_excerpt = $7, profile_fetched_at = now()
  where id = $1 and opted_out is not true`;

const CLEAR_SQL = `
  update authors set
    name = null, bio = null, company = null, website_url = null,
    social_urls = '{}', readme_excerpt = null, profile_fetched_at = now()
  where id = $1 and opted_out is not true`;

export async function authorProfiles(
  db: Db,
  opts: { limit?: number; refresh?: boolean; client?: ProfileClient } = {},
): Promise<void> {
  const run = await startRun(db, opts.refresh ? 'refresh-authors' : 'author-profiles');
  const client: ProfileClient = opts.client ?? new GraphqlClient({ token: required('FLIGHTLOG_GITHUB_TOKEN') });
  let updated = 0;
  let cleared = 0;
  let mismatched = 0;
  let errors = 0;
  let errorSample: string | undefined;
  try {
    const rows = await db.query<Row>(
      `select a.id, a.login, a.github_user_id
       from authors a
       where a.is_bot is not true and a.opted_out is not true
         and exists (select 1 from flights f where f.author_id = a.id and f.index_ok)
         and ${opts.refresh ? "a.profile_fetched_at < now() - interval '30 days'" : 'a.profile_fetched_at is null'}
       order by a.id
       limit $1`,
      [opts.limit ?? 5000],
    );
    for (let i = 0; i < rows.length; i += USER_BATCH) {
      const batch = rows.slice(i, i + USER_BATCH);
      const result = await client.request(buildUserBatchQuery(batch.map((r) => r.login)));
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        try {
          const profile = parseUserNode(result.data?.[`u${j}`]);
          if (!profile || profile.databaseId !== Number(row.github_user_id)) {
            // Deleted or renamed account (NOT_FOUND), or a login now owned by
            // someone else: clear what an earlier fetch stored and stamp, so
            // the row stops queueing and shows the login alone.
            if (profile) mismatched++;
            else cleared++;
            errorSample ??= (result.errors ?? []).find((e) => e.path?.[0] === `u${j}`)?.message;
            await db.query(CLEAR_SQL, [row.id]);
            continue;
          }
          await db.query(WRITE_SQL, [
            row.id,
            profile.name,
            clampBio(profile.bio),
            profile.company,
            httpUrl(profile.websiteUrl),
            pgTextArray(profile.socialUrls),
            readmeExcerpt(profile.readmeText),
          ]);
          updated++;
        } catch (error) {
          errors++;
          errorSample ??= String(error);
        }
      }
      console.log(`  author profiles ${Math.min(i + USER_BATCH, rows.length)}/${rows.length}`);
    }
    await finishRun(db, run, {
      ok: true,
      rowsIn: rows.length,
      rowsOut: updated,
      errors,
      errorSample,
      meta: { cleared, mismatched, graphqlRemaining: client.lastRemaining },
    });
  } catch (error) {
    await finishRun(db, run, {
      ok: false,
      rowsOut: updated,
      errors: errors + 1,
      errorSample: String(error),
      meta: { cleared, mismatched, graphqlRemaining: client.lastRemaining },
    });
    throw error;
  }
}

/** Bio as GitHub shows it, cut at a word within 160 code points. */
export function clampBio(bio: string | null): string | null {
  if (!bio) return null;
  const text = bio.replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= BIO_MAX) return text || null;
  let cut = chars.slice(0, BIO_MAX - 1).join('');
  const space = cut.lastIndexOf(' ');
  if (space >= BIO_MAX / 2) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:—–-]+$/u, '')}…`;
}

/**
 * GitHub's websiteUrl is free text ("example.com" is common): an http(s) URL
 * out, https assumed when the scheme is missing, anything else dropped.
 */
export function httpUrl(value: string | null): string | null {
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}
