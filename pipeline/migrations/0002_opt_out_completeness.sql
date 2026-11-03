-- 0002: opt-out / repo-exclusion completeness (review findings #1, #2).
--
-- Opting out or excluding a repo must remove flights from EVERY public
-- surface, not only index_ok: the per-flight "related" list, public rider
-- profiles, and all aggregate counts/rates. 0001 filtered the main flight
-- page, the repo flight/burn lists and sitemaps, but missed the related list,
-- rider_flights, the public totals, and the five materialized views.

-- ---------------------------------------------------------------------------
-- #2 — aggregate views exclude opted-out authors and excluded repos
-- ---------------------------------------------------------------------------

drop materialized view if exists mv_repo_agent_stats;
create materialized view mv_repo_agent_stats as
select
  f.repo_id, f.agent,
  count(*)::integer                                    as flights,
  count(*) filter (where f.state = 'merged')::integer  as merged,
  count(*) filter (where f.outcome = 'burn')::integer  as burns,
  round(count(*) filter (where f.state = 'merged')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as merge_rate,
  round(count(*) filter (where f.outcome = 'burn')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as burn_rate,
  percentile_cont(0.5) within group (order by f.hours_to_merge)
    filter (where f.hours_to_merge is not null)        as median_hours_to_merge,
  max(f.opened_at)                                     as last_flight_at
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where a.opted_out is not true and r.excluded is not true
group by f.repo_id, f.agent;
create unique index mv_repo_agent_stats_pk on mv_repo_agent_stats (repo_id, agent);

drop materialized view if exists mv_repo_monthly;
create materialized view mv_repo_monthly as
select
  f.repo_id,
  to_char(date_trunc('month', f.opened_at), 'YYYY-MM') as month,
  count(*)::integer                                    as flights,
  count(*) filter (where f.state = 'merged')::integer  as merged,
  count(*) filter (where f.outcome = 'burn')::integer  as burns
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where f.opened_at is not null and a.opted_out is not true and r.excluded is not true
group by f.repo_id, date_trunc('month', f.opened_at);
create unique index mv_repo_monthly_pk on mv_repo_monthly (repo_id, month);

drop materialized view if exists mv_agent_monthly;
create materialized view mv_agent_monthly as
select
  f.agent,
  to_char(date_trunc('month', f.opened_at), 'YYYY-MM') as month,
  count(*)::integer                                    as flights,
  count(*) filter (where f.state = 'merged')::integer  as merged,
  count(*) filter (where f.outcome = 'burn')::integer  as burns,
  round(count(*) filter (where f.state = 'merged')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as merge_rate,
  round(count(*) filter (where f.outcome = 'burn')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as burn_rate
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where f.opened_at is not null and a.opted_out is not true and r.excluded is not true
group by f.agent, date_trunc('month', f.opened_at);
create unique index mv_agent_monthly_pk on mv_agent_monthly (agent, month);

drop materialized view if exists mv_agent_totals;
create materialized view mv_agent_totals as
select
  f.agent,
  count(*)::integer                                    as flights,
  count(*) filter (where f.state = 'merged')::integer  as merged,
  count(*) filter (where f.outcome = 'burn')::integer  as burns,
  count(distinct f.repo_id)::integer                   as repos,
  round(count(*) filter (where f.state = 'merged')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as merge_rate,
  round(count(*) filter (where f.outcome = 'burn')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as burn_rate,
  percentile_cont(0.5) within group (order by f.hours_to_merge)
    filter (where f.hours_to_merge is not null)        as median_hours_to_merge
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where a.opted_out is not true and r.excluded is not true
group by f.agent;
create unique index mv_agent_totals_pk on mv_agent_totals (agent);

drop materialized view if exists mv_agent_task_types;
create materialized view mv_agent_task_types as
select f.agent, f.task_type, count(*)::integer as flights
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where f.task_type is not null and a.opted_out is not true and r.excluded is not true
group by f.agent, f.task_type;
create unique index mv_agent_task_types_pk on mv_agent_task_types (agent, task_type);

-- ---------------------------------------------------------------------------
-- #1 — related list, rider profiles and public totals exclude opted-out
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
    'author', jsonb_build_object(
      'login', v_author.login, 'avatar_url', v_author.avatar_url,
      'github_user_id', v_author.github_user_id, 'is_bot', v_author.is_bot
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
    -- related: same-repo flights, excluding any whose author opted out.
    'related', coalesce((
      select jsonb_agg(t.item order by t.rank)
      from (
        select flight_list_item(f2) as item,
               row_number() over (order by f2.index_ok desc, f2.opened_at desc) as rank
        from flights f2
        join authors a2 on a2.id = f2.author_id
        where f2.repo_id = v_repo.id and f2.id <> v_flight.id
          and a2.opted_out is not true
        order by f2.index_ok desc, f2.opened_at desc limit 3
      ) t
    ), '[]'::jsonb)
  );
  return out;
end $$;

-- repo_page: the "total" count now excludes opted-out authors. (agents,
-- burns, flights and monthly already filter, or read the now-filtered views.)
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
      ) order by f.opened_at desc)
      from (
        select f0.* from flights f0
        join authors a on a.id = f0.author_id
        where f0.repo_id = v_repo.id and f0.outcome = 'burn'
          and f0.reviewer_excerpt is not null and a.opted_out is not true
        order by f0.opened_at desc limit 6
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
    'total', (select count(*) from flights f
              join authors a on a.id = f.author_id
              where f.repo_id = v_repo.id and a.opted_out is not true)
  );
end $$;

-- rider_flights: a public profile must not show a flight whose author later
-- opted out. The owner can still opt back in from /opt-out.
create or replace function rider_flights(p_rider_id text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', count(*),
    'public', count(*) filter (where c.visibility = 'public'),
    'flights', coalesce(jsonb_agg(
      flight_list_item(f) || jsonb_build_object(
        'id', f.id, 'repo', r.full_name, 'visibility', c.visibility, 'note', c.note,
        'claimed_at', c.claimed_at)
      order by f.opened_at desc), '[]'::jsonb))
  from claims c
  join flights f on f.id = c.flight_id
  join repos r   on r.id = f.repo_id
  join authors a on a.id = f.author_id
  where c.rider_id = p_rider_id and a.opted_out is not true and r.excluded is not true;
$$;

-- corpus_repos: index counts exclude opted-out authors.
create or replace function corpus_repos(p_limit integer default 1000)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'full_name', x.full_name, 'stars', x.stars, 'primary_language', x.primary_language,
    'flights', x.flights, 'indexed_flights', x.indexed
  ) order by x.indexed desc, x.flights desc), '[]'::jsonb)
  from (
    select r.full_name, r.stars, r.primary_language,
           count(*)::integer as flights,
           count(*) filter (where f.index_ok)::integer as indexed
    from repos r
    join flights f on f.repo_id = r.id
    join authors a on a.id = f.author_id
    where r.excluded is not true and a.opted_out is not true
    group by r.id
    having count(*) filter (where f.index_ok) > 0
    order by indexed desc, flights desc
    limit p_limit
  ) x;
$$;
