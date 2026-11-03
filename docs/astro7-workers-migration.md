# Astro 7 + Cloudflare Workers migration

The next platform milestone: `astro` 5 → 7 and `@astrojs/cloudflare` 12 → 14, which also means leaving Cloudflare Pages for a Worker. Written up 2026-11-03 next to the dependency patch PR (zod 4 at the root, wrangler 4.156.2, yaml 2.9.1, Node pinned to 22.23.4, a 256 KiB body cap on API writes) and **not executed yet** — decision (Max, 2026-11-03): patch now, migrate as its own milestone. Everything `npm audit` still reports on the site after that PR is listed in §2; this document is where that residue is tracked.

---

## 0. Why a milestone, not a patch

- **Astro 5 gets no more security releases.** 5.18.2 is the newest 5.x; every `astro` fix lives in 6.x/7.x, and the critical one (AVIF RCE in the image service) needs ≥ 7.2.8.
- **`@astrojs/cloudflare` 13.0.0 dropped official Cloudflare Pages support** (Workers only), moved the runtime API (`locals.runtime` → `cloudflare:workers`), and runs `astro dev` in workerd. The adapter is what drags the nested `wrangler 4.59 → miniflare 4 → undici 7.14 / ws 8.18` chain along, so there is no adapter-only fix either.
- **Astro 6 and 7 each carry breaking changes that touch this tree** (§4): the runtime API, the markdown pipeline, HTML compression, the compiler, zod.

So: new infrastructure, one coordinated code change, a domain cutover with a rollback — not a lockfile bump.

## 1. Targets

| what | today | target |
|---|---|---|
| `astro` | 5.18.2 | 7.4.x (7.4.5 on 2026-11-03) |
| `@astrojs/cloudflare` | 12.6.13 | 14.4.x (peer `astro ^7.4`, `wrangler ^4.125`) |
| `vite` (transitive) | 6.4.5 | 8 |
| `wrangler` | 4.156.2 | unchanged (≥ 4.125 satisfies the adapter) |
| Node | 22.23.4 (`.nvmrc`) | ≥ 22.23.4 is what Astro 7.4 requires — already pinned |
| `@astrojs/rss`, `@astrojs/sitemap` | 4.0.19, 3.7.4 | whatever their `astro ^7` peer ranges say at execution |
| `satori`, `@resvg/resvg-js` | 0.18.4, 2.6.2 | independent of Astro; see §2 |

**Expected result:** `npm audit` → 0 in the site lock. The nested `zod 3` / `zod-to-ts` / `sharp 0.34` / `esbuild 0.27` chains disappear with Astro 7's own dependencies (it ships on `zod ^4.6.6`), and the adapter's nested wrangler/miniflare/undici/ws go with adapter 14.

## 2. What it clears — the audit residue after the patch PR

Reachability is the honest column. None of this is reachable from a request today; all of it is build- or dev-time, which is why it can wait for the milestone instead of forcing it.

| package (site lock) | finding | reachable here? | cleared by |
|---|---|---|---|
| `astro` 5.18.2 — 12 advisories | critical AVIF RCE in the image service; high Host-header SSRF in the error-page fetch, reflected XSS via slot name; moderate/low XSS through `define:vars`, spread attribute names, view transitions, JSX/MDX script content, `base` stripping; server-island replay | **No.** No `define:vars`, server islands, view transitions, `base`, JSX/MDX or dynamic slot/attribute names; the one spread (`riders.astro`) spreads a code-controlled object; the image service is `'compile'` at build time on our own images; a foreign `Host` never reaches the worker behind Cloudflare routing | Astro 7.4.x |
| `sharp` 0.34.5 (astro's) | high: libvips / libheif / librsvg | build-time only (`imageService: 'compile'`, our own images) | Astro 7 |
| `esbuild` 0.27.7 (astro's) | low | build-time | Astro 7 |
| `zod` 3.25.76 nested under `astro` and under the adapter's `miniflare`; `zod-to-ts` ≤ 1.2.0 | high: memory exhaustion validating oversized constrained collections | build/dev-time only. The copy that validates rider input at request time is the root `zod` 4 (`src/lib/log-schema.ts`, `src/lib/submissions.ts`, the submissions API), behind the body cap | Astro 7 (`zod ^4.6.6`), adapter 14 |
| `@astrojs/cloudflare` 12.6.13 | moderate: SSRF via the image-binding endpoint | endpoint not enabled | adapter 14 |
| adapter's nested `wrangler` 4.59.2 → `miniflare` 4 → `undici` 7.14 / `ws` 8.18 | high (undici, ws) | dev-only; the root `wrangler` 4.156.2 (miniflare 5, undici 7.30.1, ws 8.21) is the one `npx wrangler pages dev` runs | adapter 14 |

**Independent of Astro — `satori` 0.18.4** (GHSA-wx4j-mvgx-mqwp, moderate: improper escaping in the generated SVG). Build-time; the text is our own headline and captions, rasterized by resvg. The patched line (0.63.2 at the time of writing) was tried and reverted: it renders `public/og.png` without the logo row and the caption row (the layout engine changed; `position: relative` on those rows does not bring them back) and pins `fflate` 0.7.3, which carries its own moderate advisory. Revisit when a satori release renders the card unchanged, or rework `scripts/generate-og.mjs` for the new engine and accept the fflate note. Not part of this milestone.

## 3. Founder-side infrastructure (before, or with, the code)

- [ ] Create the Worker for this repo: Workers Builds on GitHub, or `wrangler deploy` from CI.
- [ ] Same D1 (`98530674-…`, binding `DB`) and KV (`aac75f75…`, binding `RATE`) bindings on the Worker.
- [ ] Re-set every secret on the Worker: `SESSION_PEPPER`, `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`, `RESEND_API_KEY`, `GITHUB_BOT_TOKEN`. `PAGES_DEPLOY_HOOK` (the admin **Rebuild site** button) becomes its Workers Builds equivalent.
- [ ] Verify on the `*.workers.dev` URL first (`scripts/smoke-prod.sh <url>`, then the e2e set in §5).
- [ ] Move `agentriders.com` from the Pages project to the Worker **last**, and keep the Pages project until the Worker is verified in production. Rollback is pointing the domain back.

Unchanged by design: the OAuth callback URL is domain-based; `public/_headers` and `public/_redirects` work under Workers static assets.

## 4. Code changes (from the v6/v7 upgrade guides and the adapter 13/14 changelog, mapped to this tree)

**Adapter.** `wrangler.jsonc` moves from the Pages shape (`pages_build_output_dir`) to the Workers shape (adapter-provided `main`, `assets`, the same bindings). Drop `platformProxy` from `astro.config.mjs`. Set `imageService: { build: 'compile', runtime: 'passthrough' }` explicitly — the runtime default changed. Re-verify the `.dev.vars` and `--persist-to` flows; `astro preview` becomes the local production replica (workerd).

**Runtime API.** `locals.runtime` (38 files, 47 references, mostly `const { env } = locals.runtime`) → `import { env } from 'cloudflare:workers'`; `ExecutionContext` → `Astro.locals.cfContext`. `src/env.d.ts` (`Runtime<AgentRidersEnv>`) and `src/middleware.ts` (the `!context.locals.runtime` build-time guard) change with it.

**Markdown.** Sätteri is the v7 default processor. Keep `rehype-sanitize` on rider-submitted bodies either via `@astrojs/markdown-remark` with `markdown.processor: unified()`, or by porting the schema in `astro.config.mjs` to a Sätteri HAST plugin. Re-verify heading IDs (v6 changed generation; only `/training/#curriculum` relies on a page id) and the eight pages that call `render()` from `astro:content`.

**HTML compression.** `compressHTML: true` in `astro.config.mjs` — the v7 default `'jsx'` drops the space between inline elements. Then a visual diff pass (§5).

**Rust compiler (v7).** Stricter HTML: fix whatever unclosed or invalid nesting the build reports. CSS serialization differences are cosmetic.

**Zod 4 (v6).** Already on `zod@4` at the root after the patch PR. `src/content.config.ts` builds the `logs` collection with that `zod` (a zod 3 object cannot hold zod 4 fields) behind a type-only cast for Astro 5's `defineCollection`; in Astro 7 the cast goes, and the other collections switch their `z` from `astro:content` (deprecated in 6) to `zod` too.

**v6 removals and changes to confirm clean.**
- No `Astro.glob`, no `<ViewTransitions />`, no legacy collections (glob loaders already).
- Endpoints with extensions are not reachable with a trailing slash (`/logs.json`, `/rss.xml`, `/api/public/site-state.json`) — links are slash-less, so nothing to do beyond confirming.
- `import.meta.env` inlining (three sites: `Signup.astro`, `build-state.ts`, `logs.json.ts`).
- Route pathname normalization vs the middleware's trailing-slash 301 (`slashedPath`).
- The bodiless-404 → prerendered `/404` pattern (`Astro.rewrite` is deliberately not used at its two candidate sites) under the adapter's new "prerendered error page fetch".
- `src/fetch.ts` must not exist (reserved in 7; it doesn't).

**Integrations.** `@astrojs/rss` and `@astrojs/sitemap` to their `astro ^7` releases (check peer ranges at execution). `satori` / `@resvg/resvg-js` are independent of Astro.

## 5. Verification

- `npm audit` → 0 in both locks (site and `mcp/`); `npm test`, `npm run build`, `npm run link-report` (0 missing-slash / 0 broken).
- The full e2e set against `astro preview` (workerd): the onboarding spine (sign-in → claim → `/start` → pair → file → `/me/profile` save → profile → directory), `m4-e2e`, `mcp-e2e`, admin approve → git commit → reconcile, `scripts/smoke-prod.sh`.
- Screenshot diff of ~20 key pages at 1280 and 390 wide against `main` (the compression and compiler changes are where regressions would show).
- robots.txt, sitemap, RSS and JSON-LD byte-compared where they are expected to be equal.
- `scripts/smoke-prod.sh` on the `workers.dev` URL before the domain cutover; the go-live smoke test (docs/go-live.md §6) on `agentriders.com` after it.

## 6. Rollback

The Pages project stays deployed from `main` until the Worker has passed §5 in production. If the cutover misbehaves, point `agentriders.com` back at the Pages project; D1 and KV are shared, so nothing is lost either way.
