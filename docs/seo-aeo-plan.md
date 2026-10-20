# AgentRiders — SEO & AEO plan (Phase 3)

How agentriders.com earns search traffic and answer-engine citations (ChatGPT search, Perplexity, Google AI Overviews / AI Mode, Claude, Grok), sequenced for a solo founder and honest about a corpus that is **one real flight log** deep today.

Behind this document: a technical audit of the repo, a keyword and competitor study, a review of current AEO/GEO practice, a content-strategy draft, and an adversarial critique of all four (October 2026). The critique changed the plan materially; §9 records what it cut. Sources are in §10.

---

## 0. The plan in one screen

**Where we stand.** A clean static Astro site with good bones — one H1 per page, title/description/canonical/OG everywhere, `/logs.json`, `/llms.txt`, all content prerendered — and three doors closed: **no sitemap, no robots.txt, no structured data**. Canonicals carry a trailing slash while most internal links don't (every click is a 308). The brand vocabulary (reins, burns, mounts, wings) has zero search demand and nothing on the site translates it. Content: 7 Field Manual chapters, 6 Flight School lessons, 3 missions, 6 worksheets (~14k words), and **1 published flight log** (the other two files in `src/content/logs/` are `draft: true` examples that never publish). The domain is weeks old with roughly zero referring domains. The CLI and MCP are being published to npm now; the newsletter endpoint is not configured.

**What the research settles.**

- Head terms — "claude code pricing", "claude code vs cursor", "llm evals", "claude code tutorial", flag names like `--dangerously-skip-permissions` — belong to Anthropic, vendors and established voices. Not winnable; don't try.
- The open lanes are **questions that need evidence** (what a task actually cost, how often runs fail, what the failure was and what recovery cost), **named failure patterns** with a recovery and a price, and **uncontested category terms** we can define (*verified flight*, *rider track record*, the *earned-autonomy ladder*). The SERPs for these are programmatic junk or scattered anecdotes, and answer engines in this niche are starved of primary numbers.
- **AEO is a side effect of ranking, not a traffic line.** Citation studies measure share of answer text, not clicks; only ~28% of AI mentions carry a link; AI referrals are low single digits of organic for most publishers. We optimize pages so they are quotable *once they rank*, and measure citations per engine — we do not forecast traffic from them.
- A domain this new takes 3–6 months to rank for anything non-brand and must be in Bing's index before ChatGPT/Copilot can cite it. **Expect near-zero organic through Q4 2026 whatever ships.** The quarter is planned around assets that compound — the existing 14k words made literal, one link-earning case study, recruited logs — not around rankings.

**The strategy in four moves.**

1. **Make what exists findable** (days). Technical baseline, then rewrite the 16 existing content pages so every one carries the industry term in `<title>`, description, a 40–60-word answer-first paragraph and its H2s — brand voice in the H1 and prose. Rename the three slugs no query will ever match. This is the highest-ROI item in the plan: 14k words already written and invisible to any literal query.
2. **Ship the one link-earning asset we have** (week 2–3). The $550-flight case study — five hours, three burns, a 46-agent adversarial review that caught an IDOR and a stored XSS that 38 green tests missed — with the founder's name on `/about`, one Show HN, one post to the founder's own channels.
3. **Grow the corpus beyond one rider** (month 1, non-code). Recruit 10–15 named practitioners to each file one real flight within 30 days, concierge-drafted if needed. This is the only thing that makes bylines other than `maxcr`, mounts other than Claude Code, and every corpus-dependent page possible. Decide the directory gate (§8, decisions).
4. **A short list of pages that work at n = 0** (weeks 3–8): a cross-tool "scope, cap and kill a run" comparison, a kill-switch page, a spend-cap page, six worksheet landing pages, eight burn-pattern pages labeled illustrative vs logged, one glossary page, and the data methodology page that must exist *before* any number is published.

Everything numeric (`/data/` aggregates, per-mount stats, releases, badges) is **built dark and flipped by n** — and n must come from more than one rider and one repo before a cost figure is published at all.

**The one rule on every page: bilingual.** Industry term first in `<title>`, meta description, answer paragraph and H2s; guild term first in H1 and prose. The metaphor is an asset for humans and a liability for retrieval unless both vocabularies are present.

---

## 1. Where we stand — technical audit

Status per area with the fix. File references are to the current `main`. Impact is honest: most of this is hygiene that makes the site *measurable*; it does not by itself move traffic.

| Area | Status | Finding | Fix (summary) | Impact |
|---|---|---|---|---|
| sitemap.xml | **missing** | No `@astrojs/sitemap`; nothing in `dist/`. SSR `/riders/[handle]` would be invisible to an automatic sitemap anyway. | Add the integration with a filter for private routes and `lastmod` from content dates; `sitemap-riders.xml` from D1; submit to GSC + Bing. | gate |
| robots.txt | **missing** | `public/` has none; no `Sitemap:` directive; private surfaces left to crawler discretion. On a Free Cloudflare zone a missing file can be replaced by Cloudflare's generic managed text. | Ship `public/robots.txt` (§4.6). | gate |
| JSON-LD | **missing** | Zero `application/ld+json` in `src/` or `dist/`. | `jsonLd` prop on `src/layouts/Base.astro`; Organization + WebSite + BreadcrumbList + Article/TechArticle/Dataset/ProfilePage (§4.5). Google says no schema is needed for AI features; HowTo (2023), FAQ (May 2026) and Course (2025) rich results are retired — hygiene and entity clarity only, ~0 incremental visits. | hygiene |
| Canonical / trailing slash | **weak** | `Base.astro:21` builds the canonical from `Astro.url.pathname`; with `trailingSlash` at `ignore` every built canonical ends in `/`, but `href="/guild"` ×182, `/manual` ×132, `/logs` ×117 … are slash-less (Header, Footer, ChapterRail, LogCard, FlightAtlas, `logs.json.ts:11`, half of `llms.txt`). `/riders/MaxCR` and `/riders/maxcr` render the same page with different canonicals. | `trailingSlash: 'always'`; normalize links; slash in `logs.json`; 301 mixed-case handles; explicit `canonical` prop. Googlebot follows 308s without penalty — do it because it's an hour, not because it moves anything. | hygiene |
| Titles / descriptions | **weak** | Duplicates: `/guild` = `/join`, `/logs/template` = `/logs/new`. Chapter titles 80+ chars (`manual/[slug].astro:23` uses the full subtitle). Log description is telemetry-first and 218 chars (`logs/[slug].astro:29`). Facets are templated (`logs/[facet]/[value].astro:46-47`). Profiles are `@handle — AgentRiders` (`riders/[handle].astro:61`). No length guard. | Rewrite per §4.3; `clampTitle`/`clampDescription` in `src/lib/seo.ts`. **This is where traffic starts** — the title is the first thing engines match. | high |
| Answerability | **weak** | Chapters open with a metaphorical H2 and no literal definition; the only FAQ is four pricing questions on `/guild`; lesson outcome and prompt pairs are unlabeled paragraphs. | Answer-first `summary` on every content page; industry-term H2s; labeled prompt comparisons. | high |
| Open Graph | **weak** | One site-wide `/og.png`; `og:type` always `website` (`Base.astro:45`); no `article:*` times, `og:image:alt`, `twitter:*`. | `ogType`, `publishedTime`, `modifiedTime` props now. Per-page OG cards **deferred** until riders are sharing (today it would render a card for one log). | low |
| Headings | **weak** | One H1 everywhere (good). Listing pages jump H1 → H3 (`LogCard.astro` renders `<h3>`); log telemetry aside has no heading; lesson deliverables are `<p class="micro">`. | `level` prop on LogCard; `sr-only` H2 on the aside; promote deliverable labels to H2. | low |
| Internal links | **weak** | No breadcrumbs. Profiles are orphans until the directory opens. Logs don't link the chapter their burns map to. `/agents` is footer-only. | Breadcrumbs; "Riders who logged flights" strip on `/riders/`; "Read next" on logs. | medium |
| Freshness | **weak** | Chapters have `updated` as text, not `<time>`; lessons and missions have no dates; nothing emits `article:modified_time`. | `published`/`updated` on all schemas (backfilled from git); `<time datetime>`; sitemap `lastmod`. Real updates only. | medium |
| Image alt | **weak** | Hero art on 11 Flight School / mission / kit pages ships `alt=""` (`TrainingArt.astro` default). | Default alt map keyed by art name; `artAlt` override. | low |
| Crawl / caching | **weak** | `middleware.ts:90` sets `no-store` on every SSR response including public profiles and the directory (and overrides `site-state.json.ts:35`). SSR 404s are plain text (`middleware.ts:86`, `riders/[handle].astro`). `/join` has no noindex. `gtag` (`Base.astro:28-35`) precedes `<meta charset>` (`:37`). | `no-store` only for signed-in or non-GET; `Astro.rewrite('/404')`; `noindex` prop; charset first. | medium |
| 404 / redirects | **weak** | `dist/404.html` carries a canonical and no noindex; no `public/_redirects`. | `noindex` on 404; `_redirects` for the slug renames and `/flight-log → /newsletter/`. | low |
| Authorship | **weak** | No author anywhere; `about.astro` still has `<!-- AUTHOR: who runs it, where to write -->`; no Organization/Person markup. | Founder name, bio, photo, `sameAs` on `/about`; `author` on content schemas; Organization graph. Nothing off-site works until the site says who runs it. | high |
| URL structure | **weak** | Facet pages generated for every value that occurs once (four one-item pages today); `/flight-log` (newsletter) collides with `/logs`; worksheets served as raw `.md` under `/training/`. | `noindex` facets below n=3; `/newsletter/` with 301; worksheet landing pages with a canonical header on the raw files. | low |
| Data exposure | present | `/logs.json` static with absolute URLs; `site-state.json` SSR. Not referenced from HTML; no `Dataset` markup; no RSS. | `<link rel="alternate">`, `Dataset` JSON-LD with a license, `@astrojs/rss`. | low |
| Measurement | **missing** | GA4 wired (`G-ZJ0QNE2BB3`); no Search Console or Bing verification; no conversion events; no baseline. | Verify both; submit the sitemap; GA4 events for the funnel; a 20-query sheet (§7). | gate |

---

## 2. What the research says — and what to ignore

### 2.1 Keyword landscape

Thirteen themes, ranked by how winnable they are for this site in the next two quarters. "Needs n" marks themes whose winning page needs log volume *from multiple riders*; everything else works with what exists.

| # | Theme | Who owns it now | Our angle | Needs n |
|---|---|---|---|---|
| 1 | **Named agent failures and recovery** — "AI agent failure modes list", "agent said it was done but it wasn't", "how to recover from an AI agent mistake" | News owns the viral incidents (48k files, PocketOS); curated indexes (Cyera, awesome-agent-failures); MAST taxonomy. Reddit threads contain actual incidents. | Definitional pattern pages — the everyday burn, how you know, first ten minutes, recovery — labeled illustrative vs logged. Do **not** target incident/news queries ("claude code deleted my files"); target pattern/definition queries. | no |
| 2 | **Stopping and capping an agent** — "ai agent kill switch", "how to cap claude code spend", "stop condition for agent loop" | Anthropic docs own flag-name queries; "kill switch" is fragmented across dev.to, Substacks and Gravitee's corpus pages. "Harness engineering" is *not* open (Addy Osmani, Anthropic/OpenAI engineering posts). | Industry term first: "Kill switch for an AI agent: five ways to build one that stops the run"; "Capping agent spend: why an alert is not a cap"; the cross-tool "scope, cap, kill" comparison. | no |
| 3 | **Templates** — "ai agent incident report template", "acceptance criteria template for an ai agent task", "mission brief template" | Low volume, thin supply. | Six worksheet landing pages with the template inline and a download. Templates earn links. | no |
| 4 | **Autonomy levels / earned autonomy** — "levels of autonomy ai agents", "when to let an AI agent run unattended" | No dominant owner; frameworks without data. | Lesson 5 + *the bond* chapter rewritten with a definition block and a ladder table; outcome-by-autonomy later. | no / ≥10 |
| 5 | **Logging agent runs** — "what to record for each agent session", "agent run log template" | Vendors own "observability tools"; OTel owns spec queries; Simon Willison owns transcripts. | The metadata-only run-log format: `/logs/template`, `/logs.json`, `/data/schema/`, the CLI and MCP. | no |
| 6 | **Learning to run agents** — "first task to give claude code", "ai agent practice exercises" | Brutal on "tutorial"/"course"; thin on "practice"/"exercise". | Missions and worksheets with literal titles; "flights that practiced this" later. | no |
| 7 | **Proof of work for operators** — "how to prove ai agent experience", "agentic engineer portfolio" | Nobody mature; low volume. | Own the terms: `/riders/verified-flight/`, `/riders/ranks/`. A category play, not a traffic play. | no |
| 8 | **Real cost of an agent task** — "how much does a claude code session cost", "cost per task" | Anthropic cost docs; programmatic "pricing 2026" pages; Medium anecdotes. | Dated medians with method and n — **only** from a multi-rider corpus with a stated billing method. The one real log is on a subscription plan; its `cost_usd: 550` is an estimate and would be torn apart first. | ≥10, multi-rider |
| 9 | **Real-world success rate** — "how often do ai coding agents fail", "swe-bench vs real work" | Benchmark publishers, METR, essays. | "Landed rate" with N and a self-selection caveat. | ≥10, multi-rider |
| 10 | **Tool choice on real runs** — "claude code vs cursor vs codex" | Affiliate-heavy; Artificial Analysis. | Never a comparison post. Per-mount numbers when they exist; the doc-derived reins comparison now. | ≥3 per mount |
| 11 | **Long-running / unattended loops** — "run claude code overnight", "ralph loop" | Scattered reports; Anthropic's ralph plugin. | "Long flights" facet when it has members. | ≥5 |
| 12 | **Multi-agent orchestration** — "is multi-agent worth it" | Anthropic docs, many how-tos, MAST. | Wing-vs-solo cost when logs carry it. | ≥10 |
| 13 | **Evaluating agent work** — "how do I know the agent actually finished" | Hamel Husain, Arize, Braintrust, promptfoo — strongest competition in the set. | Operator phrasing only, never "LLM evals"; lesson 2 rewritten. | no |

**Competitor gaps in one line each.** Anthropic docs: one example session, no corpus, a five-item failure list. Cursor docs/blogs: single-tool, no outcomes. LangSmith/Braintrust/Langfuse: heavyweight, nothing for a solo operator's shareable run record. Simon Willison / Latent Space / TLDR AI / Changelog News: voice and media, not corpora — **link targets**, not competitors. ClaudeLog / awesome-claude-code: tips without outcomes or verification. morphllm / mindstudio / Gravitee: thin, templated, re-dated — displaceable in AI answers by a dated primary-data page. Cyera / failure indexes: enterprise and headline incidents, no recovery cost, no operator lessons. Reddit: most-cited by Perplexity and AI Overviews, unverifiable — but a citation of a Reddit thread accrues to reddit.com, not to the link inside it.

### 2.2 Answer-engine facts worth acting on

- **Eligibility is ordinary indexing.** Google's AI Overviews / AI Mode use Googlebot and need nothing beyond crawlable, indexable HTML. ChatGPT search = `OAI-SearchBot` plus third-party providers (keep Bingbot allowed). Each engine gates citation on a different robots token (§4.6).
- **Passage-level extraction, answer-first.** ~44% of ChatGPT citations come from the first 30% of a page; cited passages use definite language and dense named entities; title/URL alignment with the engine's fan-out sub-queries is one of the strongest observed predictors; natural-language slugs out-cite others (Ahrefs, Growth Memo — directional). Self-contained sections beat artificial "chunking".
- **Statistics and quotations lift answer-text visibility ~30–40%** when they answer the question asked (Princeton GEO, arXiv 2311.09735). Irrelevant numbers don't help. And visibility in answer text ≠ clicks.
- **Freshness is real but secondary**: AI-cited pages are ~26% fresher than organic top-10, yet still ~2.9 years old on average; relevance dominates; date-bumping without changes is penalized.
- **Brand mentions correlate with AI visibility far more than backlinks** (0.66–0.74 for web/YouTube mentions vs ~0.22 for links, Ahrefs). YouTube is the strongest single correlate — a ten-minute screen recording of a real flight embedded on its log page is cheaper than most spoke pages and differentiated.
- **Cited-source sets barely overlap across engines** (~11% domain overlap ChatGPT vs Perplexity) — measure per engine.
- **Bing Webmaster Tools "AI Performance"** is the only first-party AI-citation report; IndexNow (free via Cloudflare Crawler Hints) gets fresh versions into Bing/Copilot.

### 2.3 Folklore to ignore

- **llms.txt / llms-full.txt / `.md` twins / `Accept: text/markdown` as visibility levers.** Google ignores llms.txt; a 300k-domain study found no citation correlation; ~97% of files get zero AI-crawler requests; no engine documents using it. Keep the existing `/llms.txt` and `/agents` page as they are (zero hours). The only real consumer — an MCP client logging a session — is already served by `/agents`.
- **FAQ / HowTo schema for rich results.** Retired. Keep the *visible* Q&A where it helps a reader; no markup effort.
- **Cloudflare "Markdown for Agents"** (Pro plan). Token savings for agents, no demonstrated search benefit. Skip.
- **`nosnippet` / `max-snippet`** block AI Overviews input entirely. Never on content we want cited.
- **Wikipedia / Wikidata now.** Premature until independent coverage exists.
- **MCP directory listings as backlinks.** They are nofollow, low-authority discovery pages. List the MCP for *discovery* once it is on npm; don't count them as links.
- **Reddit seeding.** r/ClaudeAI removes brand-link posts from new accounts and can get a domain filtered. Participate in incident threads with a pattern page as the honest answer, from an established account, rarely.

### 2.4 Crawler policy decision

Allow every search/answer crawler and **allow training crawlers for the founding season** (GPTBot, ClaudeBot, Google-Extended, CCBot) with `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. A new guild wants its vocabulary inside model weights, not only in retrieval. Unproven, free, reversible. Grok publishes no crawler token and fetches with browser-like user agents: Bot Fight Mode **off**, no WAF challenges on content paths.

---

## 3. Strategy

### 3.1 Position for search

> **The evidence layer for agent operations.** Real runs, numbers left in, a name on every one.

Three shapes of page, and only three: a **definition** (what a burn / kill switch / verified flight is, in both vocabularies), a **pattern** (a named failure: how you know, first ten minutes, recovery, preventing reins), and — later, from a multi-rider corpus — a **number with a method**. The Field Manual essays and Flight School lessons stay the canonical long-form; they are rewritten to *contain* definitions rather than surrounded by new spokes.

### 3.2 Five rules for every page

1. **Bilingual.** Industry term first in `<title>`, meta description, answer paragraph and H2s; guild term first in H1 and prose. ("Kill switch for an AI agent — what riders call the reins.")
2. **Answer first.** The first element after the H1 is a 40–60-word literal answer in page text. Chapters and lessons get a `summary` field; logs get a generated sentence ("A Claude Code run on Opus 4.8 for a code task landed in 5h, est. $550 on a subscription plan, with 3 burns."); the glossary opens each entry with its one-sentence definition.
3. **Every number travels with n, a date range and a billing method.** Subscription-billed vs API-billed, self-reported vs telemetry duration, how many riders. Below the gate, the page says "medians appear at 10 flights from 3+ riders" instead of a number.
4. **Authored and dated.** Byline (rider profile or `/about#author`), `published`/`updated` as `<time>`, `article:*` OG, JSON-LD dates. Real updates only, with a one-line changelog on chapters.
5. **Shallow and flat.** Hubs are short nouns at the root; content never deeper than three path segments; logs stay flat at `/logs/[slug]/`; no cross-product URLs, ever.

### 3.3 Content pillars — scoped to the quarter

| Pillar | Hub | What ships this quarter (works at n = 1) | Later, gated by n |
|---|---|---|---|
| **The Field Manual, made literal** | `/manual/` | All 7 chapters rewritten per §3.2 (summary, industry-term title/H2s, dates, byline, changelog). Three new sibling pages: `/manual/kill-switch/`, `/manual/spend-cap/`, `/manual/scope-cap-kill-compared/` (cross-tool table with a last-verified date — the one genuine gap next to Anthropic's docs). | "From the logs" blocks at ≥5 flights from ≥3 riders |
| **Flight School, made literal** | `/training/` | All 6 lessons + 3 missions rewritten; three slug renames with 301s; six worksheet landing pages `/training/kit/[worksheet]/`; labeled prompt comparisons. | "Flights that practiced this" |
| **Burns** | `/burns/` | Registry (`pattern` slug on `burnSchema`, composer dropdown) and **eight** pattern pages, each labeled illustrative vs logged, the three real burns linked. Never presented as data. | Counts and costs by pattern when ≥10 logged burns |
| **The record** | `/riders/`, `/logs/`, `/data/` | `/about` author page; `/riders/ranks/` and `/riders/verified-flight/` explainers; `/data/methodology/` and `/data/schema/` (**before any number**); the $550-flight case study; a "Riders who logged flights" strip; profiles indexable from one published flight. | Aggregates at n≥10 from ≥3 riders; releases at ~50; badges after the directory opens |
| **Vocabulary** | `/glossary/` | **One page** with anchors (`/glossary/#burn`), bilingual one-sentence definitions, `DefinedTermSet`. Promote a term to its own URL only if it shows impressions. | — |

Deferred entirely (not cut — gated on things that don't exist yet): mount hubs beyond the comparison page (they'd sit behind code.claude.com), per-model pages, `/data/` aggregates, dataset releases, per-page OG cards, README badges, rider interviews, the Roost markup, a weekly newsletter cadence.

### 3.4 What we will not do

- No "X vs Y" posts, no "best tools" listicles, no "pricing 2026" pages.
- No cost figure from a one-rider, one-repo, subscription-billed corpus. Publish those flights; do not build `/data/cost/` on them.
- No invented riders, counts or flights. "Illustrative" and "logged" travel into the HTML.
- No page that is `noindex` on arrival "until n". If it can't be indexed when it ships, it doesn't ship.
- No pages for features that don't exist (the Roost, the Yard).
- No brand-link posting from new accounts on Reddit; one Show HN, for the case study, when `/about` has a name on it.
- No build-failing link-graph CI; a post-build *report* of orphans and redirecting links is enough.

---

## 4. Page architecture

### 4.1 URL rules

- Every page URL carries a trailing slash, but `trailingSlash` stays at `'ignore'` in `astro.config.mjs`: `'always'` redirects the extension-less `/api/*` endpoints before the middleware runs, which would break the signed CLI/MCP paths, so `src/middleware.ts` 301s extension-less page paths to the slashed form and `canonicalUrl()` builds every canonical. Every internal link, `logs.json` URL and `llms.txt` line carries the slash.
- Lowercase, hyphenated ASCII slugs; no dates, query strings or capitals (`SLUG_REGEX` already enforces this for logs).
- Hubs at the root: `/manual/ /training/ /missions/ /logs/ /burns/ /glossary/ /data/ /riders/ /newsletter/ /agents/`. Content never deeper than three path segments (`/training/kit/bridle/` is the deepest shape).
- Logs stay flat at `/logs/[slug]/`; a published slug never changes.
- Facets keep `/logs/{task,outcome,burns,mount}/[value]/`; `noindex` below n=3; cards link to `/logs/`. No promotion to `/mounts/` this quarter.
- `/flight-log` → `/newsletter/` (301); issues, when they exist, at `/newsletter/[issue]/`.
- Three slug renames with 301s in `public/_redirects` — done in S1 (§8, decision 1): `/training/when-your-dragon-breathes-fire/` → `/training/when-an-agent-fails/`; `/manual/the-bond/` → `/manual/agent-trust-and-autonomy/`; `/training/earn-the-longer-leash/` → `/training/earning-autonomy/`. H1s keep the brand phrase.
- Worksheets: `/training/kit/[worksheet]/` pages; raw files move to `/kit/*.md` with `X-Robots-Tag: noindex` and a `Link: rel="canonical"` header to the page.

### 4.2 Target information architecture (this quarter)

```
/                                 home (Organization + WebSite graph)
/about/                           founder name, bio, photo, sameAs; how content is made
/manual/                          hub — 7 chapters, rewritten (TechArticle)
  /manual/[chapter]/              essay + summary + industry-term H2s + byline + changelog
  /manual/kill-switch/            new: five ways to build one that stops the run
  /manual/spend-cap/              new: why an alert is not a cap
  /manual/scope-cap-kill-compared/  new: Claude Code · Cursor · Codex CLI · Gemini CLI, last-verified
/training/                        hub — 6 lessons, rewritten (LearningResource + Article)
  /training/[lesson]/             3 slugs renamed; labeled prompt pairs; deliverable as H2
  /training/kit/                  index
  /training/kit/[worksheet]/      ×6, template inline + download
/missions/ /missions/[slug]/      rewritten
/burns/                           hub — registry index, illustrative vs logged counts
  /burns/[pattern]/               ×8
/glossary/                        one page, anchors, DefinedTermSet
/logs/ /logs/[slug]/              Dataset / Article; generated answer sentence; burns link patterns
  /logs/[facet]/[value]/          noindex < 3
/data/                            hub
  /data/methodology/              how we count — ships before any number
  /data/schema/                   the flight log, field by field; logs.json
  /data/the-550-dollar-flight/    the case study
/riders/                          hub + "Riders who logged flights" strip
  /riders/ranks/ /riders/verified-flight/
  /riders/directory/              gate per decision
  /riders/[handle]/               ProfilePage; indexable from 1 published flight
/newsletter/                      signup + archive (issues when there is a number to report)
/agents/ /llms.txt /logs.json /rss.xml /sitemap-index.xml /robots.txt   (llms.txt untouched)
```

Roughly 36 existing URLs + ~25 new. Not 150.

### 4.3 Template contract

Every indexable template renders, server-side, in this order:

1. Breadcrumb (visible + `BreadcrumbList`).
2. H1 (brand voice) and, directly under it, the **answer paragraph** (literal, 40–60 words).
3. Byline + `<time datetime>` for published and updated.
4. Body with industry-term H2s, each followed by one declarative sentence that stands alone when quoted. Tables for anything tabular (the log's reins/burns `<dl>` becomes a `<table>`).
5. Honesty markers in the HTML: `illustrative` vs `logged`; n, date range and billing method on any number.
6. **One next step** (§7 conversion): the CTA this template exists to drive.
7. Related links: hub, two siblings, the chapter or lesson it depends on, and for logs the pattern pages its burns belong to.
8. "Cite this" line on logs, patterns and data pages.
9. JSON-LD per §4.5; `ogType` article + times.

Titles and descriptions (≤60 / ≤155 chars, enforced by `src/lib/seo.ts`):

| Page | Today | Target |
|---|---|---|
| chapter | `Reins: permissions that are tight enough to be loosened — Field Manual — AgentRiders` | `AI agent permissions, budgets and kill switches (reins) — AgentRiders` |
| lesson | `When your dragon breathes fire — …` | `When an AI agent fails: contain, diagnose, recover — Flight School` |
| log | `<title> — Flight Logs — AgentRiders`, telemetry-first 218-char description | `Shipped a product phase with Claude Code: 5h, 3 burns, est. $550 — AgentRiders`; description = the lesson, then mount/duration/outcome |
| facet | `Flights · Claude Code — AgentRiders` | `Claude Code flight logs (n=12): cost, outcomes, burns — AgentRiders` |
| profile | `@maxcr — AgentRiders` | `Max (@maxcr): 14 flights, Rider — AgentRiders` |
| `/about` | `Why riders — AgentRiders` | `About AgentRiders — who runs the guild for people who run AI agents` |
| `/riders` | `Riders — AgentRiders` | `Rider ranks: Fledgling, Rider, Wingleader — AgentRiders` |
| `/training` | `Train your agent. Earn your wings. — AgentRiders Flight School` | `Flight School: six lessons on running AI agents — AgentRiders` |
| `/join` | duplicate of `/guild` | `Sign in or claim your handle — AgentRiders` + noindex |

### 4.4 Programmatic pages and their index gates

| Page type | URL | Data | Index rule |
|---|---|---|---|
| Burn patterns | `/burns/[pattern]/` | `src/content/burn-patterns/` + optional `pattern` slug on `burnSchema` (curated registry; composer dropdown; backfill the real log) | Indexed from day one as definitions; "logged examples" section says "none yet" honestly |
| Worksheet pages | `/training/kit/[worksheet]/` | `public/training/*.md` rendered + download | Indexed; raw `.md` noindex + canonical header |
| Facets | `/logs/[facet]/[value]/` | enums + `mount` free text | `noindex,follow` below n=3, no canonical (`Base.astro` ignores `canonical` under `noindex`); cards link to `/logs/` |
| Rider profiles | `/riders/[handle]/` | D1 | `noindex` at 0 published flights; indexed from Fledgling; `public, max-age=60` for anonymous GETs |
| Aggregates | `/data/{cost,duration,outcomes,burn-rate}/` | build-time from logs + telemetry | **Not built this quarter.** Ship only when n≥10 from ≥3 riders with the methodology page live; segment rows hidden below 5; no cross-product URLs |
| Releases | `/data/releases/[yyyy-qn]/` | frozen `logs.json` + de-identified records, CC BY 4.0 | At ~50 logs |
| Per-model pages | — | — | **Cut.** |

### 4.5 Structured data

Emitted from `Base.astro` via a `jsonLd` prop (`src/components/JsonLd.astro`) with stable `@id`s (`https://agentriders.com/#org`, `#website`). Values always mirror visible text. Hygiene and entity clarity — not a visibility lever.

| Type | Where | Key fields |
|---|---|---|
| `Organization` | every page | name, url, logo, description, founder → `#founder`, `sameAs` [GitHub, npm ×2, X, LinkedIn], email |
| `WebSite` | home | name, alternateName, publisher. No `SearchAction` |
| `BreadcrumbList` | inner pages | ≥2 `ListItem` mirroring the visible trail |
| `TechArticle` | chapters, kill-switch/spend-cap/compared, burn patterns | headline (industry term), datePublished, dateModified, author → `#org` until a named byline exists (S1), then Person, isPartOf → "The Field Manual" |
| `Article` | logs | headline, generated description, datePublished, author → Person {name, `@handle`, url → profile}, keywords [mount, model, task, outcome], isPartOf → `#dataset` |
| `Dataset` | `/logs/`, `/data/` | name, description, `distribution` → `/logs.json`, **license: the Terms URL until a public reuse grant is added to the Terms** (§8 decision 5), isAccessibleForFree, temporalCoverage, variableMeasured |
| `ProfilePage` + `Person` | profiles, `/about` | name, alternateName, description, sameAs (rider-supplied links), agentInteractionStatistic (flights written), interactionStatistic (vouches received), dateCreated at the precision the page shows |
| `LearningResource` + `Article` | lessons, missions | educationalLevel (rank), timeRequired, teaches, isPartOf → Course "Flight School" (free) |
| `SoftwareApplication` | `/agents/` | CLI + MCP: category, OS, version, installUrl, price 0, license, codeRepository. No ratings |
| `DefinedTermSet` | `/glossary/` | one set, terms with alternateName (industry synonyms) |

Dropped on purpose: `HowTo`, `FAQPage`, `Course` rich-result markup (retired), `VideoObject` until a video exists.

### 4.6 Crawl policy

`public/robots.txt`:

```
User-agent: *
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Disallow: /api/
Allow: /api/public/
Disallow: /admin/
Disallow: /me/
Disallow: /join
Disallow: /logs/new
Disallow: /start

# Answer engines are an audience for this site. Explicit so a future blanket rule never catches them.
# A crawler obeys only the group that names it (RFC 9309), so the rules are repeated here in full.
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Googlebot
User-agent: Bingbot
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Disallow: /api/
Allow: /api/public/
Disallow: /admin/
Disallow: /me/
Disallow: /join
Disallow: /logs/new
Disallow: /start

Sitemap: https://agentriders.com/sitemap-index.xml
```

Plus `X-Robots-Tag: noindex` in `public/_headers` for `/admin/*`, `/me/*`, `/join`, `/logs/new`, `/kit/*.md`; a `noindex` prop on 404, `/join`, `/me`, `/me/devices`, `/logs/new`, `/admin/*`; never `nosnippet`. Middleware: `no-store` only for signed-in or non-GET responses; `public, max-age=60, s-maxage=300` on anonymous profiles, the directory and `site-state.json`. Cloudflare: AI bot policy Search/Agent/Training = Allow; legacy "Block AI bots" off; Bot Fight Mode off; Crawler Hints (IndexNow) on; AI Crawl Control checked monthly for 403s on `/logs.json`, `/logs/*`, `/manual/*`.

---

## 5. Content program

### 5.1 The 20-query list

One page per query, tracked monthly in `docs/aeo-panel.md` (§7). Difficulty is a judgment: L = programmatic junk or scattered anecdotes in the SERP; M = established blogs; H = vendor docs.

| # | Query | Page | Diff | Status |
|---|---|---|---|---|
| 1 | ai agent kill switch | `/manual/kill-switch/` | L–M | new |
| 2 | how to cap ai agent spend / claude code budget cap | `/manual/spend-cap/` | M | new |
| 3 | claude code vs cursor vs codex permissions sandbox | `/manual/scope-cap-kill-compared/` | M | new |
| 4 | ai agent failure modes list | `/burns/` | M | new |
| 5 | agent said it was done but it wasn't | `/burns/confident-closing-message/` | L | new |
| 6 | ai agent incident response checklist | `/burns/first-ten-minutes/` | L–M | new |
| 7 | ai agent incident report template | `/training/kit/burn-report/` | L | new |
| 8 | acceptance criteria template ai agent task | `/training/kit/acceptance-checks/` | L | new |
| 9 | mission brief template ai agent | `/training/kit/mission-brief/` | L | new |
| 10 | levels of autonomy ai agents | `/manual/agent-trust-and-autonomy/` (the bond) | M | rewrite |
| 11 | when to let an ai agent run unattended | `/training/earning-autonomy/` | M | rewrite |
| 12 | what to record for each ai agent session | `/manual/logging-a-flight/` + `/data/schema/` | L–M | rewrite |
| 13 | how to verify an ai agent finished the task | `/training/teach-it-where-to-land/` | M–H | rewrite |
| 14 | first task to give claude code | `/training/your-first-flight/` | M | rewrite |
| 15 | ai agent permissions scope budget checklist | `/manual/before-the-first-flight/` | M | rewrite |
| 16 | prompt injection ai agent data vs instructions | `/manual/reins/` (instructions vs enforcement) | M | rewrite |
| 17 | what is a verified ai agent run / track record | `/riders/verified-flight/` | L | new |
| 18 | ai agent glossary / what is an agent harness | `/glossary/` | L–M | new |
| 19 | multi-agent handoff template | `/training/kit/wing-handoff/` | L | new |
| 20 | adversarial code review ai agents caught xss (the case study's long tail) | `/data/the-550-dollar-flight/` | L | new |

Kill criterion: a page with zero impressions after 90 days in the index gets rewritten or folded into its hub — not left to dilute.

### 5.2 Rewrite brief for the 16 existing pages

For each chapter, lesson and mission: a `summary` (40–60 words, literal, no metaphor-only sentences); a `<title>` leading with the industry term; H2s rewritten as the question or claim a reader would type; a visible `Updated` date and byline; the brand voice untouched in the H1 and prose. Lessons: the outcome and duration in the first paragraph; the weak/strong prompt pair under a visible "Weak brief vs strong brief" heading. Chapters: a one-line changelog at the foot. Estimated 8–10 founder hours of review across ~14k words, with drafts prepared in-repo.

### 5.3 New pages, in order

| # | Page | Why now | Est. |
|---|---|---|---|
| 1 | `/about` author block | Nothing off-site works until the site says who runs it | 1 h |
| 2 | `/data/the-550-dollar-flight/` | The only link-earning asset that exists; the Show HN | 6–8 h |
| 3 | `/data/methodology/` + `/data/schema/` | Must exist before any number; also the answer to "what to record" | 3 h |
| 4 | `/manual/kill-switch/`, `/manual/spend-cap/`, `/manual/scope-cap-kill-compared/` | Question-shaped gaps where the SERP is junk; the comparison is the one gap next to Anthropic's docs | 10–12 h |
| 5 | `/training/kit/[worksheet]/` ×6 | Templates rank and earn links | 4 h |
| 6 | `/burns/` + 8 patterns | Medium-term definitional citations | 12–15 h |
| 7 | `/glossary/` | One page; the translation layer the bilingual rule needs | 3 h |
| 8 | `/riders/ranks/`, `/riders/verified-flight/` | Own the category terms; link targets for every rank mention | 3 h |

The eight burn patterns, seeded from chapter 4, lessons 3–4 and the real log: green-tests-unsafe-ship (logged), agent-killed-its-own-shell (logged), wrong-principal (logged), confident-closing-message, duplicate-write-after-timeout, alert-is-not-a-cap, branch-is-not-a-sandbox, data-treated-as-orders. `/burns/first-ten-minutes/` is the chapter's checklist as a standalone page.

### 5.4 First 90 days

| Week | Code (Claude, PRs) | Content (drafted in-repo, Max reviews) | Founder-side |
|---|---|---|---|
| 1 | **S0** technical baseline + measurement | `/about` author block copy | Verify GSC + Bing, submit sitemap; Cloudflare bot settings; publish CLI + MCP to npm |
| 2 | **S1** content-page templates (summary, byline, dates, H2 levels, prompt labels, slug 301s) | Rewrite chapters 1–4 | Decide the three slugs and the directory gate; start recruiting 10–15 practitioners |
| 3 | S1 cont. | Rewrite chapters 5–7, lessons 1–3 | — |
| 4 | **S2** `/data/` hub, methodology, schema, case study template | Case study draft; lessons 4–6; missions | Show HN + own channels once `/about` and the case study are live |
| 5 | S2 cont.: worksheet pages, `/riders/` explainers, strip | Kill switch, spend cap | Recruited flights start landing; founder's own flights (every real session on this repo) |
| 6 | **S3** burns registry + pattern template + composer dropdown | Scope-cap-kill comparison; 4 patterns | Record one 10-minute screen capture of a real flight |
| 7 | S3 cont.: glossary page | 4 patterns; glossary | Embed the video on its log page |
| 8 | Newsletter route rename; RSS | Newsletter #1 *if* there is a number to report | First monthly panel run (§7) |
| 9–12 | Buffer; "Riders who logged flights" strip populated; facets reviewed against n | Changelog pass on all chapters | Week-12 review: GSC, panel, funnel; decide what the corpus supports next |

---

## 6. Distribution and entity building

Half of the distribution ideas in the research depend on things that don't exist yet (a published CLI, riders, a newsletter). This quarter:

1. **Say who runs it.** `/about` with the founder's name, bio, photo and `sameAs`; the same one-line description ("The guild for people who run AI agents on real work") on GitHub, npm, X and LinkedIn; all four in `Organization.sameAs`.
2. **One Show HN**, for the case study, when `/about` and the case study are live — not before, and not for the CLI alone. The launch slot is spent once.
3. **Recruit the corpus.** 10–15 named practitioners, one real flight each within 30 days, concierge-drafted from their session summary if needed. Their bylines and mounts are what make every corpus-dependent page possible.
4. **Three link targets who write about this material**: Simon Willison (link-friendly, covers transcripts and coding agents), TLDR AI / AINews (newsletters that run data stories), Changelog News. Pitch the case study's hook, nothing else.
5. **Founder's own channels, sized honestly.** Before planning around them, write down the X / LinkedIn / GitHub follower counts and the email-list size; plan the HN post and recruiting against those numbers.
6. **One video.** A ten-minute screen recording of a real flight, on YouTube, embedded on its log page with `VideoObject` once it exists.
7. **List the MCP** on the official registry, Smithery, Glama, PulseMCP, mcp.so and the Cursor directory once `@agentriders/mcp` is on npm — for discovery, not links.
8. **Reddit**: participate from an established account in incident threads with a pattern page as the honest answer; no link posts from a new account.

Deferred: README badges (after the directory opens), newsletter cadence (monthly at most, and only when there is a number), dataset releases as press (~50 logs), podcasts (after the case study has circulated).

---

## 7. Measurement and conversion

**Goal action.** One account with a claimed handle and one published flight. Funnel events in GA4, agent path: `join_view` → `handle_claimed` → `start_viewed { step, current, minutes_left, flight }` → `mount_selected { mount, from: 'start' }` → `code_generated` → `agent_paired` → `first_submission_filed` → `log_published`; by-hand path: `setup_fork_manual { from: 'start' | 'me' }` → `log_started` → `log_submitted`. The optional profile step: `profile_saved { bio, mounts, from }` or `profile_skipped { from: 'start' }`, and `mount_selected { mount, from: 'profile', on }` on the picker. Plus `newsletter_signup` and `cli_install_click`.

**Per-template CTA** (the "one next step" in §4.3): chapters → the lesson that practices it; lessons → `/logs/new/`; patterns → the burn-report worksheet; worksheets → the lesson; logs → `/riders/[handle]/` and `/logs/new/`; glossary → the chapter; case study → `/agents/`. A visitor landing on `/glossary/#reins` with no next step is wasted.

**Setup (S0).** Google Search Console and Bing Webmaster Tools via DNS TXT; submit `sitemap-index.xml`; Cloudflare Crawler Hints on; AI Crawl Control on; GA4 channel group "AI assistants" (referrers `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `copilot.microsoft.com`, `claude.ai`, `gemini.google.com`, `grok.com`, `x.ai`).

**Monthly review** in `docs/aeo-panel.md`: the 20-query sheet (position, impressions, clicks from GSC; Bing AI Performance citations), a 20-prompt panel run in ChatGPT search, Perplexity, Google AI Mode, Claude and Grok (cited / not cited / which page), the funnel numbers, and the kill criterion applied.

**Baseline first, targets second.** No target is set until S0 has produced 30 days of GSC data. Directional expectations for a domain this age: near-zero non-brand organic through Q4 2026; first non-brand impressions on the template and kill-switch pages in month 2–3; the case study as the first page with referring domains. Success in the quarter is: 20 queries tracked with a baseline, ≥10 flights from ≥3 riders, the case study linked from at least two independent domains, and the 16 rewrites indexed.

---

## 8. Execution — milestones and decisions

Each milestone is a branch, adversarially reviewed, PR'd into `main`, merged. Exit criteria are testable.

### S0 — Technical baseline + measurement (1 PR, ~4 h)

- Trailing slashes through the middleware 301 for extension-less page paths plus `canonicalUrl()`, with `trailingSlash` left at `'ignore'` (`'always'` redirects `/api/*` before the middleware runs and would break the signed CLI/MCP paths); normalize every internal link (Header, Footer, ChapterRail, TrainingNav, LogCard, FlightAtlas, PageCoda, pages, `logs.json.ts`, `llms.txt` slashes only); 301 mixed-case handles in that same hop; `canonical` prop.
- `public/robots.txt` (§4.6); `X-Robots-Tag` in `_headers`; `noindex` prop on private pages and 404; `public/_redirects` with `/flight-log → /newsletter/` (slug renames land in S1 after the decision).
- `@astrojs/sitemap` with filter + `lastmod`; `sitemap-riders.xml` from D1; `@astrojs/rss`.
- `JsonLd.astro` + `jsonLd` prop; Organization + WebSite + BreadcrumbList site-wide; Article on logs, TechArticle on chapters, ProfilePage on profiles, Dataset on `/logs/`, SoftwareApplication on `/agents/`.
- Base head: charset first; `ogType`, `publishedTime`, `modifiedTime`, `og:image:alt`, `twitter:*`; `<link rel="alternate">` for `/logs.json` and RSS.
- `src/lib/seo.ts` clamps; the §4.3 title rewrites; fix the two duplicates; facet `noindex` below 3.
- Middleware caching rule; `Astro.rewrite('/404')` for SSR misses; LogCard `level`; TrainingArt alt map.
- GA4 funnel events; a post-build link report (orphans, redirecting links) printed, not failing.

*Exit:* `curl -I /manual` → one 308 to `/manual/`; `/robots.txt` and `/sitemap-index.xml` 200; Rich Results Test passes for a chapter, a log and a profile; no indexable page emits a canonical that differs from its linked URL; the link report shows zero redirecting internal links; unit tests green. Founder: GSC + Bing verified, sitemap submitted, Cloudflare settings done; a ≥112px square PNG logo for the Organization markup (`favicon.svg` stands in until then).

### S1 — The 16 pages, made literal (~1.5 weeks)

- `summary`, `author`, `published`/`updated` (backfilled from git) on manual/training/missions schemas; answer paragraph, byline, `<time>` and changelog rendered; deliverable labels as H2; PromptComparison labels; the three slug renames with 301s.
- Rewrites of all 16 pages per §5.2 (drafted in-repo, reviewed by Max).
- `/about` author block + Person JSON-LD; profile titles, `noindex` at 0 flights, `rel=author` on log bylines; "Riders who logged flights" strip on `/riders/`.

*Exit:* every chapter/lesson/mission's first paragraph is a literal answer (the `summary`, rendered directly under the H1 in the hero — not buried below the rail and deliverable, which defeats passage extraction) and its `<title>` leads with an industry term; old slugs 301; `/about` names the founder. Founder: `/about` and the founder's Person node list GitHub and the rider profile only; add X, LinkedIn or any other profile link there (and to `Organization.sameAs`) when wanted. The `/about` role line now says AgentRiders "is operated by Permanent Ventures Inc" (what the Terms state); say the word if you want it to read "founder of Permanent Ventures Inc" and it will be restored.

### S2 — The record (~1.5 weeks)

- `/data/` hub, `/data/methodology/`, `/data/schema/`, `/data/the-550-dollar-flight/` (the log's `cost_usd` labeled as an estimate on a subscription plan, with the method stated).
- `/manual/kill-switch/`, `/manual/spend-cap/`, `/manual/scope-cap-kill-compared/` (last-verified date, changelog).
- Six worksheet landing pages; raw `.md` moved to `/kit/` with canonical headers; `/riders/ranks/`, `/riders/verified-flight/`.

*Exit:* the case study is live with a named author and a cite-this line; the comparison page has a last-verified date; `/training/kit/[worksheet]/` ×6 live; the Show HN is posted by Max.

*Status (2026-10-16, `phase3/s2-the-record`, unmerged):* shipped the `/data/` hub, `/data/methodology/`, `/data/schema/` and the `/data/the-550-dollar-flight/` case study; the three Field Manual guides (`/manual/kill-switch/`, `/manual/spend-cap/`, `/manual/scope-cap-kill-compared/`) with last-verified dates; the six worksheet landing pages at `/training/kit/[worksheet]/`; and the `/riders/ranks/` + `/riders/verified-flight/` explainers. The worksheet raw files stayed at `/training/*.md` with a `noindex` + `rel=canonical` header to each landing page, rather than moving to `/kit/` — the existing `download:` links and kit previews keep that path. `/data/` is wired into the footer and `llms.txt`, and the Burns, reins and before-the-first-flight chapters now carry a "Related guides" line. Code side still open: the Dataset `license` names the Terms (seo.ts) while `/data/schema/` prose describes CC BY 4.0 — reconcile per decision 5 before any public reuse grant. Founder side still open: the Show HN.

### S3 — Burns and vocabulary (~1.5 weeks)

- `pattern` on `burnSchema` + curated registry + composer dropdown + backfill of the real log's three burns; `src/content/burn-patterns/`; `/burns/` + 8 pattern pages with the illustrative/logged label and auto "logged examples".
- `/glossary/` one page with anchors + `DefinedTermSet`; log telemetry labels link the anchors.
- `/newsletter/` route; archive collection scaffold (no issue until there is a number).

*Exit:* 8 pattern pages live; the real log's burns link to their patterns; `/glossary/` lists every term from the brief §5 with a bilingual first sentence.

*Status (2026-10-16, `phase3/s3-burns-glossary`, unmerged): shipped.* The burns registry: an optional `pattern` field added to `burnSchema` (shared with the submissions API and MCP/CLI, backward-compatible — every existing log and filed burn still validates), a `burnPatterns` content collection, the `/burns/` hub and nine pattern pages (eight named patterns each labeled logged or illustrative, plus a `first-ten-minutes` checklist), with the one logged flight's three burns backfilled with pattern slugs so their `/burns/<pattern>/` pages surface the $550 flight and the rest show the honest empty state. `/glossary/`: one page, every term from §5 with a bilingual one-sentence definition, explicit per-term anchors (`/glossary/#reins`), and a `DefinedTermSet` + `DefinedTerm` graph from a new `definedTermSet()` builder in `seo.ts`. The newsletter route moved `/flight-log/` → `/newsletter/` (301s from both forms; same signup component and endpoint). `/burns/` and `/glossary/` are wired into the footer and `llms.txt`; the Burns chapter links the registry and the first-ten-minutes checklist; each patterned burn on a log page links its pattern page. Deferred: the composer pattern dropdown (decision 10, optional) — the submissions API already accepts the optional `pattern`, so it can be added later with no backend change.

### S4 — Built dark, flipped by n (next quarter, if the corpus supports it)

Aggregates with n-gates and billing-method labels; per-mount numbers; releases; badges; OG cards; video markup. Not started until ≥10 flights from ≥3 riders exist and `/data/methodology/` is live.

### Decisions for Max

1. **The three slug renames** (§4.1). Decided and done in S1: `/manual/the-bond/` → `/manual/agent-trust-and-autonomy/`, `/training/when-your-dragon-breathes-fire/` → `/training/when-an-agent-fails/`, `/training/earn-the-longer-leash/` → `/training/earning-autonomy/`, each 301'd from both the slashed and slash-less form in `public/_redirects`; H1s keep the brand phrase.
2. **The directory gate.** The site promises "opens at 20 flights". Options: (a) keep the promise and ship the "Riders who logged flights" strip on `/riders/` (profiles discoverable from one flight; recommended as the minimum); (b) lower the gate to 5 and update the copy — a 5-profile directory is better than a counter. The Rider rank also cannot bootstrap (2 Rider vouches, no Riders): the first Riders are admin-granted, which the admin surface already supports.
3. **Training crawlers**: allow for the founding season (§2.4), or block.
4. **Who the 10–15 practitioners are**, and whether concierge-drafting their first flight from a session summary is acceptable to them.
5. **A public license for `logs.json` metadata.** The Dataset JSON-LD names the Terms as its license because the Terms grant the public no reuse right on rider-written log metadata, and declaring CC BY 4.0 before they do would be false. Recommended: add a CC BY 4.0 grant for published-log metadata to the Terms (accepted at submission), then switch the Dataset `license` to `https://creativecommons.org/licenses/by/4.0/`.

---

## 9. What the critique changed

The adversarial review of the four research outputs cut the plan roughly in half. Recorded so the reasoning survives:

| Original claim | Verdict | What changed |
|---|---|---|
| AEO as a traffic channel | **Overclaim.** Citation studies measure answer text, not clicks; ~28% of mentions link. | Reframed as a side effect of ranking; measured per engine; no traffic forecast from citations. |
| Flight data as "the single highest-leverage asset" | **Overclaim at n=1.** One rider, one repo, subscription-billed; `cost_usd: 550` is an estimate. | Aggregates not built this quarter; methodology page first; cost figures only from ≥10 flights across ≥3 riders with a stated billing method. Corpus growth via recruitment is now a top-four move. |
| JSON-LD "high impact" (incl. HowTo, FAQPage) | **Hygiene only**; those rich results are retired. | Kept Organization/Article/Breadcrumb/Dataset/ProfilePage; dropped HowTo/FAQPage/Course. |
| llms-full.txt, `.md` twins, content negotiation, read API, "Markdown-first for agents" | **Cut.** The plan's own evidence shows no citations and no traffic; `/agents` already serves the only real consumer. | Removed. `/llms.txt` untouched except slash normalization. |
| "Harness engineering" as an open lane | **Wrong**; Osmani and vendor engineering posts own it. | Removed from targets. |
| Mount hubs with permissions/hooks/session-log pages | Sit behind code.claude.com indefinitely. | Only the cross-tool comparison remains. |
| Burn patterns as "the highest-value programmatic set" targeting incident queries | Nine of twelve anchored on illustrative examples; incident queries are news/Reddit. | Eight pages, definitional, labeled illustrative vs logged, never presented as data. |
| ~150 new URLs (reins spokes, 12 glossary pages, models, tasks, data, mounts, interviews) | **Index bloat** on a young domain; most thin or noindexed on arrival. | ~25 new URLs; glossary collapsed to one page; per-model cut; "no page ships noindex-until-n". |
| 52 newsletter issues a year | Full-time job; endpoint unconfigured; zero issues. | Monthly at most, only with a number; `/newsletter/` for both page and archive (contradiction resolved). |
| Per-page OG cards, orphan-rule CI that fails builds, living reins guides for 7 mounts, model registry | Engineering competing with writing and product. | OG cards deferred; link check reports instead of failing; one comparison page instead of seven guides. |
| Trailing-slash fix with "outsized effect" | Correct hygiene, ~0 traffic delta. | Kept in S0, priced honestly. |
| Reddit/HN seeding; MCP listings as backlinks | Citations accrue to reddit.com; listings are nofollow; one HN slot. | One Show HN for the case study; participation not posting; listings for discovery only. |
| Missing: conversion design, measurement baseline, prioritized query list, founder distribution sizing, rework of existing pages, slug decision, product gates, video | **Gaps.** | §7 funnel + CTAs; §5.1 20-query list; §5.2 rewrite brief as the top content item; §8 decisions; one video in §6. |

Open risks that remain: index bloat if S2/S3 pages ship thin (mitigation: the §4.4 gates and the kill criterion); brand-voice vs query drift page by page (mitigation: the bilingual rule is checked in review, title by title); a reflexive one-rider corpus (mitigation: recruitment before numbers); solo-founder time (mitigation: the 90-day calendar is the cut line).

---

## 10. Sources

Selected primary and secondary sources the research drew on (October 2026).

**Google / engines.** developers.google.com/search/docs/appearance/ai-features · …/fundamentals/ai-optimization-guide · …/crawling-indexing/robots-meta-tag · developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers · structured-data docs for article, dataset, organization, profile-page, breadcrumb, software-app, site-names, publication-dates · search blog 2023/08 (HowTo/FAQ), 2024/10 (sitelinks searchbox), 2025/06 (simplifying results) · developers.openai.com/api/docs/bots · help.openai.com/en/articles/9237897 · privacy.anthropic.com/en/articles/8896518 · docs.perplexity.ai/docs/resources/perplexity-crawlers · docs.x.ai/developers/tools/web-search · x.com/grok/status/1913956990545702970 · blogs.bing.com (AI Performance, Feb & June 2026; IndexNow).

**Cloudflare.** developers.cloudflare.com/bots/additional-configurations/block-ai-bots · …/managed-robots-txt · …/ai-crawl-control · …/bot-fight-mode · …/fundamentals/reference/markdown-for-agents · blog.cloudflare.com/content-signals-policy · contentsignals.org.

**Studies.** arxiv.org/abs/2311.09735 (Princeton GEO) · ahrefs.com/blog: do-ai-assistants-prefer-to-cite-fresh-content, why-chatgpt-cites-pages, ai-brand-visibility-correlations, ai-overview-brand-correlation, llm-search, seo-chunk-optimization, ai-citations-vs-impressions-study, top-mentioned-sources-are-not-shared-across-ai-assistants, best-lists-research · searchengineland.com/chatgpt-citations-domains-study-472349 · searchenginejournal.com (llms.txt 300k-domain study; Mueller on llms.txt) · ppc.land (llms.txt adoption) · commoncrawl.org (llms.txt content analysis) · zeroclicklabs.ai (content types) · tinuiti.com (Q1 2026 citation trends) · contently.com/2026/04/29/top-sources-llms-cite · tryprofound.com/blog/ai-platform-citation-patterns · llmstxt.org · wikidata.org (Notability, Self-promotion).

**Niche landscape.** code.claude.com/docs/en/costs and /best-practices · artificialanalysis.ai/agents/coding-agents · github.com/vectara/awesome-agent-failures · cyera.com/research (agent-inflicted damage) · getreadyforagents.com/agentfailures · arxiv.org/html/2503.13657v3 (MAST) · arxiv.org/pdf/2602.16666 · opentelemetry.io gen-ai agent spans · huggingface.co/docs/hub/en/agent-traces · lethain.com/sharing-claude-transcripts · simonwillison.net/tags/claude · latitude.so (observability comparison) · hamel.dev · getmaxim.ai/evals-handbook · addyosmani.com/blog/agent-harness-engineering · media.mit.edu (five levels of agent autonomy) · tianpan.co (earned autonomy; SWE-bench gap) · snorkel.ai (Senior SWE-Bench) · humanlayer.dev/blog/writing-a-good-claude-md · morphllm.com, mindstudio.ai, claudelog.com (the programmatic competitors) · itbrief.co.uk (Stack Overflow 2026 survey) · resources.anthropic.com/ty-2026-state-of-ai-agents.
