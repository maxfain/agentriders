# agentriders.com — build brief for Claude Code

Drop this file and `index.html` into the repo root, then start Claude Code there and paste the kickoff prompt below.

## Kickoff prompt (paste into Claude Code)

> Read `agentriders-brief.md` in full before doing anything. Build the AgentRiders site exactly as it specifies: Astro, static output, content collections for the Manual and the Flight Logs, deployed to Cloudflare Pages. `index.html` is the reference implementation of the homepage — port it into Astro components without changing its copy, tokens or layout. Ship Phase 1 only. When you finish, run the acceptance checklist at the end of the brief and report which items pass.

---

## 1. What this site is

AgentRiders is the guild for people who run AI agents on real work: a public track record, a field manual, and a community of peers. The thesis: **the agents are the easy part.** Everyone is building dragons; almost nobody is training riders.

Audience: founders, engineers and operators who already run agents on real tasks and want to get better at it, prove it, and find each other.

The metaphor: agents are dragons (powerful, willful, own ideas); humans are riders. The brand is a modern guild, not a fantasy franchise. Metaphor lives in nouns; verbs and numbers stay plain.

## 2. Stack and constraints

- **Framework:** Astro (latest), static output (`output: 'static'`). No client-side framework unless a component truly needs it; the homepage needs none.
- **Content:** Astro content collections, markdown with typed frontmatter (schemas in § 8). `src/content/manual/` and `src/content/logs/`.
- **Styling:** plain CSS with the custom properties in § 3. No Tailwind, no UI kit. One global stylesheet plus scoped component styles.
- **Fonts:** Fraunces, Instrument Sans, JetBrains Mono. Self-host via `@fontsource-variable/fraunces`, `@fontsource-variable/instrument-sans`, `@fontsource-variable/jetbrains-mono` (fall back to the Google Fonts link in `index.html` if self-hosting fights you). Preload the display face.
- **Hosting:** Cloudflare Pages. Include a `wrangler.toml`-free setup (Pages builds from the repo); document the build command (`npm run build`) and output dir (`dist`) in the README.
- **Newsletter:** a `<form>` that POSTs to `PUBLIC_NEWSLETTER_ENDPOINT` (env var). Ship with a placeholder and a README note on wiring Buttondown, Resend Audiences or ConvertKit. Do not add a third-party script.
- **Analytics:** none in Phase 1, or Cloudflare Web Analytics only (no cookies).
- **Performance:** Lighthouse ≥ 95 on every category on the homepage; no layout shift from fonts (use `font-display: swap` + size-adjust or preload).
- **Machine-readable:** serve `/llms.txt` (provided) and `/logs.json` (all published logs, generated at build). Dragons should be able to read about riders too.

## 3. Brand tokens

```css
:root {
  --ink:   #16130F;  /* dark ground: hero, ranks, rules, footer; body text on bone */
  --bone:  #F2EBDD;  /* light ground; text on ink */
  --bone-raised: #FAF6EE;   /* cards on bone */
  --ember: #E4572E;  /* the one accent: primary button, active state, burn counts, mark pupil */
  --ember-text: #A93A19;    /* ember darkened for text links on bone (meets AA) */
  --ash:   #6B645A;  /* captions on bone */
  --smoke: #2A2622;  /* cards and rules on ink */
  --smoke-line: #3B3631;
  --bone-line: #D8CFBE;
  --text-on-bone-soft: #3E3933;
  --text-on-ink-soft: #B8AE9F;
  --text-on-ink-caption: #8F8778;
  --radius: 4px;
}
```

- **Type.** Display: Fraunces 600, tight leading (0.98–1.1), letter-spacing −0.02em, optical size on. Body: Instrument Sans 17–18 px, line-height 1.55. Mono: JetBrains Mono for nav labels, flight logs, ranks, stats, form labels. Never Inter, Roboto or Arial.
- **Type scale (desktop):** h1 96 / h2 56–64 / h3 30–40 / body 17–18 / mono 13–14. Use `clamp()` as in `index.html` for mobile.
- **Ember is rare.** One accent per screen region: primary button, the live dot, burn counts > 0, rule numbers, the mark's pupil. Never as a text color at small sizes on bone (contrast fails); use `--ember-text`.
- **Buttons:** rectangles, 4 px radius, mono uppercase, min height 48 px (44 in the header).
- **Layout:** max content width 1248 px; gutters `clamp(20px, 5vw, 96px)`; sections alternate ink / bone; prose measure ≤ 62ch.
- **Logo:** wordmark "AgentRiders" in Fraunces 600 + the mark: a dragon's eye drawn as one line with an ember pupil (inline SVG in `index.html`). At 16 px use the eye alone. No wings, no flames, no full dragon.
- **Imagery:** telemetry over illustration. Log cards, horizon lines, gauge-like stats. Photos only of real riders and real screens. No stock, no AI-generated dragons.

## 4. Voice

Dry, field-tested, confident. Short sentences. Numbers stay in.

| Do | Don't |
| --- | --- |
| "Log the flight. Note what it cost." | "Hark, brave rider, ascend!" |
| "4 hours saved, $38 in tokens, one rollback" | "Huge productivity gains" |
| "It will do what you didn't say. That's the job." | "Dumb AI hallucinated again" |
| "The rein was too loose. Here's the tighter one." | "The model failed us" |

Avoid: Targaryen names, sigils, "fire and blood", thrones; fantasy diction ("thee", "quest", "epic"); calling agents pets, slaves or employees; using "rider" for anything a person does not actually do.

Name treatment: **AgentRiders**, one word, two capitals. Members are riders (lowercase); the organization is the Guild.

## 5. Vocabulary (use consistently in copy, UI labels and frontmatter)

| Term | Means |
| --- | --- |
| Dragon | An AI agent: powerful, willful, has its own ideas |
| Rider | A person who runs agents on real work |
| Mount | The specific agent you are riding right now (model plus setup); "to mount" = start a session |
| Harness | The scaffold around the model that makes it rideable: tools, memory, loops, where reins are enforced |
| Saddle | The rider's seat: the console, chat window or approval queue. Moves with the rider between mounts |
| Reins | Permissions, scopes, budgets, kill switches |
| Bridle | A full set of reins written down and reusable across mounts |
| Flight | One real run of an agent on a task, with an outcome |
| Flight Log | A written account of a flight; also the weekly newsletter |
| Burn | A run that went wrong: money, data or time lost |
| Bond | Earned trust between a rider and a specific agent over many flights |
| Hatchling | An agent with no logged flights yet (an agent state, not a rider rank) |
| Grounded | A mount pulled from service after a burn until its reins are refitted |
| Wing | A team of riders, or a fleet of agents run together |
| The Roost | The members' forum |
| The Yard | The sandbox where hatchlings fly before real work |
| Field Manual | The playbook library |

Ranks (riders): Fledgling → Rider → Wingleader. Earned by logged flights and vouches. Never sold.

## 6. Site structure

Nav, left to right: Manual · Logs · Riders · Guild · About · [Join the Guild]. One primary action everywhere: join.

| Route | Page | Phase | Template |
| --- | --- | --- | --- |
| `/` | Home | 1 | custom (port `index.html`) |
| `/manual` | Field Manual index | 1 | feed |
| `/manual/[slug]` | Manual chapter | 1 | long-form |
| `/logs` | Flight Logs feed | 1 | feed |
| `/logs/[slug]` | One flight log | 1 | long-form with a stats block |
| `/flight-log` | Newsletter signup + archive | 1 | feed |
| `/about` | Manifesto | 1 | long-form |
| `/riders` | Holding page: "Opening when 20 flights are logged" + signup | 1 (stub) | long-form |
| `/guild` | Holding page: tiers preview + signup | 1 (stub) | long-form |
| `/terms`, `/privacy` | Legal | 1 | long-form |
| `/riders/[handle]` | Rider profile: rank, flights, burns, vouches | 2 | profile |
| `/guild` (live) | Membership with checkout | 2 | profile |
| `/llms.txt`, `/logs.json` | Machine-readable | 1 | static |

**Phase 1 = everything marked 1.** Phase 2 needs auth, a database and payments; do not start it.

Three templates cover everything: **long-form** (chapters, about, legal), **feed** (manual index, logs, archive), **profile** (later). Every page: header, footer, `<title>` and description, Open Graph tags with a generated OG image in brand colors (Fraunces headline on ink).

## 7. Page copy (verbatim; headlines and leads are final)

### Home
Port `index.html` as is. Section order: hero → Agents are dragons → Four parts → Ranks → From the logs → The rider's rules → Flight Log signup → footer. Replace the three example log cards with the three most recent published logs from the collection; keep the card layout.

### Field Manual (`/manual`)
- Headline: Everything we know about holding the reins.
- Lead: Playbooks written by riders and tested on real work. Start at chapter one if you are new; skip to Burns if you already have scars.
- Launch chapters (create each as a markdown file with the summary as `description`; body = `<!-- TODO: written from real flights -->` until the author fills it):
  1. Before the first flight: scope, budget, kill switch
  2. Reins: permissions that are tight enough to be loosened
  3. The bond: how to give an agent more room, one flight at a time
  4. Burns: what goes wrong, what it costs, what to do in the first ten minutes
  5. Logging a flight: the template and why every field matters
  6. Riding a wing: running several agents without losing the reins

### Flight Logs (`/logs`)
- Headline: Real flights. Numbers left in.
- Lead: Every log is one agent, one task, one outcome, written by the rider who held the reins.
- Feed filters (client-free: query-string or static facets): task type, mount, outcome, burns > 0.
- Button: Log a flight → links to a "log template" page (`/logs/template`) that shows the markdown frontmatter to copy, until submissions exist.

### Riders (`/riders`, holding page)
- Headline: The people holding the reins.
- Lead: Search riders by rank and specialty. Every profile is a public track record, vouched by other riders.
- Body: Opening when 20 flights are logged. Subscribe to the Flight Log to be told when. [signup form]

### Guild (`/guild`, holding page)
- Headline: Join the Guild.
- Lead: Reading is free. The Guild is where riders compare notes, run flights together, and get vouched.
- Tiers table (show as "planned"; no checkout in Phase 1):

| Tier | Price | Includes |
| --- | --- | --- |
| Reader | Free | Manual, Logs, Flight Log newsletter, one logged flight |
| Rider | $15/month or $120/year | Unlimited logging, public profile, The Roost, monthly live flights, vouching |
| Wing | $49/seat/month | Everything in Rider for a team, shared bridles, private wing logs, Wingleader review |

- FAQ headers: Do I need to pay to log flights? Can a rank be bought? What if my agent burned something big? Do you take vendor sponsorships? (Answer: yes, labeled, and never in the Manual.)
- Then the signup form: "Be first in when the Guild opens."

### About (`/about`)
- Headline: Why riders.
- Lead: Everyone is building dragons. We are here for the people who ride them.
- Body: five short paragraphs in this order — agents are powerful and willful; the human is the bottleneck and the hero; autonomy is earned; logs beat opinions; the Guild exists so nobody has to learn every lesson alone. Leave `<!-- AUTHOR: who runs it, where to write -->` for the sign-off.

### Flight Log (`/flight-log`)
- Headline: Flight Log.
- Sub: One field-tested lesson a week, from riders who left the numbers in.
- Form + small print: No vendor demos. Unsubscribe any time.
- Archive list below (empty state: "First issue lands when the first twenty flights are logged.").

### Footer (every page)
Mark, wordmark, italic tagline "The agents are the easy part.", columns Guild (Manual, Logs, Riders, Guild) and More (About, Flight Log, llms.txt), bottom line "© 2026 AgentRiders · Terms · Privacy" and "Built by riders. Readable by dragons."

## 8. Content model

`src/content/manual/*.md`
```yaml
title: "Before the first flight: scope, budget, kill switch"
chapter: 1
description: "What to set before an agent touches real work."
startHere: true        # Fledgling path
updated: 2026-09-25
draft: false
```

`src/content/logs/*.md`
```yaml
title: "Migrated 214 unit tests to Vitest"
date: 2026-09-20
rider: "handle"                 # plain text in Phase 1; links to /riders/[handle] in Phase 2
mount: "Claude Code"            # agent product or framework
model: "Claude Opus 4"          # optional
harness: "Claude Code CLI"      # optional
task: "code"                    # code | ops | research | sales | writing | data | other
duration: "3h 10m"
cost_usd: 41
outcome: "landed"               # landed | partial | aborted
burns:
  - what: "Deleted a test fixture"
    recovery: "Restored from git"
    cost_usd: 0
lesson: "Give it a branch, not the repo."
reins:
  scope: "acme/web, branch only"
  budget: "$50 per flight"
  kill_switch: "on, 2 approvals"
  autonomy: "Rider, unsupervised"
draft: true                     # the three example logs ship as drafts and never publish
```

Validate with Astro's `defineCollection` + zod. `/logs.json` = every non-draft log's frontmatter plus its URL.

## 9. Acceptance checklist

- [ ] `npm run build` succeeds with zero warnings; `dist/` deploys to Cloudflare Pages
- [ ] Homepage matches `index.html` section for section, copy unchanged
- [ ] All Phase 1 routes exist; Riders and Guild are holding pages with a working signup form
- [ ] Six Manual chapters exist with the exact titles above; index lists them in chapter order with "Start here" on chapter 1
- [ ] Three example logs exist as `draft: true` and do not appear on the site or in `/logs.json`
- [ ] `/llms.txt` and `/logs.json` are served
- [ ] Fonts self-hosted or preloaded; no layout shift; Lighthouse ≥ 95 across the board
- [ ] Keyboard focus visible everywhere; every form input has a label; color contrast passes AA on both grounds
- [ ] No Inter/Roboto/Arial, no gradients, no emoji, no drop shadows, no dragon illustrations
- [ ] README explains: build, deploy, adding a Manual chapter, adding a log, wiring the newsletter endpoint

## 10. Don'ts

- Don't invent riders, testimonials, member counts or logo bars. Empty is fine; fake is not.
- Don't add animation, parallax, or scroll-triggered reveals.
- Don't add a chat widget, cookie banner or tracking pixel.
- Don't restyle: the tokens and `index.html` are the design. Small, faithful, shipped.
