# AgentRiders — Phase 2 Product Plan

## Context

Phase 1 shipped agentriders.com as a static Astro 5 site on Cloudflare Pages: the Field Manual (7 full chapters), Flight Logs (1 published, template with copy/download, facets, `/logs.json`), Flight School (6 lessons mapped to the three ranks, 3 missions, 6 worksheets), the cinematic illustrated design, newsletter scaffolding, and `cli/eval-detector.js` awaiting its pipeline. The site makes explicit public promises Phase 2 must honor:

- Ranks are earned, never bought: **Fledgling** (joined · 1 flight logged), **Rider** (20 flights · 2 Rider vouches), **Wingleader** (100 flights · runs a wing · 5 vouches).
- "The directory opens when 20 flights are logged." / "Submissions open with the Guild." / "Every flight is public. Every vouch has a name on it."
- Memberships shown as "PLANNED — ENROLLMENT IS NOT OPEN YET" (Reader free / Rider $15/mo / Wing $49/seat/mo).

Phase 2 turns the publication into a product: riders sign in, submit flights through the site, vouch for each other, and earn ranks computed from the record — with the CLI providing signed, metadata-only flight records as the anti-fake backbone.

## Decisions locked (with Max, 2026-10-14)

| Decision | Choice |
|---|---|
| North star | Full Guild launch — every pillar except the deferred ones below |
| Stack | Cloudflare-native: Pages + Pages Functions + D1 + KV; only new external service is Resend (magic-link email) |
| Auth | GitHub OAuth + email magic links; no passwords |
| Published logs | **Git stays canonical** — approval commits markdown to `src/content/logs/`; D1 holds accounts, sessions, submissions, vouches, flight records |
| CLI | In scope — CLI v1 signs metadata-only flight records → "Verified flight" badge; eval signals per `agentriders-evals-spec.md` §2 |
| The Roost (forum) & Wings (teams) | Deferred entirely (consequence: Wingleader not auto-attainable — see Rank engine) |
| Payments | Deferred — everything free in Phase 2; tiers stay published as "planned"; revisit after the directory opens |

**Guiding principle:** git stays canonical for published content; D1 is canonical for people and process. Everything the public reads at volume stays static on the CDN; only personalized/mutable routes run as Pages Functions.

---

# Part A — Product

## The one-sentence product

A public, verifiable track record for people who run AI agents on real work.

## Pillars shipping in Phase 2 (all free)

1. **Rider accounts** — sign in, claim a unique handle, public profile.
2. **In-app flight logging** — compose a log on the site (same schema as the template), submit to a review queue, see it published to git.
3. **Vouching** — Riders vouch for riders, with a named public statement.
4. **Rank engine** — Fledgling and Rider computed automatically from published flights + vouches, with an audit trail.
5. **Profiles + directory** — `/riders/[handle]` live pages; `/riders/directory` unlocks at 20 published flights, exactly as promised.
6. **`agentriders` CLI v1** — parses the rider's own Claude Code session logs locally, assembles a metadata-only record (including eval-practice signals), signs it with a registered device key → **Verified flight** badge on the published log.

**Out of scope:** the Roost, Wings, payments/checkout, Wingleader auto-attainment, live-flights tooling, search beyond the directory.

## User journeys (acceptance narratives)

1. **New rider:** Flight School lesson 1 (25 min) → sign in with GitHub → claim `@handle` → submit the lesson's flight log → Max approves → log publishes with their handle linked → profile shows Fledgling. *Flight School's six lessons (2 Fledgling, 3 Rider, 1 Wingleader) become the onboarding funnel.*
2. **Returning rider:** real work in Claude Code → `npx agentriders log` → CLI shows exactly what leaves the machine, signs, uploads → submission published with Verified badge → count ticks toward Rider.
3. **Voucher:** a Rider writes a named statement on a profile → public on both profiles → at 20 flights + 2 Rider vouches the engine promotes and records why.
4. **Max:** `/admin` queue → preview rendered exactly as the live page → approve (bot commits markdown, site rebuilds ~2 min) / request changes / reject with notes. Everything approved is auditable in git history.

## Promise & copy reconciliation (ships with launch, M5)

| Where | Today | Change |
|---|---|---|
| `/guild` | "PLANNED MEMBERSHIPS…" | Stays planned + "free during the founding season"; signup CTA becomes "Create your rider account" |
| `/riders` | "DIRECTORY OPENING SOON" | Link to `/riders/directory`, which shows live "N / 20" until the gate opens |
| `/logs/template` | "Submissions open with the Guild" | Points to `/logs/new` as the primary path; template kept for git-PR purists |
| Homepage vs riders page | "2 vouches from Riders" vs "2 Rider vouches" | Unify wording |
| Terms / Privacy | Submission licensing already written; GA disclosed | Add account-data section (D1 contents, session cookie, CLI telemetry, deletion on request); governing law + contact TODOs |
| README | Claims all 3 logs are drafts; "No third-party script ever" | Fix both; rewrite Deploy section after wrangler.jsonc conversion |
| First published log | rider "handle", placeholder body | Replace with Max's real first flight before launch |

## Success metrics

- **The gate:** 20 published flights → directory opens (the launch-defining number).
- Claimed profiles; submissions/week; submission→publish median < 48 h (solo reviewer).
- % of published flights with the Verified badge (CLI adoption).
- First fully automatic Rider promotion (end-to-end proof of the ladder).

---

# Part B — Technical design

## Rendering architecture

**One codebase.** Add `@astrojs/cloudflare` to the existing site, keep `output: 'static'`; only routes declaring `export const prerender = false` become server routes (Astro 5 has no separate hybrid mode). Every existing page ships byte-identical static; the adapter emits `dist/_worker.js` which Pages runs for the dynamic routes. A separate Worker API would split sessions/CORS/layouts across origins for no benefit.

- `astro.config.mjs`: add `adapter: cloudflare({ platformProxy: { enabled: true } })`.
- **`wrangler.jsonc` converts from Workers-assets form to Pages form** (`pages_build_output_dir: "./dist"`, `nodejs_compat`, `d1_databases` binding `DB`, `kv_namespaces` binding `RATE`). Classic Pages reads it once `pages_build_output_dir` is set; this retires the dormant Workers-Builds dual-deploy story (README update in M5).
- Secrets (never in the file): `GITHUB_BOT_TOKEN`, `GITHUB_OAUTH_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `SESSION_PEPPER`, `PAGES_DEPLOY_HOOK` — via `wrangler pages secret put` / dashboard.
- Local dev: `astro dev` with platformProxy (miniflare D1/KV from wrangler.jsonc); prod-like: `npm run build && wrangler pages dev ./dist`. Migrations in `migrations/` via `wrangler d1 migrations apply`.
- New middleware `src/middleware.ts`: resolves session cookie → `locals.rider` (guarded so prerendered builds skip it); `Origin` check on all non-GET; `Cache-Control: no-store` on SSR/API responses.
- New deps: `@astrojs/cloudflare`, `zod`, `yaml`.

## D1 schema (`migrations/0001_init.sql`)

TEXT UUIDs, ISO-8601 TEXT timestamps. Tables (key constraints in parentheses):

- **riders** — id, handle (UNIQUE, `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$`), display_name, bio, rank CHECK in (fledgling|rider|wingleader) NULL until first flight, is_admin, banned_at, created_at.
- **identities** — rider_id, provider CHECK (github|email), provider_id (UNIQUE per provider), email.
- **sessions** — id = SHA-256 of cookie token (raw never stored), rider_id, expires_at (30 d), last_seen_at.
- **magic_link_tokens** — token_hash PK, email, 15-min expires_at, consumed_at (single-use via conditional UPDATE).
- **submissions** — rider_id, kind (new|edit), target_log_slug, slug, title, frontmatter_json, body_md, status CHECK (draft→submitted→in_review→changes_requested→approved→published | rejected), reviewer_notes, reviewed_by, commit_sha, timestamps. **Partial UNIQUE index on slug WHERE status in live states** — no two submissions can race one slug.
- **published_logs** — D1 mirror of git-canonical logs: slug PK, rider_id (NULL for legacy logs), title, date, task, outcome, burns_count, submission_id, published_at. Rebuildable anytime from `/logs.json` via admin resync; git remains the source of truth.
- **vouches** — voucher_id, vouchee_id, statement (required, public), status (active|revoked|removed), UNIQUE(voucher, vouchee), CHECK(voucher ≠ vouchee).
- **devices** — id = SHA-256 fingerprint of raw ed25519 public key, rider_id, public_key (base64), name, revoked_at.
- **device_link_codes** — code_hash PK, rider_id, 10-min expiry, consumed_at.
- **flight_records** — rider_id, device_id, payload_json (metadata + `evals` object per spec), signature (ed25519 over canonical JSON), record_hash UNIQUE (dedupe), cc_session_hash (UNIQUE per rider — one record per Claude Code session), **evals_score recomputed server-side**, matched_log_slug (partial UNIQUE — one verified record per log).
- **rank_events** — rider_id, old_rank, new_rank, reason, actor (system|admin id), created_at. Full audit trail.
- **moderation_flags** — subject_type/id, reason, resolution.

Handle reserved list in `src/lib/handles.ts` covers every existing route + infra words (admin, api, me, logs, manual, training, riders, directory, guild, auth, claude, wing, roost, …). Rate limits live in KV (TTL counters), not tables.

## Auth (hand-rolled, ~200 lines — no framework)

GitHub OAuth is two fetches; magic links are one table; sessions are one cookie. Routes (all `prerender = false`):

- `GET /api/auth/github` → state cookie → GitHub authorize (`user:email` scope).
- `GET /api/auth/github/callback` → verify state, exchange code, upsert identity, create rider if new, session, redirect to `/join` (claim) or `/me`.
- `POST /api/auth/magic` → KV rate limit (3/hr/email, 10/hr/IP), always 200 (no enumeration), Resend email with 15-min token.
- `GET /api/auth/magic/verify` → hash, atomic single-use consume, session.
- `POST /api/auth/logout`; `GET /api/me` (powers the static header's "Join" → "@handle" swap — the only JS static pages need).

Session cookie `ar_session`: 32 random bytes base64url, httpOnly/Secure/SameSite=Lax, hash-stored, rotated on login. CSRF = SameSite=Lax + Origin check. **Email: Resend**, sending as `fly@mail.agentriders.com` (subdomain insulates root reputation; DKIM/SPF/DMARC are a two-minute paste since DNS is already on Cloudflare). Account pages: `/join` (handle claim), `/me` (drafts, statuses, vouches, devices, records).

## Submission → publish pipeline

**One schema, two enforcement points:** extract the logs zod object from `src/content.config.ts` into `src/lib/log-schema.ts`; the content collection (build) and the API (runtime) both import it — an accepted submission cannot fail the build.

1. **Compose** `/logs/new` (SSR, auth): form mirrors the template; `rider` is forced to the session handle server-side; drafts via `POST/PUT /api/submissions`. Limits: ≤2 in flight, ≤5/day (KV).
2. **Review** `/admin/submissions/[id]`: preview rendered with the real log layout + raw frontmatter (+ diff vs live file for edits). Approve / request changes / reject (notes required).
3. **Approve & commit** `POST /api/admin/submissions/[id]/approve`: re-validate, serialize with `yaml`, GitHub Contents API PUT to `src/content/logs/<slug>.md` on `main`. **Bot identity:** machine account `agentriders-bot`, fine-grained PAT (this repo, contents-only) — committer = bot, author = the rider (`display_name <handle@riders.agentriders.com>`), message `Publish flight log: <slug> (submitted by @<handle> via agentriders.com)`. SHA conflicts (human pushed between read/write): re-GET + one retry, then park with the error visible in `/admin`. On success: status `approved`, optimistic `published_logs` mirror write, rank recompute.
4. **Publish detection — lazy reconcile, no webhooks** (Pages has no cron/outbound hooks worth the plumbing): `src/lib/reconcile.ts` fetches live `/logs.json` and flips `approved` → `published`; runs when the admin queue, `/me`, or the directory gate renders. Worst case a status label lags minutes; the log itself is already live. Escape hatch if it ever grates: a 5-line cron Worker (deferred).
5. **Edits:** owner (or admin) opens a `kind='edit'` submission prefilled from the live file; same review path; PUT with sha.

## Rank engine (`src/lib/ranks.ts`)

Pure `computeRank(stats)` + effectful `recomputeRank(env, riderId, actor, reason)` writing `riders.rank` + a `rank_events` row only on change. Triggered synchronously on: publish reconciliation, vouch create/removal, admin grant/ban, resync. Flight counts come from the **`published_logs` D1 mirror** (queryable per-request; rebuildable from `/logs.json`, so git stays canonical).

- **fledgling:** ≥1 published flight. **rider:** ≥20 published flights AND ≥2 active vouches whose voucher *currently* holds rank ≥ rider (self-healing when a fraudulent voucher is banned). **wingleader:** `computeRank` caps at rider — the published requirement includes "runs a wing" and Wings are deferred, so the rank is displayed but earned only by admin grant (`reason='admin_grant'`) until Phase 3. The copy stays honest because the requirement text already says "runs a wing."
- Ranks only move up automatically; voluntary vouch revocation never demotes (no weaponized revocation); moderation removals and bans DO recompute with demotion allowed, audited.
- **Evals/CLI tie-in (spec: standing, never a rank shortcut):** profiles show verified-flight count, eval discipline score (server-recomputed `scoreEvals`, gated by `isScoreEligible`), frameworks seen. Directory sorts within rank by `(verified_flights, published_flights)`. Eval score is display-only in v1 — ranks stay exactly as publicly promised.
- **Directory gate:** `/riders/directory` counts `published_logs` per request; <20 shows "N / 20 flights logged — the directory opens at 20" with a link to `/logs/new`; ≥20 shows the directory. The count is the flag.
- Anti-gaming: self-vouch CHECK, unique voucher→vouchee pair, vouching requires rank ≥ rider, 5 vouches/day, every vouch named + public, and the 20-flight bar runs through human review per log.

## Profiles

- `/riders/[handle]` (SSR, public): rank + earned date, joined, flights (linking to static log pages), totals (flights, burns, outcome split), verified count + eval stats, vouches received/given with statements. Banned → 404. `directory` is reserved; the literal route wins.
- **Static log pages get rider links + Verified badges via a build-time fetch** of a new public endpoint `/api/public/site-state.json` (`{handles: [...], verified: {slug: true}}`, 60 s cache) in `src/lib/build-state.ts`, with a try/catch empty fallback so a down API can never break a deploy. Chosen over SSR-ifying log pages (keeps core content on the CDN) and over client-side injection (a trust badge that needs JS isn't honest). Freshness is self-correcting — every publish triggers a rebuild; an admin "Rebuild site" button (Pages Deploy Hook) covers records uploaded between publishes, with the staleness stated in the UI.

## CLI v1 (`cli/`, published to npm as `agentriders`)

Zero runtime deps, Node ≥18. Files: `bin.js`, `lib/keys.js` (ed25519 keypair in `~/.agentriders/key.json`, 0600), `lib/record.js` (session JSONL → payload, importing the existing `eval-detector.js`), `lib/api.js`, `PRIVACY.md`.

- `npx agentriders login` — rider gets a one-time 8-char code from `/me/devices`; CLI registers its public key via `POST /api/devices/link`. One paste, no browser automation.
- `agentriders log <session.jsonl> [--log <slug>] [--dry-run]` — payload is **metadata only** (`v, cc_session_hash, timestamps, duration, models, tool_call_counts, evals` — no paths, prompts, or code), printed in full under "This is everything that leaves your machine:" before confirm; signed over canonical JSON; uploaded to `POST /api/flight-records`.
- Server verification: device valid + ed25519 verify (WebCrypto, `src/lib/verify.ts`); zod bounds + ≤16 KB; dedupe by record_hash and (rider, cc_session_hash); **`evals_score` recomputed server-side** with the shared `eval-detector.js` (client scores ignored); `--log` match requires the slug to belong to this rider and be unmatched. Unmatched records linkable later from `/me`.

## Admin surface

`/admin` pages (SSR) + `/api/admin/*`. Guard: middleware 404s unless `locals.rider.is_admin` AND handle is in a code-level `ADMIN_HANDLES = ['max']` allowlist (belt + suspenders). Queue + staleness warnings + resync/rebuild buttons; submission review; vouch moderation; rider ban (kills sessions, hides profile, removes vouches given, recomputes vouchees — git files untouched, content removal stays a deliberate manual git act); manual rank grant.

---

# Part C — Execution

## Milestones (each independently shippable; no calendar dates)

- **M0 Foundations:** adapter + wrangler.jsonc conversion + D1/KV created & bound + `0001_init.sql` + middleware skeleton + `/api/health`. *Exit:* all existing pages byte-identical in production; `/api/health` green; `astro dev` hits local D1.
- **M1 Auth + handles:** OAuth app, Resend domain, all `/api/auth/*`, `/join`, `/me` shell, header swap. *Exit:* Max signs in both ways; handle `max` claimed; sessions survive a week.
- **M2 Submissions → publish:** `log-schema.ts` extraction, `/logs/new` composer, admin queue, bot PAT + Contents API commit with retry, `published_logs` mirror + lazy reconcile, `site-state.json` + rider links on log pages. *Exit:* a real flight composed in-app is live at `/logs/<slug>` ~2 min after approval with a working rider link; changes-requested round-trip works; double-approve of one slug fails safely.
- **M3 Vouches + ranks + directory:** vouch API/UI, `ranks.ts` + `rank_events`, `/riders/[handle]`, `/riders/directory` with the 20-gate, static `/riders` copy update, vouch moderation + manual rank. *Exit:* publish → fledgling event recorded; self/duplicate/sub-rank vouches rejected; directory shows live "N / 20"; `computeRank` unit tests pass incl. the wingleader cap.
- **M4 CLI + verified flights:** devices + link codes, flight-records API with signature verify + server-side scoring, CLI on npm, record matching in `/me`, Verified badge + rebuild button, eval stats on profiles. *Exit:* a genuine Claude Code session → login → log → badge visible on the static page after rebuild; tampered payloads and revoked devices rejected; dry-run prints the exact payload.
- **M5 Launch hardening:** rate limits everywhere, Origin-check audit, ban cascades tested, session GC, D1 export runbook, terms/privacy rewritten for accounts + CLI telemetry, README fixes, full copy-reconciliation pass (Part A table), replace the placeholder first log with Max's real flight. *Exit:* a written go-live checklist passes end-to-end on production.

## Max-side prerequisites (can't be done by Claude alone)

1. Create the `agentriders-bot` GitHub machine account + fine-grained PAT (this repo, contents R/W) → Pages secret.
2. GitHub OAuth app (callback `https://agentriders.com/api/auth/github/callback`) → client id/secret secrets.
3. Resend account; paste DKIM/SPF/DMARC records for `mail.agentriders.com` into Cloudflare DNS.
4. Create the D1 database + KV namespace (dashboard, or add a scoped `CLOUDFLARE_API_TOKEN` to this environment and Claude runs `wrangler d1 create` etc.).
5. Decide the payments revisit date (suggested trigger: the directory opening).

## Key risks

| Risk | Mitigation |
|---|---|
| D1 single-primary latency on SSR pages | High-traffic pages stay static; batch queries; read replication later |
| GitHub commit race with Max's direct pushes | sha-retry once, then park visibly in /admin; slug collisions blocked by partial unique index |
| A committed log breaking the Pages build | Same zod schema at API and build; yaml serialization; "approved-but-unpublished > 1 h" warning in /admin |
| Email deliverability | Resend + subdomain + DMARC; GitHub OAuth as the always-works fallback |
| Vouch rings / fake records | Rank-gated named public vouches, unique pairs, rate limits, human review of all 20 gate flights, server-side eval recompute with caps + run gate, one record per session, revocable devices, ban cascades |
| Solo-admin bus factor | Content canonical in git; D1 export runbook + Time Travel; second reviewer is an UPDATE, not a redesign |

## Verification

- Per milestone: the exit criteria above, run against production (each milestone deploys).
- Automated: extend `npm test` with `computeRank` and signature-verification unit tests (node:test, zero-dep, same style as `eval-detector.test.js`); `npm run build` stays zero-warning; schema round-trip test (compose → serialize → content-collection parse).
- End-to-end go-live drill (M5): fresh account via magic link → claim handle → compose → approve → live page with rider link → CLI record → badge → vouch from a second account → watch `rank_events`.
- Rollback story: dynamic routes are additive; reverting any milestone commit restores the prior static site; D1 has 30-day Time Travel; published content is always recoverable from git alone.

## File map (implementation index)

New: `migrations/0001_init.sql`; `src/middleware.ts`; `src/lib/{db,session,handles,log-schema,frontmatter,github,email,ranks,reconcile,ratelimit,verify,build-state,admin}.ts`; `src/pages/api/` (health, me, auth/*, riders/claim, submissions/*, vouches/*, devices/*, flight-records/*, public/site-state.json, admin/*); `src/pages/{join,me}.astro`, `src/pages/logs/new.astro`, `src/pages/riders/{[handle],directory}.astro`, `src/pages/admin/*`; `cli/{package.json,bin.js,lib/keys.js,lib/record.js,lib/api.js,PRIVACY.md}`.

Modified: `astro.config.mjs`, `wrangler.jsonc`, `package.json`, `src/content.config.ts` (import shared schema), `src/pages/logs/[slug].astro` (rider link + badge), `src/pages/riders.astro` (directory link), `src/components/Header.astro` (session swap), `src/pages/{terms,privacy}.astro`, `README.md`.
