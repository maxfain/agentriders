# Flight Log corpus — design and decisions

The corpus turns public agent-authored GitHub pull requests into flight records
(the 2026-11-02 scraper brief). This doc records how it is built into the
existing site and where the implementation deliberately deviates from the brief,
and why. The operational runbook is `pipeline/README.md`.

## The shape

- **`pipeline/`** — a standalone Node 22+ package (erasable TypeScript, run
  directly with `node`, zero build step) that loads AIDev, discovers new
  flights from GH Archive, enriches through the GitHub GraphQL API, classifies
  outcomes, writes debriefs, computes `index_ok`, renders OG cards, and keeps
  a run log. Scheduled by GitHub Actions (`.github/workflows/flightlog-*.yml`).
- **Supabase Postgres** — the corpus database: `repos`, `authors`, `flights`,
  `flight_events`, `claims`, `pipeline_runs`, plus materialized views for the
  aggregate pages. Schema in `pipeline/migrations/`. The site reads it over
  PostgREST RPCs with the service key (no new npm dependency in the site);
  tables and functions are locked to the service role.
- **Site routes** — `/logs/{owner}/{repo}/{number}/` (flight),
  `/logs/{owner}/{repo}/` (repo), `/logs/agent/{agent}/` (agent),
  `/logs/author/{login}/` (author, lowercase login), each with a `.json`
  twin, all `prerender = false` server routes behind the existing middleware
  cache rule (anonymous GETs are edge-cached 5 minutes). Corpus sitemaps are
  served from Postgres at `/sitemap-corpus.xml`. Every page names the agent
  product with its maker (Claude Code by Anthropic, OpenAI Codex, GitHub
  Copilot, Cursor, Devin) and the author by display name in its title, H1 and
  description; the patterns are pure builders in `src/lib/flightlog.ts`.
- **Claim flow** — GitHub sign-in is the only proof: the session rider's
  GitHub identity (`identities.provider_id`, stamped at OAuth) must equal the
  flight author's `github_user_id`. Claims live in Postgres; riders stay in D1.

## Deviations from the brief, and why

1. **Riders stay in D1.** The brief sketches a Postgres `riders` table; the
   site already has riders, sessions, vouches and ranks in D1 ("D1 is
   canonical for people and process"). `claims` stores the D1 `rider_id`, the
   proven `github_user_id`, and a `rider_handle` snapshot for rendering.
   One person-system, not two.
2. **AIDev pinned to `v3`.** The dataset has moved on (v5 is "AIDev-7.6M",
   cutoff 2026-03-31). The brief's numbers (932,791 PRs; 33,596 AIDev-pop;
   2,807 repos) are exactly the `v3` tag, so the loader defaults to `v3`
   (`--revision` overrides). Upgrading to v5 is a cost decision (≈8× rows,
   bigger debrief bill), not a code change.
3. **`additions`/`deletions` from AIDev are an approximation.** The detail
   table is per-commit-per-file, so the loader sums across commits (a PR that
   reworks one file in five commits counts the churn, not the net diff).
   GraphQL enrichment replaces these with GitHub's exact PR numbers whenever a
   flight is re-enriched; `flights.metrics_source` says which one a page shows.
4. **OG images are pre-rendered by the pipeline**, not at request time
   (satori + resvg don't fit Pages Functions). Indexed flights and rider cards
   are rendered on publish/nightly and uploaded to Supabase Storage;
   `og_generated_at` gates the `og:image` so a page never points at a 404.
5. **Ranks**: claimed flights count toward the existing rank thresholds
   (Fledgling ≥1, Rider ≥20 flights + 2 Rider vouches — `src/lib/ranks.ts` is
   unchanged); the claim APIs pass the rider's claimed-flight count into the
   same engine, and the nightly workflow calls `/api/cron/flightlog` to
   recompute riders with claims. Hidden flights still count (the brief:
   hiding is presentation, not deletion). Vouch gates are untouched, so a
   claimed backlog alone never mints a Rider.
6. **The private "/status" page is `/admin/flightlog`** behind the existing
   admin gate (session + allowlist + 404-shape), rather than a new
   authentication scheme for a bare `/status`.
7. **Route collisions**: `/logs/[facet]/[value]` (static, facets `task`,
   `mount`, `outcome`, `burns`), `/logs/agent/…` and `/logs/author/…` are
   reserved before the catch-all corpus route, so a GitHub owner literally
   named `task`, `mount`, `outcome`, `burns`, `agent`, `author`, `new` or
   `template` cannot have a repo page (flight pages, three segments deep,
   still work). Accepted and documented.
8. **Author profiles.** The original footprint was login, numeric id and
   avatar URL only. Author pages and named bylines (the SEO work of
   November 2026) added the public profile fields GitHub shows next to a
   person's own pull requests — see Consent and footprint. The author-page
   index gate is `author_index_min()` in Postgres (1 indexed flight today),
   one line to raise if Search Console shows thin pages piling up.

## Consent and footprint

- Stored per person: GitHub login, numeric user id, constructed avatar URL,
  and — for authors with at least one indexed flight — the public profile
  fields GitHub shows on their profile: display name, bio (≤160 chars),
  company, website, up to five social links, and the first paragraph of the
  profile README as plain text (≤25 words, the same verbatim-excerpt bound
  the flight pages use). Fetched by the `author-profiles` job over the
  GraphQL API (25 users per call), only for human accounts, only after the
  response's `databaseId` matches the stored user id (a renamed login can
  belong to someone else), re-fetched every 30 days so a changed profile
  changes here too, and shown with the date it was read. No emails, no
  location; AIDev commit author strings are logins and are not stored beyond
  flight signals. Profile fields never live in a materialized view — every
  page reads them through a live join on `opted_out`.
- `/opt-out/`: sign in with GitHub, one button → `authors.opted_out`, flights
  and the author page 410 on the next render, dropped from JSON, sitemaps and
  aggregates, and every profile field cleared in the same statement
  (`opt_out_author()`), with `profile_fetched_at` stamped so the job never
  re-fetches. The row stays so the pipeline never re-creates the author.
  Opting back in clears the stamp and the next backfill restores the profile. Email fallback for
  people who won't sign in: verify via a line in the GitHub profile bio, then
  the admin sets the same flag from `/admin/flightlog`.
- Repo takedown: `repos.excluded` (same 410 behavior), from `/admin/flightlog`.
- No outreach from inside GitHub, ever: the pipeline only reads.
- AIDev is CC BY 4.0 (dataset); the PR contents it aggregates keep their
  repos' own licenses — which is why pages show metadata, computed numbers and
  ≤25-word verbatim excerpts with links, never diffs or full bodies.

## Quality gate

`index_ok` is computed in SQL (never by hand): confidence high/medium (the
`dataset` confidence of un-re-verified AIDev rows counts as medium), repo ≥100
stars and not a fork and not excluded, substance (≥20 changed lines and ≥1
file, or a non-author human review), outcome decided
(merged_clean/merged_after_rework/burn), debrief present and validated, author
not opted out, claim not hidden. Everything else renders `noindex` (or 410).
Expected from AIDev-pop: 15–25k indexable flights; measure after the first
classification run and tighten rather than loosen.
