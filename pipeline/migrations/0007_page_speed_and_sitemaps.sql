-- 0007: corpus page speed + untruncated sitemaps (Search Console clean-up).
--
-- Two production problems, both visible in Search Console as "Discovered -
-- currently not indexed" (crawl budget throttled) and "Server error (5xx)":
--
-- 1. Sitemaps capped at 1,000 URLs. sitemap_pages() and sitemap_flights()
--    returned SETOF rows, and PostgREST's max-rows (1000) silently truncates
--    every set-returning RPC. flights-N.xml promised 10k URLs per chunk and
--    served 1,000 (2,000 of 19,420 indexable flights listed); corpus-pages.xml
--    stopped after 995 of 1,666 repos and never reached the author or browse
--    pages. Both now return ONE jsonb array, which max-rows does not touch.
--    The JSON body PostgREST sends is the same array of {loc, lastmod}
--    objects as before, so the site code reads either form unchanged.
--
-- 2. Pages over the 8 s statement_timeout (authenticator role) → 500, or 404
--    on author pages (the route swallowed the error). Measured on the live DB:
--      repo_page mochilang/mochi  7.1 s   (8,913 flights; latest-50 sorted all
--                                          rows: `desc nulls last` matched no index)
--      flight_page liam-hq/liam   2.8 s   (author is devin-ai-integration[bot]:
--                                          related_by_author sorted 29,746 rows)
--      agent_page openai-codex    > 8 s   ('notable' sorted 814k rows, same
--                                          nulls-last mismatch)
--      author_page tamnd/...      > 8 s cold (aggregated every flight live)
--    Fixes: indexes in the exact sort order the pages ask for; a rollup
--    materialized view for the per-repo / per-author counts; the
--    "(repo_id = x), index_ok desc, opened_at desc" orderings rewritten as
--    ordered UNION ALL buckets that each walk an index and stop at LIMIT.
--    Output JSON shapes are unchanged.

-- Index builds over ~930k flights outlast the 2-minute database default.
set local statement_timeout = '15min';

-- ---------------------------------------------------------------------------
-- Indexes. opened_at is never null today, but the queries say NULLS LAST, and
-- a btree DESC index is NULLS FIRST by default — so the old indexes could not
-- serve them and every page sorted the full set.
-- ---------------------------------------------------------------------------

-- Repo page: latest 50 flights.
create index if not exists flights_repo_recent
  on flights (repo_id, opened_at desc nulls last);
-- Flight page "related" (indexed bucket) — partial, ~20k rows.
create index if not exists flights_repo_indexok
  on flights (repo_id, opened_at desc nulls last) where index_ok;
-- Repo page burn quotes.
create index if not exists flights_repo_burn_quotes
  on flights (repo_id, opened_at desc nulls last)
  where outcome = 'burn' and reviewer_excerpt is not null;
-- Author page flight list + flight page related_by_author buckets. Supersedes
-- flights_author (author_id), which it covers as a leading-column prefix.
create index if not exists flights_author_recent
  on flights (author_id, index_ok desc, opened_at desc nulls last);
drop index if exists flights_author;
-- Agent page "notable" (indexed flights by agent) — partial, ~20k rows.
create index if not exists flights_agent_indexok
  on flights (agent, opened_at desc nulls last) where index_ok;

-- ---------------------------------------------------------------------------
-- Rollup: one row per (repo, author, agent), ~120k rows. Deliberately
-- unfiltered — callers join authors/repos live, so an opt-out or exclusion
-- takes effect on the next request even though the counts lag by one publish
-- like every other mv_*. pipeline/src/views.ts refreshes every public matview,
-- so this one is picked up without a code change.
-- ---------------------------------------------------------------------------

create materialized view if not exists mv_flight_rollup as
  select f.repo_id, f.author_id, f.agent,
         count(*)::integer                                     as flights,
         count(*) filter (where f.index_ok)::integer           as indexed,
         count(*) filter (where f.state = 'merged')::integer   as merged,
         count(*) filter (where f.outcome = 'burn')::integer   as burns
  from flights f
  group by f.repo_id, f.author_id, f.agent;
create unique index if not exists mv_flight_rollup_pk on mv_flight_rollup (repo_id, author_id, agent);
create index if not exists mv_flight_rollup_author on mv_flight_rollup (author_id);

create or replace function refresh_corpus_views() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_repo_agent_stats;
  refresh materialized view concurrently mv_repo_monthly;
  refresh materialized view concurrently mv_agent_monthly;
  refresh materialized view concurrently mv_agent_totals;
  refresh materialized view concurrently mv_agent_task_types;
  refresh materialized view concurrently mv_author_totals;
  refresh materialized view concurrently mv_agent_authors;
  refresh materialized view concurrently mv_corpus_repos;
  refresh materialized view concurrently mv_flight_rollup;
end $$;

-- ---------------------------------------------------------------------------
-- repo_page: same JSON. Latest-50 and burns walk their indexes; top_authors,
-- total and indexed read the rollup (≤ a few hundred rows per repo) instead
-- of every flight.
-- ---------------------------------------------------------------------------

create or replace function repo_page(p_owner text, p_repo text)
returns jsonb language plpgsql stable as $$
declare v_repo repos;
begin
  select * into v_repo from repos where full_name_lower = lower(p_owner || '/' || p_repo);
  if not found then return null; end if;
  if v_repo.excluded then return jsonb_build_object('gone', true); end if;
  return jsonb_build_object(
    'repo', jsonb_build_object(
      'full_name', v_repo.full_name, 'owner', v_repo.owner, 'name', v_repo.name,
      'stars', v_repo.stars, 'primary_language', v_repo.primary_language,
      'license', v_repo.license, 'fetched_at', v_repo.fetched_at
    ),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent', s.agent, 'flights', s.flights, 'merged', s.merged,
        'merge_rate', s.merge_rate, 'burn_rate', s.burn_rate,
        'median_hours_to_merge', round(s.median_hours_to_merge::numeric, 1),
        'last_flight_at', s.last_flight_at
      ) order by s.flights desc)
      from mv_repo_agent_stats s where s.repo_id = v_repo.id
    ), '[]'::jsonb),
    'flights', coalesce((
      select jsonb_agg(t.item order by t.opened_at desc nulls last)
      from (
        select flight_list_item(f0) as item, f0.opened_at
        from flights f0
        join authors a on a.id = f0.author_id
        where f0.repo_id = v_repo.id and a.opted_out is not true
        order by f0.opened_at desc nulls last limit 50
      ) t
    ), '[]'::jsonb),
    'burns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', f.number, 'agent', f.agent,
        'reviewer_excerpt', f.reviewer_excerpt, 'reviewer_excerpt_url', f.reviewer_excerpt_url
      ) order by f.opened_at desc nulls last)
      from (
        select f0.* from flights f0
        join authors a on a.id = f0.author_id
        where f0.repo_id = v_repo.id and f0.outcome = 'burn'
          and f0.reviewer_excerpt is not null and a.opted_out is not true
        order by f0.opened_at desc nulls last limit 6
      ) f
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', m.month, 'flights', m.flights, 'merged', m.merged, 'burns', m.burns
      ) order by m.month)
      from mv_repo_monthly m where m.repo_id = v_repo.id
    ), '[]'::jsonb),
    'riders', coalesce((
      select jsonb_agg(distinct c.rider_handle)
      from claims c join flights f on f.id = c.flight_id
      where f.repo_id = v_repo.id and c.visibility = 'public'
    ), '[]'::jsonb),
    'top_authors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'login', x.login, 'name', x.name, 'flights', x.flights, 'indexed', x.indexed
      ) order by x.indexed desc, x.flights desc, x.login)
      from (
        select a.login, a.name, s.flights, s.indexed
        from (
          select author_id, sum(flights)::integer as flights, sum(indexed)::integer as indexed
          from mv_flight_rollup where repo_id = v_repo.id
          group by author_id
        ) s
        join authors a on a.id = s.author_id
        where a.is_bot is not true and a.opted_out is not true
        order by s.indexed desc, s.flights desc, a.login limit 10
      ) x
    ), '[]'::jsonb),
    'total', (select coalesce(sum(s.flights), 0) from mv_flight_rollup s
              join authors a on a.id = s.author_id
              where s.repo_id = v_repo.id and a.opted_out is not true),
    'indexed', (select coalesce(sum(s.indexed), 0) from mv_flight_rollup s
                join authors a on a.id = s.author_id
                where s.repo_id = v_repo.id and a.opted_out is not true)
  );
end $$;

-- ---------------------------------------------------------------------------
-- flight_page: same JSON. The three "related" lists keep their order but are
-- built from ordered buckets: Postgres runs UNION ALL branches in sequence and
-- the outer LIMIT stops as soon as it has enough rows, so a bot author with
-- 30k flights costs three index probes, not a 30k-row sort.
-- ---------------------------------------------------------------------------

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
    'author', author_public(v_author) || jsonb_build_object(
      'indexed_flights', (select count(*) from flights f3
                          where f3.author_id = v_author.id and f3.index_ok)
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
    -- first, then indexed first, then newest.
    'related_by_author', coalesce((
      select jsonb_agg(flight_list_item(t.f) || jsonb_build_object('repo', t.repo)
                       order by t.b, (t.f).opened_at desc nulls last)
      from (
        (select f2 as f, r2.full_name as repo, 1 as b from flights f2 join repos r2 on r2.id = f2.repo_id
          where f2.author_id = v_author.id and f2.index_ok and f2.repo_id <> v_repo.id
            and r2.excluded is not true
          order by f2.index_ok desc, f2.opened_at desc nulls last limit 3)
        union all
        (select f2, r2.full_name, 2 from flights f2 join repos r2 on r2.id = f2.repo_id
          where f2.author_id = v_author.id and not f2.index_ok and f2.repo_id <> v_repo.id
            and r2.excluded is not true
          order by f2.index_ok desc, f2.opened_at desc nulls last limit 3)
        union all
        (select f2, v_repo.full_name, 3 from flights f2
          where f2.author_id = v_author.id and f2.index_ok and f2.repo_id = v_repo.id
            and f2.id <> v_flight.id
          order by f2.index_ok desc, f2.opened_at desc nulls last limit 3)
        union all
        (select f2, v_repo.full_name, 4 from flights f2
          where f2.author_id = v_author.id and not f2.index_ok and f2.repo_id = v_repo.id
            and f2.id <> v_flight.id
          order by f2.index_ok desc, f2.opened_at desc nulls last limit 3)
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

-- ---------------------------------------------------------------------------
-- author_page: same JSON. Aggregates read the rollup; the flight list walks
-- flights_author_recent in its exact order.
-- ---------------------------------------------------------------------------

create or replace function author_page(p_login text)
returns jsonb language plpgsql stable as $$
declare v_author authors; v_tot mv_author_totals;
begin
  select a.* into v_author
  from authors a
  left join mv_author_totals t on t.author_id = a.id
  where a.login_lower = lower(p_login)
  order by a.profile_fetched_at desc nulls last, coalesce(t.indexed, 0) desc, a.id
  limit 1;
  if not found then return null; end if;
  if v_author.opted_out then return jsonb_build_object('gone', true); end if;
  select * into v_tot from mv_author_totals where author_id = v_author.id;
  return jsonb_build_object(
    'author', author_public(v_author),
    -- For a bot login the route 301s to this agent's page.
    'dominant_agent', (
      select s.agent from mv_flight_rollup s where s.author_id = v_author.id
      group by s.agent order by sum(s.flights) desc, s.agent limit 1
    ),
    'totals', jsonb_build_object(
      'flights', coalesce(v_tot.flights, 0), 'indexed', coalesce(v_tot.indexed, 0),
      'merged', coalesce(v_tot.merged, 0), 'burns', coalesce(v_tot.burns, 0),
      'repos', coalesce(v_tot.repos, 0), 'merge_rate', v_tot.merge_rate,
      'burn_rate', v_tot.burn_rate, 'last_flight_at', v_tot.last_flight_at
    ),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent', x.agent, 'flights', x.flights, 'merged', x.merged, 'burns', x.burns
      ) order by x.flights desc, x.agent)
      from (
        select s.agent, sum(s.flights)::integer as flights,
               sum(s.merged)::integer as merged, sum(s.burns)::integer as burns
        from mv_flight_rollup s join repos r on r.id = s.repo_id
        where s.author_id = v_author.id and r.excluded is not true
        group by s.agent
      ) x
    ), '[]'::jsonb),
    'repos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', x.full_name, 'stars', x.stars, 'primary_language', x.primary_language, 'flights', x.flights
      ) order by x.flights desc, x.full_name)
      from (
        select r.full_name, r.stars, r.primary_language, sum(s.flights)::integer as flights
        from mv_flight_rollup s join repos r on r.id = s.repo_id
        where s.author_id = v_author.id and r.excluded is not true
        group by r.id, r.full_name, r.stars, r.primary_language
        order by flights desc, r.full_name limit 20
      ) x
    ), '[]'::jsonb),
    'flights', coalesce((
      select jsonb_agg(t.item order by t.rank)
      from (
        select flight_list_item(f) || jsonb_build_object('repo', r.full_name) as item,
               row_number() over (order by f.index_ok desc, f.opened_at desc nulls last) as rank
        from flights f join repos r on r.id = f.repo_id
        where f.author_id = v_author.id and r.excluded is not true
        order by f.index_ok desc, f.opened_at desc nulls last limit 50
      ) t
    ), '[]'::jsonb),
    'claim', (
      select jsonb_build_object('rider_handle', c.rider_handle)
      from claims c
      where c.github_user_id = v_author.github_user_id and c.visibility = 'public'
      order by c.claimed_at desc limit 1
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Sitemaps as single jsonb arrays (PostgREST max-rows cannot truncate them).
-- The return type changes, so drop + create. Same rows, same order.
-- ---------------------------------------------------------------------------

drop function if exists sitemap_flights(integer);
create function sitemap_flights(p_chunk integer)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('loc', x.loc, 'lastmod', x.lastmod) order by x.id), '[]'::jsonb)
  from (
    select f.id, '/logs/' || r.full_name || '/' || f.number || '/' as loc,
           to_char(coalesce(f.enriched_at, f.updated_at), 'YYYY-MM-DD') as lastmod
    from flights f join repos r on r.id = f.repo_id
    where f.index_ok
    order by f.id
    limit 10000 offset greatest(0, p_chunk) * 10000
  ) x;
$$;

drop function if exists sitemap_pages();
create function sitemap_pages()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('loc', x.loc, 'lastmod', x.lastmod)), '[]'::jsonb)
  from (
    select '/logs/agent/' || t.agent || '/' as loc, to_char(now(), 'YYYY-MM-DD') as lastmod
    from mv_agent_totals t
    union all
    select '/logs/' || r.full_name || '/',
           to_char(max(coalesce(f.enriched_at, f.updated_at)), 'YYYY-MM-DD')
    from repos r
    join flights f on f.repo_id = r.id
    where f.index_ok and r.excluded is not true
    group by r.id
    union all
    select '/logs/author/' || a.login_lower || '/',
           to_char(max(coalesce(f.enriched_at, f.updated_at)), 'YYYY-MM-DD')
    from authors a
    join flights f on f.author_id = a.id
    where f.index_ok and a.is_bot is not true and a.opted_out is not true
    group by a.login_lower
    having count(*) >= author_index_min()
    union all
    select '/logs/repositories/' || case when g = 1 then '' else g || '/' end,
           to_char(now(), 'YYYY-MM-DD')
    from generate_series(
      1, greatest(1, ceil((select count(*) from mv_corpus_repos)::numeric / 120)::int)) g
    union all
    select '/logs/authors/' || case when g = 1 then '' else g || '/' end,
           to_char(now(), 'YYYY-MM-DD')
    from generate_series(
      1, greatest(1, ceil((
        select count(*) from mv_author_totals t join authors a on a.id = t.author_id
        where a.opted_out is not true and a.is_bot is not true and t.indexed >= author_index_min()
      )::numeric / 120)::int)) g
  ) x;
$$;

-- The corpus stays server-only (0001): new objects get no anon/authenticated
-- access, which Supabase's default privileges would otherwise grant.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on mv_flight_rollup from anon;
    revoke all on function sitemap_flights(integer), sitemap_pages() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on mv_flight_rollup from authenticated;
    revoke all on function sitemap_flights(integer), sitemap_pages() from authenticated;
  end if;
end $$;

analyze flights;
