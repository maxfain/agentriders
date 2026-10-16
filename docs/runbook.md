# Operations runbook

Published flights are canonical in Git — they are always recoverable from the repo alone. D1 holds people and process (accounts, sessions, submissions, vouches, devices, flight records, rank events); back it up.

## Backups

**Export D1** (run regularly; before any risky migration):

```sh
npx wrangler d1 export agentriders --remote --output agentriders-$(date +%F).sql
```

**Time Travel** — D1 keeps 30 days of history. To see or restore a point in time:

```sh
npx wrangler d1 time-travel info agentriders --remote
npx wrangler d1 time-travel restore agentriders --remote --timestamp <ISO8601>
```

Published content needs no D1 restore — re-deploying `main` rebuilds every log from `src/content/logs/`.

## Session / token GC

No cron on Pages. Expired sessions are deleted on access; the rest is swept:

- Automatically on each `/admin` render (bounded).
- On demand: the **Sweep expired** button on `/admin`, or `POST /api/admin/gc`.

Each sweep is bounded (500 rows/table by default); run it again to clear a large backlog. It removes expired sessions and spent/expired `magic_link_tokens` and `device_link_codes`.

## Common actions

- **Take down a published flight:** delete `src/content/logs/<slug>.md` in Git and push (or revert the publish commit); the site rebuilds without it. Optionally remove the D1 `published_logs` row (admin resync rebuilds the mirror from `/logs.json`).
- **Ban a rider:** `/admin` → their profile → Ban. This kills their sessions, hides their profile, removes vouches they gave, and recomputes everyone they vouched. Their Git-published logs are untouched — content removal is a deliberate manual Git act.
- **Moderate a vouch:** remove it from the voucher's or vouchee's profile (admin control); the rank engine recomputes with demotion allowed.
- **Rotate a secret:** set the new value and redeploy. Rotating `SESSION_PEPPER` invalidates every session (everyone signs in again) — do it if a session leak is suspected.
- **Revoke a CLI device:** the rider does this from `/me/devices`; an admin can also clear `devices.revoked_at`/set it via D1. Revoked devices cannot sign new records; existing records stay (they were valid when made).
- **Stuck publish:** `/admin` flags "approved but not live after an hour." Check the Pages deploy and the `agentriders-bot` PAT; "Resync mirror" re-reads `/logs.json`, "Rebuild site" fires the deploy hook.

## Abuse controls (coverage)

Rate limits live in KV (`src/lib/ratelimit.ts`). CSRF rests on `SameSite=Lax` plus the middleware Origin check (a cookie-authenticated write with a missing/mismatched Origin is rejected; the cookieless CLI endpoints authenticate by link code or signature).

- **Unauthenticated writes are all limited:** magic-link request (3/hr/email, 10/hr/IP), magic-link **verify** (30/hr/IP), device link exchange (30/hr/IP), flight-record upload (60/hr/IP).
- **Account-creating / fan-out writes are limited per rider:** handle claim (10/hr), submission create (≤2 in flight, ≤5/day), vouch create (5/day), device-code mint (10/hr).
- **Admin routes** (`/api/admin/*`) are gated by the middleware 404 for non-admins — a trusted single actor, no per-call limit.
- **Own-resource writes** (edit/submit a draft, match/unmatch/delete a record, revoke a device or vouch) are session-authenticated and bounded by DB constraints (unique indexes, in-flight caps); they are intentionally not rate-limited so legitimate rapid use (e.g. draft edits) is not throttled.

All dynamic responses are `no-store`; `/admin*` and `/api/admin*` 404 for non-admins.

## Health

- `GET /api/health` returns `{ ok, checks: { d1, schema, kv } }`. Non-200 or a failing check means a binding or migration problem.
