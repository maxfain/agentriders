# AgentRiders

The guild for people who run AI agents on real work. The published site is static (Astro + plain CSS with small progressive enhancements); the product layer — rider accounts, in-app flight logging, vouches, ranks, and CLI-verified flights — runs as Cloudflare Pages Functions backed by D1 and KV, from the same codebase. Only routes that declare `export const prerender = false` become server routes; everything else ships byte-identical static. Guiding principle: **Git stays canonical for published content; D1 is canonical for people and process.** The agents are the easy part.

- `agentriders-brief.md` and root `index.html` — the original launch brief and visual reference, retained for history.
- `docs/design.md` — the current illustrated design direction, authorized in the September 2026 redesign.
- `src/pages/index.astro`, `src/styles/experience.css`, and `src/styles/cinematic.css` — the homepage, visual system, and optional cinematic motion. The historical reference is no longer a parity requirement.
- `src/components/PageHero.astro`, `src/components/Relic.astro`, and `src/styles/inner-world.css` — the shared inner-page art direction and reading layouts.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321
```

## Build

```sh
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Deploy — Cloudflare Pages, built from the repo

The live deployment is the Cloudflare **Pages** project `agentriders`, building `main` on every push; other branches get preview URLs. Because `wrangler.jsonc` sets `pages_build_output_dir`, the Pages git build reads it, so the D1/KV bindings and `nodejs_compat` flag are version-controlled. The `@astrojs/cloudflare` adapter emits `dist/_worker.js` for the dynamic routes; the rest is static assets.

1. **Workers & Pages → Create → Pages → Import an existing Git repository**, pick this repo.
2. Production branch `main`, framework preset **Astro**, build command `npm run build`, build output directory `dist`.
3. Custom domains → add `agentriders.com` and `www.agentriders.com` (the zone must be on Cloudflare). Every page's canonical URL points at the apex, so the duplicate hostname is harmless; to make `www` 301 to the apex, add a zone-level Redirect Rule (**Rules → Redirect from WWW to root**) — Pages' `_redirects` cannot do domain-level redirects.
4. `PUBLIC_NEWSLETTER_ENDPOINT` goes in the project's **Settings → Variables and Secrets** (see § Newsletter). Node comes from `.node-version` (22).

**Bindings and resources.** The bindings in `wrangler.jsonc` must exist in the account: a D1 database named `agentriders` (binding `DB`) and a KV namespace (binding `RATE`). Create them once with `npx wrangler d1 create agentriders` / `npx wrangler kv namespace create RATE` and put the returned ids in `wrangler.jsonc`.

**Migrations.** The D1 schema lives in `migrations/`. Apply it with `npx wrangler d1 migrations apply agentriders --remote` (and `--local` for dev).

**Secrets** (never in `wrangler.jsonc`), set with `npx wrangler pages secret put <NAME>` or in the dashboard:

- `SESSION_PEPPER` — random string; hardens session/token hashes.
- `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` — the GitHub OAuth app (callback `https://agentriders.com/api/auth/github/callback`).
- `RESEND_API_KEY` — magic-link email (sending from a verified domain).
- `GITHUB_BOT_TOKEN` — the `agentriders-bot` fine-grained PAT (contents R/W, this repo) that commits approved logs to Git. Optional overrides: `GITHUB_REPO`, `GITHUB_BRANCH`.
- `PAGES_DEPLOY_HOOK` — a Pages Deploy Hook URL, powering the admin "Rebuild site" button.

**Local dev.** `npm run dev` runs `astro dev` with the adapter's platformProxy (local miniflare D1/KV under `.wrangler/`). Put the secrets above in `.dev.vars` (gitignored); set `DEV_MAGIC_ECHO=1` to echo magic links in the API response instead of emailing. For a prod-like run: `npm run build && npx wrangler pages dev ./dist`.

## Adding a Manual chapter

Create `src/content/manual/<slug>.md`:

```yaml
---
title: "Before the first flight: scope, budget, kill switch"
chapter: 1
description: "What to set before an agent touches real work."
startHere: true        # shows the "Start here" tag; chapter 1 only
updated: 2026-09-26
draft: false           # true keeps it off the site
---

Chapter body in markdown.
```

The Manual index lists chapters in `chapter` order. The schema is enforced in `src/content.config.ts`; a bad frontmatter fails the build, which is the point.

## Adding a flight log

Published flights arrive two ways: through the in-app composer at `/logs/new` (reviewed in `/admin`, then committed to `src/content/logs/` by the bot — see § Accounts, logging, ranks), or by hand as a `src/content/logs/<slug>.md` file with the frontmatter shown on [/logs/template](https://agentriders.com/logs/template). Either way the schema in `src/content.config.ts` is enforced at build (the API and the content collection import the same schema from `src/lib/log-schema.ts`, so an approved submission can't fail the build). With `draft: false` a log appears in `/logs`, on the homepage (three most recent), in the static facet pages, and in `/logs.json`.

`src/content/logs/` currently holds one real published flight (`shipped-agentriders-phase-2.md`) and two `draft: true` examples from the brief that never publish. The homepage shows its built-in example cards only while no real logs exist.

## Accounts, logging, ranks (Phase 2)

The product layer is hand-rolled, no framework. All of it lives behind `export const prerender = false` routes; `src/middleware.ts` resolves the session cookie, enforces the Origin check on writes, and `no-store`s dynamic responses.

- **Auth** (`src/lib/{session,crypto}.ts`, `src/pages/api/auth/*`): GitHub OAuth + email magic links; sessions are a random cookie whose SHA-256 (peppered) is the stored row id. No passwords.
- **Submissions → publish** (`src/lib/{submissions,github,reconcile}.ts`, `src/pages/logs/new.astro`, `src/pages/api/admin/*`): compose → review in `/admin` → approve commits the markdown to `src/content/logs/` via the GitHub Contents API (the bot) → the site rebuilds → a lazy reconcile flips the status to published. Git remains canonical.
- **Vouches + ranks** (`src/lib/{vouches,ranks}.ts`): named, public, rank-gated vouches; `computeRank` is pure and audited in `rank_events`. Fledgling = 1 flight; Rider = 20 flights + 2 Rider vouches; Wingleader is admin-grant-only (Wings are deferred).
- **Directory** (`/riders/directory`): opens at 20 published flights, counted live.
- **Admin**: `ADMIN_HANDLES` in `src/lib/admin.ts` plus `is_admin` in D1 — belt and suspenders. `/admin` and `/api/admin/*` 404 for everyone else.

The D1 schema is `migrations/0001_init.sql`.

## The `agentriders` CLI

`cli/` is a zero-dependency, Node ≥18 CLI published to npm as `agentriders`. It signs **metadata-only** flight records with a device key and earns a "Verified flight" badge.

```sh
npx agentriders login                      # pair this machine (code from /me/devices)
agentriders log <session.jsonl> --log <slug>   # sign + upload a session's metadata
agentriders log --latest --dry-run         # print the exact payload, upload nothing
```

Records carry counts, model names, timestamps, a one-way session hash, and eval signals — never prompts, code, paths, or commands (`cli/PRIVACY.md`). The server verifies the Ed25519 signature over canonical JSON (`src/lib/verify.ts`), recomputes the eval score, and dedupes per session. A verified record is a **self-attested** signed artifact: it proves a registered device signed the metadata, not that the metadata is true — eval stats are display-only and never feed rank.

Publishing needs an npm account; the name `agentriders` is reserved by the maintainer. `AGENTRIDERS_API` points the CLI at a non-production server.

## Newsletter

Every signup form POSTs a single `email` field to `PUBLIC_NEWSLETTER_ENDPOINT`, read at build time (`src/components/Signup.astro`). Unset or empty, the site displays an honest “signup opens soon” state with a Field Manual link; no email form or placeholder POST is rendered. The newsletter form loads no third-party script — it is a plain POST. (Site analytics is a separate, disclosed Google tag; see § House rules and /privacy.)

- **Buttondown** (drop-in): `https://buttondown.com/api/emails/embed-subscribe/<username>` — accepts a form POST with `email`.
- **Kit (ConvertKit)**: `https://app.kit.com/forms/<form-id>/subscriptions` — expects the field named `email_address`, so either rename the input in `Signup.astro` or front it with the Worker below.
- **Resend Audiences**: no public form endpoint; needs a tiny Worker that accepts the POST and calls the Resend API with your key:

```js
export default {
  async fetch(req, env) {
    const email = (await req.formData()).get('email');
    await fetch('https://api.resend.com/audiences/<audience-id>/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return Response.redirect('https://agentriders.com/flight-log', 303);
  },
};
```

## Machine-readable

- `/llms.txt` — `public/llms.txt`, served as-is.
- `/logs.json` — generated at build by `src/pages/logs.json.ts`: every published (non-draft) log's frontmatter plus its URL.

## OG image

`public/og.png` (1200×630, first-flight artwork and Fraunces headline) is generated by `scripts/generate-og.mjs` as the first step of `npm run build`, so Cloudflare Pages produces it on every deploy; it is not committed. `npm run og` generates it alone for a local look.

## House rules for changes

Tokens and type live in `src/styles/global.css`; the illustrated experience lives in `src/styles/experience.css`. Preserve ink/bone/ember, Fraunces/Instrument Sans/JetBrains Mono, honest example labels, and static content collections. Artwork and optional motion are now part of the approved direction. No invented riders, testimonials, counts, or published flights. Analytics is the Google tag in `src/layouts/Base.astro` only (disclosed on /privacy) — no session recorders, no ad pixels, nothing else. Respect reduced-motion preferences and retain keyboard navigation.

## Flight School content

Flight School lives at `/training/`, with guided missions at `/missions/` and six downloadable worksheets at `/training/kit/`. The six lessons are Markdown entries in `src/content/training/`; mission briefs are in `src/content/missions/`. Their schemas are in `src/content.config.ts`. Edit `public/training/*.md` to update a worksheet; the kit previews import the same files at build time so downloads and previews stay consistent. Lessons link to the existing Field Manual for continuing reference.

Artwork prompts and responsive image paths are recorded in `docs/flight-school-art-prompts.md`. New assets are additive. Keep the original artwork and preserve the local motion toggle and reduced-motion behavior when extending these pages.
