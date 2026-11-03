-- Flight Log corpus: Supabase Postgres schema.
-- Apply with: node pipeline/src/run.ts migrate   (DATABASE_URL)
--
-- Conventions: the pipeline (direct Postgres) and the site (PostgREST RPC
-- with the service key) are the only clients. Row Level Security is enabled
-- with NO policies and all grants to anon/authenticated are revoked, so the
-- browser-facing keys can read nothing; the service role bypasses RLS.
-- Every number a page shows is a stored field here — pages compute nothing.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists repos (
  id               bigint generated always as identity primary key,
  github_repo_id   bigint unique,
  full_name        text not null,
  full_name_lower  text generated always as (lower(full_name)) stored,
  owner            text generated always as (split_part(full_name, '/', 1)) stored,
  name             text generated always as (split_part(full_name, '/', 2)) stored,
  stars            integer,
  primary_language text,
  license          text,
  is_fork          boolean,
  excluded         boolean not null default false,  -- owner takedown (48h promise)
  excluded_at      timestamptz,
  fetched_at       timestamptz,                      -- last metadata refresh
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists repos_full_name_lower on repos (full_name_lower);
create index if not exists repos_owner_name on repos (lower(owner), lower(name));

-- Data minimisation: login, numeric id, constructed avatar URL. Nothing else.
create table if not exists authors (
  id             bigint generated always as identity primary key,
  github_user_id bigint not null unique,
  login          text not null,
  login_lower    text generated always as (lower(login)) stored,
  avatar_url     text,
  is_bot         boolean not null default false,
  opted_out      boolean not null default false,
  opted_out_at   timestamptz,
  fetched_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists authors_login_lower on authors (login_lower);

create table if not exists flights (
  id             bigint generated always as identity primary key,
  github_pr_id   bigint unique,                 -- GitHub's PR database id
  repo_id        bigint not null references repos (id),
  author_id      bigint not null references authors (id),
  number         integer not null,
  title          text not null default '',
  body_excerpt   text check (char_length(body_excerpt) <= 300),
  body_chars     integer,                       -- original body length (page marks truncation)
  agent          text not null check (agent in
                   ('openai-codex','github-copilot','devin','cursor','claude-code','unknown')),
  signals        text[] not null default '{}',  -- every matched signal, never just the label
  confidence     text not null check (confidence in ('dataset','high','medium','low')),
  state          text not null check (state in ('open','merged','closed')),
  opened_at      timestamptz,
  merged_at      timestamptz,
  closed_at      timestamptz,
  -- Numbers row. metrics_source says whether they are AIDev commit-sums
  -- (approximation) or GitHub's exact PR totals from enrichment.
  additions      integer,
  deletions      integer,
  files_changed  integer,
  commits        integer,
  metrics_source text check (metrics_source in ('aidev_commit_sum','github_api')),
  review_count   integer,                       -- all submitted reviews
  change_requests integer,                      -- CHANGES_REQUESTED reviews
  review_comment_count integer,                 -- inline (diff) comments
  -- Classifier inputs kept as stored fields so a re-run needs no re-fetch.
  human_review_count  integer,                  -- reviews by non-author humans
  human_comment_count integer,                  -- discussion comments by non-author humans
  first_review_at     timestamptz,
  commits_after_first_review integer,
  hours_to_merge numeric(10,2),
  outcome        text check (outcome in
                   ('merged_clean','merged_after_rework','burn','abandoned','open','stale')),
  task_type      text,
  debrief        text,
  debrief_prompt_version text,
  debrief_failed_at timestamptz,                -- validation failed after retry; page renders without
  reviewer_excerpt     text check (char_length(reviewer_excerpt) <= 700),  -- ≤25 words, verbatim
  reviewer_excerpt_url text,
  source         text not null check (source in ('aidev','gharchive')),
  enriched_at    timestamptz,
  classified_at  timestamptz,
  index_ok       boolean not null default false,
  og_generated_at timestamptz,
  raw            jsonb,                          -- verbatim GraphQL response (enriched flights)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (repo_id, number)
);
create index if not exists flights_author   on flights (author_id);
create index if not exists flights_agent    on flights (agent, opened_at desc);
create index if not exists flights_repo     on flights (repo_id, opened_at desc);
create index if not exists flights_indexok  on flights (opened_at desc) where index_ok;
create index if not exists flights_open     on flights (enriched_at) where state = 'open';
create index if not exists flights_outcome  on flights (outcome);

create table if not exists flight_events (
  flight_id   bigint not null references flights (id) on delete cascade,
  seq         integer not null,
  kind        text not null check (kind in
               ('committed','reviewed','changes_requested','labeled','closed','merged')),
  actor_login text,
  at          timestamptz,
  url         text,
  primary key (flight_id, seq)
);

-- One claim per flight; the claimant must be the PR author (enforced in
-- claim_flight). rider_id/rider_handle come from the site's D1 (the person
-- system of record); github_user_id is the proof recorded at claim time.
create table if not exists claims (
  flight_id      bigint primary key references flights (id) on delete cascade,
  rider_id       text not null,
  rider_handle   text not null,
  github_user_id bigint not null,
  claimed_at     timestamptz not null default now(),
  verified_by    text not null default 'github_oauth',
  visibility     text not null default 'public' check (visibility in ('public','hidden')),
  note           text check (char_length(note) <= 280),  -- "What I'd do differently"
  note_updated_at timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists claims_rider on claims (rider_id);
create index if not exists claims_user  on claims (github_user_id);

create table if not exists pipeline_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  rows_in      integer,
  rows_out     integer,
  errors       integer not null default 0,
  error_sample text,
  meta         jsonb
);
create index if not exists pipeline_runs_job on pipeline_runs (job, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['repos','authors','flights','claims'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The quality gate. index_ok is computed, never set by hand.
-- ---------------------------------------------------------------------------

create or replace function recompute_index_ok() returns integer language sql as $$
  with computed as (
    select f.id,
      ( f.confidence in ('high','medium','dataset')
        and coalesce(r.stars, 0) >= 100
        and r.is_fork is not true
        and r.excluded is not true
        and a.opted_out is not true
        and ( (coalesce(f.additions,0) + coalesce(f.deletions,0)) >= 20
                and coalesce(f.files_changed,0) >= 1
              or coalesce(f.human_review_count,0) >= 1 )
        and f.outcome in ('merged_clean','merged_after_rework','burn')
        and f.debrief is not null
        and (c.flight_id is null or c.visibility = 'public')
      ) as ok
    from flights f
    join repos r   on r.id = f.repo_id
    join authors a on a.id = f.author_id
    left join claims c on c.flight_id = f.id
  ), changed as (
    update flights f set index_ok = computed.ok
    from computed
    where computed.id = f.id and f.index_ok is distinct from computed.ok
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- ---------------------------------------------------------------------------
-- Aggregates for repo and agent pages, refreshed at publish.
-- ---------------------------------------------------------------------------

drop materialized view if exists mv_repo_agent_stats;
create materialized view mv_repo_agent_stats as
select
  f.repo_id,
  f.agent,
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
where f.opened_at is not null
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
where f.opened_at is not null
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
group by f.agent;
create unique index mv_agent_totals_pk on mv_agent_totals (agent);

drop materialized view if exists mv_agent_task_types;
create materialized view mv_agent_task_types as
select f.agent, f.task_type, count(*)::integer as flights
from flights f
where f.task_type is not null
group by f.agent, f.task_type;
create unique index mv_agent_task_types_pk on mv_agent_task_types (agent, task_type);

create or replace function refresh_corpus_views() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_repo_agent_stats;
  refresh materialized view concurrently mv_repo_monthly;
  refresh materialized view concurrently mv_agent_monthly;
  refresh materialized view concurrently mv_agent_totals;
  refresh materialized view concurrently mv_agent_task_types;
end $$;

-- ---------------------------------------------------------------------------
-- Page reads (PostgREST /rpc/*, called by the site with the service key).
-- Each returns one jsonb document so a page is one round trip.
-- ---------------------------------------------------------------------------

-- Shared row shape for flight lists.
create or replace function flight_list_item(f flights) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'number', f.number, 'title', f.title, 'agent', f.agent, 'state', f.state,
    'outcome', f.outcome, 'opened_at', f.opened_at, 'merged_at', f.merged_at,
    'additions', f.additions, 'deletions', f.deletions, 'files_changed', f.files_changed,
    'hours_to_merge', f.hours_to_merge, 'index_ok', f.index_ok, 'task_type', f.task_type
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

  -- Opt-out and takedown answer 410 Gone (the route maps "gone" to 410).
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
    'related', coalesce((
      select jsonb_agg(t.item order by t.rank)
      from (
        select flight_list_item(f2) as item,
               row_number() over (order by f2.index_ok desc, f2.opened_at desc) as rank
        from flights f2
        where f2.repo_id = v_repo.id and f2.id <> v_flight.id
        order by f2.index_ok desc, f2.opened_at desc limit 3
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
    'total', (select count(*) from flights where repo_id = v_repo.id)
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

-- Corpus indexes for /logs/repos.json, /logs/agents.json and /llms.txt.
create or replace function corpus_agents() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'agent', t.agent, 'flights', t.flights, 'merge_rate', t.merge_rate,
    'burn_rate', t.burn_rate, 'repos', t.repos
  ) order by t.flights desc), '[]'::jsonb)
  from mv_agent_totals t;
$$;

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
    from repos r join flights f on f.repo_id = r.id
    where r.excluded is not true
    group by r.id
    having count(*) filter (where f.index_ok) > 0
    order by indexed desc, flights desc
    limit p_limit
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- Sitemaps: index_ok flights plus repo and agent pages, chunks of 10k.
-- ---------------------------------------------------------------------------

create or replace function sitemap_summary()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'flight_chunks', ceil(count(*) filter (where index_ok) / 10000.0)::integer,
    'flights', count(*) filter (where index_ok),
    'lastmod', to_char(coalesce(max(updated_at) filter (where index_ok), now()),
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) from flights;
$$;

create or replace function sitemap_flights(p_chunk integer)
returns table (loc text, lastmod text) language sql stable as $$
  select '/logs/' || r.full_name || '/' || f.number || '/',
         to_char(coalesce(f.enriched_at, f.updated_at), 'YYYY-MM-DD')
  from flights f join repos r on r.id = f.repo_id
  where f.index_ok
  order by f.id
  limit 10000 offset p_chunk * 10000;
$$;

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
  having count(*) filter (where f.index_ok) > 0;
$$;

-- ---------------------------------------------------------------------------
-- Claims (called by the site; the GitHub id was proven by OAuth there).
-- ---------------------------------------------------------------------------

create or replace function claimable_for(p_github_user_id bigint)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'count', count(*),
    'sample', coalesce(jsonb_agg(x order by x->>'opened_at' desc)
              filter (where x is not null and rn <= 5), '[]'::jsonb))
  from (
    select flight_list_item(f) || jsonb_build_object('repo', r.full_name) as x,
           row_number() over (order by f.opened_at desc) as rn
    from flights f
    join authors a on a.id = f.author_id
    join repos r on r.id = f.repo_id
    left join claims c on c.flight_id = f.id
    where a.github_user_id = p_github_user_id and c.flight_id is null
  ) s;
$$;

create or replace function claim_flight(
  p_flight_id bigint, p_rider_id text, p_rider_handle text, p_github_user_id bigint)
returns jsonb language plpgsql as $$
declare v_author_gh bigint;
begin
  select a.github_user_id into v_author_gh
  from flights f join authors a on a.id = f.author_id where f.id = p_flight_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_such_flight');
  end if;
  if v_author_gh is distinct from p_github_user_id then
    return jsonb_build_object('ok', false, 'error', 'not_author');
  end if;
  insert into claims (flight_id, rider_id, rider_handle, github_user_id)
  values (p_flight_id, p_rider_id, p_rider_handle, p_github_user_id)
  on conflict (flight_id) do nothing;
  if not found then
    -- Already claimed: fine when it is the same rider (idempotent), an error otherwise.
    if exists (select 1 from claims where flight_id = p_flight_id and rider_id = p_rider_id) then
      return jsonb_build_object('ok', true, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function claim_all(
  p_rider_id text, p_rider_handle text, p_github_user_id bigint)
returns jsonb language plpgsql as $$
declare n integer;
begin
  insert into claims (flight_id, rider_id, rider_handle, github_user_id)
  select f.id, p_rider_id, p_rider_handle, p_github_user_id
  from flights f
  join authors a on a.id = f.author_id
  left join claims c on c.flight_id = f.id
  where a.github_user_id = p_github_user_id and c.flight_id is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'claimed', n);
end $$;

create or replace function set_claim_visibility(
  p_flight_id bigint, p_rider_id text, p_visibility text)
returns jsonb language plpgsql as $$
declare n integer;
begin
  update claims set visibility = p_visibility
  where flight_id = p_flight_id and rider_id = p_rider_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  -- Hiding drops the flight out of the index immediately; the record stays.
  update flights set index_ok = false
  where id = p_flight_id and p_visibility = 'hidden';
  return jsonb_build_object('ok', true);
end $$;

create or replace function set_claim_note(p_flight_id bigint, p_rider_id text, p_note text)
returns jsonb language plpgsql as $$
declare n integer;
begin
  update claims set note = nullif(trim(p_note), ''), note_updated_at = now()
  where flight_id = p_flight_id and rider_id = p_rider_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  return jsonb_build_object('ok', true);
end $$;

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
  join repos r on r.id = f.repo_id
  where c.rider_id = p_rider_id;
$$;

create or replace function riders_with_claims()
returns table (rider_id text, rider_handle text, claimed bigint) language sql stable as $$
  select rider_id, max(rider_handle), count(*) from claims group by rider_id;
$$;

-- Handle renames on the site propagate into the claim snapshots nightly.
create or replace function sync_rider_handle(p_rider_id text, p_handle text)
returns jsonb language plpgsql as $$
declare n integer;
begin
  update claims set rider_handle = p_handle where rider_id = p_rider_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'updated', n);
end $$;

-- ---------------------------------------------------------------------------
-- Opt-out and takedown.
-- ---------------------------------------------------------------------------

create or replace function author_status(p_github_user_id bigint)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'known', count(*) > 0,
    'opted_out', bool_or(opted_out),
    'flights', (select count(*) from flights f join authors a2 on a2.id = f.author_id
                where a2.github_user_id = p_github_user_id)
  ) from authors where github_user_id = p_github_user_id;
$$;

create or replace function opt_out_author(p_github_user_id bigint, p_opted_out boolean)
returns jsonb language plpgsql as $$
declare n integer;
begin
  update authors set opted_out = p_opted_out,
                     opted_out_at = case when p_opted_out then now() end
  where github_user_id = p_github_user_id;
  get diagnostics n = row_count;
  if n = 0 and p_opted_out then
    -- Keep the row so the pipeline never re-creates them tomorrow — even when
    -- no flight of theirs is loaded yet.
    insert into authors (github_user_id, login, opted_out, opted_out_at)
    values (p_github_user_id, 'opted-out-' || p_github_user_id, true, now())
    on conflict (github_user_id) do update set opted_out = true, opted_out_at = now();
  end if;
  update flights f set index_ok = false
  from authors a
  where a.id = f.author_id and a.github_user_id = p_github_user_id
    and p_opted_out and f.index_ok;
  return jsonb_build_object('ok', true, 'opted_out', p_opted_out);
end $$;

create or replace function exclude_repo(p_owner text, p_repo text, p_excluded boolean)
returns jsonb language plpgsql as $$
declare v_id bigint;
begin
  update repos set excluded = p_excluded,
                   excluded_at = case when p_excluded then now() end
  where full_name_lower = lower(p_owner || '/' || p_repo)
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'no_such_repo'); end if;
  update flights set index_ok = false where repo_id = v_id and p_excluded and index_ok;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Status for /admin/flightlog.
-- ---------------------------------------------------------------------------

create or replace function status_snapshot() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'flights', (select jsonb_object_agg(k, v) from (
       select source || '/' || confidence as k, count(*) as v
       from flights group by source, confidence) s),
    'total', (select count(*) from flights),
    'index_ok', (select count(*) from flights where index_ok),
    'outcomes', (select coalesce(jsonb_object_agg(coalesce(outcome,'unclassified'), n), '{}'::jsonb)
                 from (select outcome, count(*) as n from flights group by outcome) o),
    'claims_total', (select count(*) from claims),
    'claims_7d', (select count(*) from claims where claimed_at > now() - interval '7 days'),
    'debriefs', (select count(*) from flights where debrief is not null),
    'debrief_failed', (select count(*) from flights where debrief_failed_at is not null),
    'opted_out_authors', (select count(*) from authors where opted_out),
    'excluded_repos', (select count(*) from repos where excluded),
    'last_runs', (select coalesce(jsonb_object_agg(job, info), '{}'::jsonb) from (
       select distinct on (job) job, jsonb_build_object(
         'started_at', started_at, 'finished_at', finished_at, 'ok', ok,
         'rows_in', rows_in, 'rows_out', rows_out, 'errors', errors, 'meta', meta) as info
       from pipeline_runs order by job, started_at desc) r)
  );
$$;

-- ---------------------------------------------------------------------------
-- Lockdown: service role only. (Role names exist on Supabase; the DO blocks
-- keep this file runnable on plain Postgres / PGlite in tests.)
-- ---------------------------------------------------------------------------

alter table repos          enable row level security;
alter table authors        enable row level security;
alter table flights        enable row level security;
alter table flight_events  enable row level security;
alter table claims         enable row level security;
alter table pipeline_runs  enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all functions in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all functions in schema public from authenticated;
  end if;
end $$;
