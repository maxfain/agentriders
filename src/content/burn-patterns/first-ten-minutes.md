---
title: "The first ten minutes of a burn"
seoTitle: "AI agent incident response checklist: 10 min"
description: "A printable incident response checklist for when an AI agent fails: minutes 0–2 contain the run, 2–5 establish facts, 5–10 choose the smallest recovery."
summary: "When an AI agent fails, the first ten minutes are for regaining control, not explaining. Minutes zero to two: stop the run and remove access that can still do harm. Minutes two to five: write an incident note separating confirmed facts from unknowns. Minutes five to ten: choose the smallest recovery that restores the intended state without new damage."
kind: checklist
plain_name: "incident response checklist for an AI agent"
related_chapter: "burns"
related_lesson: "when-an-agent-fails"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## The first ten minutes are for control, not explanation

A [burn](/glossary/#burn) is a run that went wrong: money, data or time lost. In plain terms, an AI agent incident. This page is the [Burns chapter](/manual/burns/) protocol as a printable checklist: not a failure pattern, but what you do when one shows up on your mount.

Ten minutes buys control and facts, not repair. Where customer data, credentials, payments or production are involved, your organization's incident process applies; this runs inside it.

## Minutes 0–2: stop the AI agent, then confirm it stopped

Containment comes before diagnosis, because an agent still acting is still adding damage. Use the stop control you tested in [Build the harness](/training/build-the-harness/).

- [ ] Cancel the run with the harness's actual control, not the chat window.
- [ ] Check for queued jobs, scheduled retries, child processes and other workers.
- [ ] If it can still act through a connected service, remove the access.
- [ ] Confirm the stop where the work executes; a frozen screen is not confirmation.
- [ ] Before anyone retries an uncertain write or payment, check whether it succeeded.
- [ ] Preserve state. No broad cleanup that destroys logs or others' work.

## Minutes 2–5: write the incident note before the theory

The incident note records what you can verify and labels the rest unknown. The agent's explanation is a lead, not evidence.

```text
Detected at:
Run and workflow version:
Last confirmed safe state:
Observed action and evidence:
Systems or records potentially affected:
Execution stopped? [confirmed / not confirmed]
Access contained? [confirmed / not confirmed]
Unknowns:
Owner and next check:
```

- [ ] Sort every action into confirmed, attempted or untouched. Keep unknowns visibly unknown.
- [ ] A deletion caught by an approval gate is a near miss; a completed one is a different recovery.
- [ ] Keep evidence somewhere access-controlled. No secrets in a public log.

## Minutes 5–10: the recovery must match the side effect

The right recovery is the smallest one that restores the intended state without new damage. A Git revert recovers tracked code. It does not unsend an email, restore an external database or revoke a leaked credential.

- [ ] Recover in the system that took the side effect, with exact identifiers.
- [ ] Review material recoveries with the owner before executing.
- [ ] Do not let the agent improvise the cleanup. The mount is [grounded](/glossary/#grounded) until its reins are refitted.
- [ ] Treat resuming as a separate decision with its own scope.

## The kill switch and permissions decide how fast you stop

The checklist only works if there is something to pull. [Reins](/manual/reins/) asks whether each boundary is enforced by the harness or only requested in the prompt.

- **Kill switch.** Enforced: a tested cancel that also stops scheduled work. Instruction: "stop if anything looks wrong." See [kill switch](/manual/kill-switch/).
- **Scope.** Enforced: a narrow account, read-only connector or isolated workspace. Instruction: "do not touch production." A branch is not a boundary.
- **Budget.** Enforced: a hard cap at the provider or runtime. Instruction: a limit in the brief. An alert fires after the money is gone. See [spend cap](/manual/spend-cap/).
- **Autonomy.** Enforced: an approval gate before each consequential action, naming destination and payload. Instruction: "ask before sending."

Instruction-only boundaries mean you supervise the first two minutes yourself.

## How does the checklist run on the doubled import?

This example is illustrative: the practice case from [When an agent fails](/training/when-an-agent-fails/), invented for that lesson.

An operator asks an agent to create ten draft tasks. The tool times out after the first batch; the agent retries all ten. The workspace now holds fifteen drafts.

Minutes 0–2: she stops the workflow and saves the action log. Minutes 2–5: she compares source IDs with the draft records: ten sources, five duplicated, fifteen destinations. Minutes 5–10: she proposes removing the five confirmed duplicate IDs, checks they are still disposable drafts, and authorizes that bounded action. Not "delete the extras."

## What happens after minute ten?

Containment and facts start the burn report; they do not finish it. Reconstruct the sequence from instruction to missed check, change the smallest relevant part, add a regression case, and test both before restoring access. Log charges, lost work and recovery time separately; leave unknown costs unknown.

The [burn report worksheet](/training/kit/burn-report/) carries the note forward. What survives into a flight log is three fields per burn: what happened, the recovery, the cost. The one published flight, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), logs three burns that way.

## Questions riders ask

The [Burns chapter](/manual/burns/) answers all three in passing.

**Does closing the chat stop the agent?**
Not necessarily. A chat window is the saddle, not the harness; jobs, retries and child processes can outlive it. Cancel the run where it executes and confirm there. If you cannot confirm, treat it as running and remove its access.

**Should I ask the agent what it did?**
Ask, then verify. Its account points you at the right logs, but it is a claim, not a receipt. "The update failed" does not show nothing changed; a request can time out after the service accepted it.

**What if the burn is small? Is ten minutes overkill?**
Match the response to the consequence. A weak draft needs a correction, not a protocol. An agent still making unauthorized changes needs containment, however small the first change looked. Run the checklist whenever the agent could still act.
