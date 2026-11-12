-- 0007: the GitHub Sponsors graph (docs/flight-log-corpus.md, Sponsors graph).
--
-- Who publicly sponsors whom, crawled by the `sponsors` job over the GraphQL
-- API (never scraped HTML), breadth-first from the owners of catalogued repos,
-- their FUNDING.yml GitHub accounts, and manual seeds, up to a hop limit.
--
-- Rules this file keeps:
--   * Public sponsorships only — GitHub never returns private ones to us — and
--     no amounts: which tier a person chose is not public, so it is not here.
--   * Opt-out wins. opt_out_author() (redefined below) also marks the GitHub
--     account here; the crawler never expands it or writes new edges to it,
--     and every reader joins gh_accounts live with opted_out is not true.
--   * Sponsor names never live in a materialized view: the views below hold
--     ids and counts only; names are read live (repo_sponsors()).
--   * Views read base tables only (no matview reads another — refresh order
--     must not matter, see src/views.ts) and every matview has a unique index
--     so `refresh ... concurrently` works.
-- Re-runnable: migrate() applies every file each time.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per GitHub user or organization seen anywhere in the graph. The
-- numeric id is the identity; logins are rewritten on every fetch (renames).
create table if not exists gh_accounts (
  id                   bigint generated always as identity primary key,
  github_id            bigint not null unique,
  login                text not null,
  login_lower          text generated always as (lower(login)) stored,
  kind                 text not null default 'User' check (kind in ('User','Organization')),
  avatar_url           text,
  has_sponsors_listing boolean,
  listing_short_desc   text check (char_length(listing_short_desc) <= 300),
  sponsors_count       integer,
  sponsoring_count     integer,
  sponsors_truncated   boolean not null default false,  -- a connection hit the page cap
  top_repos            jsonb not null default '[]'::jsonb,  -- top 5 owned public repos by stars
  depth                integer not null default 0,      -- fewest hops from a seed
  is_seed              boolean not null default false,  -- manual seed or approved discovery
  crawl_state          text not null default 'queued' check (crawl_state in ('queued','done','error')),
  crawl_error          text,
  fetched_at           timestamptz,
  opted_out            boolean not null default false,
  opted_out_at         timestamptz,
  review_status        text not null default 'new' check (review_status in ('new','approved','dismissed')),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists gh_accounts_login_lower on gh_accounts (login_lower);
create index if not exists gh_accounts_queue on gh_accounts (depth, id) where crawl_state = 'queued';

-- sponsor → maintainer, as GitHub lists it publicly. No amounts, no tiers.
create table if not exists sponsorships (
  sponsor_id    bigint not null references gh_accounts (id) on delete cascade,
  maintainer_id bigint not null references gh_accounts (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  active        boolean not null default true,
  primary key (sponsor_id, maintainer_id)
);
create index if not exists sponsorships_maintainer on sponsorships (maintainer_id) where active;

-- A catalogued repo's FUNDING.yml links (Repository.fundingLinks). github_login
-- is set for platform GITHUB and joins gh_accounts by login at read time.
create table if not exists repo_funding (
  repo_id      bigint not null references repos (id) on delete cascade,
  platform     text not null,
  url          text not null,
  github_login text,
  fetched_at   timestamptz not null default now(),
  primary key (repo_id, platform, url)
);
create index if not exists repo_funding_login on repo_funding (lower(github_login)) where github_login is not null;

alter table repos add column if not exists funding_fetched_at timestamptz;

drop trigger if exists gh_accounts_touch on gh_accounts;
create trigger gh_accounts_touch before update on gh_accounts
  for each row execute function touch_updated_at();

-- People who opted out of the corpus before this table existed.
insert into gh_accounts (github_id, login, opted_out, opted_out_at, crawl_state)
select a.github_user_id, a.login, true, coalesce(a.opted_out_at, now()), 'done'
from authors a where a.opted_out
on conflict (github_id) do update set opted_out = true,
  opted_out_at = coalesce(gh_accounts.opted_out_at, excluded.opted_out_at);

-- ---------------------------------------------------------------------------
-- Views (ids and counts only)
-- ---------------------------------------------------------------------------

drop materialized view if exists mv_related_repos;
drop materialized view if exists mv_sponsor_discovery;

-- Catalogued repos (at least one indexed flight, not taken down) and the
-- accounts that maintain them: the owner, plus FUNDING.yml GitHub accounts.
create or replace view catalog_repo_maintainers with (security_invoker = true) as
  with catalog as (
    select distinct f.repo_id
    from flights f join repos r on r.id = f.repo_id
    where f.index_ok and r.excluded is not true
  )
  select c.repo_id, g.id as account_id, 'owner'::text as via
  from catalog c
  join repos r on r.id = c.repo_id
  join gh_accounts g on g.login_lower = lower(r.owner)
  union
  select c.repo_id, g.id as account_id, 'funding'::text as via
  from catalog c
  join repo_funding rf on rf.repo_id = c.repo_id and rf.github_login is not null
  join gh_accounts g on g.login_lower = lower(rf.github_login);

-- "Projects with the same sponsors": catalogued repo pairs from different
-- owners ranked by the Jaccard index of their maintainers' active public
-- sponsors, at least two shared, top five per repo. Opted-out sponsors do not
-- count.
create materialized view mv_related_repos as
with repo_sponsor as (
  select distinct m.repo_id, s.sponsor_id
  from catalog_repo_maintainers m
  join sponsorships s on s.maintainer_id = m.account_id and s.active
  join gh_accounts sp on sp.id = s.sponsor_id and sp.opted_out is not true
  join gh_accounts mg on mg.id = m.account_id and mg.opted_out is not true
),
sizes as (
  select repo_id, count(*)::numeric as n from repo_sponsor group by repo_id
),
pairs as (
  select a.repo_id, b.repo_id as related_repo_id, count(*)::integer as shared
  from repo_sponsor a
  join repo_sponsor b on b.sponsor_id = a.sponsor_id and b.repo_id <> a.repo_id
  group by a.repo_id, b.repo_id
  having count(*) >= 2
),
ranked as (
  select p.repo_id, p.related_repo_id, p.shared,
         round(p.shared / (sa.n + sb.n - p.shared), 4) as jaccard
  from pairs p
  join sizes sa on sa.repo_id = p.repo_id
  join sizes sb on sb.repo_id = p.related_repo_id
  join repos ra on ra.id = p.repo_id
  join repos rb on rb.id = p.related_repo_id
  where lower(ra.owner) <> lower(rb.owner)
),
numbered as (
  select r.*, row_number() over (
           partition by r.repo_id order by r.jaccard desc, r.shared desc, r.related_repo_id) as rank
  from ranked r
)
select repo_id, related_repo_id, shared, jaccard, rank::integer as rank
from numbered where rank <= 5;
create unique index mv_related_repos_pk on mv_related_repos (repo_id, related_repo_id);

-- Discovery: sponsorable accounts outside the catalog, scored by how many
-- distinct (non-opted-out) sponsors they share with catalogued maintainers.
create materialized view mv_sponsor_discovery as
with catalog_maint as (
  select distinct account_id from catalog_repo_maintainers
),
catalog_sponsors as (
  select distinct s.sponsor_id
  from sponsorships s
  join catalog_maint m on m.account_id = s.maintainer_id
  where s.active
)
select g.id as account_id, count(distinct s.sponsor_id)::integer as shared_sponsors
from gh_accounts g
join sponsorships s on s.maintainer_id = g.id and s.active
join catalog_sponsors cs on cs.sponsor_id = s.sponsor_id
join gh_accounts sp on sp.id = s.sponsor_id and sp.opted_out is not true
where g.has_sponsors_listing and g.opted_out is not true
  and not exists (select 1 from catalog_maint m where m.account_id = g.id)
group by g.id;
create unique index mv_sponsor_discovery_pk on mv_sponsor_discovery (account_id);

-- For manual ops; the publish job (src/views.ts) and the sponsors job refresh
-- these one statement at a time.
create or replace function refresh_sponsor_views() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_related_repos;
  refresh materialized view concurrently mv_sponsor_discovery;
end $$;

-- ---------------------------------------------------------------------------
-- Opt-out now covers the sponsors graph too (same signature, same button).
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

  -- Sponsors graph: the row stays (so the crawler never names them again),
  -- profile-ish fields are cleared; opting back in re-queues it.
  if p_opted_out then
    insert into gh_accounts (github_id, login, opted_out, opted_out_at, crawl_state)
    values (p_github_user_id, 'opted-out-' || p_github_user_id, true, now(), 'done')
    on conflict (github_id) do update set
      opted_out = true, opted_out_at = now(),
      listing_short_desc = null, top_repos = '[]'::jsonb;
  else
    update gh_accounts set opted_out = false, opted_out_at = null, crawl_state = 'queued'
    where github_id = p_github_user_id and opted_out;
  end if;
  return jsonb_build_object('ok', true, 'opted_out', p_opted_out);
end $$;

-- ---------------------------------------------------------------------------
-- Page reads
-- ---------------------------------------------------------------------------

-- author_public() gains the account's GitHub Sponsors link (exact identity:
-- the numeric id, never the login).
create or replace function author_public(a authors) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'login', a.login, 'avatar_url', a.avatar_url, 'github_user_id', a.github_user_id, 'is_bot', a.is_bot,
    'name',           case when a.opted_out then null else a.name end,
    'bio',            case when a.opted_out then null else a.bio end,
    'company',        case when a.opted_out then null else a.company end,
    'website_url',    case when a.opted_out then null else a.website_url end,
    'social_urls',    case when a.opted_out then '[]'::jsonb else to_jsonb(coalesce(a.social_urls, '{}'::text[])) end,
    'readme_excerpt', case when a.opted_out then null else a.readme_excerpt end,
    'profile_fetched_at', a.profile_fetched_at,
    'sponsors_url', case when a.opted_out then null else (
      select 'https://github.com/sponsors/' || g.login
      from gh_accounts g
      where g.github_id = a.github_user_id and g.has_sponsors_listing and g.opted_out is not true
      limit 1
    ) end
  );
$$;

-- The repo page's sponsor block: who maintains it and takes sponsorships, its
-- FUNDING.yml links, the maintainers' public sponsors (named, live join on
-- opted_out, at most 60) and related catalogued repos.
create or replace function repo_sponsors(p_owner text, p_repo text)
returns jsonb language plpgsql stable as $$
declare v_repo repos;
begin
  select * into v_repo from repos where full_name_lower = lower(p_owner || '/' || p_repo);
  if not found then return null; end if;
  if v_repo.excluded then return jsonb_build_object('gone', true); end if;
  return (
    with maint as (
      select g.*, bool_or(x.via = 'owner') as is_owner
      from (
        select g0.id, 'owner'::text as via from gh_accounts g0
        where g0.login_lower = lower(v_repo.owner)
        union
        select g0.id, 'funding'::text from repo_funding rf
        join gh_accounts g0 on g0.login_lower = lower(rf.github_login)
        where rf.repo_id = v_repo.id and rf.github_login is not null
      ) x
      join gh_accounts g on g.id = x.id
      where g.opted_out is not true
      group by g.id
    ),
    spons as (
      select sp.login, sp.avatar_url, sp.kind, min(s.first_seen_at) as since
      from sponsorships s
      join maint m on m.id = s.maintainer_id
      join gh_accounts sp on sp.id = s.sponsor_id
      where s.active and sp.opted_out is not true
      group by sp.id, sp.login, sp.avatar_url, sp.kind
    )
    select jsonb_build_object(
      'maintainers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'login', m.login, 'kind', m.kind, 'avatar_url', m.avatar_url,
          'has_sponsors_listing', coalesce(m.has_sponsors_listing, false),
          'sponsors_url', case when m.has_sponsors_listing then 'https://github.com/sponsors/' || m.login end,
          'listing_short_desc', m.listing_short_desc,
          'sponsors_count', m.sponsors_count, 'is_owner', m.is_owner
        ) order by m.is_owner desc, m.login)
        from maint m
      ), '[]'::jsonb),
      'funding', coalesce((
        select jsonb_agg(jsonb_build_object('platform', rf.platform, 'url', rf.url)
          order by rf.platform, rf.url)
        from repo_funding rf where rf.repo_id = v_repo.id
      ), '[]'::jsonb),
      'sponsors', coalesce((
        select jsonb_agg(jsonb_build_object('login', t.login, 'avatar_url', t.avatar_url, 'kind', t.kind)
          order by t.since, t.login)
        from (select * from spons order by since, login limit 60) t
      ), '[]'::jsonb),
      'sponsors_total', (select count(*) from spons),
      'related', coalesce((
        select jsonb_agg(jsonb_build_object(
          'full_name', r.full_name, 'stars', r.stars, 'primary_language', r.primary_language,
          'shared_sponsors', rr.shared
        ) order by rr.rank)
        from mv_related_repos rr
        join repos r on r.id = rr.related_repo_id
        where rr.repo_id = v_repo.id and r.excluded is not true
      ), '[]'::jsonb),
      'fetched_at', v_repo.funding_fetched_at
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Admin: the discovery queue (/admin/flightlog)
-- ---------------------------------------------------------------------------

create or replace function sponsor_discovery(p_limit integer default 100)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'accounts',    (select count(*) from gh_accounts where opted_out is not true),
      'sponsorable', (select count(*) from gh_accounts where has_sponsors_listing and opted_out is not true),
      'expanded',    (select count(*) from gh_accounts where crawl_state = 'done' and opted_out is not true),
      'queued',      (select count(*) from gh_accounts where crawl_state = 'queued' and opted_out is not true),
      'edges',       (select count(*) from sponsorships where active),
      'catalog_maintainers', (select count(distinct account_id) from catalog_repo_maintainers)
    ),
    'candidates', coalesce((
      select jsonb_agg(y.item || jsonb_build_object('topic_hits', y.topic_hits)
                       order by y.shared_sponsors desc, y.topic_hits desc, y.top_stars desc, y.login)
      from (
        select x.*
        from (
          select g.login, d.shared_sponsors,
                 (select count(*)::integer from jsonb_array_elements(g.top_repos) r,
                         jsonb_array_elements_text(coalesce(r->'topics', '[]'::jsonb)) t
                  where t ~* '(^|-)(ai|llm|llms|agent|agents|agentic|mcp|rag|gpt|claude|openai|copilot|genai)($|-)') as topic_hits,
                 coalesce((select max((r->>'stars')::integer) from jsonb_array_elements(g.top_repos) r), 0) as top_stars,
                 jsonb_build_object(
                   'login', g.login, 'kind', g.kind, 'avatar_url', g.avatar_url,
                   'sponsors_url', 'https://github.com/sponsors/' || g.login,
                   'listing_short_desc', g.listing_short_desc,
                   'shared_sponsors', d.shared_sponsors, 'sponsors_count', g.sponsors_count,
                   'top_repos', g.top_repos, 'review_status', g.review_status, 'depth', g.depth
                 ) as item
          from mv_sponsor_discovery d
          join gh_accounts g on g.id = d.account_id
          where g.opted_out is not true and g.review_status <> 'dismissed'
        ) x
        order by x.shared_sponsors desc, x.topic_hits desc, x.top_stars desc, x.login
        limit greatest(p_limit, 0)
      ) y
    ), '[]'::jsonb)
  );
$$;

-- approve → becomes a crawl seed (depth 0, re-queued); dismiss hides it.
create or replace function set_discovery_status(p_login text, p_status text)
returns jsonb language plpgsql as $$
declare n integer;
begin
  if p_status not in ('new','approved','dismissed') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;
  update gh_accounts set
    review_status = p_status,
    reviewed_at = now(),
    is_seed = case when p_status = 'approved' then true else is_seed end,
    depth = case when p_status = 'approved' then 0 else depth end,
    crawl_state = case when p_status = 'approved' and crawl_state <> 'error' then 'queued' else crawl_state end
  where login_lower = lower(p_login) and opted_out is not true;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'no_such_account'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Lockdown: service role only (as 0001). Repeated here because Supabase's
-- default privileges grant new tables and functions to anon/authenticated.
-- ---------------------------------------------------------------------------

alter table gh_accounts  enable row level security;
alter table sponsorships enable row level security;
alter table repo_funding enable row level security;

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
