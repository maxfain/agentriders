# Go-live checklist

Phase 2 turns the static publication into a product (accounts, logging, vouches, ranks, CLI-verified flights). Work top to bottom; the smoke test at the end is the real gate.

## 1. Cloudflare resources

- [ ] D1 database `agentriders` exists; its id is in `wrangler.jsonc` (`DB` binding).
- [ ] KV namespace exists; its id is in `wrangler.jsonc` (`RATE` binding).
- [ ] Migrations applied to production: `npx wrangler d1 migrations apply agentriders --remote`.
- [ ] Migration `0002_profile_mounts.sql` is among them (same command): `PRAGMA table_info(published_logs)` shows `mount` and `mount_slug`. Until it is, profiles render without mounts and a `/me/profile` save that touches rides answers "Profile storage is being upgraded." — code first is safe, nothing 500s.
- [ ] Pages project `agentriders` builds `main`; `agentriders.com` + `www` attached; `www` 301s to apex (zone Redirect Rule).

## 2. Secrets (dashboard or `wrangler pages secret put`)

- [ ] `SESSION_PEPPER` — long random string. (Rotating it signs everyone out.)
- [ ] `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` — OAuth app, callback `https://agentriders.com/api/auth/github/callback`, scope `user:email`.
- [ ] `RESEND_API_KEY` — domain verified in Resend; magic links send from a verified sender.
- [ ] `GITHUB_BOT_TOKEN` — `agentriders-bot` fine-grained PAT, **Contents: Read & write** on this repo only. (Optional: `GITHUB_REPO`, `GITHUB_BRANCH`.)
- [ ] `PAGES_DEPLOY_HOOK` — a Pages Deploy Hook URL (powers admin "Rebuild site").
- [ ] `DEV_MAGIC_ECHO` is **not** set in production.

## 3. Admin

- [ ] The admin handle is in `ADMIN_HANDLES` (`src/lib/admin.ts`) **and** that rider's `is_admin = 1` in D1. Both are required (belt + suspenders).
- [ ] `/admin` loads for the admin and 404s for a signed-out visitor.

## 4. Copy / legal (author TODOs)

- [x] Monitored **hello@agentriders.com** inbox (routes to the founder's mail) — `/terms` and `/privacy` point there.
- [x] `/terms` governing law: State of Delaware, United States; operator Permanent Ventures Inc. Code is MIT-licensed (`LICENSE`, also shipped in both npm packages).
- [ ] First real flight is published (not the brief examples); the homepage shows real cards.

## 5. CLI

- [ ] `npm publish` from `cli/` (name `agentriders` reserved). Verify `npx agentriders --version`.
- [ ] `agentriders login` against production pairs a device; `agentriders log --dry-run` prints a metadata-only payload.

## 6. Smoke test (run against production)

- [ ] Sign in with **GitHub**; sign in with an **email magic link** (second browser/incognito).
- [ ] Claim a handle; `/me` shows it.
- [ ] Compose a flight at `/logs/new` → approve in `/admin` → it appears at `/logs/<slug>` within ~2 min with a working rider link.
- [ ] A second account vouches for the first; the vouch is public and named on both profiles.
- [ ] Drive one account to Rider (20 flights + 2 Rider vouches) and watch `rank_events` record the promotion (the end-to-end ladder proof).
- [ ] `agentriders log --log <slug>` → after a rebuild the **Verified flight** badge shows on the static log page.
- [ ] `/riders/directory` shows the live `N / 20` and opens at 20.
- [ ] After 0002: force one reconcile (`/admin` → **Resync mirror**, or `POST /api/admin/reconcile`) so every published flight carries `mount`/`mount_slug`; then a profile with a published flight shows **MOUNTS** ("Claude Code · 1 flight"), `/me/profile` saves rides, and `/riders/directory` shows the "MOUNTS IN THE RECORD" strip.

## 7. Guardrails

- [ ] Rate limits respond (repeat a magic-link request past the limit → generic 200, no email; repeat vouches past 5/day → 429).
- [ ] Admin "Sweep expired" runs; `/api/admin/*` 404s for non-admins.
- [ ] A D1 export has been taken at least once (see `docs/runbook.md`).

## 8. Search visibility

The technical baseline (robots, sitemap, RSS, JSON-LD, canonicals) ships with the code; this is the founder-side half (docs/seo-aeo-plan.md §4.6, §7).

- [ ] **Google Search Console** verified for `agentriders.com` via a DNS TXT record (domain property, not URL prefix).
- [ ] **Bing Webmaster Tools** verified via DNS TXT (ChatGPT/Copilot citations need Bing's index).
- [ ] `https://agentriders.com/sitemap-index.xml` submitted in both; `curl -sI https://agentriders.com/robots.txt` and `/sitemap-index.xml` both 200.
- [ ] `curl -sI https://agentriders.com/manual` → one 308 to `/manual/`; `curl -sI https://agentriders.com/riders/directory` → one 301 to `/riders/directory/`.
- [ ] Cloudflare → Security → Bots: **AI bot policy** Search = Allow, Agent = Allow, Training = Allow (founding-season decision, §2.4); legacy **"Block AI bots" off**; **Bot Fight Mode off** (Grok fetches with browser-like user agents).
- [ ] Cloudflare → Caching → Configuration: **Crawler Hints (IndexNow) on**. AI Crawl Control on; check monthly for 403s on `/logs.json`, `/logs/*`, `/manual/*`.
- [ ] GA4: channel group **"AI assistants"** with referrers `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `copilot.microsoft.com`, `claude.ai`, `gemini.google.com`, `grok.com`, `x.ai`.
- [ ] **Rich Results Test** passes (no errors) on one chapter (`/manual/reins/`), one log (`/logs/shipped-agentriders-phase-2/`) and one profile (`/riders/maxcr/`).
- [ ] 30 days after verification: record the GSC baseline before setting any target (§7).
