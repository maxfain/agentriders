# Go-live checklist

Phase 2 turns the static publication into a product (accounts, logging, vouches, ranks, CLI-verified flights). Work top to bottom; the smoke test at the end is the real gate.

## 1. Cloudflare resources

- [ ] D1 database `agentriders` exists; its id is in `wrangler.jsonc` (`DB` binding).
- [ ] KV namespace exists; its id is in `wrangler.jsonc` (`RATE` binding).
- [ ] Migrations applied to production: `npx wrangler d1 migrations apply agentriders --remote`.
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

- [ ] `/terms` — add governing law / jurisdiction and a contact address (see the `AUTHOR` comment).
- [ ] `/privacy` — add a contact address for privacy and deletion requests (see the `AUTHOR` comment).
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

## 7. Guardrails

- [ ] Rate limits respond (repeat a magic-link request past the limit → generic 200, no email; repeat vouches past 5/day → 429).
- [ ] Admin "Sweep expired" runs; `/api/admin/*` 404s for non-admins.
- [ ] A D1 export has been taken at least once (see `docs/runbook.md`).
