---
title: "Burns: named ways AI agent runs go wrong"
seoTitle: "AI agent failure modes list, with recovery"
description: "AI agent failure modes, named and labeled logged or illustrative: how you know, the first ten minutes, recovery, and the permissions that prevent each one."
summary: "When an AI agent run loses money, data or time, riders call it a burn. This registry is a curated list of named failure patterns. Each page gives the signals, the first ten minutes, the recovery, and the permissions, budgets and kill switches that prevent it, labeled logged or illustrative. Counts and rates wait for enough logged burns."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

A kill script that matched the agent's own shell. An admin allowlist that would have locked out its own admin. A green test run with an IDOR behind it. Three burns, one flight, logged. This is where burns get names.

## Which AI agent failures count as burns?

A burn is an AI agent run that lost money, data or time ([glossary](/glossary/#burn)): a failure or incident with a cost attached. A duplicate write, a leaked credential, an hour of review on work that said it was done. [The burns chapter](/manual/burns/) logs the cost in three parts: direct charges, lost work, recovery time. Unknown stays unknown, never zero.

## How does the registry of AI agent failure modes work?

The registry is a curated list of named failure patterns. Each gets one page: how you know, the first ten minutes, the recovery, and the [reins](/manual/reins/) that prevent it. Each carries one of two labels. **Logged** means a published flight log records the burn, quoted as the rider wrote it. **Illustrative** means the example is drawn from the Field Manual or Flight School, like the doubled import in [When an agent fails](/training/when-an-agent-fails/), and the page says so. Logged examples accrue from published flight logs; the first come from [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/). No counts, rates or costs by pattern until enough burns are logged, per [how we count](/data/methodology/). An illustrative page is a definition, never data.

## How do you file an AI agent incident report?

An incident is filed as a burn inside a flight log. First stop the loss. The [first-ten-minutes checklist](/burns/first-ten-minutes/) carries the [Burns chapter](/manual/burns/) protocol on one page: contain, establish the facts, choose the smallest recovery. Then fill the [burn report](/training/kit/burn-report/) while the evidence is fresh. When the flight is over, log it in the [composer](/logs/new/): what happened, how you recovered, what it cost, and a pattern from this registry. The registry grows from what riders file, not from what we guess.

## Questions riders ask about AI agent failure modes

All three turn on one distinction: a burn is a cost on the record, not a verdict on the flight or the mount.

**Is a burn the same as an aborted run?** No. Outcome and burns are logged separately. A flight can land with burns, as the first logged one did, and an aborted flight can carry none.

**Why no counts or rates?** A rate from one rider, one repo and one billing method is noise with a decimal point. Numbers appear when enough burns are logged by enough riders, with the method stated.

**Does a burn ground the mount?** Not always. [Grounded](/glossary/#grounded) means pulled from real work until the rein that let the burn through is refitted: a scope the [harness](/training/build-the-harness/) enforces, a [spend cap](/manual/spend-cap/) instead of an alert, a [kill switch](/manual/kill-switch/) you have fired. Log a near miss too. Resuming is a separate decision from recovering.
