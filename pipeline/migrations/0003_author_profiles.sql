-- 0003: author profiles and author pages.
--
-- Public GitHub profile fields for attribution (docs/flight-log-corpus.md,
-- Consent and footprint): name, bio, company, website, social links and a
-- ≤25-word excerpt of the profile README, fetched by the author-profiles job
-- from the GraphQL API, refreshed monthly, cleared on opt-out.
--
-- Rules this file keeps:
--   * No profile field ever lives in a materialized view. Views refresh only
--     at publish, and a name there would outlive an opt-out by a day. Every
--     reader of a name joins authors live with opted_out is not true.
--   * opt_out_author() clears every profile column and stamps
--     profile_fetched_at so the job never re-fetches; opting back in clears
--     the stamp so the backfill picks the row up again.
--   * The author-page index gate is one function, author_index_min(), so it
--     can be raised in one line (docs/seo-aeo-plan.md, corpus).
-- Re-runnable: migrate() applies every file each time.

alter table authors add column if not exists name text;
alter table authors add column if not exists bio text;
alter table authors add column if not exists company text;
alter table authors add column if not exists website_url text;
alter table authors add column if not exists social_urls text[] not null default '{}';
alter table authors add column if not exists readme_excerpt text check (char_length(readme_excerpt) <= 300);
alter table authors add column if not exists profile_fetched_at timestamptz;

-- related_by_task on the flight page: same agent and task type, indexed only.
create index if not exists flights_agent_task_indexed
  on flights (agent, task_type, opened_at desc) where index_ok;

-- The author-page gate: indexed flights an author needs before their page is
-- indexable and listed in the sitemap.
create or replace function author_index_min() returns integer language sql immutable as $$
  select 1
$$;

-- ---------------------------------------------------------------------------
-- Author aggregates (ids and counts only — see the rules above).
-- ---------------------------------------------------------------------------

drop materialized view if exists mv_author_totals;
create materialized view mv_author_totals as
select
  f.author_id,
  count(*)::integer                                    as flights,
  count(*) filter (where f.index_ok)::integer          as indexed,
  count(*) filter (where f.state = 'merged')::integer  as merged,
  count(*) filter (where f.outcome = 'burn')::integer  as burns,
  count(distinct f.repo_id)::integer                   as repos,
  array_agg(distinct f.agent)                          as agents,
  round(count(*) filter (where f.state = 'merged')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as merge_rate,
  round(count(*) filter (where f.outcome = 'burn')::numeric
        / nullif(count(*) filter (where f.state <> 'open'), 0), 3) as burn_rate,
  max(f.opened_at)                                     as last_flight_at
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where a.is_bot is not true and a.opted_out is not true and r.excluded is not true
group by f.author_id;
create unique index mv_author_totals_pk on mv_author_totals (author_id);
create index mv_author_totals_rank on mv_author_totals (indexed desc, flights desc);

-- Per-agent author ranking for the agent page's "top authors".
drop materialized view if exists mv_agent_authors;
create materialized view mv_agent_authors as
select
  f.agent,
  f.author_id,
  count(*)::integer                                    as flights,
  count(*) filter (where f.index_ok)::integer          as indexed
from flights f
join authors a on a.id = f.author_id
join repos r   on r.id = f.repo_id
where a.is_bot is not true and a.opted_out is not true and r.excluded is not true
group by f.agent, f.author_id;
create unique index mv_agent_authors_pk on mv_agent_authors (agent, author_id);
create index mv_agent_authors_rank on mv_agent_authors (agent, indexed desc, flights desc);

create or replace function refresh_corpus_views() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_repo_agent_stats;
  refresh materialized view concurrently mv_repo_monthly;
  refresh materialized view concurrently mv_agent_monthly;
  refresh materialized view concurrently mv_agent_totals;
  refresh materialized view concurrently mv_agent_task_types;
  refresh materialized view concurrently mv_author_totals;
  refresh materialized view concurrently mv_agent_authors;
end $$;

-- ---------------------------------------------------------------------------
-- Opt-out clears the profile and stops re-fetching; opt-in re-queues it.
-- ---------------------------------------------------------------------------

create or replace function opt_out_author(p_github_user_id bigint, p_opted_out boolean)
returns jsonb language plpgsql as $$
declare n integer;
begin
  update authors set
    opted_out = p_opted_out,
    opted_out_at = case when p_opted_out then now() end,
    name = case when p_opted_out then null else name end,
    bio = case when p_opted_out then null else bio end,
    company = case when p_opted_out then null else company end,
    website_url = case when p_opted_out then null else website_url end,
    social_urls = case when p_opted_out then '{}'::text[] else social_urls end,
    readme_excerpt = case when p_opted_out then null else readme_excerpt end,
    profile_fetched_at = case when p_opted_out then now() else null end
  where github_user_id = p_github_user_id;
  get diagnostics n = row_count;
  if n = 0 and p_opted_out then
    -- Keep the row so the pipeline never re-creates them tomorrow — even when
    -- no flight of theirs is loaded yet.
    insert into authors (github_user_id, login, opted_out, opted_out_at, profile_fetched_at)
    values (p_github_user_id, 'opted-out-' || p_github_user_id, true, now(), now())
    on conflict (github_user_id) do update
      set opted_out = true, opted_out_at = now(), profile_fetched_at = now();
  end if;
  update flights f set index_ok = false
  from authors a
  where a.id = f.author_id and a.github_user_id = p_github_user_id
    and p_opted_out and f.index_ok;
  return jsonb_build_object('ok', true, 'opted_out', p_opted_out);
end $$;

-- ---------------------------------------------------------------------------
-- Page reads.
-- ---------------------------------------------------------------------------

-- The author as a page shows them. Profile fields are blank for an opted-out
-- row even if a caller forgets the check.
create or replace function author_public(a authors) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'login', a.login, 'avatar_url', a.avatar_url, 'github_user_id', a.github_user_id, 'is_bot', a.is_bot,
    'name',           case when a.opted_out then null else a.name end,
    'bio',            case when a.opted_out then null else a.bio end,
    'company',        case when a.opted_out then null else a.company end,
    'website_url',    case when a.opted_out then null else a.website_url end,
    'social_urls',    case when a.opted_out then '[]'::jsonb else to_jsonb(coalesce(a.social_urls, '{}'::text[])) end,
    'readme_excerpt', case when a.opted_out then null else a.readme_excerpt end,
    'profile_fetched_at', a.profile_fetched_at
  );
$$;

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
      'indexed_flights', (select count(*) from flights f3 where f3.author_id = v_author.id and f3.index_ok)
    ),
    -- The human in the loop on a bot-authored flight: whoever merged it.
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
    -- related: same-repo flights (the published .json contract), excluding
    -- any whose author opted out.
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
    ), '[]'::jsonb),
    -- related_by_author: the same account's other flights, other repos first.
    'related_by_author', coalesce((
      select jsonb_agg(t.item order by t.rank)
      from (
        select flight_list_item(f2) || jsonb_build_object('repo', r2.full_name) as item,
               row_number() over (order by (f2.repo_id = v_repo.id), f2.index_ok desc, f2.opened_at desc) as rank
        from flights f2
        join repos r2 on r2.id = f2.repo_id
        where f2.author_id = v_author.id and f2.id <> v_flight.id and r2.excluded is not true
        order by (f2.repo_id = v_repo.id), f2.index_ok desc, f2.opened_at desc limit 3
      ) t
    ), '[]'::jsonb),
    -- related_by_task: indexed flights by the same agent on the same task type.
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
    -- The humans who fly agents here (live join: a name never outlives an opt-out).
    'top_authors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'login', x.login, 'name', x.name, 'flights', x.flights, 'indexed', x.indexed
      ) order by x.indexed desc, x.flights desc, x.login)
      from (
        select a.login, a.name,
               count(*)::integer as flights,
               count(*) filter (where f.index_ok)::integer as indexed
        from flights f join authors a on a.id = f.author_id
        where f.repo_id = v_repo.id and a.is_bot is not true and a.opted_out is not true
        group by a.id, a.login, a.name
        order by indexed desc, flights desc, a.login limit 10
      ) x
    ), '[]'::jsonb),
    'total', (select count(*) from flights f
              join authors a on a.id = f.author_id
              where f.repo_id = v_repo.id and a.opted_out is not true),
    'indexed', (select count(*) from flights f
                join authors a on a.id = f.author_id
                where f.repo_id = v_repo.id and f.index_ok and a.opted_out is not true)
  );
end $$;

create or replace function agent_page(p_agent text)
returns jsonb language plpgsql stable as $$
declare v_tot mv_agent_totals;
begin
  select * into v_tot from mv_agent_totals where agent = p_agent;
  if not found then return null; end if;
  return jsonb_build_object(
    'agent', p_agent,
    'totals', jsonb_build_object(
      'flights', v_tot.flights, 'merged', v_tot.merged, 'burns', v_tot.burns,
      'repos', v_tot.repos, 'merge_rate', v_tot.merge_rate, 'burn_rate', v_tot.burn_rate,
      'median_hours_to_merge', round(v_tot.median_hours_to_merge::numeric, 1)
    ),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', m.month, 'flights', m.flights, 'merge_rate', m.merge_rate,
        'burn_rate', m.burn_rate
      ) order by m.month)
      from mv_agent_monthly m where m.agent = p_agent
    ), '[]'::jsonb),
    'top_repos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', x.full_name, 'stars', x.stars, 'flights', x.flights,
        'merge_rate', x.merge_rate
      ) order by x.flights desc)
      from (
        select r0.full_name, r0.stars, s0.flights, s0.merge_rate
        from mv_repo_agent_stats s0
        join repos r0 on r0.id = s0.repo_id
        where s0.agent = p_agent and r0.excluded is not true
        order by s0.flights desc limit 10
      ) x
    ), '[]'::jsonb),
    'top_authors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'login', x.login, 'name', x.name, 'flights', x.flights, 'indexed', x.indexed
      ) order by x.indexed desc, x.flights desc, x.login)
      from (
        select a.login, a.name, s.flights, s.indexed
        from mv_agent_authors s
        join authors a on a.id = s.author_id
        where s.agent = p_agent and a.opted_out is not true and a.is_bot is not true
        order by s.indexed desc, s.flights desc, a.login limit 10
      ) x
    ), '[]'::jsonb),
    'task_types', coalesce((
      select jsonb_agg(jsonb_build_object('type', t.task_type, 'flights', t.flights)
        order by t.flights desc)
      from mv_agent_task_types t where t.agent = p_agent
    ), '[]'::jsonb),
    'notable', coalesce((
      select jsonb_agg(t.item order by t.opened_at desc nulls last)
      from (
        select flight_list_item(f) || jsonb_build_object('repo', r.full_name) as item,
               f.opened_at
        from flights f join repos r on r.id = f.repo_id
        where f.agent = p_agent and f.index_ok
        order by f.opened_at desc nulls last limit 10
      ) t
    ), '[]'::jsonb)
  );
end $$;

-- The author page. login is not unique (renames; enrichment rewrites it):
-- the row the API last confirmed owns the login wins, then the one with the
-- most indexed flights.
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
      select f.agent from flights f where f.author_id = v_author.id
      group by f.agent order by count(*) desc, f.agent limit 1
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
        select f.agent, count(*)::integer as flights,
               count(*) filter (where f.state = 'merged')::integer as merged,
               count(*) filter (where f.outcome = 'burn')::integer as burns
        from flights f join repos r on r.id = f.repo_id
        where f.author_id = v_author.id and r.excluded is not true
        group by f.agent
      ) x
    ), '[]'::jsonb),
    'repos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', x.full_name, 'stars', x.stars, 'primary_language', x.primary_language, 'flights', x.flights
      ) order by x.flights desc, x.full_name)
      from (
        select r.full_name, r.stars, r.primary_language, count(*)::integer as flights
        from flights f join repos r on r.id = f.repo_id
        where f.author_id = v_author.id and r.excluded is not true
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

-- Authors with indexed flights, for the hub and /logs/authors.json.
create or replace function corpus_authors(p_limit integer default 100)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'login', x.login, 'name', x.name, 'flights', x.flights,
    'indexed_flights', x.indexed, 'agents', to_jsonb(x.agents)
  ) order by x.indexed desc, x.flights desc, x.login), '[]'::jsonb)
  from (
    select a.login, a.name, t.flights, t.indexed, t.agents
    from mv_author_totals t
    join authors a on a.id = t.author_id
    where a.opted_out is not true and a.is_bot is not true
      and t.indexed >= author_index_min()
    order by t.indexed desc, t.flights desc, a.login
    limit p_limit
  ) x;
$$;

-- Sitemap: agent pages, repo pages with indexed flights, and author pages at
-- or above the gate. Author URLs are lowercase (login_lower).
create or replace function sitemap_pages()
returns table (loc text, lastmod text) language sql stable as $$
  select '/logs/agent/' || t.agent || '/',
         to_char(now(), 'YYYY-MM-DD')
  from mv_agent_totals t
  union all
  select '/logs/' || r.full_name || '/',
         to_char(max(coalesce(f.enriched_at, f.updated_at)), 'YYYY-MM-DD')
  from repos r join flights f on f.repo_id = r.id
  where r.excluded is not true
  group by r.id
  having count(*) filter (where f.index_ok) > 0
  union all
  select '/logs/author/' || a.login_lower || '/',
         to_char(max(coalesce(f.enriched_at, f.updated_at)), 'YYYY-MM-DD')
  from authors a join flights f on f.author_id = a.id
  where a.is_bot is not true and a.opted_out is not true
  group by a.login_lower
  having count(*) filter (where f.index_ok) >= author_index_min();
$$;
