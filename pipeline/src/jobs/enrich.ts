// GraphQL enrichment (brief, Pipeline step 5): every new candidate and every
// flight whose state changed (discovery cleared enriched_at), plus claimed
// long-tail flights that have never been enriched. 25 PRs per call via
// aliases; the exact GraphQL response is kept in flights.raw.

import type { Db } from '../db.ts';
import { GraphqlClient, buildPrBatchQuery, parsePrNode, type EnrichedPr, type PrRef } from '../github-graphql.ts';
import { detectSignals } from '../agents.ts';
import { classifyOutcome, pickReviewerExcerpt, type ExcerptCandidate } from '../classify.ts';
import { excerpt300, firstWords, hoursBetween } from '../text.ts';
import { required } from '../env.ts';
import { startRun, finishRun } from '../runlog.ts';
import { pgTextArray } from './load-aidev.ts';

const BATCH = 25;

type Pending = { id: number; owner: string; name: string; number: number };

export async function enrich(
  db: Db,
  opts: { limit?: number; client?: GraphqlClient; includeOpenOlderThanDays?: number } = {},
): Promise<void> {
  const run = await startRun(db, 'enrich');
  const client = opts.client ?? new GraphqlClient({ token: required('FLIGHTLOG_GITHUB_TOKEN') });
  let fetched = 0;
  let updated = 0;
  let errors = 0;
  let errorSample: string | undefined;
  try {
    const staleOpen = opts.includeOpenOlderThanDays;
    const pending = await db.query<Pending>(
      `select f.id, r.owner, r.name, f.number
       from flights f join repos r on r.id = f.repo_id
       where (f.enriched_at is null and (f.source = 'gharchive'
                or exists (select 1 from claims c where c.flight_id = f.id)))
          ${staleOpen ? `or (f.state = 'open' and f.enriched_at < now() - ($2 || ' days')::interval)` : ''}
       order by f.id
       limit $1`,
      staleOpen ? [opts.limit ?? 2000, String(staleOpen)] : [opts.limit ?? 2000],
    );

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const refs: PrRef[] = batch.map((p) => ({ owner: p.owner, name: p.name, number: Number(p.number) }));
      const result = await client.request(buildPrBatchQuery(refs));
      for (let j = 0; j < batch.length; j++) {
        const alias = `p${j}`;
        const node = result.data?.[alias];
        const pathErrors = (result.errors ?? []).filter((e) => e.path?.[0] === alias);
        try {
          const parsed = parsePrNode(node);
          if (!parsed) {
            // Only a confirmed permanent error (deleted / private / renamed
            // away → NOT_FOUND) stamps enriched_at to stop the row queueing.
            // A transient error (rate limit, 5xx, timeout mid-batch) leaves
            // enriched_at untouched so the flight is retried next run, instead
            // of being silently dropped from both scheduled queues forever.
            const permanent = pathErrors.some((e) => e.type === 'NOT_FOUND');
            if (permanent) {
              await db.query(
                `update flights set enriched_at = now(),
                   signals = (select array(select distinct unnest(signals || $2::text[])))
                 where id = $1`,
                [batch[j].id, pgTextArray([`enrich:${pathErrors[0]?.type?.toLowerCase() ?? 'not_found'}`])],
              );
            }
            errors++;
            errorSample ??= pathErrors[0]?.message ?? 'empty node';
            continue;
          }
          await applyEnrichment(db, batch[j].id, parsed);
          updated++;
        } catch (error) {
          errors++;
          errorSample ??= String(error);
        }
      }
      fetched += batch.length;
      console.log(`  enriched ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
    }
    await finishRun(db, run, {
      ok: true,
      rowsIn: pending.length,
      rowsOut: updated,
      errors,
      errorSample,
      meta: { graphqlRemaining: client.lastRemaining },
    });
  } catch (error) {
    await finishRun(db, run, {
      ok: false,
      rowsIn: fetched,
      rowsOut: updated,
      errors: errors + 1,
      errorSample: String(error),
      meta: { graphqlRemaining: client.lastRemaining },
    });
    throw error;
  }
}

async function applyEnrichment(db: Db, flightId: number, pr: EnrichedPr): Promise<void> {
  // Repo metadata rides along in the same response.
  if (pr.repo.nameWithOwner) {
    await db.query(
      `update repos set github_repo_id = coalesce($2, github_repo_id), stars = $3,
         primary_language = $4, license = $5, is_fork = $6, fetched_at = now()
       where id = (select repo_id from flights where id = $1)`,
      [
        flightId,
        pr.repo.databaseId,
        pr.repo.stargazerCount,
        pr.repo.primaryLanguage,
        pr.repo.license,
        pr.repo.isFork,
      ],
    );
  }
  if (pr.authorDatabaseId !== null && pr.authorLogin) {
    await db.query(
      `update authors set login = $2, is_bot = $3, fetched_at = now()
       where github_user_id = $1`,
      [pr.authorDatabaseId, pr.authorLogin, pr.authorIsBot],
    );
  }

  // Confirm signals from the live PR (brief: set confidence high with 2+
  // signals, medium with one bot/trailer signal, low with a branch prefix).
  const detection = detectSignals({
    authorLogin: pr.authorLogin,
    headRef: pr.headRefName,
    commitMessages: pr.commitMessages,
  });

  const prAuthor = (pr.authorLogin ?? '').toLowerCase();
  const humanReviews = pr.reviews.filter(
    (r) => !r.authorIsBot && (r.authorLogin ?? '').toLowerCase() !== prAuthor,
  );
  const humanComments = pr.comments.filter(
    (c) => !c.authorIsBot && (c.authorLogin ?? '').toLowerCase() !== prAuthor,
  );
  const changeRequests = pr.reviews.filter((r) => r.state === 'CHANGES_REQUESTED').length;
  const firstReviewAt =
    pr.reviews.map((r) => r.submittedAt).filter((d): d is string => !!d).sort()[0] ?? null;
  const commitsAfterFirstReview = firstReviewAt
    ? pr.timeline.filter((t) => t.kind === 'committed' && t.at && t.at > firstReviewAt).length
    : 0;

  const candidates: ExcerptCandidate[] = [
    ...pr.reviews.map((r) => ({
      kind: 'review' as const,
      state: r.state,
      authorLogin: r.authorLogin,
      authorIsBot: r.authorIsBot,
      body: r.body,
      createdAt: r.submittedAt,
      url: r.url,
    })),
    ...pr.comments.map((c) => ({
      kind: 'comment' as const,
      authorLogin: c.authorLogin,
      authorIsBot: c.authorIsBot,
      body: c.body,
      createdAt: c.createdAt,
      url: c.url,
    })),
  ];
  const excerptPick = pickReviewerExcerpt(candidates, pr.authorLogin, firstWords);

  const outcome = classifyOutcome({
    state: pr.state,
    openedAt: pr.createdAt,
    changeRequests,
    humanReviewCount: humanReviews.length,
    humanCommentCount: humanComments.length,
    commitsAfterFirstReview,
  });

  const { excerpt, chars } = excerpt300(pr.bodyText);
  await db.query(
    `update flights set
       github_pr_id = coalesce($2, github_pr_id),
       title = $3, body_excerpt = $4, body_chars = $5,
       state = $6, opened_at = $7, merged_at = $8, closed_at = $9,
       additions = $10, deletions = $11, files_changed = $12, commits = $13,
       metrics_source = 'github_api',
       review_count = $14, change_requests = $15, review_comment_count = $16,
       human_review_count = $17, human_comment_count = $18,
       first_review_at = $19, commits_after_first_review = $20,
       hours_to_merge = $21,
       outcome = $22, classified_at = now(),
       reviewer_excerpt = $23, reviewer_excerpt_url = $24,
       agent = case when $25 <> 'unknown' then $25 else agent end,
       signals = (select array(select distinct unnest(signals || $26::text[]))),
       confidence = coalesce($27, confidence),
       raw = $28::jsonb,
       -- Enrichment can change the numbers a debrief and card were built from
       -- (e.g. AIDev commit-sums → GitHub's exact totals on claim). Force the
       -- debrief to revalidate (regenerates only if it no longer matches) and
       -- the card to re-render, so a page never shows stale figures.
       debrief_prompt_version = case when debrief is not null then null else debrief_prompt_version end,
       og_generated_at = null,
       enriched_at = now()
     where id = $1`,
    [
      flightId,
      pr.ghPrId,
      pr.title,
      excerpt,
      chars,
      pr.state,
      pr.createdAt,
      pr.mergedAt,
      pr.closedAt,
      pr.additions,
      pr.deletions,
      pr.changedFiles,
      pr.commitsTotal,
      // Accurate total even when the PR has >50 reviews; change_requests and
      // the human counts below use the first page, which covers virtually all
      // real PRs (a change-requested review past #50 is vanishingly rare).
      pr.reviewsTotal,
      changeRequests,
      pr.reviewCommentCount,
      humanReviews.length,
      humanComments.length,
      firstReviewAt,
      commitsAfterFirstReview,
      hoursBetween(pr.createdAt, pr.mergedAt),
      outcome,
      excerptPick?.excerpt ?? null,
      excerptPick?.url ?? null,
      detection?.agent ?? 'unknown',
      pgTextArray(detection?.signals ?? []),
      detection?.confidence ?? null,
      JSON.stringify(pr.raw),
    ],
  );

  // Events: reviews (+changes_requested) from the reviews list, the rest from
  // the timeline; replaced wholesale.
  await db.query('delete from flight_events where flight_id = $1', [flightId]);
  const events = [
    ...pr.timeline,
    ...pr.reviews.flatMap((r) => {
      const base = { at: r.submittedAt, actor: r.authorLogin, url: r.url };
      return r.state === 'CHANGES_REQUESTED'
        ? [{ kind: 'changes_requested', ...base }]
        : [{ kind: 'reviewed', ...base }];
    }),
  ]
    .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
    .slice(0, 200);
  if (events.length > 0) {
    const params: unknown[] = [];
    const tuples = events
      .map((e, seq) => {
        params.push(flightId, seq, e.kind, e.actor, e.at, e.url);
        const base = params.length - 6;
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`;
      })
      .join(',');
    await db.query(
      `insert into flight_events (flight_id, seq, kind, actor_login, at, url)
       values ${tuples} on conflict (flight_id, seq) do nothing`,
      params,
    );
  }
}
