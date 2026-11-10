-- 0006: crawlable browse indexes for the corpus.
--
-- The /logs/ hub links only the top 15 repositories and top 15 authors; agent
-- pages add ~10 each. But ~1.7k repositories and ~1k authors have indexed
-- flights, so the long tail of repo/author pages (and every flight nested in
-- them) had no internal link at all — reachable only via the sitemap, which is
-- exactly what Search Console reports as "Crawled - currently not indexed".
--
-- These two paginated RPCs back /logs/repositories/ and /logs/authors/ — HTML
-- index pages that link every repo and author with indexed flights, two clicks
-- from the homepage. Each returns { total, items } so the page can paginate.
-- sitemap_pages() is extended to list those index pages too.

-- 120 rows per page; the page size is mirrored in the Astro routes
-- (src/pages/logs/{repositories,authors}/[...page].astro) and below in
-- sitemap_pages(). p_limit is clamped so a crawler cannot ask for everything.

create or replace function corpus_repos_page(p_limit integer default 120, p_offset integer default 0)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', (select count(*) from mv_corpus_repos),
    'repos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', x.full_name, 'stars', x.stars,
        'primary_language', x.primary_language, 'indexed_flights', x.indexed
      ) order by x.indexed desc, x.full_name)
      from (
        select full_name, stars, primary_language, indexed
        from mv_corpus_repos
        order by indexed desc, full_name
        limit greatest(0, least(p_limit, 500)) offset greatest(0, p_offset)
      ) x
    ), '[]'::jsonb)
  );
$$;

create or replace function corpus_authors_page(p_limit integer default 120, p_offset integer default 0)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', (
      select count(*) from mv_author_totals t join authors a on a.id = t.author_id
      where a.opted_out is not true and a.is_bot is not true and t.indexed >= author_index_min()
    ),
    'authors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'login', x.login, 'name', x.name, 'flights', x.flights, 'indexed_flights', x.indexed
      ) order by x.indexed desc, x.flights desc, x.login)
      from (
        select a.login, a.name, t.flights, t.indexed
        from mv_author_totals t join authors a on a.id = t.author_id
        where a.opted_out is not true and a.is_bot is not true and t.indexed >= author_index_min()
        order by t.indexed desc, t.flights desc, a.login
        limit greatest(0, least(p_limit, 500)) offset greatest(0, p_offset)
      ) x
    ), '[]'::jsonb)
  );
$$;

-- sitemap_pages() now also lists the browse-index pages, one row per page, so
-- every repo/author page is both internally linked and in the sitemap. The
-- three existing branches (agent / repo / author) are unchanged; two generate
-- the index page URLs at 120 rows per page.
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
    )::numeric / 120)::int)) g;
$$;
