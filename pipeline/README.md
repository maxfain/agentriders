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
  never scraped HTML. Store nothing about a person beyond login, numeric id
  and the constructed avatar URL.

## Secrets (environment variables — never in the repo)

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | every job | Supabase Postgres connection string (use the session pooler URI; `pglite://memory` or `pglite://path` for tests) |
| `FLIGHTLOG_GITHUB_TOKEN` | enrich, repo metadata | fine-grained PAT, **public-repo read only**, no write scopes — separate from the OAuth app and the bot PAT, so a leaked ingest token can't sign anyone in or commit |
| `BQ_SERVICE_ACCOUNT_JSON` | discover | GCP service-account key JSON (`client_email`, `private_key`, `project_id`) with BigQuery read + a billed project |
| `ANTHROPIC_API_KEY` | debrief | debrief model defaults to `claude-opus-5-5`; set `DEBRIEF_MODEL=claude-haiku-5-5` to cut the ~20k-call backfill roughly 40× — the task is narrow and machine-validated, but the trade is yours to make |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | publish, rider-cards | Storage uploads (public `cards` bucket). The same two values go to Cloudflare Pages secrets for the site |
| `FLIGHTLOG_CRON_SECRET` | nightly workflow | must equal the site's `CRON_SECRET` Pages secret (`/api/cron/flightlog`) |

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

```sh
node src/run.ts download-aidev --dir data/aidev --revision v3   # ~1 GB
node --max-old-space-size=6144 src/run.ts load-aidev --dir data/aidev
node src/run.ts repo-metadata        # 2,807 pop repos: ~1 batch-hour of GraphQL
node src/run.ts classify             # minutes, SQL only
node src/run.ts debrief              # ~20k LLM calls; resumable — the DB is the checkpoint
node src/run.ts publish              # gate, aggregates, OG cards, spot check
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
| 06:00 daily | `flightlog-daily` | discover (yesterday) → enrich → classify → debrief → publish |
| 02:00 nightly | `flightlog-nightly` | re-enrich open + claimed flights → classify → rider cards → site rank resync |
| Sun 04:00 | `flightlog-weekly` | repo metadata refresh (indexed repos) |
| 1st 05:30 | `flightlog-monthly` | full re-classify → debriefs → full gate re-run |

## Rate limits (how each job stays under them)

| Resource | Limit | Behavior |
|---|---|---|
| GitHub GraphQL | 5,000 points/hr | 25 PRs (or 50 repos) per aliased query; `rateLimit { remaining resetAt }` read on every response, sleep to `resetAt` under 200; 3 consecutive 5xx → 15-minute pause |
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
