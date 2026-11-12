// The sponsors job against a real Postgres (PGlite) and a fake GitHub:
// breadth-first expansion and the hop limit, roots from the catalog and
// FUNDING.yml, pagination and the page cap, identity (renames, not found),
// edge deactivation, opt-out, and the page/admin reads built on the graph
// (docs/flight-log-corpus.md, Sponsors graph).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { wrapPglite, migrate, type Db } from '../src/db.ts';
import {
  ACCOUNT_BATCH,
  buildAccountBatchQuery,
  githubLoginFromFundingUrl,
  parseAccountNode,
} from '../src/github-graphql.ts';
import { sponsorsJob, sponsorsDryRun, parseSeeds, type SponsorsClient } from '../src/jobs/sponsors.ts';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function freshDb(): Promise<Db> {
  const db = wrapPglite(new PGlite());
  await migrate(db, MIGRATIONS);
  return db;
}

// --- a fake GitHub -------------------------------------------------------------

type FakeAccount = {
  id: number;
  kind?: 'User' | 'Organization';
  listing?: boolean;
  desc?: string;
  sponsors?: string[];
  sponsoring?: string[];
  repos?: { name: string; stars: number; topics?: string[] }[];
};
type FakeRepo = { owner: string; funding?: { platform: string; url: string }[] };

class FakeGithub {
  accounts: Record<string, FakeAccount>;
  repos: Record<string, FakeRepo>;
  pageSize: number;
  queries: string[] = [];

  constructor(accounts: Record<string, FakeAccount>, repos: Record<string, FakeRepo> = {}, pageSize = 100) {
    this.accounts = accounts;
    this.repos = repos;
    this.pageSize = pageSize;
  }

  find(login: string): [string, FakeAccount] | undefined {
    const key = Object.keys(this.accounts).find((k) => k.toLowerCase() === login.toLowerCase());
    return key ? [key, this.accounts[key]] : undefined;
  }

  neighbor(login: string) {
    const hit = this.find(login);
    if (!hit) throw new Error(`fake: unknown neighbour ${login}`);
    const [name, a] = hit;
    return { __typename: a.kind ?? 'User', login: name, databaseId: a.id, hasSponsorsListing: !!a.listing };
  }

  page(list: string[], offset: number) {
    const slice = list.slice(offset, offset + this.pageSize);
    const next = offset + this.pageSize < list.length;
    return {
      totalCount: list.length,
      pageInfo: { hasNextPage: next, endCursor: next ? String(offset + this.pageSize) : null },
      nodes: slice.map((l) => this.neighbor(l)),
    };
  }

  client(): SponsorsClient & { queries: string[] } {
    const self = this;
    return {
      queries: this.queries,
      lastRemaining: 4999,
      async request(query: string) {
        self.queries.push(query);
        const data: Record<string, unknown> = { rateLimit: { remaining: 4999, resetAt: '2026-01-01T00:00:00Z', cost: 1 } };
        const errors: { type: string; path: string[]; message: string }[] = [];
        for (const m of query.matchAll(/a(\d+): repositoryOwner\(login: "([^"]+)"\)/g)) {
          const hit = self.find(m[2]);
          if (!hit) {
            data[`a${m[1]}`] = null;
            errors.push({ type: 'NOT_FOUND', path: [`a${m[1]}`], message: `Could not resolve to a RepositoryOwner with the login of '${m[2]}'.` });
            continue;
          }
          const [name, a] = hit;
          data[`a${m[1]}`] = {
            __typename: a.kind ?? 'User',
            login: name,
            databaseId: a.id,
            hasSponsorsListing: !!a.listing,
            sponsorsListing: a.listing ? { shortDescription: a.desc ?? null } : null,
            sponsors: self.page(a.sponsors ?? [], 0),
            sponsoring: self.page(a.sponsoring ?? [], 0),
            repositories: {
              nodes: (a.repos ?? []).map((r) => ({
                nameWithOwner: `${name}/${r.name}`,
                stargazerCount: r.stars,
                description: null,
                repositoryTopics: { nodes: (r.topics ?? []).map((t) => ({ topic: { name: t } })) },
              })),
            },
          };
        }
        const page = query.match(/o: repositoryOwner\(login: "([^"]+)"\)/);
        if (page) {
          const conn = query.match(/(sponsors|sponsoring)\(first: 100, after: "(\d+)"\)/)!;
          const hit = self.find(page[1]);
          if (!hit) data.o = null;
          else {
            const [, a] = hit;
            const field = conn[1] as 'sponsors' | 'sponsoring';
            data.o = { __typename: a.kind ?? 'User', databaseId: a.id, [field]: self.page(a[field] ?? [], Number(conn[2])) };
          }
        }
        for (const m of query.matchAll(/r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)) {
          const repo = self.repos[`${m[2]}/${m[3]}`];
          if (!repo) {
            data[`r${m[1]}`] = null;
            errors.push({ type: 'NOT_FOUND', path: [`r${m[1]}`], message: 'Could not resolve to a Repository.' });
            continue;
          }
          const owner = self.find(repo.owner);
          data[`r${m[1]}`] = {
            nameWithOwner: `${m[2]}/${m[3]}`,
            owner: owner
              ? { __typename: owner[1].kind ?? 'User', login: owner[0], databaseId: owner[1].id }
              : { __typename: 'User', login: repo.owner, databaseId: null },
            fundingLinks: repo.funding ?? [],
          };
        }
        return { data, errors: errors.length ? errors : undefined };
      },
    };
  }
}

// --- fixtures ----------------------------------------------------------------

let nextAuthorId = 9_000_000;
async function catalogRepo(db: Db, fullName: string): Promise<number> {
  const [repo] = await db.query<{ id: number }>(
    `insert into repos (full_name, stars) values ($1, 500) returning id`,
    [fullName],
  );
  const [author] = await db.query<{ id: number }>(
    'insert into authors (github_user_id, login) values ($1, $2) returning id',
    [nextAuthorId, `pilot${nextAuthorId++}`],
  );
  await db.query(
    `insert into flights (repo_id, author_id, number, agent, confidence, state, source, index_ok)
     values ($1, $2, 1, 'claude-code', 'high', 'merged', 'gharchive', true)`,
    [repo.id, author.id],
  );
  return Number(repo.id);
}

async function accounts(db: Db) {
  const rows = await db.query<{ login: string; depth: number; crawl_state: string; crawl_error: string | null; github_id: number }>(
    'select login, depth, crawl_state, crawl_error, github_id from gh_accounts order by login',
  );
  return Object.fromEntries(rows.map((r) => [r.login, r]));
}

async function edges(db: Db, activeOnly = true): Promise<string[]> {
  const rows = await db.query<{ e: string }>(
    `select s.login || '>' || m.login as e
     from sponsorships x join gh_accounts s on s.id = x.sponsor_id join gh_accounts m on m.id = x.maintainer_id
     ${activeOnly ? 'where x.active' : ''} order by 1`,
  );
  return rows.map((r) => r.e);
}

const quiet = { maxMinutes: 5 };

// --- tests -------------------------------------------------------------------

test('query shape: aliases, both concrete fragments, rateLimit; parser keeps public fields only', () => {
  const q = buildAccountBatchQuery(['ArashTabrizi', 'unclecode']);
  assert.match(q, /a0: repositoryOwner\(login: "ArashTabrizi"\)/);
  assert.match(q, /a1: repositoryOwner\(login: "unclecode"\)/);
  assert.match(q, /fragment AccountUser on User/);
  assert.match(q, /fragment AccountOrg on Organization/);
  assert.match(q, /sponsoring\(first: 100\)/);
  assert.match(q, /rateLimit \{ remaining resetAt cost \}/);
  assert.equal(ACCOUNT_BATCH, 20);
  const parsed = parseAccountNode({
    __typename: 'User', login: 'x', databaseId: 7, hasSponsorsListing: true,
    sponsorsListing: { shortDescription: '  builds   things ' },
    sponsors: { totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{ __typename: 'User', login: 'y', databaseId: 8, hasSponsorsListing: false }, null, { __typename: 'Bot', login: 'z', databaseId: 9 }] },
    sponsoring: null,
    repositories: { nodes: [{ nameWithOwner: 'x/r', stargazerCount: 3, description: 'd', repositoryTopics: { nodes: [{ topic: { name: 'llm' } }] } }] },
  });
  assert.equal(parsed?.listingShortDescription, 'builds things');
  assert.deepEqual(parsed?.sponsors.nodes.map((n) => n.login), ['y']);
  assert.equal(parsed?.sponsoring.totalCount, 0);
  assert.deepEqual(parsed?.topRepos, [{ name_with_owner: 'x/r', stars: 3, description: 'd', topics: ['llm'] }]);
  assert.equal(parseAccountNode({ __typename: 'User', login: 'ghost' }), null);
});

test('funding URLs map to logins; seeds are validated and de-duplicated', () => {
  assert.equal(githubLoginFromFundingUrl('https://github.com/unclecode'), 'unclecode');
  assert.equal(githubLoginFromFundingUrl('https://github.com/sponsors/unclecode'), 'unclecode');
  assert.equal(githubLoginFromFundingUrl('https://patreon.com/x'), null);
  assert.equal(githubLoginFromFundingUrl('not a url'), null);
  assert.deepEqual(parseSeeds('@ArashTabrizi, unclecode arashtabrizi bad/login'), ['ArashTabrizi', 'unclecode']);
});

test('breadth-first from a seed, both directions, stops at the hop limit; a deeper run continues', async () => {
  const db = await freshDb();
  const gh = new FakeGithub({
    ArashTabrizi: { id: 1, sponsoring: ['unclecode'] },
    unclecode: { id: 2, listing: true, desc: 'crawl4ai', sponsors: ['ArashTabrizi', 'bob'] },
    bob: { id: 3, sponsoring: ['unclecode', 'carol'] },
    carol: { id: 4, listing: true, sponsors: ['bob', 'dave'] },
    dave: { id: 5, sponsoring: ['carol'] },
  });
  await sponsorsJob(db, { ...quiet, seeds: ['ArashTabrizi'], maxDepth: 3, client: gh.client() });
  let acc = await accounts(db);
  assert.deepEqual(
    Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, [v.depth, v.crawl_state]])),
    { ArashTabrizi: [0, 'done'], unclecode: [1, 'done'], bob: [2, 'done'], carol: [3, 'queued'] },
  );
  assert.deepEqual(await edges(db), ['ArashTabrizi>unclecode', 'bob>carol', 'bob>unclecode']);
  const [seed] = await db.query<{ is_seed: boolean }>("select is_seed from gh_accounts where login = 'ArashTabrizi'");
  assert.equal(seed.is_seed, true);
  const [carol] = await db.query<{ has_sponsors_listing: boolean }>("select has_sponsors_listing from gh_accounts where login = 'carol'");
  assert.equal(carol.has_sponsors_listing, true, 'a leaf still knows it is sponsorable');
  const [run] = await db.query<{ ok: boolean; meta: { leaves: number; pending: number; stoppedBy: string } }>(
    "select ok, meta from pipeline_runs where job = 'sponsors' order by id desc limit 1",
  );
  assert.equal(run.ok, true);
  assert.equal(run.meta.leaves, 1);
  assert.equal(run.meta.stoppedBy, 'queue_empty');

  await sponsorsJob(db, { ...quiet, maxDepth: 4, client: gh.client() });
  acc = await accounts(db);
  assert.equal(acc.carol.crawl_state, 'done');
  assert.equal(acc.dave.depth, 4);
  assert.deepEqual(await edges(db), ['ArashTabrizi>unclecode', 'bob>carol', 'bob>unclecode', 'dave>carol']);
  await db.end();
});

test('max-accounts stops the run and the next run picks up the queue', async () => {
  const db = await freshDb();
  const gh = new FakeGithub({
    root: { id: 1, sponsoring: ['m1', 'm2', 'm3'] },
    m1: { id: 2, listing: true, sponsors: ['root'] },
    m2: { id: 3, listing: true, sponsors: ['root'] },
    m3: { id: 4, listing: true, sponsors: ['root'] },
  });
  const first = await sponsorsJob(db, { ...quiet, seeds: ['root'], maxDepth: 2, maxAccounts: 2, client: gh.client() });
  assert.equal(first.expanded, 2);
  const [run] = await db.query<{ meta: { stoppedBy: string; pending: number } }>(
    "select meta from pipeline_runs where job = 'sponsors' order by id desc limit 1",
  );
  assert.equal(run.meta.stoppedBy, 'max_accounts');
  assert.equal(run.meta.pending, 2);
  await sponsorsJob(db, { ...quiet, maxDepth: 2, client: gh.client() });
  const acc = await accounts(db);
  assert.deepEqual(Object.values(acc).map((a) => a.crawl_state), ['done', 'done', 'done', 'done']);
  await db.end();
});

test('pagination follows cursors up to the page cap; a truncated read deactivates nothing', async () => {
  const db = await freshDb();
  const gh = new FakeGithub(
    {
      hub: { id: 1, listing: true, sponsors: ['s1', 's2', 's3', 's4', 's5'] },
      s1: { id: 11 }, s2: { id: 12 }, s3: { id: 13 }, s4: { id: 14 }, s5: { id: 15 },
    },
    {},
    2,
  );
  await sponsorsJob(db, { ...quiet, seeds: ['hub'], maxDepth: 1, maxPages: 2, client: gh.client() });
  let [hub] = await db.query<{ sponsors_count: number; sponsors_truncated: boolean }>(
    "select sponsors_count, sponsors_truncated from gh_accounts where login = 'hub'",
  );
  assert.equal(hub.sponsors_count, 5);
  assert.equal(hub.sponsors_truncated, true);
  assert.equal((await edges(db)).length, 4);

  // The hub drops s1 and s2 but the read is still truncated: nothing deactivates.
  gh.accounts.hub.sponsors = ['s3', 's4', 's5', 's6', 's7', 's8'];
  gh.accounts.s6 = { id: 16 }; gh.accounts.s7 = { id: 17 }; gh.accounts.s8 = { id: 18 };
  await db.query("update gh_accounts set fetched_at = now() - interval '40 days'");
  await sponsorsJob(db, { ...quiet, maxDepth: 1, maxPages: 2, refresh: true, client: gh.client() });
  assert.ok((await edges(db)).includes('s1>hub'));

  // A complete read does deactivate the ones no longer listed.
  await db.query("update gh_accounts set fetched_at = now() - interval '40 days'");
  await sponsorsJob(db, { ...quiet, maxDepth: 1, maxPages: 10, refresh: true, client: gh.client() });
  [hub] = await db.query("select sponsors_count, sponsors_truncated from gh_accounts where login = 'hub'");
  assert.equal(hub.sponsors_truncated, false);
  assert.deepEqual(await edges(db), ['s3>hub', 's4>hub', 's5>hub', 's6>hub', 's7>hub', 's8>hub']);
  assert.ok((await edges(db, false)).includes('s1>hub'), 'inactive edges are kept, not deleted');
  await db.end();
});

test('identity: a reassigned login stamps the old row; a missing account is stamped not_found', async () => {
  const db = await freshDb();
  await db.query(
    `insert into gh_accounts (github_id, login, depth, crawl_state) values
       (500, 'oldname', 0, 'queued'), (501, 'ghost', 0, 'queued')`,
  );
  const gh = new FakeGithub({ oldname: { id: 777, listing: true } });
  const stats = await sponsorsJob(db, { ...quiet, maxDepth: 2, client: gh.client() });
  assert.equal(stats.renamed, 1);
  assert.equal(stats.notFound, 1);
  const rows = await db.query<{ github_id: number; login: string; crawl_state: string; crawl_error: string | null }>(
    'select github_id, login, crawl_state, crawl_error from gh_accounts order by github_id',
  );
  assert.deepEqual(rows.map((r) => [Number(r.github_id), r.login, r.crawl_state, r.crawl_error]), [
    [500, 'oldname', 'error', 'login_reassigned'],
    [501, 'ghost', 'error', 'not_found'],
    [777, 'oldname', 'done', null],
  ]);
  await db.end();
});

test('catalog roots, FUNDING.yml, repo page block, related repos and discovery', async () => {
  const db = await freshDb();
  const widget = await catalogRepo(db, 'acme/widget');
  await catalogRepo(db, 'beta/tool');
  const gh = new FakeGithub(
    {
      acme: { id: 100, kind: 'Organization', listing: true, sponsors: ['s1', 's2'] },
      alice: { id: 101, listing: true, sponsors: ['s2', 's3'] },
      beta: { id: 102, listing: true, sponsors: ['s1', 's2', 's3'] },
      s1: { id: 201, sponsoring: ['acme', 'beta', 'outsider'] },
      s2: { id: 202, sponsoring: ['acme', 'alice', 'beta', 'outsider'] },
      s3: { id: 203, sponsoring: ['alice', 'beta'] },
      outsider: { id: 300, listing: true, sponsors: ['s1', 's2'], repos: [{ name: 'agent-kit', stars: 900, topics: ['ai-agents'] }] },
    },
    {
      'acme/widget': {
        owner: 'acme',
        funding: [
          { platform: 'GITHUB', url: 'https://github.com/alice' },
          { platform: 'CUSTOM', url: 'https://acme.example/donate' },
          { platform: 'CUSTOM', url: 'javascript:alert(1)' },
        ],
      },
      'beta/tool': { owner: 'beta' },
    },
  );
  const stats = await sponsorsJob(db, { ...quiet, maxDepth: 3, client: gh.client() });
  assert.equal(stats.fundingRepos, 2);
  assert.equal(stats.fundingLinks, 2, 'non-http links are dropped');
  const acc = await accounts(db);
  assert.equal(acc.acme.depth, 0);
  assert.equal(acc.alice.depth, 0);
  assert.equal(acc.s1.depth, 1);
  assert.equal(acc.outsider.depth, 2);
  assert.equal(acc.outsider.crawl_state, 'done');

  const [{ page }] = await db.query<{ page: any }>("select repo_sponsors('acme', 'widget') as page");
  assert.deepEqual(page.maintainers.map((m: any) => [m.login, m.is_owner, m.sponsors_url]), [
    ['acme', true, 'https://github.com/sponsors/acme'],
    ['alice', false, 'https://github.com/sponsors/alice'],
  ]);
  assert.deepEqual(page.funding.map((f: any) => f.url), ['https://acme.example/donate', 'https://github.com/alice']);
  assert.deepEqual(page.sponsors.map((s: any) => s.login).sort(), ['s1', 's2', 's3']);
  assert.equal(page.sponsors_total, 3);
  assert.deepEqual(page.related.map((r: any) => [r.full_name, r.shared_sponsors]), [['beta/tool', 3]]);

  const [{ d }] = await db.query<{ d: any }>('select sponsor_discovery(10) as d');
  assert.deepEqual(d.candidates.map((c: any) => [c.login, c.shared_sponsors, c.topic_hits]), [['outsider', 2, 1]]);
  assert.equal(d.totals.catalog_maintainers, 3);

  // Approving a candidate makes it a root for the next run.
  await db.query("select set_discovery_status('outsider', 'approved')");
  const [o] = await db.query<{ is_seed: boolean; depth: number; crawl_state: string }>(
    "select is_seed, depth, crawl_state from gh_accounts where login = 'outsider'",
  );
  assert.deepEqual([o.is_seed, o.depth, o.crawl_state], [true, 0, 'queued']);
  await db.query("select set_discovery_status('outsider', 'dismissed')");
  const [{ d: d2 }] = await db.query<{ d: any }>('select sponsor_discovery(10) as d');
  assert.equal(d2.candidates.length, 0);

  // The author byline gains the Sponsors link by numeric id.
  await db.query("insert into authors (github_user_id, login) values (101, 'alice')");
  const [{ a }] = await db.query<{ a: any }>("select author_page('alice') as a");
  assert.equal(a.author.sponsors_url, 'https://github.com/sponsors/alice');

  // A taken-down repo shows nothing.
  await db.query('update repos set excluded = true where id = $1', [widget]);
  const [{ gone }] = await db.query<{ gone: any }>("select repo_sponsors('acme', 'widget') as gone");
  assert.deepEqual(gone, { gone: true });
  await db.end();
});

test('opt-out: hidden on the next read, never expanded, no new edges, even when never seen before', async () => {
  const db = await freshDb();
  await catalogRepo(db, 'acme/widget');
  const gh = new FakeGithub(
    {
      acme: { id: 100, listing: true, sponsors: ['s1', 's2', 'quiet'] },
      s1: { id: 201, sponsoring: ['acme'] },
      s2: { id: 202, sponsoring: ['acme'] },
      quiet: { id: 999, sponsoring: ['acme', 'elsewhere'] },
      elsewhere: { id: 998, listing: true },
    },
    { 'acme/widget': { owner: 'acme' } },
  );
  // Opted out before the crawler ever saw them (through the existing button).
  await db.query('select opt_out_author(999, true)');
  await sponsorsJob(db, { ...quiet, maxDepth: 3, client: gh.client() });
  const acc = await accounts(db);
  assert.equal(acc['opted-out-999'].crawl_state, 'done', 'placeholder row is untouched');
  assert.equal(acc.elsewhere, undefined, 'never expanded, so its sponsoring is never read');
  assert.ok(!(await edges(db, false)).some((e) => e.startsWith('opted-out-999')));

  // Opting out later hides them on the next read, without a crawl.
  let [{ page }] = await db.query<{ page: any }>("select repo_sponsors('acme', 'widget') as page");
  assert.deepEqual(page.sponsors.map((s: any) => s.login).sort(), ['s1', 's2']);
  await db.query('select opt_out_author(201, true)');
  [{ page }] = await db.query<{ page: any }>("select repo_sponsors('acme', 'widget') as page");
  assert.deepEqual(page.sponsors.map((s: any) => s.login), ['s2']);
  assert.equal(page.sponsors_total, 1);

  // Opting back in re-queues the account.
  await db.query('select opt_out_author(201, false)');
  const [s1] = await db.query<{ opted_out: boolean; crawl_state: string }>(
    'select opted_out, crawl_state from gh_accounts where github_id = 201',
  );
  assert.deepEqual([s1.opted_out, s1.crawl_state], [false, 'queued']);
  await db.end();
});

test('a query-level failure fails the run loudly instead of stamping every account', async () => {
  const db = await freshDb();
  await db.query("insert into gh_accounts (github_id, login, depth, crawl_state) values (1, 'a', 0, 'queued')");
  const client: SponsorsClient = {
    lastRemaining: null,
    async request() {
      return { errors: [{ message: "Field 'sponsoring' doesn't exist on type 'User'" }] };
    },
  };
  await assert.rejects(sponsorsJob(db, { ...quiet, maxDepth: 2, client }), /no data/);
  const [row] = await db.query<{ crawl_state: string }>("select crawl_state from gh_accounts where login = 'a'");
  assert.equal(row.crawl_state, 'queued');
  const [run] = await db.query<{ ok: boolean }>("select ok from pipeline_runs where job = 'sponsors'");
  assert.equal(run.ok, false);
  await db.end();
});

test('dry run prints the listing and both directions without a database', async () => {
  const gh = new FakeGithub({
    ArashTabrizi: { id: 1, sponsoring: ['unclecode'] },
    unclecode: { id: 2, listing: true, desc: 'crawl4ai', sponsors: ['ArashTabrizi'] },
  });
  const lines: string[] = [];
  const out = await sponsorsDryRun(['ArashTabrizi', 'unclecode', 'nobody'], { client: gh.client(), log: (l) => lines.push(l) });
  assert.equal(out.length, 2);
  const text = lines.join('\n');
  assert.match(text, /ArashTabrizi \(User, id 1\)\n {2}sponsors listing: none/);
  assert.match(text, /sponsoring \(1 public\): unclecode/);
  assert.match(text, /sponsors listing: https:\/\/github.com\/sponsors\/unclecode — crawl4ai/);
  assert.match(text, /nobody: not found/);
});
