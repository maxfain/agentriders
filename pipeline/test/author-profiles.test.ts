// The author-profiles job against a real Postgres (PGlite) and a fake GraphQL
// client: identity check, clearing, stamping, scope, refresh, and the
// opt-out race (docs/flight-log-corpus.md, Consent and footprint).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { wrapPglite, migrate, type Db } from '../src/db.ts';
import { USER_BATCH, buildUserBatchQuery, parseUserNode } from '../src/github-graphql.ts';
import { authorProfiles, clampBio, httpUrl, type ProfileClient } from '../src/jobs/author-profiles.ts';

let db: Db;

before(async () => {
  db = wrapPglite(new PGlite());
  await migrate(db, join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations'));
});
after(async () => {
  await db.end();
});

async function author(githubId: number, login: string, over: { is_bot?: boolean; opted_out?: boolean } = {}): Promise<number> {
  const [row] = await db.query<{ id: number }>(
    'insert into authors (github_user_id, login, is_bot, opted_out) values ($1, $2, $3, $4) returning id',
    [githubId, login, over.is_bot ?? false, over.opted_out ?? false],
  );
  return Number(row.id);
}

async function indexedFlight(authorId: number, number: number): Promise<void> {
  const [repo] = await db.query<{ id: number }>(
    `insert into repos (full_name, stars) values ('acme/widget', 500)
     on conflict (full_name_lower) do update set stars = excluded.stars returning id`,
  );
  await db.query(
    `insert into flights (repo_id, author_id, number, agent, confidence, state, source, index_ok)
     values ($1, $2, $3, 'claude-code', 'high', 'merged', 'gharchive', true)`,
    [repo.id, authorId, number],
  );
}

type Node = Record<string, unknown> | undefined;

/** Answers each alias from `nodes` by login; an absent login is a NOT_FOUND path error. */
function fakeClient(nodes: Record<string, Node>, onRequest?: () => Promise<void>) {
  const queries: string[] = [];
  const client: ProfileClient & { queries: string[] } = {
    queries,
    lastRemaining: 4990,
    async request(query: string) {
      queries.push(query);
      if (onRequest) await onRequest();
      const data: Record<string, unknown> = { rateLimit: { remaining: 4990, resetAt: '2026-01-01T00:00:00Z', cost: 5 } };
      const errors: { message: string; path: string[]; type: string }[] = [];
      for (const m of query.matchAll(/u(\d+): user\(login: "([^"]+)"\)/g)) {
        const node = nodes[m[2]];
        data[`u${m[1]}`] = node ?? null;
        if (!node) errors.push({ type: 'NOT_FOUND', path: [`u${m[1]}`], message: `Could not resolve to a User with the login of '${m[2]}'.` });
      }
      return { data, errors };
    },
  };
  return client;
}

const profile = (databaseId: number, login: string, over: Record<string, unknown> = {}) => ({
  databaseId, login, name: ' Good Person ', bio: 'Builds sandboxes for agents', company: '@acme',
  websiteUrl: 'good.example',
  socialAccounts: { nodes: [{ provider: 'TWITTER', url: 'https://x.com/good' }, { provider: 'GENERIC', url: 'http://insecure.example' }] },
  repository: { object: {
    text: '# Hi there 👋\n\n[![ci](https://img.example/ci.svg)](https://ci.example)\n\nI build **sandboxes** for agents at [Acme](https://acme.example).\n\nMore below.\n',
    byteSize: 140, isTruncated: false, isBinary: false,
  } },
  ...over,
});

test('buildUserBatchQuery and parseUserNode: the fields, the README guard, https-only socials', () => {
  const q = buildUserBatchQuery(['octocat', 'o"quote']);
  assert.ok(q.includes('u0: user(login: "octocat")'));
  assert.ok(q.includes('u1: user(login: "o\\"quote")'));
  assert.ok(q.includes('repository(name: "octocat")'));
  assert.ok(q.includes('object(expression: "HEAD:README.md")'));
  assert.ok(q.includes('rateLimit { remaining resetAt cost }'));
  assert.equal(USER_BATCH, 25);

  assert.equal(parseUserNode(null), null);
  const p = parseUserNode(profile(1, 'good'))!;
  assert.equal(p.databaseId, 1);
  assert.equal(p.name, 'Good Person');
  assert.deepEqual(p.socialUrls, ['https://x.com/good']);
  assert.ok(p.readmeText?.includes('sandboxes'));
  assert.equal(parseUserNode(profile(1, 'g', { repository: { object: { text: 'x', byteSize: 200_000, isTruncated: false, isBinary: false } } }))!.readmeText, null);
  assert.equal(parseUserNode(profile(1, 'g', { repository: { object: { text: 'x', byteSize: 10, isTruncated: true, isBinary: false } } }))!.readmeText, null);
  assert.equal(parseUserNode(profile(1, 'g', { repository: null }))!.readmeText, null);
  assert.equal(parseUserNode(profile(1, 'g', { name: '   ', bio: null }))!.name, null);
});

test('clampBio and httpUrl', () => {
  assert.equal(clampBio(null), null);
  assert.equal(clampBio('  short  bio '), 'short bio');
  const long = clampBio('word '.repeat(60))!;
  assert.ok(Array.from(long).length <= 160 && long.endsWith('…'), long);
  assert.equal(httpUrl('good.example'), 'https://good.example/');
  assert.equal(httpUrl('https://good.example/me'), 'https://good.example/me');
  assert.equal(httpUrl('http://plain.example'), 'http://plain.example/');
  assert.equal(httpUrl('javascript:alert(1)'), null);
  assert.equal(httpUrl('ftp://files.example'), null);
  assert.equal(httpUrl('localhost'), null);
  assert.equal(httpUrl(''), null);
});

test('author-profiles: scope, identity check, clearing, stamping, run log', async () => {
  const good = await author(1001, 'good');
  const swapped = await author(1002, 'swapped');
  const missing = await author(1003, 'missing');
  const opted = await author(1004, 'opted', { opted_out: true });
  const bot = await author(1005, 'bot-user', { is_bot: true });
  await author(1006, 'noflight');
  await indexedFlight(good, 1);
  await indexedFlight(swapped, 2);
  await indexedFlight(missing, 3);
  await indexedFlight(opted, 4);
  await indexedFlight(bot, 5);
  // A stale name from an earlier fetch on the row whose login now belongs to someone else.
  await db.query("update authors set name = 'Old Name' where login = 'swapped'");

  const client = fakeClient({
    good: profile(1001, 'good'),
    swapped: profile(9999, 'swapped', { name: 'Someone Else' }),
  });
  await authorProfiles(db, { client });

  assert.equal(client.queries.length, 1);
  for (const login of ['good', 'swapped', 'missing']) assert.ok(client.queries[0].includes(`"${login}"`), login);
  for (const login of ['opted', 'bot-user', 'noflight']) assert.ok(!client.queries[0].includes(`"${login}"`), login);

  const rows = await db.query<Record<string, unknown>>(
    'select login, name, bio, company, website_url, social_urls, readme_excerpt, profile_fetched_at from authors order by github_user_id',
  );
  const by = Object.fromEntries(rows.map((r) => [r.login as string, r]));
  assert.equal(by.good.name, 'Good Person');
  assert.equal(by.good.bio, 'Builds sandboxes for agents');
  assert.equal(by.good.company, '@acme');
  assert.equal(by.good.website_url, 'https://good.example/');
  assert.deepEqual(Array.isArray(by.good.social_urls) ? by.good.social_urls : String(by.good.social_urls).replace(/[{}]/g, '').split(','), ['https://x.com/good']);
  assert.equal(by.good.readme_excerpt, 'I build sandboxes for agents at Acme.');
  assert.ok(by.good.profile_fetched_at);
  // Identity mismatch: nothing from the other account lands; the stale name is gone; stamped.
  assert.equal(by.swapped.name, null);
  assert.ok(by.swapped.profile_fetched_at);
  // NOT_FOUND: stamped so it stops queueing.
  assert.equal(by.missing.name, null);
  assert.ok(by.missing.profile_fetched_at);
  // Out of scope: untouched.
  for (const login of ['opted', 'bot-user', 'noflight']) assert.equal(by[login].profile_fetched_at, null, login);

  const [run] = await db.query<{ ok: boolean; rows_in: number; rows_out: number; meta: { cleared: number; mismatched: number } }>(
    "select ok, rows_in, rows_out, meta from pipeline_runs where job = 'author-profiles' order by id desc limit 1",
  );
  assert.equal(run.ok, true);
  assert.equal(Number(run.rows_in), 3);
  assert.equal(Number(run.rows_out), 1);
  assert.equal(run.meta.cleared, 1);
  assert.equal(run.meta.mismatched, 1);

  // A second default run finds nothing (everything is stamped).
  const again = fakeClient({});
  await authorProfiles(db, { client: again });
  assert.equal(again.queries.length, 0);

  // --refresh re-fetches only rows older than 30 days.
  await db.query("update authors set profile_fetched_at = now() - interval '40 days' where login = 'good'");
  const refresh = fakeClient({ good: profile(1001, 'good', { name: 'Renamed Person' }) });
  await authorProfiles(db, { client: refresh, refresh: true });
  assert.equal(refresh.queries.length, 1);
  assert.ok(refresh.queries[0].includes('"good"') && !refresh.queries[0].includes('"swapped"'));
  const [renamed] = await db.query<{ name: string }>("select name from authors where login = 'good'");
  assert.equal(renamed.name, 'Renamed Person');
});

test('author-profiles: an opt-out that lands mid-request wins — no field is written', async () => {
  const late = await author(2001, 'late');
  await indexedFlight(late, 6);
  const client = fakeClient({ late: profile(2001, 'late', { name: 'Too Late' }) }, async () => {
    await db.query('select opt_out_author(2001, true)');
  });
  await authorProfiles(db, { client });
  const [row] = await db.query<{ name: string | null; opted_out: boolean; profile_fetched_at: string | null }>(
    "select name, opted_out, profile_fetched_at from authors where login = 'late'",
  );
  assert.equal(row.opted_out, true);
  assert.equal(row.name, null);
  assert.ok(row.profile_fetched_at, 'opt-out stamps the row so the job never re-fetches');
});
