-- 0005: materialize corpus_repos (the /logs/ hub's repo list).
--
-- 0003's corpus_repos joined all of repos + authors at request time to apply
-- the excluded/opted-out filters, hash-spilling to temp on the small instance
-- (measured 2.5-13.8 s); correcting the planner statistics did not help (the
-- fresh-stats plan still seq-scans both tables and spills). Materialize the
-- aggregate once per publish and read a ~1.7k-row view at request time
-- (sub-millisecond). Same output columns and opt-out/excluded semantics as
-- 0003; the only change is that counts now lag an opt-out by one publish, like
-- every other count view (mv_agent_totals, mv_repo_*, mv_author_*).

drop materialized view if exists mv_corpus_repos;
create materialized view mv_corpus_repos as
  select r.full_name, r.stars, r.primary_language,
         count(*) filter (where f.index_ok)::integer as indexed
  from repos r
  join flights f on f.repo_id = r.id
  join authors a on a.id = f.author_id
  where f.index_ok and r.excluded is not true and a.opted_out is not true
  group by r.id;
-- Unique index: required for refresh ... concurrently, and full_name is unique.
create unique index mv_corpus_repos_full_name on mv_corpus_repos (full_name);

-- corpus_repos now reads the view; the JSON shape is byte-for-byte what 0003
-- returned ('flights' mirrors indexed, ordered by indexed desc).
create or replace function corpus_repos(p_limit integer default 1000)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'full_name', x.full_name, 'stars', x.stars, 'primary_language', x.primary_language,
    'flights', x.indexed, 'indexed_flights', x.indexed
  ) order by x.indexed desc), '[]'::jsonb)
  from (select full_name, stars, primary_language, indexed
        from mv_corpus_repos order by indexed desc limit p_limit) x;
$$;

-- refresh_corpus_views() now refreshes mv_corpus_repos too (eight views). This
-- redefinition sorts after 0004's, so a full migrate ends on the eight-view
-- form.
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
end $$;
