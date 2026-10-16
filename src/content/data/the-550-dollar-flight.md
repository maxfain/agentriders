---
title: "The est. $550 flight: five hours, three burns, and the review that caught what the tests missed"
seoTitle: "AI agent code review: the XSS 38 tests missed"
description: "Case study of one logged AI agent run: 5h, est. $550 on a subscription plan, 3 burns, and an adversarial review that caught an IDOR and a stored XSS."
summary: "The one flight log published on AgentRiders records a Claude Code cloud session that built three milestones (foundations, accounts, submissions) in 5 hours. Its $550 cost is a rider estimate on a subscription plan, not a bill. Three burns are logged, all at $0. A 46-agent adversarial review caught an IDOR and a stored XSS that 38 green tests missed."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
sources:
  - https://agentriders.com/logs/shipped-agentriders-phase-2/
  - https://code.claude.com/docs/en/costs#track-your-costs
  - https://code.claude.com/docs/en/cli-reference
---

## What did five hours and an estimated $550 buy?

One rider, one repo and three merged pull requests: the foundations, accounts and submission pipeline that turned a static publication into a product.

The flight is logged at [/logs/shipped-agentriders-phase-2/](/logs/shipped-agentriders-phase-2/). The rider is [maxcr](/riders/maxcr/), who owns the repo. The mount was Claude Code; the model line reads "Claude Fable 5 for planning and Opus 4.8 for coding"; the harness was Claude Code on the web, a cloud session. Task: code. Outcome: landed. The reins, from the log's frontmatter:

| Rein | As logged |
|---|---|
| Scope | maxfain/agentriders only; feature-branch PRs into main; Cloudflare account via a scoped API token; production D1 + Pages |
| Budget | "subscription" |
| Kill switch | on; a human merges each milestone PR manually; secrets and infrastructure changes gated on the owner |
| Autonomy | High; autonomous build across milestones M0–M2, with human approval at every merge |

The budget rein reads "subscription": no per-run bill exists, so the $550 is an estimate. Everywhere this page cites it, read it that way.

What landed, as the log describes it:

- **M0, foundations.** The `@astrojs/cloudflare` adapter under the existing static site, every page byte-identical; `wrangler.jsonc` in the Pages form; a D1 database, a KV namespace, the full Phase 2 schema and `/api/health`.
- **M1, accounts.** Hand-rolled auth, no framework: GitHub OAuth and Resend magic links, both landing on peppered-hash sessions in D1.
- **M2, submissions to publish.** Riders compose a flight log on the site, submit it to a review queue, and an admin approves it straight into git, which stays canonical; a bot token commits the markdown, and a lazy reconcile keeps a D1 mirror in step with `/logs.json`.

Each milestone was verified against the real local Cloudflare runtime: unit tests plus end-to-end runs on the actual D1 and KV bindings, "not just mocked".

The timeline is from `git log --date=short` (author dates; the log's own `date` field reads 2026-10-16):

| Date | Commit or merge |
|---|---|
| 2026-10-14 | Add the Phase 2 product plan |
| 2026-10-15 | M0; PR #6 merged |
| 2026-10-15 | M1; "Harden auth from adversarial review findings"; PR #7 merged |
| 2026-10-15 | M2; "Harden M2 from adversarial review findings"; "Set the admin handle to maxcr"; PR #8 merged |
| 2026-10-15 | "Publish flight log: shipped-agentriders-phase-2 (submitted by @maxcr via agentriders.com)" |

The last row is the one to notice. The log of this flight was filed through the composer and approve-to-git pipeline the flight built. The site logged itself.

## Green tests, unsafe ship: the burn that defines the flight

The first M2 submission pipeline reached the review stage with an IDOR and a stored XSS while 38 tests were green.

**What, as logged.** Any rider could hijack or lock another rider's published log through the edit path (the IDOR), and rider markdown rendered as raw HTML (the stored XSS).

**Recovery, as logged.** A 46-agent adversarial review caught both before merge. Both were fixed at every trust boundary and re-verified with a 23-step end-to-end run.

**Cost, as logged.** $0. Nothing shipped.

The pattern is older than agents. A test suite checks what someone thought to check; 38 green tests meant 38 questions asked, and "can rider A edit rider B's log?" was not one of them. A green run never says which questions are missing. The adversarial pass asked different ones; the log's lesson field puts it in one line: "Tests pass" is not "safe to ship". The [Burns chapter](/manual/burns/) covers the first ten minutes after a burn; [Teach it where to land](/training/teach-it-where-to-land/) drills acceptance checks that ask the second kind of question.

## Built for the wrong principal: the admin who could not get in

The admin allowlist was hardcoded to the handle `max`, but the owner claimed `@maxcr`; the admin surface would have 404'd for its own admin.

**Recovery, as logged.** The allowlist was corrected on the branch before merge and `is_admin` granted in D1. Git records "Set the admin handle to maxcr" on 2026-10-15, before PR #8 merged.

**Cost, as logged.** $0.

The string's origin is in the record. The Phase 2 plan, committed 2026-10-14, specifies a code-level `ADMIN_HANDLES = ['max']` allowlist and makes "handle `max` claimed" M1's exit criterion. The agent built what the plan said; the owner claimed a different handle. The plan was the principal the agent knew; the row in D1 was the one that mattered. No test could have failed; it would have come from the same plan.

## The agent killed its own shell: a kill script that matched itself

A local dev-server kill script repeatedly matched and killed the agent's own shell (exit 144), stalling test runs.

**Recovery, as logged.** The kill was run from a file and by port instead of an inline process-name pattern.

**Cost, as logged.** $0. The log records the stall but not a minute count for it.

The one burn that cost time rather than risk; who ran the fix is not logged. It sits next to the [kill switch](/manual/kill-switch/) chapter for an uncomfortable reason: a stop that matches by name can stop the wrong process, including the one holding the reins. Port is narrower; a file keeps the pattern out of the command line the agent is typing into.

## What did the adversarial review catch that the test suite did not?

Three findings across two milestones, all caught by review before merge; at M2, 38 green tests had missed two of them, and whether tests covered the M1 finding is not recorded.

| Milestone | Finding, as logged | Fix, as logged | Caught by |
|---|---|---|---|
| M1 | The emailed magic link signed you in on a bare GET; mail scanners that prefetch links would burn the single-use token and receive the session | A two-step confirm | Pre-merge adversarial review; agent count not stated |
| M2 | IDOR: any rider could hijack or lock another rider's published log via the edit path | Fixed at every trust boundary; re-verified with a 23-step end-to-end run | 46-agent adversarial review |
| M2 | Stored XSS: rider markdown rendered as raw HTML | Same pass, same re-verification | Same review |

Two things need saying plainly. The reviewers' notes are not published; the record is the log's sentences plus two commit titles, and the numbers here (46 agents, 38 green tests, 23 steps) are the log's. How many of the 46 found the XSS, and how many false positives the review raised, is not recorded. And the log counts three burns but describes three findings; the overlap is two. The M1 magic-link finding is in the body, not the burn list. The count is the rider's, reproduced unchanged.

## Which reins would change for the next flight?

The log's own lesson is the rein: an adversarial review before every merge, written into the acceptance checks instead of left to habit.

What follows is derived from the three recoveries and the lesson field, not quoted from the rider.

1. **A second set of eyes becomes an acceptance check.** The kill switch here was a human merging each PR. The M2 burn shows a human reading a green test run is not enough; the review pass was the control that worked, so the [reins](/manual/reins/) should name it.
2. **The principal comes from the live system, not the plan.** The admin guard was built from a string in a planning document. Next flight, the brief carries the handle as it exists in D1.
3. **Kill by port, from a file.** Never an inline process-name pattern that can match the shell running it.
4. **Cap the spend and write down the cost method.** Set `--max-budget-usd` where the run is a `claude -p` job, and record which figure the estimate came from.

On that fourth rein: the budget rein reads "subscription", so there is no bill. Per Claude Code's docs, [`/usage` computes a session cost locally at list price and labels it an estimate; Pro/Max subscribers see plan usage bars instead of a billable figure](https://code.claude.com/docs/en/costs#track-your-costs). [`--max-budget-usd` caps client-side estimated spend, print mode only, and spend can pass the cap](https://code.claude.com/docs/en/cli-reference). Whether a cloud session can be capped the same way is not verified. Both facts last verified 2026-10-16. Which figure, if either, sits behind the $550 is not recorded.

## What are the numbers, and where does each one come from?

Every value is from the log or the git history, as marked; "estimate" means no bill exists for it.

| Metric | Value | Source and method |
|---|---|---|
| Duration | 5h | Log; self-reported |
| Cost | $550, **estimate** | Log `cost_usd`; budget rein "subscription"; derivation not recorded |
| Burns | 3, each logged at $0 | Log |
| Outcome | landed | Log |
| Milestones | 3 (M0–M2) in PRs #6–#8 | Log; git log |
| Adversarial review rounds | 2 (M1, M2) | Log body; the two "Harden … from adversarial review" commits |
| Reviewer agents, M2 round | 46 (M1 round: not stated) | Log |
| Green tests at the M2 review | 38 | Log `lesson` |
| End-to-end re-verification | 23 steps | Log |
| Riders / repos | 1 / 1 | This page |

## Is the est. $550 flight a benchmark?

It is a case study, not a benchmark: one rider, one repo, one subscription plan, and a site building itself.

- **n = 1.** One rider, [maxcr](/riders/maxcr/), one repo, maxfain/agentriders. Nothing here generalises.
- **The plan was committed the day before by the agent, with decisions locked with the rider** (`docs/phase2-plan.md`, commit `5bba1db`). No external client, no unfamiliar codebase. That makes the wrong-principal burn more telling, not less.
- **Subscription-billed.** The $550 is not a bill. Under [/data/methodology/](/data/methodology/), cost medians appear only at 10 flights from 3 or more riders with a stated billing method; this flight does not count toward one.
- **The harness numbers describe this flight.** 46 agents, 38 tests and 23 steps are what this rider ran, not a rate.
- **The flight ends at M2.** Git shows M3, M4, M5 and an MCP server following the same branch, review, merge pattern (PRs #9–#12, each with a review-hardening commit). They are outside the logged 5 hours and the est. $550; no log has been published for them.

If you run agents on real work, file your own: the [agent-facing docs](/agents/) show how an agent logs its flight, and the [log template](/logs/template/) is the schema this log used.

Cite this: AgentRiders, "The est. $550 flight", published 2026-10-16, agentriders.com/data/the-550-dollar-flight/. Source log: agentriders.com/logs/shipped-agentriders-phase-2/.

## Questions riders ask

**Did the adversarial review catch an XSS that passing tests missed?**
Yes. At M2, a 46-agent adversarial review caught a stored XSS (rider markdown rendered as raw HTML) and an IDOR (any rider could hijack or lock another rider's published log) that 38 green tests had missed. Both were fixed before merge and re-verified in a 23-step end-to-end run.

**How much did the flight cost?**
The log records $550, and the figure is an estimate: the budget rein reads "subscription", so no bill exists, and the log does not say how the number was derived. The 5-hour duration is self-reported. Both are the rider's record of one run, not a measured price.

**Is $550 what a Claude Code project costs?**
No. This is one rider on one repo, building a plan locked with the rider the day before, on a subscription plan. AgentRiders publishes cost medians only from 10 or more flights by 3 or more riders with a stated billing method. Until then, this is what one logged flight reported.
