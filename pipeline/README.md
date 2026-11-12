# Flight Log pipeline

Builds and maintains the Flight Log corpus: every public pull request authored
by a coding agent becomes a flight record in Supabase Postgres, and the good
ones become indexed pages on agentriders.com. Design and deviations:
[`docs/flight-log-corpus.md`](../docs/flight-log-corpus.md).

Node ≥ 22.18 (erasable TypeScript, run directly — no build step). Every job is
idempotent and re-runnable, and writes a `pipeline_runs` row (counts in/out,
errors, meta) that `/admin/flightlog` shows.

```sh
cd pipeline && npm ci
node src/run.ts                 # list jobs
node src/run.ts migrate         # apply migrations/ to DATABASE_URL
```

## Data sources and licenses

- **AIDev** (`hao-li/AIDev` on Hugging Face, pinned to tag **`v3`** — the
  932,791-PR cut with the 33,596-flight AIDev-pop subset). The dataset is
  **CC BY 4.0**; per its card, the PR contents it aggregates (bodies, patches)
  keep their source repositories' own licenses — which is why flight pages
  show metadata, computed numbers and ≤25-word verbatim excerpts with links,
  never diffs or full bodies, and why `pr_commit_details.patch` is never read.
  Cite as: *AIDev: Studying AI Coding Agents on GitHub* (Li et al.), and
  *The Rise of AI Teammates in Software Engineering 3.0*. Newer tags exist
  (v5 is "AIDev-7.6M"); upgrading is a cost decision — `--revision v5` works,
  but expect ~8× rows and a proportionally bigger debrief bill.
- **GH Archive** via BigQuery (`githubarchive.day.YYYYMMDD`), one query per
  day over one day table, selected columns only.
- **GitHub GraphQL API** for enrichment. Per GitHub's Acceptable Use Policies
  (information-usage rules), data stays public-aggregate plus attribution by
  login: no contacting users, no selling personal information, API only —
  never scraped HTML. About a person the corpus stores the login, numeric id
  and constructed avatar URL, and — for authors with an indexed flight — the
  public profile fields GitHub shows next to their own pull requests (display
  name, bio, company, website, social links, a ≤25-word plain-text excerpt of
  the profile README), fetched by `author-profiles`, refreshed every 30 days,
  cleared on opt-out (`docs/flight-log-corpus.md`, Consent and footprint).
  Nothing private: no emails, no location, nothing beyond the flights.
  The sponsors graph adds public GitHub sponsorships and Sponsors listings
  (§ Sponsors graph); it too is API-only, read-only and cleared on opt-out.

## Secrets (environment variables — never in the repo)

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | every job | Supabase Postgres connection string (use the session pooler URI; `pglite://memory` or `pglite://path` for tests) |
| `FLIGHTLOG_GITHUB_TOKEN` | enrich, repo metadata, author profiles | fine-grained PAT, **public-repo read only**, no write scopes — separate from the OAuth app and the bot PAT, so a leaked ingest token can't sign anyone in or commit |
| `BQ_SERVICE_ACCOUNT_JSON` | discover | GCP service-account key JSON (`client_email`, `private_key`, `project_id`) with BigQuery read + a billed project |
| `ANTHROPIC_API_KEY` | debrief | debrief model defaults to `claude-opus-5-5`; set `DEBRIEF_MODEL=claude-haiku-5-5` to cut the ~20k-call backfill roughly 40× — the task is narrow and machine-validated, but the trade is yours to make |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | publish, rider-cards | Storage uploads (public `cards` bucket). The same two values go to Cloudflare Pages secrets for the site |
| `FLIGHTLOG_CRON_SECRET` | nightly workflow | must equal the site's `CRON_SECRET` Pages secret (`/api/cron/flightlog`) |
| `SPONSORS_GITHUB_TOKEN` | sponsors (optional) | only if the fine-grained `FLIGHTLOG_GITHUB_TOKEN` cannot read GitHub Sponsors fields (the dry run below tells you): a **classic PAT with no scopes** reads public data only. Actions secret `FLIGHTLOG_SPONSORS_GITHUB_TOKEN` |

GitHub Actions repo secrets use the `FLIGHTLOG_*` names in
`.github/workflows/flightlog-*.yml`. Site-side secrets (`SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `CRON_SECRET`) are set with
`npx wrangler pages secret put <NAME>`; apply the D1 migration too
(`npx wrangler d1 migrations apply agentriders --remote` — 0003 adds the
claimed-flights mirror).

## One-time setup

1. Create a Supabase project (any name; region near Cloudflare's US edge is
   fine), take the Postgres pooler URI and the service-role key.
2. `node src/run.ts migrate` — tables, gate, RPCs, materialized views, RLS
   lockdown (service role only; the browser-facing keys can read nothing).
3. Create the GitHub fine-grained PAT and the BigQuery service account.
4. Set the Pages secrets + D1 migration (above), then deploy the site.

## Backfill run order (brief: hours of loading, no API, then one hour of GraphQL)

Easiest: **Actions → `flightlog-backfill` → Run workflow** — it performs the
exact sequence below on a runner (set `FLIGHTLOG_DATABASE_URL` first; steps
whose secrets are missing are skipped, so a load-only pass works before the
GitHub/Anthropic/Supabase keys exist, and a `sample` input does a smoke run).
Re-running is safe — the database is the checkpoint. By hand:

```sh
node src/run.ts download-aidev --dir data/aidev --revision v3   # ~1 GB
node --max-old-space-size=6144 src/run.ts load-aidev --dir data/aidev
node src/run.ts repo-metadata        # 2,807 pop repos: ~1 batch-hour of GraphQL
node src/run.ts classify             # minutes, SQL only
node src/run.ts debrief              # ~20k LLM calls; resumable — the DB is the checkpoint
node src/run.ts publish              # gate, aggregates, OG cards, spot check
node src/run.ts author-profiles      # public profile fields, 25 users per GraphQL call
```

`--sample N` on `load-aidev` loads a slice for a smoke run;
`--skip-core` / `--skip-pop` split the two phases. The loader is re-runnable:
repos/authors/flights upsert, and a flight that GraphQL has enriched is never
overwritten by a backfill re-run. The 900k long-tail flights are **not**
enriched through the API — they are complete enough as records and are
enriched one by one when claimed (picked up by the nightly job).

Before trusting the two *verify*-marked agent signatures from the brief
(Copilot's `Copilot` author login, Cursor's co-author line), pull ~20 live
PRs matching each — e.g. GitHub search `author:Copilot is:pr` and
`"Co-authored-by: Cursor Agent" is:pr` — and confirm by eye; drop or adjust
the rule in `src/agents.ts` if the wild disagrees. Codex (`codex/*` branch
alone) stays `confidence = low` and unindexed until a second signal or a
claim confirms it.

## Schedule (UTC, `.github/workflows/`)

| When | Workflow | Steps |
|---|---|---|
| 06:00 daily | `flightlog-daily` | discover (yesterday) → enrich → classify → debrief → publish → author profiles (newly indexed authors) |
| 02:00 nightly | `flightlog-nightly` | re-enrich open + claimed flights → classify → rider cards → site rank resync |
| Sun 04:00 | `flightlog-weekly` | repo metadata refresh (indexed repos) → author profile refresh (30+ days old) |
| 1st 05:30 | `flightlog-monthly` | full re-classify → debriefs → full gate re-run |
| Sat 03:23 | `flightlog-sponsors` | sponsors graph: FUNDING.yml for new/30-day-old catalogued repos → breadth-first crawl (`--refresh`, 100-minute budget) |

## Sponsors graph

`node src/run.ts sponsors` maps who publicly sponsors whom on GitHub,
starting from the catalog (docs/flight-log-corpus.md, Sponsors graph):

1. **Roots** (hop 0): owners of catalogued repos (≥1 indexed flight), the
   GitHub accounts in their FUNDING.yml (`Repository.fundingLinks`, stored in
   `repo_funding`), seeds from `--seed`, and discovery candidates approved in
   `/admin/flightlog`.
2. **Breadth-first**: each queued account below the hop limit is fetched with
   its Sponsors listing, top five public repos, and both directions —
   `sponsors` (who sponsors it) and `sponsoring` (whom it sponsors) — 20
   accounts per query, 100 per page, up to `--max-pages` pages per direction.
   Every neighbour is stored one hop further out; at the hop limit it stays
   queued as a leaf (login, id, sponsorable or not) until a deeper run.
3. **Outputs**: `repo_sponsors()` (the repo page's sponsor block),
   `mv_related_repos` ("projects with the same sponsors"),
   `mv_sponsor_discovery` (the admin discovery queue), and
   `author_public().sponsors_url`.

```sh
# Token check first — no database needed, prints what the token can see:
node src/run.ts sponsors --dry-run --seed ArashTabrizi,unclecode
# A small first crawl:
node src/run.ts sponsors --seed ArashTabrizi,unclecode --max-depth 2 --max-accounts 200
# The scheduled form:
node src/run.ts sponsors --refresh
```

| Flag | Default | Meaning |
|---|---|---|
| `--seed a,b` | — | extra roots, remembered (`is_seed`) |
| `--max-depth N` | 3 | hops from a root; ArashTabrizi → unclecode → unclecode's other sponsors → what they sponsor is 3 |
| `--max-pages N` | 10 | pages of 100 per direction; a hub past it is marked `sponsors_truncated` and none of its edges deactivate |
| `--max-accounts N` | 5000 | accounts expanded per run |
| `--max-minutes N` | 100 | wall-clock budget; the queue carries over |
| `--refresh` | off | re-queue accounts and FUNDING.yml fetched more than 30 days ago |
| `--limit N` | 5000 | catalogued repos whose FUNDING.yml is read this run |
| `--dry-run` | off | fetch `--seed` only and print; no database |

Opt-out (`opt_out_author()`, the existing `/opt-out` button) marks the
GitHub account in `gh_accounts`: it is never expanded, no edge to or from it
is written, and every read joins `opted_out` live. Edges a complete read no
longer lists become `active = false` (kept, not deleted). The first full crawl
from ~1.7k catalogued repos takes several weekly runs; each run's counts
(`expanded`, `pending`, `leaves`, `edgesAdded`, `truncated`, `stoppedBy`) are
in its `pipeline_runs.meta`.

## Rate limits (how each job stays under them)

| Resource | Limit | Behavior |
|---|---|---|
| GitHub GraphQL | 5,000 points/hr | 25 PRs (or 50 repos, 25 user profiles, 20 sponsors-graph accounts) per aliased query; `rateLimit { remaining resetAt }` read on every response, sleep to `resetAt` under 200; 3 consecutive 5xx → 15-minute pause |
| GitHub REST | 30 req/min search | not used by any scheduled job (avatars are constructed URLs, repo lookups ride GraphQL) |
| BigQuery | billed per byte | one query per day over one day table, selected columns only, never `SELECT *` on month tables |
| Anthropic | cost per call | gated flights only, cached by (flight, prompt version), concurrency 4, failure rate >5% fails the run |

## Quality

- `index_ok` is computed in SQL (`recompute_index_ok()`), never set by hand.
- Debriefs are validated deterministically (`src/debrief.ts`): 40–60 words,
  numbers must match stored fields, quotes must be verbatim substrings of
  `reviewer_excerpt`, no motive/sentiment words, no `!`, no emoji. One retry,
  then the flight renders without a debrief and stays out of the index.
  `DEBRIEF_PROMPT_VERSION` bumps revalidate every stored debrief and
  regenerate only the failures.
- `publish` spot-checks 30 random indexed flights (re-validation + URL list
  printed for the by-hand pass: open them, compare numbers against GitHub).
  Failures drop those flights from the index and fail the job.
- Measure the first classification run against the 15–25k indexable estimate;
  tighten thresholds rather than loosen them (scaled-content risk — see the
  brief's Quality section).

## Failure handling & monitoring

- Every job: `pipeline_runs` row with counts; single-PR GraphQL errors skip
  and continue; a flight that 404s on GitHub is stamped so it stops queueing.
- Alerts are GitHub Actions failures: zero discovery candidates (table late /
  query broken), debrief failure rate >5%, spot-check failures. Watch the
  repo's Actions notifications (or add a Slack webhook step later).
- `/admin/flightlog` (admin-gated) shows flights by source/confidence,
  index_ok count, claims, debrief failure rate, last run per job, GraphQL
  points remaining — plus repo takedown (48h promise) and verified email
  opt-outs.

## Tests

```sh
cd pipeline && npm test   # node --test; PGlite stands in for Postgres
```
