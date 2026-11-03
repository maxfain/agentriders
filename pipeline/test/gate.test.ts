// The quality gate and the SQL↔TS classifier parity, against a real Postgres
// (PGlite) with the real migration applied.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { wrapPglite, migrate, type Db } from '../src/db.ts';
import { CLASSIFY_SQL } from '../src/jobs/classify.ts';
import { classifyOutcome, type ClassifyInput } from '../src/classify.ts';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let db: Db;

before(async () => {
  db = wrapPglite(new PGlite());
  await migrate(db, join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations'));
});
after(async () => {
  await db.end();
});

async function insertFlight(opts: {
  repo?: string; stars?: number | null; isFork?: boolean; excluded?: boolean;
  login?: string; optedOut?: boolean;
  number: number; state?: string; additions?: number; deletions?: number; files?: number;
  humanReviews?: number; humanComments?: number; changeRequests?: number;
  commitsAfterFirstReview?: number; outcome?: string | null; debrief?: string | null;
  confidence?: string; openedAt?: string;
}): Promise<number> {
  const repoName = opts.repo ?? 'acme/widget';
  const login = opts.login ?? 'octocat';
  const [repo] = await db.query<{ id: number }>(
    `insert into repos (full_name, stars, is_fork, excluded) values ($1, $2, $3, $4)
     on conflict (full_name_lower) do update set stars = excluded.stars,
       is_fork = excluded.is_fork, excluded = excluded.excluded
     returning id`,
    [repoName, opts.stars === undefined ? 500 : opts.stars, opts.isFork ?? false, opts.excluded ?? false],
  );
  const [author] = await db.query<{ id: number }>(
    `insert into authors (github_user_id, login, opted_out)
     values (abs(hashtext($1)), $1, $2)
     on conflict (github_user_id) do update set opted_out = excluded.opted_out
     returning id`,
    [login, opts.optedOut ?? false],
  );
  const [flight] = await db.query<{ id: number }>(
    `insert into flights (repo_id, author_id, number, title, agent, signals, confidence,
       state, opened_at, merged_at, additions, deletions, files_changed,
       human_review_count, human_comment_count, change_requests,
       commits_after_first_review, outcome, debrief, debrief_prompt_version, source)
     values ($1, $2, $3, 'A title', 'claude-code', '{}', $4, $5, $6,
       case when $5 = 'merged' then $6::timestamptz + interval '2 hours' end,
       $7, $8, $9, $10, $11, $12, $13, $14, $15, 'v1', 'aidev')
     returning id`,
    [
      repo.id, author.id, opts.number, opts.confidence ?? 'dataset',
      opts.state ?? 'merged', opts.openedAt ?? '2026-01-01T00:00:00Z',
      opts.additions ?? 100, opts.deletions ?? 20, opts.files ?? 3,
      opts.humanReviews ?? 1, opts.humanComments ?? 0, opts.changeRequests ?? 0,
      opts.commitsAfterFirstReview ?? 0, opts.outcome ?? null,
      opts.debrief === undefined ? 'a debrief' : opts.debrief,
    ],
  );
  return Number(flight.id);
}

test('SQL classifier matches the TS classifier on every branch', async () => {
  const cases: (ClassifyInput & { number: number })[] = [
    { number: 9001, state: 'merged', openedAt: '2026-01-01T00:00:00Z', changeRequests: 0, humanReviewCount: 1, humanCommentCount: 0, commitsAfterFirstReview: 0 },
    { number: 9002, state: 'merged', openedAt: '2026-01-01T00:00:00Z', changeRequests: 1, humanReviewCount: 1, humanCommentCount: 0, commitsAfterFirstReview: 0 },
    { number: 9003, state: 'merged', openedAt: '2026-01-01T00:00:00Z', changeRequests: 0, humanReviewCount: 0, humanCommentCount: 0, commitsAfterFirstReview: 2 },
    { number: 9004, state: 'closed', openedAt: '2026-01-01T00:00:00Z', changeRequests: 0, humanReviewCount: 1, humanCommentCount: 0, commitsAfterFirstReview: 0 },
    { number: 9005, state: 'closed', openedAt: '2026-01-01T00:00:00Z', changeRequests: 0, humanReviewCount: 0, humanCommentCount: 0, commitsAfterFirstReview: 0 },
    { number: 9006, state: 'open', openedAt: '2020-01-01T00:00:00Z', changeRequests: 0, humanReviewCount: 0, humanCommentCount: 0, commitsAfterFirstReview: 0 },
    { number: 9007, state: 'open', openedAt: new Date().toISOString(), changeRequests: 0, humanReviewCount: 0, humanCommentCount: 0, commitsAfterFirstReview: 0 },
  ];
  const ids = new Map<number, number>();
  for (const c of cases) {
    ids.set(
      c.number,
      await insertFlight({
        repo: 'parity/check', number: c.number, state: c.state, openedAt: c.openedAt ?? undefined,
        humanReviews: c.humanReviewCount, humanComments: c.humanCommentCount,
        changeRequests: c.changeRequests, commitsAfterFirstReview: c.commitsAfterFirstReview,
      }),
    );
  }
  await db.query(CLASSIFY_SQL);
  for (const c of cases) {
    const [row] = await db.query<{ outcome: string }>('select outcome from flights where id = $1', [
      ids.get(c.number),
    ]);
    assert.equal(row.outcome, classifyOutcome(c), `case #${c.number}`);
  }
});

test('index_ok: the full gate, each condition knocking a flight out', async () => {
  const okId = await insertFlight({ repo: 'gate/ok', number: 1, outcome: 'merged_clean' });
  const lowStars = await insertFlight({ repo: 'gate/smallrepo', stars: 50, number: 2, outcome: 'merged_clean' });
  const fork = await insertFlight({ repo: 'gate/fork', isFork: true, number: 3, outcome: 'merged_clean' });
  const excluded = await insertFlight({ repo: 'gate/excluded', excluded: true, number: 4, outcome: 'merged_clean' });
  const optedOut = await insertFlight({ repo: 'gate/ok', login: 'hidden-author', optedOut: true, number: 5, outcome: 'merged_clean' });
  const thin = await insertFlight({ repo: 'gate/ok', number: 6, additions: 5, deletions: 2, humanReviews: 0, outcome: 'merged_clean' });
  const thinButReviewed = await insertFlight({ repo: 'gate/ok', number: 7, additions: 5, deletions: 2, humanReviews: 1, outcome: 'merged_clean' });
  const undecided = await insertFlight({ repo: 'gate/ok', number: 8, state: 'open', outcome: 'open' });
  const noDebrief = await insertFlight({ repo: 'gate/ok', number: 9, outcome: 'merged_clean', debrief: null });
  const lowConf = await insertFlight({ repo: 'gate/ok', number: 10, outcome: 'merged_clean', confidence: 'low' });

  await db.query('select recompute_index_ok()');
  const expect = async (id: number, ok: boolean, label: string) => {
    const [row] = await db.query<{ index_ok: boolean }>('select index_ok from flights where id = $1', [id]);
    assert.equal(row.index_ok, ok, label);
  };
  await expect(okId, true, 'all conditions met');
  await expect(lowStars, false, 'under 100 stars');
  await expect(fork, false, 'fork');
  await expect(excluded, false, 'excluded repo');
  await expect(optedOut, false, 'opted-out author');
  await expect(thin, false, 'no substance');
  await expect(thinButReviewed, true, 'thin but human-reviewed');
  await expect(undecided, false, 'outcome not decided');
  await expect(noDebrief, false, 'no debrief');
  await expect(lowConf, false, 'branch prefix alone');
});

test('claims: author match enforced, hidden drops index, note capped', async () => {
  const flightId = await insertFlight({ repo: 'claims/repo', login: 'real-author', number: 11, outcome: 'merged_clean' });
  const [author] = await db.query<{ github_user_id: number }>(
    "select github_user_id from authors where login = 'real-author'",
  );

  const wrong = await db.query<{ claim_flight: { ok: boolean; error: string } }>(
    'select claim_flight($1, $2, $3, $4)', [flightId, 'rider-1', 'maxcr', 999999999],
  );
  assert.equal(wrong[0].claim_flight.ok, false);
  assert.equal(wrong[0].claim_flight.error, 'not_author');

  const right = await db.query<{ claim_flight: { ok: boolean } }>(
    'select claim_flight($1, $2, $3, $4)', [flightId, 'rider-1', 'maxcr', Number(author.github_user_id)],
  );
  assert.equal(right[0].claim_flight.ok, true);

  // Idempotent for the same rider; refused for someone else.
  const again = await db.query<{ claim_flight: { ok: boolean; already?: boolean } }>(
    'select claim_flight($1, $2, $3, $4)', [flightId, 'rider-1', 'maxcr', Number(author.github_user_id)],
  );
  assert.equal(again[0].claim_flight.ok, true);
  assert.equal(again[0].claim_flight.already, true);

  await db.query('select recompute_index_ok()');
  const hide = await db.query<{ set_claim_visibility: { ok: boolean } }>(
    "select set_claim_visibility($1, 'rider-1', 'hidden')", [flightId],
  );
  assert.equal(hide[0].set_claim_visibility.ok, true);
  const [afterHide] = await db.query<{ index_ok: boolean }>('select index_ok from flights where id = $1', [flightId]);
  assert.equal(afterHide.index_ok, false, 'hiding drops the flight from the index');
  await db.query('select recompute_index_ok()');
  const [recomputed] = await db.query<{ index_ok: boolean }>('select index_ok from flights where id = $1', [flightId]);
  assert.equal(recomputed.index_ok, false, 'the gate keeps it out while hidden');

  const notYours = await db.query<{ set_claim_note: { ok: boolean } }>(
    "select set_claim_note($1, 'rider-2', 'not mine')", [flightId],
  );
  assert.equal(notYours[0].set_claim_note.ok, false);
});

test('opt-out hides immediately and survives for unknown authors', async () => {
  const flightId = await insertFlight({ repo: 'optout/repo', login: 'leaving-author', number: 12, outcome: 'merged_clean' });
  await db.query('select recompute_index_ok()');
  const [author] = await db.query<{ github_user_id: number }>(
    "select github_user_id from authors where login = 'leaving-author'",
  );
  await db.query('select opt_out_author($1, true)', [Number(author.github_user_id)]);
  const [row] = await db.query<{ index_ok: boolean }>('select index_ok from flights where id = $1', [flightId]);
  assert.equal(row.index_ok, false);

  // Unknown author: the row is created flagged so the pipeline never re-adds them.
  await db.query('select opt_out_author($1, true)', [123456789]);
  const [stub] = await db.query<{ opted_out: boolean }>(
    'select opted_out from authors where github_user_id = 123456789',
  );
  assert.equal(stub.opted_out, true);
});

test('page RPCs answer with gone for excluded/opted-out and null for missing', async () => {
  const [{ flight_page: missing }] = await db.query<{ flight_page: unknown }>(
    "select flight_page('nobody', 'nothing', 1)",
  );
  assert.equal(missing, null);
  const [{ flight_page: gone }] = await db.query<{ flight_page: { gone?: boolean } }>(
    "select flight_page('gate', 'excluded', 4)",
  );
  assert.equal(gone.gone, true);
  const [{ flight_page: page }] = await db.query<{ flight_page: { flight: { number: number }; author: { login: string }; related: unknown[] } }>(
    "select flight_page('gate', 'ok', 1)",
  );
  assert.equal(page.flight.number, 1);
  assert.equal(page.author.login, 'octocat');
  assert.ok(Array.isArray(page.related));
});

test('sitemaps list only indexed flights', async () => {
  await db.query('select refresh_corpus_views()');
  const rows = await db.query<{ loc: string }>('select loc from sitemap_flights(0)');
  assert.ok(rows.some((r) => r.loc === '/logs/gate/ok/1/'));
  assert.ok(!rows.some((r) => r.loc.startsWith('/logs/gate/smallrepo/')));
  const pages = await db.query<{ loc: string }>('select loc from sitemap_pages()');
  assert.ok(pages.some((p) => p.loc === '/logs/agent/claude-code/'));
});
