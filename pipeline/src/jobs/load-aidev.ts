// Backfill from AIDev (pinned revision, default v3 — the brief's cut:
// 932,791 PRs; AIDev-pop 33,596 across 2,807 repos >100 stars).
//
// Order (brief, "Backfill run order"): core first (no API), then the pop
// detail tables and computed metrics (no API). Idempotent: repos/authors/
// flights upsert; detail metrics overwrite only fields the detail tables own,
// and never touch a flight that GraphQL has since enriched.
//
// Data minimisation at load time: logins and numeric ids only. Commit
// messages are scanned for agent trailers and then dropped — author strings
// and any emails inside trailers are never stored.

import type { Db } from '../db.ts';
import { insertBatch } from '../db.ts';
import { aidevAgentToSlug, avatarUrl, isBotLogin, signalsFromCommitMessage } from '../agents.ts';
import { excerpt300, firstWords, hoursBetween } from '../text.ts';
import { pickReviewerExcerpt, type ExcerptCandidate } from '../classify.ts';
import { iso, num, readColumns, str } from '../parquet.ts';
import { startRun, finishRun } from '../runlog.ts';
import { join } from 'node:path';

/** PG text[] literal from JS strings (works on postgres.js and PGlite). */
export function pgTextArray(items: string[]): string {
  const quoted = items.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${quoted.join(',')}}`;
}

/** "https://api.github.com/repos/o/r" | "https://github.com/o/r" → "o/r". */
export function fullNameFromRepoUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/github\.com\/(?:repos\/)?([^/]+\/[^/\s]+)/);
  return m ? m[1].replace(/\.git$/, '') : null;
}

type Opts = {
  dir: string;
  /** Load only the first N core rows (smoke tests). */
  sample?: number;
  skipCore?: boolean;
  skipPop?: boolean;
};

export async function loadAidev(db: Db, opts: Opts): Promise<void> {
  const run = await startRun(db, 'load-aidev', { dir: opts.dir, sample: opts.sample ?? null });
  let rowsIn = 0;
  let rowsOut = 0;
  try {
    const seeded = await seedReposAndAuthors(db, opts.dir);
    rowsOut += seeded;
    if (!opts.skipCore) {
      const core = await loadCore(db, opts.dir, opts.sample);
      rowsIn += core.read;
      rowsOut += core.written;
    }
    if (!opts.skipPop) {
      const pop = await loadPopDetail(db, opts.dir, opts.sample);
      rowsIn += pop.read;
      rowsOut += pop.written;
    }
    await finishRun(db, run, { ok: true, rowsIn, rowsOut });
  } catch (error) {
    await finishRun(db, run, {
      ok: false,
      rowsIn,
      rowsOut,
      errors: 1,
      errorSample: String(error),
    });
    throw error;
  }
}

// --- repos + authors -------------------------------------------------------

async function seedReposAndAuthors(db: Db, dir: string): Promise<number> {
  let written = 0;
  for (const file of ['all_repository.parquet', 'repository.parquet']) {
    const rows = await readColumns(join(dir, file), ['id', 'full_name', 'language', 'stars', 'license']);
    const values = rows
      .filter((r) => str(r.full_name)?.includes('/'))
      .map((r) => [num(r.id), str(r.full_name), num(r.stars), str(r.language), str(r.license)]);
    written += await insertBatch(
      db,
      'repos',
      ['github_repo_id', 'full_name', 'stars', 'primary_language', 'license'],
      values,
      `on conflict (github_repo_id) do update set
         stars = coalesce(excluded.stars, repos.stars),
         primary_language = coalesce(excluded.primary_language, repos.primary_language),
         license = coalesce(excluded.license, repos.license)`,
    );
    console.log(`  ${file}: ${rows.length} rows`);
  }
  for (const file of ['all_user.parquet', 'user.parquet']) {
    const rows = await readColumns(join(dir, file), ['id', 'login']);
    const values: unknown[][] = [];
    const seen = new Set<number>();
    for (const r of rows) {
      const id = num(r.id);
      const login = str(r.login);
      if (id === null || !login || seen.has(id)) continue;
      seen.add(id);
      values.push([id, login, avatarUrl(id), isBotLogin(login)]);
    }
    written += await insertBatch(
      db,
      'authors',
      ['github_user_id', 'login', 'avatar_url', 'is_bot'],
      values,
      'on conflict (github_user_id) do update set login = excluded.login, avatar_url = excluded.avatar_url, is_bot = excluded.is_bot',
    );
    console.log(`  ${file}: ${rows.length} rows`);
  }
  return written;
}

async function repoIdMap(db: Db): Promise<Map<number, number>> {
  const rows = await db.query<{ id: number; github_repo_id: number }>(
    'select id, github_repo_id from repos where github_repo_id is not null',
  );
  return new Map(rows.map((r) => [Number(r.github_repo_id), Number(r.id)]));
}

async function repoNameMap(db: Db): Promise<Map<string, number>> {
  const rows = await db.query<{ id: number; full_name_lower: string }>(
    'select id, full_name_lower from repos',
  );
  return new Map(rows.map((r) => [r.full_name_lower, Number(r.id)]));
}

async function authorIdMap(db: Db): Promise<Map<number, number>> {
  const rows = await db.query<{ id: number; github_user_id: number }>(
    'select id, github_user_id from authors',
  );
  return new Map(rows.map((r) => [Number(r.github_user_id), Number(r.id)]));
}

// --- flight upserts (shared by the core and pop loads) ----------------------

type CoreRow = {
  id: unknown;
  number: unknown;
  title: unknown;
  body?: unknown;
  user: unknown;
  user_id: unknown;
  state: unknown;
  created_at: unknown;
  closed_at: unknown;
  merged_at: unknown;
  repo_url: unknown;
  repo_id: unknown;
  agent: unknown;
};

const FLIGHT_COLUMNS = [
  'github_pr_id', 'repo_id', 'author_id', 'number', 'title', 'body_excerpt', 'body_chars',
  'agent', 'signals', 'confidence', 'state', 'opened_at', 'merged_at', 'closed_at',
  'hours_to_merge', 'source',
];

// Core fields come from the dataset; a flight GraphQL has already enriched is
// never overwritten by a backfill re-run.
const FLIGHT_CONFLICT = `on conflict (repo_id, number) do update set
   github_pr_id = coalesce(flights.github_pr_id, excluded.github_pr_id),
   title = excluded.title,
   body_excerpt = excluded.body_excerpt,
   body_chars = excluded.body_chars,
   state = excluded.state,
   opened_at = excluded.opened_at,
   merged_at = excluded.merged_at,
   closed_at = excluded.closed_at,
   hours_to_merge = excluded.hours_to_merge
 where flights.enriched_at is null`;

/**
 * Upsert flights from AIDev PR rows (core or pop — same columns), creating
 * stub repos/authors for rows the dataset's dimension tables miss.
 */
async function upsertFlightRows(
  db: Db,
  rows: CoreRow[],
  bodyOf: (i: number) => string | null,
): Promise<number> {
  const repoByGhId = await repoIdMap(db);
  const repoByName = await repoNameMap(db);
  const authorByGhId = await authorIdMap(db);

  const missingRepos = new Map<string, [number | null, string]>();
  const missingAuthors = new Map<number, string>();
  for (const r of rows) {
    const ghRepo = num(r.repo_id);
    const name = fullNameFromRepoUrl(str(r.repo_url));
    if ((ghRepo === null || !repoByGhId.has(ghRepo)) && name && !repoByName.has(name.toLowerCase())) {
      missingRepos.set(name.toLowerCase(), [ghRepo, name]);
    }
    const ghUser = num(r.user_id);
    const login = str(r.user);
    if (ghUser !== null && login && !authorByGhId.has(ghUser)) missingAuthors.set(ghUser, login);
  }
  if (missingRepos.size > 0) {
    await insertBatch(
      db,
      'repos',
      ['github_repo_id', 'full_name'],
      [...missingRepos.values()],
      'on conflict (full_name_lower) do nothing',
    );
    for (const [k, v] of await repoNameMap(db)) repoByName.set(k, v);
    for (const [k, v] of await repoIdMap(db)) repoByGhId.set(k, v);
  }
  if (missingAuthors.size > 0) {
    await insertBatch(
      db,
      'authors',
      ['github_user_id', 'login', 'avatar_url', 'is_bot'],
      [...missingAuthors.entries()].map(([id, login]) => [id, login, avatarUrl(id), isBotLogin(login)]),
      'on conflict (github_user_id) do nothing',
    );
    for (const [k, v] of await authorIdMap(db)) authorByGhId.set(k, v);
  }

  let written = 0;
  let skipped = 0;
  let values: unknown[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ghRepo = num(r.repo_id);
    const name = fullNameFromRepoUrl(str(r.repo_url))?.toLowerCase();
    const repoId =
      (ghRepo !== null ? repoByGhId.get(ghRepo) : undefined) ??
      (name ? repoByName.get(name) : undefined);
    const ghUser = num(r.user_id);
    const authorId = ghUser !== null ? authorByGhId.get(ghUser) : undefined;
    const number = num(r.number);
    if (repoId === undefined || authorId === undefined || number === null) {
      skipped++;
      continue;
    }
    const mergedAt = iso(r.merged_at);
    const state = mergedAt ? 'merged' : str(r.state) === 'open' ? 'open' : 'closed';
    const { excerpt, chars } = excerpt300(bodyOf(i));
    values.push([
      num(r.id),
      repoId,
      authorId,
      number,
      str(r.title) ?? '',
      excerpt,
      chars,
      aidevAgentToSlug(str(r.agent) ?? ''),
      pgTextArray([`aidev:${str(r.agent) ?? 'unknown'}`]),
      'dataset',
      state,
      iso(r.created_at),
      mergedAt,
      iso(r.closed_at),
      hoursBetween(iso(r.created_at), mergedAt),
      'aidev',
    ]);
    if (values.length >= 20_000) {
      written += await insertBatch(db, 'flights', FLIGHT_COLUMNS, values, FLIGHT_CONFLICT);
      values = [];
    }
  }
  if (values.length > 0) {
    written += await insertBatch(db, 'flights', FLIGHT_COLUMNS, values, FLIGHT_CONFLICT);
  }
  if (skipped > 0) console.log(`  skipped ${skipped} rows with no resolvable repo/author`);
  return written;
}

// --- core (all 933k PRs, metadata only) -------------------------------------

async function loadCore(
  db: Db,
  dir: string,
  sample?: number,
): Promise<{ read: number; written: number }> {
  const path = join(dir, 'all_pull_request.parquet');
  const range = sample ? { rowStart: 0, rowEnd: sample } : undefined;
  console.log('  reading core columns…');
  const meta = (await readColumns(
    path,
    ['id', 'number', 'title', 'user', 'user_id', 'state', 'created_at', 'closed_at', 'merged_at', 'repo_url', 'repo_id', 'agent'],
    range,
  )) as CoreRow[];
  console.log(`  core rows: ${meta.length}; reading bodies…`);
  const bodies = (await readColumns(path, ['body'], range)) as { body: unknown }[];
  const written = await upsertFlightRows(db, meta, (i) => str(bodies[i]?.body));
  console.log(`  core upserted: ${written}`);
  return { read: meta.length, written };
}

// --- AIDev-pop detail tables → metrics, excerpts, events --------------------

type PopPr = {
  ghPrId: number;
  flightId?: number;
  htmlUrl: string | null;
  authorLogin: string | null;
  additions?: number;
  deletions?: number;
  files?: Set<string>;
  commits?: number;
  commitSignals?: Set<string>;
  reviewCount?: number;
  changeRequests?: number;
  humanReviewCount?: number;
  firstReviewAt?: string | null;
  reviewCommentCount?: number;
  humanCommentCount?: number;
  taskType?: string | null;
  candidates: ExcerptCandidate[];
  events: { kind: string; at: string | null; actor: string | null; url: string | null }[];
  commitsAfterFirstReview?: number;
};

async function loadPopDetail(
  db: Db,
  dir: string,
  sample?: number,
): Promise<{ read: number; written: number }> {
  let read = 0;
  const popRows = await readColumns(join(dir, 'pull_request.parquet'), [
    'id', 'number', 'title', 'body', 'agent', 'user_id', 'user', 'state', 'created_at', 'closed_at', 'merged_at', 'repo_id', 'repo_url', 'html_url',
  ]);
  read += popRows.length;

  // Pop rows are a subset of core, but upserting them here keeps this step
  // self-sufficient (core-skipping runs, smoke tests) and is a no-op after a
  // core load. In sample mode only the first N pop PRs are processed.
  const popSlice = (sample ? popRows.slice(0, sample) : popRows) as CoreRow[];
  await upsertFlightRows(db, popSlice, (i) => str((popSlice[i] as { body?: unknown }).body));

  const prs = new Map<number, PopPr>();
  for (const r of popSlice as { id: unknown; html_url: unknown; user: unknown }[]) {
    const id = num(r.id);
    if (id === null) continue;
    prs.set(id, {
      ghPrId: id,
      htmlUrl: str(r.html_url),
      authorLogin: str(r.user),
      candidates: [],
      events: [],
    });
  }

  // pr_commit_details: per-commit per-file additions/deletions. Summed across
  // commits (an approximation GraphQL later replaces); patches are not read.
  {
    const rows = await readColumns(join(dir, 'pr_commit_details.parquet'), ['pr_id', 'filename', 'additions', 'deletions', 'sha']);
    read += rows.length;
    const shas = new Map<number, Set<string>>();
    for (const r of rows) {
      const pr = prs.get(num(r.pr_id) ?? -1);
      if (!pr) continue;
      pr.additions = (pr.additions ?? 0) + (num(r.additions) ?? 0);
      pr.deletions = (pr.deletions ?? 0) + (num(r.deletions) ?? 0);
      (pr.files ??= new Set()).add(str(r.filename) ?? '');
      const sha = str(r.sha);
      if (sha) {
        let set = shas.get(pr.ghPrId);
        if (!set) shas.set(pr.ghPrId, (set = new Set()));
        set.add(sha);
      }
    }
    for (const [id, set] of shas) {
      const pr = prs.get(id);
      if (pr) pr.commits = set.size;
    }
    console.log(`  pr_commit_details: ${rows.length} rows`);
  }

  // pr_commits: commit count (covers PRs missing from commit_details) and
  // agent trailers in messages. Messages are scanned and dropped.
  {
    const rows = await readColumns(join(dir, 'pr_commits.parquet'), ['pr_id', 'sha', 'message']);
    read += rows.length;
    const counts = new Map<number, number>();
    for (const r of rows) {
      const id = num(r.pr_id) ?? -1;
      const pr = prs.get(id);
      if (!pr) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      const message = str(r.message) ?? '';
      for (const signal of signalsFromCommitMessage(message)) (pr.commitSignals ??= new Set()).add(signal);
    }
    for (const [id, n] of counts) {
      const pr = prs.get(id)!;
      pr.commits = Math.max(pr.commits ?? 0, n);
    }
    console.log(`  pr_commits: ${rows.length} rows`);
  }

  // pr_reviews: counts, first review time, excerpt candidates, review events.
  const reviewPr = new Map<number, number>(); // review id → pr id
  {
    const rows = await readColumns(join(dir, 'pr_reviews.parquet'), ['id', 'pr_id', 'user', 'user_type', 'state', 'submitted_at', 'body']);
    read += rows.length;
    for (const r of rows) {
      const prId = num(r.pr_id) ?? -1;
      const pr = prs.get(prId);
      if (!pr) continue;
      const reviewId = num(r.id);
      if (reviewId !== null) reviewPr.set(reviewId, prId);
      const state = (str(r.state) ?? '').toUpperCase();
      const login = str(r.user);
      const isBot = (str(r.user_type) ?? '') === 'Bot' || isBotLogin(login ?? '');
      const at = iso(r.submitted_at);
      const url = pr.htmlUrl && reviewId !== null ? `${pr.htmlUrl}#pullrequestreview-${reviewId}` : null;
      pr.reviewCount = (pr.reviewCount ?? 0) + 1;
      if (state === 'CHANGES_REQUESTED') {
        pr.changeRequests = (pr.changeRequests ?? 0) + 1;
        pr.events.push({ kind: 'changes_requested', at, actor: login, url });
      }
      if (!isBot && login && login.toLowerCase() !== (pr.authorLogin ?? '').toLowerCase()) {
        pr.humanReviewCount = (pr.humanReviewCount ?? 0) + 1;
      }
      if (at && (!pr.firstReviewAt || at < pr.firstReviewAt)) pr.firstReviewAt = at;
      pr.candidates.push({ kind: 'review', state, authorLogin: login, authorIsBot: isBot, body: str(r.body), createdAt: at, url });
    }
    console.log(`  pr_reviews: ${rows.length} rows`);
  }

  // pr_review_comments: inline comment counts via their parent review.
  {
    const rows = await readColumns(join(dir, 'pr_review_comments.parquet'), ['pull_request_review_id']);
    read += rows.length;
    for (const r of rows) {
      const prId = reviewPr.get(num(r.pull_request_review_id) ?? -1);
      const pr = prId === undefined ? undefined : prs.get(prId);
      if (pr) pr.reviewCommentCount = (pr.reviewCommentCount ?? 0) + 1;
    }
    console.log(`  pr_review_comments: ${rows.length} rows`);
  }

  // pr_comments: discussion comments (human engagement + excerpt candidates).
  {
    const rows = await readColumns(join(dir, 'pr_comments.parquet'), ['id', 'pr_id', 'user', 'user_type', 'created_at', 'body']);
    read += rows.length;
    for (const r of rows) {
      const pr = prs.get(num(r.pr_id) ?? -1);
      if (!pr) continue;
      const login = str(r.user);
      const isBot = (str(r.user_type) ?? '') === 'Bot' || isBotLogin(login ?? '');
      const commentId = num(r.id);
      if (!isBot && login && login.toLowerCase() !== (pr.authorLogin ?? '').toLowerCase()) {
        pr.humanCommentCount = (pr.humanCommentCount ?? 0) + 1;
        pr.candidates.push({
          kind: 'comment',
          authorLogin: login,
          authorIsBot: isBot,
          body: str(r.body),
          createdAt: iso(r.created_at),
          url: pr.htmlUrl && commentId !== null ? `${pr.htmlUrl}#issuecomment-${commentId}` : null,
        });
      }
    }
    console.log(`  pr_comments: ${rows.length} rows`);
  }

  // pr_timeline → events + commits-after-first-review.
  {
    const KINDS = new Set(['committed', 'reviewed', 'labeled', 'closed', 'merged']);
    const rows = await readColumns(join(dir, 'pr_timeline.parquet'), ['pr_id', 'event', 'created_at', 'actor']);
    read += rows.length;
    for (const r of rows) {
      const pr = prs.get(num(r.pr_id) ?? -1);
      const event = str(r.event) ?? '';
      if (!pr || !KINDS.has(event)) continue;
      const at = iso(r.created_at);
      pr.events.push({ kind: event, at, actor: str(r.actor), url: null });
      if (event === 'committed' && at && pr.firstReviewAt && at > pr.firstReviewAt) {
        pr.commitsAfterFirstReview = (pr.commitsAfterFirstReview ?? 0) + 1;
      }
    }
    console.log(`  pr_timeline: ${rows.length} rows`);
  }

  // pr_task_type: GPT-assigned Conventional Commits category (pop only).
  {
    const rows = await readColumns(join(dir, 'pr_task_type.parquet'), ['id', 'type']);
    read += rows.length;
    for (const r of rows) {
      const pr = prs.get(num(r.id) ?? -1);
      if (pr) pr.taskType = str(r.type);
    }
  }

  // Resolve flight ids, then write metrics + events in batches.
  const ids = [...prs.keys()];
  const flightRows: { id: number; github_pr_id: number }[] = [];
  for (let i = 0; i < ids.length; i += 10_000) {
    const chunk = ids.slice(i, i + 10_000);
    flightRows.push(
      ...(await db.query<{ id: number; github_pr_id: number }>(
        `select id, github_pr_id from flights where github_pr_id = any($1::bigint[])`,
        [`{${chunk.join(',')}}`],
      )),
    );
  }
  for (const row of flightRows) {
    const pr = prs.get(Number(row.github_pr_id));
    if (pr) pr.flightId = Number(row.id);
  }

  let written = 0;
  const found = [...prs.values()].filter((p) => p.flightId !== undefined);
  console.log(`  pop flights found in db: ${found.length} / ${prs.size}`);
  for (let i = 0; i < found.length; i += 500) {
    const batch = found.slice(i, i + 500);
    const params: unknown[] = [];
    const tuples = batch
      .map((pr) => {
        const excerptPick = pickReviewerExcerpt(pr.candidates, pr.authorLogin, firstWords);
        const extraSignals = [...(pr.commitSignals ?? [])];
        const row = [
          pr.flightId,
          pr.additions ?? null,
          pr.deletions ?? null,
          pr.files ? pr.files.size : null,
          pr.commits ?? null,
          pr.additions !== undefined ? 'aidev_commit_sum' : null,
          pr.reviewCount ?? 0,
          pr.changeRequests ?? 0,
          pr.reviewCommentCount ?? 0,
          pr.humanReviewCount ?? 0,
          pr.humanCommentCount ?? 0,
          pr.firstReviewAt ?? null,
          pr.commitsAfterFirstReview ?? 0,
          pr.taskType ?? null,
          excerptPick?.excerpt ?? null,
          excerptPick?.url ?? null,
          extraSignals.length > 0 ? pgTextArray(extraSignals) : null,
        ];
        const placeholders = row.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${placeholders.join(',')})`;
      })
      .join(',');
    const updated = await db.query(
      `update flights f set
         additions = v.additions::integer, deletions = v.deletions::integer,
         files_changed = v.files_changed::integer, commits = v.commits::integer,
         metrics_source = coalesce(v.metrics_source, f.metrics_source),
         review_count = v.review_count::integer, change_requests = v.change_requests::integer,
         review_comment_count = v.review_comment_count::integer,
         human_review_count = v.human_review_count::integer,
         human_comment_count = v.human_comment_count::integer,
         first_review_at = v.first_review_at::timestamptz,
         commits_after_first_review = v.commits_after_first_review::integer,
         task_type = v.task_type,
         reviewer_excerpt = v.reviewer_excerpt, reviewer_excerpt_url = v.reviewer_excerpt_url,
         signals = case when v.extra_signals is null then f.signals
                        else (select array(select distinct unnest(f.signals || v.extra_signals::text[]))) end
       from (values ${tuples}) as v
         (flight_id, additions, deletions, files_changed, commits, metrics_source,
          review_count, change_requests, review_comment_count, human_review_count,
          human_comment_count, first_review_at, commits_after_first_review, task_type,
          reviewer_excerpt, reviewer_excerpt_url, extra_signals)
       where f.id = v.flight_id::bigint and f.enriched_at is null
       returning 1`,
      params,
    );
    written += updated.length;
  }

  // flight_events: replace wholesale, but ONLY for flights GraphQL has not
  // enriched — the metrics update above is guarded the same way. Without this,
  // a backfill re-run would delete a flight's newer GitHub timeline and put
  // the older AIDev events back while leaving the newer metrics in place.
  const notEnriched = new Set<number>();
  for (let i = 0; i < found.length; i += 10_000) {
    const chunk = found.slice(i, i + 10_000).map((p) => p.flightId);
    const rows = await db.query<{ id: number }>(
      'select id from flights where id = any($1::bigint[]) and enriched_at is null',
      [`{${chunk.join(',')}}`],
    );
    for (const row of rows) notEnriched.add(Number(row.id));
  }
  const withEvents = found.filter((p) => p.events.length > 0 && notEnriched.has(p.flightId!));
  for (let i = 0; i < withEvents.length; i += 200) {
    const batch = withEvents.slice(i, i + 200);
    await db.query(`delete from flight_events where flight_id = any($1::bigint[])`, [
      `{${batch.map((p) => p.flightId).join(',')}}`,
    ]);
    const values: unknown[][] = [];
    for (const pr of batch) {
      const events = pr.events
        .slice()
        .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
        .slice(0, 200);
      events.forEach((e, seq) => {
        values.push([pr.flightId, seq, e.kind, e.actor, e.at, e.url]);
      });
    }
    written += await insertBatch(
      db,
      'flight_events',
      ['flight_id', 'seq', 'kind', 'actor_login', 'at', 'url'],
      values,
      'on conflict (flight_id, seq) do nothing',
    );
  }

  return { read, written };
}
