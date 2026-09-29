# AgentRiders

The guild for people who run AI agents on real work. A static site: Astro, plain CSS, and small progressive enhancements for navigation, cinematic motion, a pre-flight checklist, and copying flight-log templates. The agents are the easy part.

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

## Deploy — Cloudflare, built from the repo

Cloudflare builds and deploys on every push to `main`; other branches get preview URLs. The dashboard's current default git-import flow creates a **Worker with static assets**; the classic **Pages** flow works too if your dashboard still offers it. The repo supports both.

**Workers flow (dashboard default):**

1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository**, pick this repo.
2. Project name: `agentriders`. Build command: `npm run build`. Deploy command: `npx wrangler deploy` (the default). `wrangler.jsonc` tells it to serve `dist/` as static assets — there is no server code.
3. Custom domain: the Worker → **Settings → Domains & Routes → Add → Custom Domain** → `agentriders.com` and `www.agentriders.com` (the zone must be on Cloudflare).
4. `PUBLIC_NEWSLETTER_ENDPOINT` goes in the project's **Settings → Build → Variables**. See § Newsletter.

**Pages flow (where offered):**

1. **Workers & Pages → Create → Pages tab → Import an existing Git repository**, pick this repo.
2. Production branch `main`, framework preset **Astro**, build command `npm run build`, build output directory `dist`. Pages ignores `wrangler.jsonc`.
3. Custom domains and `PUBLIC_NEWSLETTER_ENDPOINT` live in the Pages project's **Custom domains** and **Settings → Environment variables**.

Either way, Node comes from `.node-version` (22).

**Production wiring:** the live deployment is the Pages project `agentriders`, building `main` on every push. `agentriders.com` and `www.agentriders.com` are both attached under the project's Custom domains, and every page's canonical URL points at the apex, so the duplicate hostname is harmless. To make `www` redirect instead of serve, add a zone-level Redirect Rule (the zone → **Rules** → "Redirect from WWW to root" template, 301) — Pages' `_redirects` file cannot do domain-level redirects, so that would live in the zone, not this repo.

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

Create `src/content/logs/<slug>.md` with the frontmatter shown on [/logs/template](https://agentriders.com/logs/template) (schema in `src/content.config.ts`). With `draft: false` it appears in `/logs`, on the homepage (three most recent), in the static facet pages, and in `/logs.json`.

The three logs shipped in `src/content/logs/` are the examples from the brief. They are `draft: true` on purpose and never publish; the homepage shows its built-in example cards until real logs exist. Don't flip them.

## Newsletter

Every signup form POSTs a single `email` field to `PUBLIC_NEWSLETTER_ENDPOINT`, read at build time (`src/components/Signup.astro`). Unset or empty, the site displays an honest “signup opens soon” state with a Field Manual link; no email form or placeholder POST is rendered. No third-party script is loaded, ever.

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

Tokens and type live in `src/styles/global.css`; the illustrated experience lives in `src/styles/experience.css`. Preserve ink/bone/ember, Fraunces/Instrument Sans/JetBrains Mono, honest example labels, and static content collections. Artwork and optional motion are now part of the approved direction. No invented riders, testimonials, counts, or published flights. No tracking. Respect reduced-motion preferences and retain keyboard navigation.

## Flight School content

Flight School lives at `/training/`, with guided missions at `/missions/` and six downloadable worksheets at `/training/kit/`. The six lessons are Markdown entries in `src/content/training/`; mission briefs are in `src/content/missions/`. Their schemas are in `src/content.config.ts`. Edit `public/training/*.md` to update a worksheet; the kit previews import the same files at build time so downloads and previews stay consistent. Lessons link to the existing Field Manual for continuing reference.

Artwork prompts and responsive image paths are recorded in `docs/flight-school-art-prompts.md`. New assets are additive. Keep the original artwork and preserve the local motion toggle and reduced-motion behavior when extending these pages.
