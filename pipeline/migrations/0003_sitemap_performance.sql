-- 0003: sitemap / corpus-index performance.
--
-- sitemap_summary, sitemap_pages and corpus_repos counted index_ok flights
-- with `count(*) filter (where index_ok)`, which forces a sequential scan of
-- the whole flights table (~950k rows → ~20s) and 500'd the public sitemap
-- under the request timeout. Rewritten to filter `where index_ok` so the
-- flights_indexok partial index is used (index scan over the ~20k indexed
-- rows). corpus_repos also picks up the opted-out-author exclusion so it stays
-- the authoritative version after 0002.
--
-- Applies after 0002; also applied to the live DB out of band to fix the
-- production sitemap immediately.

create or replace function sitemap_summary()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'flight_chunks', ceil(count(*) / 10000.0)::integer,
    'flights', count(*),
    'lastmod', to_char(coalesce(max(updated_at), now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  from flights where index_ok;
$$;

create or replace function sitemap_pages()
returns table (loc text, lastmod text) language sql stable as $$
  select '/logs/agent/' || t.agent || '/', to_char(now(), 'YYYY-MM-DD')
  from mv_agent_totals t
  union all
  select '/logs/' || r.full_name || '/',
         to_char(max(coalesce(f.enriched_at, f.updated_at)), 'YYYY-MM-DD')
  from repos r
  join flights f on f.repo_id = r.id
  where f.index_ok and r.excluded is not true
  group by r.id;
$$;

create or replace function corpus_repos(p_limit integer default 1000)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'full_name', x.full_name, 'stars', x.stars, 'primary_language', x.primary_language,
    'flights', x.indexed, 'indexed_flights', x.indexed
  ) order by x.indexed desc), '[]'::jsonb)
  from (
    select r.full_name, r.stars, r.primary_language,
           count(*)::integer as indexed
    from repos r
    join flights f on f.repo_id = r.id
    join authors a on a.id = f.author_id
    where f.index_ok and r.excluded is not true and a.opted_out is not true
    group by r.id
    order by indexed desc
    limit p_limit
  ) x;
$$;
