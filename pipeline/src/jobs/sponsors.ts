// The GitHub Sponsors graph (docs/flight-log-corpus.md, Sponsors graph):
// who publicly sponsors whom, crawled breadth-first over the GraphQL API.
//
//   1. Funding: catalogued repos (≥1 indexed flight, not taken down) get their
//      FUNDING.yml links and owner identity, 50 per query. Owners become roots
//      (depth 0); FUNDING.yml GitHub accounts and --seed logins too.
//   2. Expand: queued accounts with depth < --max-depth, fewest hops first, 20
//      per query — listing, top repos, and both connections (`sponsors`, who
//      sponsors them; `sponsoring`, whom they sponsor), paged up to
//      --max-pages × 100. Every neighbour is stored at depth + 1 and queued;
//      a neighbour at the hop limit stays queued as a leaf until a deeper run.
//   3. Stop at --max-accounts or --max-minutes; the database is the
//      checkpoint, so the next run continues the queue. --refresh re-queues
//      accounts and funding fetched more than 30 days ago.
//
// Identity is the numeric id (logins are renamed and re-used): a login that
// now resolves to a different id marks the old row and the new account is
// stored as itself. Opt-out wins: an opted-out account is never expanded and
// no edge to or from it is written. Edges a complete read no longer lists
// become inactive; a truncated read (a hub past the page cap) deactivates
// nothing. No amounts, no emails — public sponsorships and public repos only.

import type { Db } from '../db.ts';
import {
  ACCOUNT_BATCH,
  FUNDING_BATCH,
  GraphqlClient,
  buildAccountBatchQuery,
  buildConnectionPageQuery,
  buildRepoFundingBatchQuery,
  parseAccountNode,
  parseFundingNode,
  parseSponsorConnection,
  type GraphqlResult,
  type SponsorAccount,
  type SponsorConnection,
  type SponsorConnectionField,
  type SponsorNeighbor,
} from '../github-graphql.ts';
import { avatarUrl } from '../agents.ts';
import { required } from '../env.ts';
import { startRun, finishRun } from '../runlog.ts';
import { pgTextArray } from './load-aidev.ts';

export type SponsorsClient = Pick<GraphqlClient, 'request' | 'lastRemaining'>;

export type SponsorsOptions = {
  seeds?: string[];
  maxDepth?: number;
  maxPages?: number;
  maxAccounts?: number;
  maxMinutes?: number;
  refresh?: boolean;
  fundingLimit?: number;
  client?: SponsorsClient;
  now?: () => number;
};

export const SPONSORS_DEFAULTS = { maxDepth: 3, maxPages: 10, maxAccounts: 5000, maxMinutes: 100 };
const REFRESH_DAYS = 30;

/** A classic no-scope PAT may be needed for Sponsors fields; fall back to the ingest token. */
export function sponsorsToken(): string {
  return process.env.SPONSORS_GITHUB_TOKEN || required('FLIGHTLOG_GITHUB_TOKEN');
}

export function parseSeeds(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[\s,]+/)) {
    const login = raw.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) continue;
    if (seen.has(login.toLowerCase())) continue;
    seen.add(login.toLowerCase());
    out.push(login);
  }
  return out;
}

type Stats = {
  fundingRepos: number;
  fundingLinks: number;
  resolved: number;
  expanded: number;
  notFound: number;
  renamed: number;
  skippedOptedOut: number;
  pages: number;
  truncated: number;
  deactivated: number;
  errors: number;
  errorSample?: string;
};

type QueueItem = { login: string; depth: number; rowId: number | null; githubId: number | null; seed: boolean };

/** Throws on a query-level failure (no data at all) so a schema or token problem fails the run loudly. */
function ensureData(result: GraphqlResult): Record<string, unknown> {
  if (!result.data) {
    throw new Error(`GraphQL returned no data: ${(result.errors ?? []).map((e) => e.message).join('; ').slice(0, 500)}`);
  }
  return result.data;
}

function aliasError(result: GraphqlResult, alias: string): { type?: string; message: string } | undefined {
  return (result.errors ?? []).find((e) => e.path?.[0] === alias);
}

/** Upsert neighbour stubs at `depth`; returns github id → row id for accounts not opted out. */
async function upsertStubs(db: Db, nodes: SponsorNeighbor[], depth: number): Promise<Map<number, number>> {
  const byId = new Map<number, SponsorNeighbor>();
  for (const n of nodes) byId.set(n.githubId, n);
  const out = new Map<number, number>();
  const unique = [...byId.values()];
  for (let i = 0; i < unique.length; i += 400) {
    const batch = unique.slice(i, i + 400);
    const params: unknown[] = [];
    const tuples = batch.map((n) => {
      params.push(n.githubId, n.login, n.kind, avatarUrl(n.githubId), n.hasSponsorsListing, depth);
      const b = params.length - 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::boolean, $${b + 6}::integer, 'queued')`;
    });
    // Every SET expression reads the old row, so the crawl_state case sees the
    // previous depth: an account already expanded at a deeper hop is re-queued
    // when found closer to a root, so its neighbours get the shorter path too.
    const rows = await db.query<{ id: number | string; github_id: number | string }>(
      `insert into gh_accounts (github_id, login, kind, avatar_url, has_sponsors_listing, depth, crawl_state)
       values ${tuples.join(',')}
       on conflict (github_id) do update set
         login = excluded.login,
         kind = excluded.kind,
         avatar_url = excluded.avatar_url,
         has_sponsors_listing = coalesce(excluded.has_sponsors_listing, gh_accounts.has_sponsors_listing),
         crawl_state = case when excluded.depth < gh_accounts.depth and gh_accounts.crawl_state = 'done'
                            then 'queued' else gh_accounts.crawl_state end,
         depth = least(gh_accounts.depth, excluded.depth)
       where gh_accounts.opted_out is not true
       returning id, github_id`,
      params,
    );
    for (const r of rows) out.set(Number(r.github_id), Number(r.id));
  }
  return out;
}

async function upsertEdges(db: Db, edges: [number, number][], ts: string): Promise<void> {
  const seen = new Set<string>();
  const unique = edges.filter(([s, m]) => {
    const key = `${s}:${m}`;
    if (s === m || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const params: unknown[] = [ts];
    const tuples = batch.map(([s, m]) => {
      params.push(s, m);
      return `($${params.length - 1}::bigint, $${params.length}::bigint, $1::timestamptz, $1::timestamptz, true)`;
    });
    await db.query(
      `insert into sponsorships (sponsor_id, maintainer_id, first_seen_at, last_seen_at, active)
       values ${tuples.join(',')}
       on conflict (sponsor_id, maintainer_id) do update set last_seen_at = excluded.last_seen_at, active = true`,
      params,
    );
  }
}

/** Make logins roots (depth 0). Returns the lowercased logins not yet in gh_accounts. */
async function promoteRoots(db: Db, logins: string[], seed: boolean): Promise<Set<string>> {
  if (logins.length === 0) return new Set();
  const lower = [...new Set(logins.map((l) => l.toLowerCase()))];
  const found = await db.query<{ login_lower: string }>(
    `update gh_accounts set
       is_seed = is_seed or $2,
       crawl_state = case when depth > 0 and crawl_state = 'done' then 'queued' else crawl_state end,
       depth = 0
     where login_lower = any($1::text[]) and opted_out is not true
     returning login_lower`,
    [pgTextArray(lower), seed],
  );
  // Opted-out rows are not updated but are known: never resolve them again.
  const optedOut = await db.query<{ login_lower: string }>(
    'select login_lower from gh_accounts where login_lower = any($1::text[]) and opted_out',
    [pgTextArray(lower)],
  );
  const known = new Set([...found, ...optedOut].map((r) => r.login_lower));
  return new Set(lower.filter((l) => !known.has(l)));
}

async function readConnection(
  client: SponsorsClient,
  login: string,
  field: SponsorConnectionField,
  first: SponsorConnection,
  maxPages: number,
  stats: Stats,
): Promise<{ nodes: SponsorNeighbor[]; complete: boolean }> {
  const nodes = [...first.nodes];
  let page = first;
  let pages = 1;
  while (page.hasNextPage && page.endCursor && pages < maxPages) {
    const result = await client.request(buildConnectionPageQuery(login, field, page.endCursor));
    const owner = ensureData(result).o as Record<string, unknown> | null;
    if (!owner) break;
    page = parseSponsorConnection(owner[field]);
    nodes.push(...page.nodes);
    pages++;
    stats.pages++;
  }
  return { nodes, complete: !page.hasNextPage };
}

async function storeAccount(
  db: Db,
  acc: SponsorAccount,
  item: QueueItem,
  truncated: boolean,
): Promise<number | null> {
  const rows = await db.query<{ id: number | string }>(
    `insert into gh_accounts (github_id, login, kind, avatar_url, has_sponsors_listing, listing_short_desc,
       sponsors_count, sponsoring_count, sponsors_truncated, top_repos, depth, is_seed, crawl_state, fetched_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, 'done', now())
     on conflict (github_id) do update set
       login = excluded.login, kind = excluded.kind, avatar_url = excluded.avatar_url,
       has_sponsors_listing = excluded.has_sponsors_listing,
       listing_short_desc = excluded.listing_short_desc,
       sponsors_count = excluded.sponsors_count, sponsoring_count = excluded.sponsoring_count,
       sponsors_truncated = excluded.sponsors_truncated, top_repos = excluded.top_repos,
       depth = least(gh_accounts.depth, excluded.depth),
       is_seed = gh_accounts.is_seed or excluded.is_seed,
       crawl_state = 'done', crawl_error = null, fetched_at = now()
     where gh_accounts.opted_out is not true
     returning id`,
    [
      acc.githubId,
      acc.login,
      acc.kind,
      avatarUrl(acc.githubId),
      acc.hasSponsorsListing,
      acc.listingShortDescription,
      acc.sponsors.totalCount,
      acc.sponsoring.totalCount,
      truncated,
      JSON.stringify(acc.topRepos),
      item.depth,
      item.seed,
    ],
  );
  return rows.length ? Number(rows[0].id) : null;
}

async function markRow(db: Db, rowId: number, error: string): Promise<void> {
  await db.query(
    `update gh_accounts set crawl_state = 'error', crawl_error = $2, fetched_at = now() where id = $1`,
    [rowId, error.slice(0, 300)],
  );
}

async function expandBatch(
  db: Db,
  client: SponsorsClient,
  items: QueueItem[],
  opts: { maxPages: number; ts: string },
  stats: Stats,
): Promise<void> {
  const result = await client.request(buildAccountBatchQuery(items.map((i) => i.login)));
  const data = ensureData(result);
  for (let j = 0; j < items.length; j++) {
    const item = items[j];
    try {
      const acc = parseAccountNode(data[`a${j}`]);
      if (!acc) {
        const err = aliasError(result, `a${j}`);
        stats.notFound++;
        stats.errorSample ??= err?.message;
        if (item.rowId !== null) await markRow(db, item.rowId, err?.type === 'NOT_FOUND' || !err ? 'not_found' : err.message);
        continue;
      }
      if (item.githubId !== null && acc.githubId !== item.githubId && item.rowId !== null) {
        // The login now belongs to someone else (or the account was renamed and
        // the old login re-registered). Stamp the old row; store the new
        // account as itself under its own id.
        stats.renamed++;
        await markRow(db, item.rowId, 'login_reassigned');
      }
      const existing = await db.query<{ opted_out: boolean }>(
        'select opted_out from gh_accounts where github_id = $1',
        [acc.githubId],
      );
      if (existing[0]?.opted_out) {
        stats.skippedOptedOut++;
        continue;
      }

      const sponsors = await readConnection(client, acc.login, 'sponsors', acc.sponsors, opts.maxPages, stats);
      const sponsoring = await readConnection(client, acc.login, 'sponsoring', acc.sponsoring, opts.maxPages, stats);
      const truncated = !sponsors.complete || !sponsoring.complete;
      if (truncated) stats.truncated++;

      const selfId = await storeAccount(db, acc, item, truncated);
      if (selfId === null) {
        stats.skippedOptedOut++;
        continue;
      }
      const ids = await upsertStubs(db, [...sponsors.nodes, ...sponsoring.nodes], item.depth + 1);
      const edges: [number, number][] = [];
      for (const n of sponsors.nodes) {
        const id = ids.get(n.githubId);
        if (id !== undefined) edges.push([id, selfId]);
      }
      for (const n of sponsoring.nodes) {
        const id = ids.get(n.githubId);
        if (id !== undefined) edges.push([selfId, id]);
      }
      await upsertEdges(db, edges, opts.ts);

      if (sponsors.complete) {
        const gone = await db.query(
          `update sponsorships set active = false
           where maintainer_id = $1 and active and last_seen_at < $2::timestamptz returning 1`,
          [selfId, opts.ts],
        );
        stats.deactivated += gone.length;
      }
      if (sponsoring.complete) {
        const gone = await db.query(
          `update sponsorships set active = false
           where sponsor_id = $1 and active and last_seen_at < $2::timestamptz returning 1`,
          [selfId, opts.ts],
        );
        stats.deactivated += gone.length;
      }
      stats.expanded++;
    } catch (error) {
      stats.errors++;
      stats.errorSample ??= String(error);
      if (item.rowId !== null) await markRow(db, item.rowId, String(error));
    }
  }
}

async function fundingStep(
  db: Db,
  client: SponsorsClient,
  opts: { refresh: boolean; limit: number },
  stats: Stats,
): Promise<string[]> {
  const repos = await db.query<{ id: number | string; owner: string; name: string }>(
    `select r.id, r.owner, r.name from repos r
     where r.excluded is not true
       and exists (select 1 from flights f where f.repo_id = r.id and f.index_ok)
       and (r.funding_fetched_at is null
            or ($2::boolean and r.funding_fetched_at < now() - interval '${REFRESH_DAYS} days'))
     order by r.id limit $1`,
    [opts.limit, opts.refresh],
  );
  const githubLogins: string[] = [];
  for (let i = 0; i < repos.length; i += FUNDING_BATCH) {
    const batch = repos.slice(i, i + FUNDING_BATCH);
    const result = await client.request(buildRepoFundingBatchQuery(batch));
    const data = ensureData(result);
    const owners: SponsorNeighbor[] = [];
    for (let j = 0; j < batch.length; j++) {
      const repoId = Number(batch[j].id);
      try {
        const funding = parseFundingNode(data[`r${j}`]);
        if (!funding) {
          stats.errorSample ??= aliasError(result, `r${j}`)?.message;
          await db.query('update repos set funding_fetched_at = now() where id = $1', [repoId]);
          continue;
        }
        if (funding.owner) owners.push({ ...funding.owner, hasSponsorsListing: null });
        await db.query('delete from repo_funding where repo_id = $1', [repoId]);
        const seen = new Set<string>();
        for (const link of funding.links) {
          const key = `${link.platform}\n${link.url}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await db.query(
            'insert into repo_funding (repo_id, platform, url, github_login) values ($1, $2, $3, $4)',
            [repoId, link.platform, link.url, link.githubLogin],
          );
          if (link.githubLogin) githubLogins.push(link.githubLogin);
          stats.fundingLinks++;
        }
        await db.query('update repos set funding_fetched_at = now() where id = $1', [repoId]);
        stats.fundingRepos++;
      } catch (error) {
        stats.errors++;
        stats.errorSample ??= String(error);
      }
    }
    // Owners are roots: identity comes with the repo, so no lookup by login.
    await upsertStubs(db, owners, 0);
    console.log(`  funding ${Math.min(i + FUNDING_BATCH, repos.length)}/${repos.length}`);
  }
  return githubLogins;
}

export async function sponsorsJob(db: Db, opts: SponsorsOptions = {}): Promise<Stats> {
  const maxDepth = opts.maxDepth ?? SPONSORS_DEFAULTS.maxDepth;
  const maxPages = Math.max(1, opts.maxPages ?? SPONSORS_DEFAULTS.maxPages);
  const maxAccounts = opts.maxAccounts ?? SPONSORS_DEFAULTS.maxAccounts;
  const maxMinutes = opts.maxMinutes ?? SPONSORS_DEFAULTS.maxMinutes;
  const now = opts.now ?? Date.now;
  const seeds = opts.seeds ?? [];
  const run = await startRun(db, 'sponsors', { maxDepth, maxPages, maxAccounts, maxMinutes, seeds });
  const client: SponsorsClient = opts.client ?? new GraphqlClient({ token: sponsorsToken() });
  const started = now();
  const ts = new Date(started).toISOString();
  const deadline = started + maxMinutes * 60_000;
  const stats: Stats = {
    fundingRepos: 0, fundingLinks: 0, resolved: 0, expanded: 0, notFound: 0, renamed: 0,
    skippedOptedOut: 0, pages: 0, truncated: 0, deactivated: 0, errors: 0,
  };
  let stoppedBy = 'queue_empty';
  const edgeCount = async () =>
    Number((await db.query<{ n: number | string }>('select count(*) as n from sponsorships'))[0].n);
  try {
    const edgesBefore = await edgeCount();

    if (opts.refresh) {
      await db.query(
        `update gh_accounts set crawl_state = 'queued'
         where crawl_state in ('done', 'error') and opted_out is not true
           and fetched_at < now() - interval '${REFRESH_DAYS} days'`,
      );
    }

    // 1. Roots: catalog owners (via funding), FUNDING.yml accounts, seeds.
    const fundingLogins = await fundingStep(db, client, { refresh: !!opts.refresh, limit: opts.fundingLimit ?? 5000 }, stats);
    const unresolvedFunding = await promoteRoots(db, fundingLogins, false);
    const unresolvedSeeds = await promoteRoots(db, seeds, true);
    const toResolve: QueueItem[] = [];
    const seedLower = new Set(seeds.map((s) => s.toLowerCase()));
    for (const login of new Set([...unresolvedSeeds, ...unresolvedFunding])) {
      toResolve.push({ login, depth: 0, rowId: null, githubId: null, seed: seedLower.has(login) });
    }
    for (let i = 0; i < toResolve.length && maxDepth > 0; i += ACCOUNT_BATCH) {
      const before = stats.expanded;
      await expandBatch(db, client, toResolve.slice(i, i + ACCOUNT_BATCH), { maxPages, ts }, stats);
      stats.resolved += stats.expanded - before;
    }

    // 2. Breadth-first expansion of the queue.
    for (;;) {
      if (stats.expanded >= maxAccounts) { stoppedBy = 'max_accounts'; break; }
      if (now() >= deadline) { stoppedBy = 'max_minutes'; break; }
      const rows = await db.query<{ id: number | string; login: string; depth: number; github_id: number | string; is_seed: boolean }>(
        `select id, login, depth, github_id, is_seed from gh_accounts
         where crawl_state = 'queued' and depth < $1 and opted_out is not true
         order by depth, id limit $2`,
        [maxDepth, Math.min(ACCOUNT_BATCH, maxAccounts - stats.expanded)],
      );
      if (rows.length === 0) break;
      await expandBatch(
        db,
        client,
        rows.map((r) => ({
          login: r.login, depth: Number(r.depth), rowId: Number(r.id), githubId: Number(r.github_id), seed: r.is_seed,
        })),
        { maxPages, ts },
        stats,
      );
      console.log(`  sponsors: expanded ${stats.expanded} (depth ${rows[0].depth}), ${stats.errors} errors`);
    }

    for (const view of ['mv_related_repos', 'mv_sponsor_discovery']) {
      await db.query(`refresh materialized view concurrently ${view}`);
    }

    const [queue] = await db.query<{ pending: number | string; leaves: number | string }>(
      `select count(*) filter (where depth < $1) as pending, count(*) filter (where depth >= $1) as leaves
       from gh_accounts where crawl_state = 'queued' and opted_out is not true`,
      [maxDepth],
    );
    const edgesAdded = (await edgeCount()) - edgesBefore;
    await finishRun(db, run, {
      ok: true,
      rowsIn: stats.expanded + stats.notFound + stats.skippedOptedOut,
      rowsOut: stats.expanded,
      errors: stats.errors,
      errorSample: stats.errorSample,
      meta: {
        ...stats,
        errorSample: undefined,
        edgesAdded,
        stoppedBy,
        pending: Number(queue.pending),
        leaves: Number(queue.leaves),
        maxDepth,
        graphqlRemaining: client.lastRemaining,
      },
    });
    return stats;
  } catch (error) {
    await finishRun(db, run, {
      ok: false,
      rowsOut: stats.expanded,
      errors: stats.errors + 1,
      errorSample: String(error),
      meta: { ...stats, errorSample: undefined, graphqlRemaining: client.lastRemaining },
    });
    throw error;
  }
}

/**
 * --dry-run: fetch the seeds and print what the crawl would see, with no
 * database at all — the token smoke test (does this token read Sponsors?).
 */
export async function sponsorsDryRun(
  seeds: string[],
  opts: { client?: SponsorsClient; log?: (line: string) => void } = {},
): Promise<SponsorAccount[]> {
  if (seeds.length === 0) throw new Error('--dry-run needs --seed <login[,login…]>');
  const client: SponsorsClient = opts.client ?? new GraphqlClient({ token: sponsorsToken() });
  const log = opts.log ?? console.log;
  const out: SponsorAccount[] = [];
  for (let i = 0; i < seeds.length; i += ACCOUNT_BATCH) {
    const batch = seeds.slice(i, i + ACCOUNT_BATCH);
    const result = await client.request(buildAccountBatchQuery(batch));
    const data = ensureData(result);
    for (let j = 0; j < batch.length; j++) {
      const acc = parseAccountNode(data[`a${j}`]);
      if (!acc) {
        log(`${batch[j]}: not found (${aliasError(result, `a${j}`)?.message ?? 'no node'})`);
        continue;
      }
      out.push(acc);
      const names = (c: SponsorConnection) =>
        c.nodes.slice(0, 15).map((n) => n.login).join(', ') + (c.totalCount > 15 ? ', …' : '');
      log(`${acc.login} (${acc.kind}, id ${acc.githubId})`);
      log(`  sponsors listing: ${acc.hasSponsorsListing ? `https://github.com/sponsors/${acc.login}` : 'none'}` +
        (acc.listingShortDescription ? ` — ${acc.listingShortDescription}` : ''));
      log(`  sponsored by (${acc.sponsors.totalCount} public): ${names(acc.sponsors) || '—'}`);
      log(`  sponsoring (${acc.sponsoring.totalCount} public): ${names(acc.sponsoring) || '—'}`);
      log(`  top repos: ${acc.topRepos.map((r) => `${r.name_with_owner} ★${r.stars}`).join(', ') || '—'}`);
    }
  }
  log(`graphql points remaining: ${client.lastRemaining ?? 'unknown'}`);
  return out;
}
