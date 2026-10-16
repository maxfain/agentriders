---
title: "How the Guild counts: flights, burns, cost, time, outcomes, and what verified means"
seoTitle: "AI agent cost and outcomes: how we count them"
description: "How AgentRiders counts AI agent runs: what a flight, burn, cost and outcome mean, what a verified record proves, and the n-gates before any number ships."
summary: "AgentRiders counts one AI agent run with an outcome as a flight. Cost, duration and outcome are self-reported by the rider in the log; a verified record adds device-signed session metadata, including a telemetry duration, but does not prove the claims. No aggregate is published below 10 flights from 3 or more riders."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
lastVerified: 2026-10-16
sources:
  - https://code.claude.com/docs/en/costs#track-your-costs
  - https://code.claude.com/docs/en/sessions#where-transcripts-are-stored
  - https://developers.openai.com/codex/pricing
  - https://github.com/maxfain/agentriders/blob/main/src/lib/log-schema.ts
  - https://github.com/maxfain/agentriders/blob/main/mcp/lib/validate.js
  - https://github.com/maxfain/agentriders/blob/main/mcp/tools/file.js
  - https://github.com/maxfain/agentriders/blob/main/cli/lib/record.js
  - https://github.com/maxfain/agentriders/blob/main/src/lib/verify.ts
  - https://github.com/maxfain/agentriders/blob/main/src/lib/ranks.ts
---

## What counts as a flight (one AI agent run)?

A flight is one real run of an AI agent on one task, with an outcome, filed by the person who held the reins.

The schema ([/data/schema/](/data/schema/); source [`src/lib/log-schema.ts`](https://github.com/maxfain/agentriders/blob/main/src/lib/log-schema.ts)) requires `title`, `date`, `rider`, `mount`, `task`, `duration`, `cost_usd`, `outcome`, `lesson` and the reins: `scope`, `budget`, `kill_switch`, `autonomy`. `task` is code, ops, research, sales, writing, data or other. A `draft: true` log is not a flight and never reaches `/logs.json`. Every field is self-reported. Template: [/logs/template/](/logs/template/); reasoning: [chapter 5](/manual/logging-a-flight/).

## What counts as a burn (an incident), and how is its cost recorded?

A burn is any part of the run that lost money, data or time, recorded with what happened, the recovery, and the direct cost in US dollars.

Each burn has `what`, `recovery` (280 characters each) and `cost_usd`, non-negative, default 0; a log holds at most 20. A burn cost already in the flight total is not counted twice. An empty list means none were observed, not that none were possible.

Logged example: [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), the one published flight, lists 3 burns at `cost_usd: 0`; its total is est. $550 on a subscription plan.

## How is AI agent cost measured in a flight log?

`cost_usd` is the rider's self-reported direct cost in US dollars; AgentRiders meters nothing.

| Billing | What `cost_usd` is | Label |
| --- | --- | --- |
| API key, metered | A figure read from a bill or a per-run cost field | measured |
| Subscription plan | An allocation the rider computed from usage; no per-run bill exists | estimate |

The one published flight ran on a subscription (`budget: "subscription"`), so its `cost_usd: 550` is an estimate, labeled so wherever cited. The schema accepts any non-negative `cost_usd`, so a log filed on the site can carry 0. The MCP file tool, `agentriders_file_flight_log`, refuses a `cost_usd` of 0 or less; its message asks for a measured amount or, failing that, the rider's best estimate with the uncertainty explained in the body ([`mcp/lib/validate.js`](https://github.com/maxfain/agentriders/blob/main/mcp/lib/validate.js), enforced in [`mcp/tools/file.js`](https://github.com/maxfain/agentriders/blob/main/mcp/tools/file.js)). The draft tool reports the same issue and refuses nothing. A 0 in a published log means a supported zero, never "did not check".

Mounts rarely hand over a bill, so the billing method travels with the number. Claude Code's `/usage` total is a local list-price estimate, not billing, and Pro and Max subscribers see plan usage bars instead ([costs](https://code.claude.com/docs/en/costs#track-your-costs)). Codex CLI has no in-CLI dollar meter ([pricing](https://developers.openai.com/codex/pricing)). Last verified 2026-10-16.

## How is duration recorded?

`duration` is a free-text elapsed-time string the rider writes; a verified record adds a telemetry duration in seconds, checked against the session's own timestamps.

The schema accepts up to 40 characters ("5h", "3h 10m"); the body states the clock convention and lists human review time separately. A verified record's `duration_seconds` is last timestamp minus first in the Claude Code session file ([`cli/lib/record.js`](https://github.com/maxfain/agentriders/blob/main/cli/lib/record.js)); the server rejects a record whose duration disagrees with its timestamps by more than 2 seconds ([`src/lib/verify.ts`](https://github.com/maxfain/agentriders/blob/main/src/lib/verify.ts)). They can differ: a flight may span several sessions; a session may include idle time. The public log page shows the rider's `duration` and the Verified flight badge; the telemetry duration appears only on the rider's own device page, after sign-in.

## What do landed, partial and aborted mean?

Outcome is judged against the brief, never against the agent's closing message.

| Outcome | Definition |
| --- | --- |
| `landed` | The agreed deliverable passed its acceptance checks |
| `partial` | Useful work exists, but part of the agreed result remains unmet |
| `aborted` | The run stopped without completing the agreed deliverable |

An aborted flight can show good judgment: if the input lacked required evidence and the agent stopped, log both facts.

## What does a verified flight prove?

A valid signature proves that a device registered to a rider signed that session's metadata; it does not prove the metadata is true.

The `agentriders` CLI reads a Claude Code session file locally and signs a metadata-only record with the device's Ed25519 key: a one-way session hash, timestamps, `duration_seconds`, model names, tool-call counts by name (MCP tools folded into one bucket) and eval signals. Never prompts, code, paths, command text or output; the payload is capped at 16 KB.

Every value is produced on the rider's machine and self-attested. The server recomputes the eval score from the signed signals, clamped to shared caps; eval stats are display-only and never feed rank. Anthropic documents the session file format as internal and changeable ([sessions](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored), last verified 2026-10-16), so a record proves only what the CLI could read. Install and pairing: [/agents/](/agents/). Records are linked, unlinked or deleted on your device page, after sign-in. The full account of the badge: [/riders/verified-flight/](/riders/verified-flight/).

Ranks count published flights, not verified ones: Fledgling, 1; Rider, 20 plus 2 vouches from Riders; Wingleader, admin grant only ([`src/lib/ranks.ts`](https://github.com/maxfain/agentriders/blob/main/src/lib/ranks.ts); [/riders/ranks/](/riders/ranks/)).

## When does AgentRiders publish a number?

No median, rate or per-mount figure appears before 10 flights from 3 or more riders, and no segment row before 5 flights.

Every published number carries n, a date range and a billing method. Below the gate the page says so instead of showing a number. Today the corpus is 1 flight from 1 rider on 1 mount; no aggregate exists.

## Why is a one-rider corpus not a benchmark?

One rider's flights measure that rider's habits, repository and billing plan at least as much as the agent.

Riders choose which flights to publish, so the sample is self-selected. A subscription cost is an allocation, not a charge. One repo under one set of reins repeats one set of conditions. One flight is a case study: read it, copy the reins, do not average it.

## Questions riders ask

**What should I record for each AI agent session?**

Title, date, rider, mount, task category, elapsed duration, direct cost in dollars, outcome against the brief, every burn with its recovery and cost, one lesson, and the reins as they operated: scope, budget, kill switch, autonomy. [/logs/template/](/logs/template/) has every field.

**How is AI agent cost measured?**

Self-reported. On an API key the rider copies a metered figure. On a subscription there is no per-run bill; the rider computes an allocation and the site labels it an estimate. Most tools show a local estimate or token counts, not a bill.

**Does a verified flight mean the numbers are true?**

No. A device registered to that rider signed metadata from a real session: timestamps, duration, models, tool counts, eval signals. They are self-attested. The signature rules out a forged device, not an inflated count. Cost, outcome and burns are not in the record.
