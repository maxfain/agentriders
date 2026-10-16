---
title: "One timeout, two writes, one burn"
seoTitle: "AI agent retry after timeout: duplicate writes"
description: "A non-idempotent retry: an AI agent's write times out, it retries, and every record lands twice. Signals, the first ten minutes, recovery, prevention."
summary: "A duplicate write after a timeout is an AI agent failure, a non-idempotent retry: a write times out, the agent reads the silence as a failed call and retries, and the destination, which accepted the first request, now holds every record twice. No flight has logged it yet; the example is illustrative. The fix is a destination check before retrying."
pattern: "duplicate-write-after-timeout"
plain_name: "non-idempotent retry"
status: illustrative
logged_examples: []
related_chapter: "burns"
related_lesson: "when-an-agent-fails"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is a duplicate write after a timeout?

A duplicate write after a timeout is an AI agent failure in which a write request times out, the agent reads the silence as a failed call, and sends the same request again. The destination had accepted the first one. Every record now exists twice. Engineers call the cause a non-idempotent retry: an operation unsafe to repeat, and nothing stopping it.

Riders call the result a [burn](/glossary/#burn). The dragon did the reasonable thing with what it could see; a timeout looks like nothing happened. The fix lives in the [harness](/glossary/#harness), not in a sterner prompt.

## How do you know an agent wrote it twice?

The first signal is a count that does not match the input.

- The destination holds more records than the source supplied.
- The action log shows a timeout, then the same call again.
- The closing message reports success and mentions the retry in passing, or not at all.

## The first ten minutes: contain, confirm, then choose recovery

The first ten minutes follow the [Burns chapter](/manual/burns/): stop the run, establish what happened, pick the smallest recovery.

**Minutes zero to two: contain.** Cancel the run with the harness's real controls, not by closing the saddle. Check queued jobs and scheduled retries; the loop may still be running. Issue no new write.

**Minutes two to five: establish the facts.** Open the [burn report](/training/kit/burn-report/) and ask the chapter's question: what does the destination confirm already happened? Pull the records by identifier and sort every action into confirmed, attempted or untouched. An agent saying the first call failed is a hypothesis, not evidence.

**Minutes five to ten: choose recovery.** With reliable identifiers for the duplicates, recovery is a bounded delete. Without them, the records wait for the system owner.

## Recovery is a bounded delete, not a cleanup sweep

Recovery removes the duplicates you can name, one identifier at a time, and nothing else.

Build the inventory: source identifiers against destination identifiers, one to one. The extras are your list. Check that each is still deletable: a draft, a test record, an unsent message. Authorize that list, and only that list.

Do not ask the agent to delete the extras across a workspace; that is a second unbounded write.

The second repair is the workflow, recorded separately: a destination check after any uncertain response, the destination's own duplicate prevention, and a regression case where a timeout after a partial write must not produce a second record. The mount stays grounded until the check exists.

## Which permissions and limits prevent a non-idempotent retry?

The reins that prevent this burn make the retry safe or impossible, and only some are enforced outside the model.

| Rein | Concrete setting | Enforcement or instruction |
| --- | --- | --- |
| Scope | Staging workspace until the retry path is proven; unique constraint at the destination | Enforced by the account and the destination |
| Budget | Retry limit and attempt cap in the runner | Enforced if the runner supports it, else instruction |
| Kill switch | Uncertain writes stop and report; retries cannot bypass approval | Enforced only if the gate sits before the write |
| Autonomy | Non-idempotent writes stay proposals until the check exists | Instruction, backed by scope |

"Do not retry writes" in a prompt is an instruction. The [Reins chapter](/manual/reins/) asks you to write both layers down and name where no enforced control exists. Before the flight, simulate a timeout in a sandbox and confirm the harness stops rather than repeats ([Build the harness](/training/build-the-harness/)). For the stop, read [kill switch](/manual/kill-switch/); for attempt caps, [spend cap](/manual/spend-cap/).

## The illustrative example: the doubled import

This pattern has no logged example yet; the case below is illustrative, from the Flight School lesson [When an agent fails](/training/when-an-agent-fails/).

An operator asks an agent to create ten draft tasks in a disposable sample workspace. The tool times out after the first batch. The agent retries all ten. The workspace now holds fifteen drafts: five from the first attempt, ten from the retry.

She stops the workflow, saves the action log, and compares source item IDs with the draft records: ten source items, five duplicated destinations, fifteen destination IDs. She does not run a delete-the-extras pass. She proposes removal of the five confirmed duplicate IDs, checks they are still disposable drafts, and authorizes that bounded action. The workflow repair: a destination check after an uncertain response, and a supported way to avoid repeating the operation.

The one published flight log, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), has no burn of this pattern; when a rider logs one, it links here.

## Questions riders ask about duplicate writes

Riders bring three questions to this pattern.

**Was the retry the agent's fault?**
No. Without a destination check, a timeout looks like a failed call; retrying is the sensible move. Nothing confirmed the first write, nothing stopped the second. Fix the harness, not the mount's manners.

**Can I just tell it not to retry?**
Write it down, yes, but a prompt sentence is an instruction, not a control. Controls: a retry limit the runner enforces, an approval gate before the write, a unique constraint at the destination. Label which you have.

**What if I cannot tell whether the first write landed?**
It is attempted, not confirmed, until the destination says otherwise. Query by identifier. If you cannot, do not retry; report the uncertain write and let the system owner decide.

Log the burn with the [burn report](/training/kit/burn-report/) before you refit the reins.
