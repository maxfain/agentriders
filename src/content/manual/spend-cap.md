---
title: "Cap what a flight can spend: an alert is not a cap"
kind: "guide"
seoTitle: "AI agent spend cap: why an alert is not a cap"
description: "How to cap AI agent spend: per-run vs per-day budgets, token vs dollar vs turn caps, subscription vs API billing, and the flags that make a cap hold."
summary: "A spend cap stops an AI agent at a limit; an alert only tells you afterwards. Caps count tokens, dollars or turns, per run or per day. Claude Code has a per-run dollar cap in print mode; Codex and Gemini CLI do not, and Cursor documents none, so their enforceable limit sits in billing, turns or a hook you write."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
lastVerified: 2026-10-16
sources:
  - https://code.claude.com/docs/en/cli-reference
  - https://code.claude.com/docs/en/headless#background-tasks-at-exit
  - https://code.claude.com/docs/en/costs#track-your-costs
  - https://code.claude.com/docs/en/costs#manage-costs-for-your-organization
  - https://code.claude.com/docs/en/hooks
  - https://developers.openai.com/codex/config-reference
  - https://developers.openai.com/codex/changelog
  - https://github.com/openai/codex/blob/main/codex-rs/features/src/feature_configs.rs
  - https://developers.openai.com/codex/pricing
  - https://developers.openai.com/codex/hooks
  - https://cursor.com/docs/account/billing/spend-limits
  - https://cursor.com/docs/account/pricing
  - https://cursor.com/docs/agent/hooks
  - https://forum.cursor.com/t/max-tokens-cap-cli-option/155706
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/quota-and-pricing.md
---

## What is the difference between a spend alert and a spend cap?

An alert reports spending after it happens; a cap refuses the next request once the limit is reached.

A budget line in a prompt is neither; [Chapter 1](/manual/before-the-first-flight/) and [Reins](/manual/reins/) both say instructions are not enforcement. The test is one question: when the number is reached, what does the next tool call do? If it runs and you get an email, you have an alert.

Call the pattern **alert-is-not-a-cap**; the money it loses is a burn, and [chapter 4](/manual/burns/) says what to do in the first ten minutes. No logged flight carries it yet, so this example is illustrative: a rider sets a $20 threshold in a billing console, starts an overnight run, and finds the notification at breakfast beside a $140 line. The alert fired at $20. Nothing stopped.

## Per-run or per-day: which budget does an AI agent need?

Both, because they fail differently: a per-flight cap bounds one run, and a per-day cap bounds the loop that keeps starting new ones.

| Scope | Stops | Misses | Lives in |
| --- | --- | --- | --- |
| Per flight | A run that loops, retries or spawns subagents | A scheduler relaunching it hourly | A CLI flag or a hook on the run |
| Per day or month | Spend across runs and riders | A run that spends the day in an hour | Provider billing, team dashboard |

Set the per-flight cap at what one failed run may cost, not what a good run should. The [harness lesson](/training/build-the-harness/) keeps a row for this: what you ask, next to what the service enforces.

## Token, dollar or turn caps: which one actually holds?

A turn cap is the easiest to enforce, a dollar cap is the easiest to read, and a token cap sits between them.

| Unit | Counts | Drifts when | Who ships one (last verified 2026-10-16) |
| --- | --- | --- | --- |
| Turns | Agentic round-trips | Each turn grows as context grows | Claude Code `--max-turns` (print mode); Gemini CLI `model.maxSessionTurns` |
| Tokens | Input and output tokens, sometimes weighted | Prices change; cached tokens cost less | Codex `[features.rollout_budget]` (experimental) |
| Dollars | A client-side price estimate | The estimate is not the invoice | Claude Code `--max-budget-usd` (print mode) |

Dollar caps are client-side estimates, and Claude Code's docs say spend can pass the cap, so leave headroom ([CLI reference](https://code.claude.com/docs/en/cli-reference)). Turn caps never drift but ignore cost per turn.

## Most subscription plans cap usage windows, not dollars

On most subscription plans the limit is a usage window, not a dollar figure, so the cost of any one run is an estimate, not a bill.

The one published log here, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), shows it. Its reins block reads `budget: "subscription"`, so its `cost_usd: 550` for a 5-hour Claude Code run is an estimate with no per-run invoice behind it. Quote $550 as an estimate, or not at all.

On Claude Code Pro and Max, `/usage` shows usage bars, not a billable figure, and "You've hit your session/weekly limit" is a seat-based window, not a dollar limit ([costs](https://code.claude.com/docs/en/costs#track-your-costs), [org costs](https://code.claude.com/docs/en/costs#manage-costs-for-your-organization)). Codex on a ChatGPT plan runs on 5-hour and weekly windows ([pricing](https://developers.openai.com/codex/pricing)); Gemini CLI meters daily request quotas by auth method ([quota and pricing](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/quota-and-pricing.md)). Cursor is the exception: its included agent-usage pool is a dollar allowance (Pro $20, Pro+ $70, Ultra $400), which Cloud Agents draw down at API pricing before on-demand usage begins ([pricing](https://cursor.com/docs/account/pricing)). A dollar pool is still not a per-run bill. Last verified 2026-10-16.

API billing is the reverse: a real invoice, and no stop unless you add one.

## How to make a spend cap enforceable, tool by tool

The enforceable cap is whichever control refuses the next request, and only two of these four mounts ship one per run.

| Mount | Per-run cap, and what happens at the limit | Outside the run |
| --- | --- | --- |
| Claude Code | `--max-budget-usd <amount>` and `--max-turns <n>`, print mode (`-p`) only. Stops at the client-side estimate; subagent spend counts; spend can pass the cap; background work is stopped (v2.1.217+) ([CLI reference](https://code.claude.com/docs/en/cli-reference), [headless](https://code.claude.com/docs/en/headless#background-tasks-at-exit)) | Console workspace limits (API orgs); usage-credit limits (Teams, Enterprise); cloud-provider budgets ([org costs](https://code.claude.com/docs/en/costs#manage-costs-for-your-organization)) |
| Codex CLI | None for turns, tool calls or dollars. `[features.rollout_budget]` with `limit_tokens` is experimental; the changelog says turns abort when it is exhausted ([config reference](https://developers.openai.com/codex/config-reference), [source](https://github.com/openai/codex/blob/main/codex-rs/features/src/feature_configs.rs), [changelog](https://developers.openai.com/codex/changelog); changelog excerpt, key names in flux, not verified at runtime) | Plan usage windows, or raw API billing ([pricing](https://developers.openai.com/codex/pricing)) |
| Cursor | Not verified: no per-run cap found in docs; absence inferred from a [forum request](https://forum.cursor.com/t/max-tokens-cap-cli-option/155706) | Team USD limit in Dashboard > Spending, with group and member overrides; AI features stop for that user; not instant ([spend limits](https://cursor.com/docs/account/billing/spend-limits)) |
| Gemini CLI | `model.maxSessionTurns` in settings.json, default -1 (unlimited). Stops sending requests; headless runs exit with code 53 ([session management](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md), [headless](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)) | No token or dollar cap ([configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)); daily request quotas |

The flags bind one process; a scheduled job or background session can outlive them. A pre-tool hook on any of the four mounts can deny a call for a reason your script computes, so a counting hook is a cap you own: `PreToolUse` in Claude Code and Codex, `beforeShellExecution` in Cursor, `BeforeTool` in Gemini CLI ([Claude Code hooks](https://code.claude.com/docs/en/hooks), [Codex hooks](https://developers.openai.com/codex/hooks), [Cursor hooks](https://cursor.com/docs/agent/hooks), [Gemini CLI hooks](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md); last verified 2026-10-16). How each one blocks, and where each fails open: [the comparison page](/manual/scope-cap-kill-compared/#can-a-hook-block-a-tool-call-or-stop-the-loop). Fire it on a harmless run first.

## What do you do when no hard cap exists?

Shrink the flight until its worst case is affordable, and stay in the saddle.

Chapter 1 is explicit: if a hard cap is unavailable, stay present and monitor usage. Set a retry limit so repeated failure becomes a question, not a loop. Count review time in the budget. Know how to [cancel the run and anything it scheduled](/manual/kill-switch/) before you need to. Loosen a cap as [the bond](/manual/agent-trust-and-autonomy/) loosens any rein: one boundary at a time, on logged evidence, with the restoring condition written first.

Then log it. The [log template](/logs/template/)'s `budget` field should name what enforced the number; "subscription" marks the cost as an estimate, as the [methodology](/data/methodology/) requires.

## Questions riders ask

**How do I cap Claude Code spend?**
In print mode, pass `--max-budget-usd <amount>`; the run stops when the client-side estimate reaches it, subagents included, and spend can pass the cap, so leave headroom. Add `--max-turns`. Pro and Max sessions have usage windows, not dollar caps; API orgs set workspace limits in the Console. Verified 2026-10-16.

**Is there a token budget limit for AI agents?**
Only Codex CLI ships one, and it is experimental: `[features.rollout_budget]` with `limit_tokens`, documented as under development. Claude Code caps dollars and turns; Gemini CLI caps turns with `model.maxSessionTurns`; Cursor documents no per-run cap we could verify. Otherwise the token limit is your plan's usage window.

**How do I stop a runaway AI agent cost?**
Stop the process first; a billing alert will not. Check what the run scheduled or spawned, since that can outlive it. Before the next flight, set a per-run cap where the tool offers one, a daily limit in billing and a retry limit in the brief, and shrink the task until an unattended failure is affordable.
