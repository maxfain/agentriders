-- 0008: first-load cost of flight and agent pages.
--
-- After 0007 every corpus page answered, but first loads still took 8-13 s
-- on some pages (repeat loads < 1 s). Measured with EXPLAIN (ANALYZE, BUFFERS):
--   flight_page, author with 8,913 flights in one repo   18,112 buffers  2.5 s
--   flight_page, devin-ai-integration[bot] flight          4,343 buffers  0.6 s
--   agent_page github-copilot                             5,034 buffers  2.8 s
--   ordinary flight / repo / author page                 ~1,700 buffers  < 0.1 s
-- Causes and fixes:
--   * agent_page top_repos sorted mv_repo_agent_stats (118k rows, no index on
--     agent) → index (agent, flights desc).
--   * flight_page author.indexed_flights counted the author's flights row by
--     row → read mv_flight_rollup.
--   * flight_page related_by_author walked every flight of the author when
--     none sat in another repo → each bucket picks from the author's 200 most
--     recent flights of its kind.
-- Function output shapes are unchanged.
--
-- Production-safe: no table locks beyond the matview's index build (a ~11 MB
-- matview; blocks only its refresh), and lock_timeout fails fast instead of
-- queueing site traffic. Run as one transaction.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists mv_repo_agent_stats_agent_rank
  on mv_repo_agent_stats (agent, flights desc);

create or replace function flight_page(p_owner text, p_repo text, p_number integer)
returns jsonb language plpgsql stable as $$
declare
  v_repo repos; v_flight flights; v_author authors; v_claim claims; out jsonb;
begin
  select * into v_repo from repos
    where full_name_lower = lower(p_owner || '/' || p_repo);
  if not found then return null; end if;
  select * into v_flight from flights where repo_id = v_repo.id and number = p_number;
  if not found then return null; end if;
  select * into v_author from authors where id = v_flight.author_id;
  select * into v_claim from claims where flight_id = v_flight.id;

  if v_author.opted_out or v_repo.excluded then
    return jsonb_build_object('gone', true);
  end if;

  out := jsonb_build_object(
    'flight', flight_list_item(v_flight) || jsonb_build_object(
      'id', v_flight.id,
      'body_excerpt', v_flight.body_excerpt,
      'body_chars', v_flight.body_chars,
      'confidence', v_flight.confidence,
      'signals', to_jsonb(v_flight.signals),
      'closed_at', v_flight.closed_at,
      'commits', v_flight.commits,
      'metrics_source', v_flight.metrics_source,
      'review_count', v_flight.review_count,
      'change_requests', v_flight.change_requests,
      'review_comment_count', v_flight.review_comment_count,
      'debrief', v_flight.debrief,
      'reviewer_excerpt', v_flight.reviewer_excerpt,
      'reviewer_excerpt_url', v_flight.reviewer_excerpt_url,
      'source', v_flight.source,
      'enriched_at', v_flight.enriched_at,
      'og_generated_at', v_flight.og_generated_at,
      'updated_at', v_flight.updated_at
    ),
    'repo', jsonb_build_object(
      'full_name', v_repo.full_name, 'owner', v_repo.owner, 'name', v_repo.name,
      'stars', v_repo.stars, 'primary_language', v_repo.primary_language,
      'license', v_repo.license
    ),
    -- indexed_flights from the rollup: counting the author's index_ok rows
    -- live cost one heap visit per flight (6,749 for one prolific author).
    'author', author_public(v_author) || jsonb_build_object(
      'indexed_flights', coalesce((select sum(s.indexed)::integer from mv_flight_rollup s
                                   where s.author_id = v_author.id), 0)
    ),
    'merged_by', (
      select e.actor_login from flight_events e
      where e.flight_id = v_flight.id and e.kind = 'merged' and e.actor_login is not null
      order by e.seq desc limit 1
    ),
    'claim', case when v_claim.flight_id is null then null else jsonb_build_object(
      'rider_handle', v_claim.rider_handle, 'visibility', v_claim.visibility,
      'note', case when v_claim.visibility = 'public' then v_claim.note end,
      'claimed_at', v_claim.claimed_at
    ) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', e.kind, 'actor_login', e.actor_login, 'at', e.at, 'url', e.url)
        order by e.seq)
      from flight_events e where e.flight_id = v_flight.id
    ), '[]'::jsonb),
    -- related: same-repo flights, indexed first, newest first; opted-out
    -- authors excluded.
    'related', coalesce((
      select jsonb_agg(flight_list_item(t.f) order by t.b, (t.f).opened_at desc nulls last)
      from (
        (select f2 as f, 1 as b from flights f2 join authors a2 on a2.id = f2.author_id
          where f2.repo_id = v_repo.id and f2.index_ok and f2.id <> v_flight.id
            and a2.opted_out is not true
          order by f2.opened_at desc nulls last limit 3)
        union all
        (select f2, 2 from flights f2 join authors a2 on a2.id = f2.author_id
          where f2.repo_id = v_repo.id and not f2.index_ok and f2.id <> v_flight.id
            and a2.opted_out is not true
          order by f2.opened_at desc nulls last limit 3)
        limit 3
      ) t
    ), '[]'::jsonb),
    -- related_by_author: the same account's other flights — other repos
    -- first, then indexed first, then newest — chosen from the author's 200
    -- most recent flights of each kind. Unbounded, an author whose flights
    -- all sit in one repo made the "other repos" buckets walk every flight
    -- (18k buffers, 2.5 s for a mochilang/mochi page); capped, it is a few
    -- hundred index entries at most.
    'related_by_author', coalesce((
      select jsonb_agg(flight_list_item(t.f) || jsonb_build_object('repo', t.repo)
                       order by t.b, (t.f).opened_at desc nulls last)
      from (
        (select c.f, r2.full_name as repo, 1 as b
          from (select x as f from flights x
                where x.author_id = v_author.id and x.index_ok
                order by x.index_ok desc, x.opened_at desc nulls last limit 200) c
          join repos r2 on r2.id = (c.f).repo_id
          where (c.f).repo_id <> v_repo.id and r2.excluded is not true
          order by (c.f).opened_at desc nulls last limit 3)
        union all
        (select c.f, r2.full_name, 2
          from (select x as f from flights x
                where x.author_id = v_author.id and not x.index_ok
                order by x.index_ok desc, x.opened_at desc nulls last limit 200) c
          join repos r2 on r2.id = (c.f).repo_id
          where (c.f).repo_id <> v_repo.id and r2.excluded is not true
          order by (c.f).opened_at desc nulls last limit 3)
        union all
        (select c.f, v_repo.full_name, 3
          from (select x as f from flights x
                where x.author_id = v_author.id and x.index_ok
                order by x.index_ok desc, x.opened_at desc nulls last limit 200) c
          where (c.f).repo_id = v_repo.id and (c.f).id <> v_flight.id
          order by (c.f).opened_at desc nulls last limit 3)
        union all
        (select c.f, v_repo.full_name, 4
          from (select x as f from flights x
                where x.author_id = v_author.id and not x.index_ok
                order by x.index_ok desc, x.opened_at desc nulls last limit 200) c
          where (c.f).repo_id = v_repo.id and (c.f).id <> v_flight.id
          order by (c.f).opened_at desc nulls last limit 3)
        limit 3
      ) t
    ), '[]'::jsonb),
    -- related_by_task: indexed flights by the same agent on the same task type
    -- (flights_agent_task_indexed serves this one already).
    'related_by_task', coalesce((
      select jsonb_agg(t.item order by t.rank)
      from (
        select flight_list_item(f2) || jsonb_build_object('repo', r2.full_name) as item,
               row_number() over (order by f2.opened_at desc) as rank
        from flights f2
        join repos r2   on r2.id = f2.repo_id
        join authors a2 on a2.id = f2.author_id
        where v_flight.task_type is not null
          and f2.agent = v_flight.agent and f2.task_type = v_flight.task_type
          and f2.id <> v_flight.id and f2.index_ok
          and r2.excluded is not true and a2.opted_out is not true
        order by f2.opened_at desc limit 3
      ) t
    ), '[]'::jsonb)
  );
  return out;
end $$;

commit;
