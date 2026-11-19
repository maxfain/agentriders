-- 0009: a tighter index gate for flight pages.
--
-- After 0007/0008 Google crawled the corpus freely and answered with
-- "Crawled - currently not indexed" for ~4,900 flight pages: 19,420
-- near-template PR pages read as thin. docs/flight-log-corpus.md planned for
-- this ("measure ... and tighten rather than loosen").
--
-- New rule, on top of every 0001 condition: a flight is indexable when it is a
-- story — a burn or a merge after rework — or a clean merge that a human
-- reviewed in a repository with at least 1,000 stars. Measured on production
-- (2026-11-19): 19,420 → ~4,260 indexable flights. Everything else still
-- renders, as noindex, and leaves the sitemap; repo and author pages follow
-- automatically (they are indexable while they hold an indexed flight).
--
-- Running this file only redefines the function. Applying the new gate is the
-- publish job's recompute_index_ok() + view refresh (or run them by hand).

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
        -- 0009: stories, or reviewed clean merges in notable repositories.
        and ( f.outcome in ('burn','merged_after_rework')
              or ( coalesce(f.human_review_count,0) >= 1
                   and coalesce(r.stars, 0) >= 1000 ) )
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
