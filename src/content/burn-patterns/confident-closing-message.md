---
title: "The dragon said it landed"
seoTitle: "AI agent said it was done but it wasn't"
description: "False completion report: an AI agent says the task is done when nothing landed or nothing was checked. Signals, first ten minutes, recovery, reins."
summary: "A false completion report is a closing message that says the task is done when the evidence does not support it: the artifact is missing, partial, or never checked. Riders call it a confident closing message. No flight has logged this pattern yet; the example here is illustrative. The fix is a check the agent does not control."
pattern: "confident-closing-message"
plain_name: "false completion report"
status: illustrative
logged_examples: []
related_chapter: "logging-a-flight"
related_lesson: "teach-it-where-to-land"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is a false completion report from an AI agent?

A false completion report is a closing message that claims the task is done when the evidence does not support it: the artifact is missing, partial, or never checked. Riders call it a confident closing message, after the Guild's [guiding rule](/agents/): a confident closing message is not evidence that the work landed.

The mount's summary of what it believes happened reads as a result. [Build the harness](/training/build-the-harness/) draws the line: "Here are twelve possible duplicate groups" is an artifact; "I cleaned the CRM" is a claim that requires checking external state. The burn is a claim accepted as an artifact, what [Teach it where to land](/training/teach-it-where-to-land/) calls convincing work that is still wrong.

## How do you know the agent did not actually finish?

The signal is a verdict with nothing to open.

- A result ("all checks pass", "sent", "deployed") with no command, output, diff or record beside it.
- Checks written, run and graded by the same session, or not run at all.
- A destination that disagrees: file, branch, inbox or ticket unchanged.

## The first ten minutes: open the destination, not the message

The first job is to find out what, if anything, landed, as [the burns chapter](/manual/burns/) sets out.

**Minutes zero to two: contain.** Stop the run before it acts on its own report; a mount that believes it finished may retry or hand off. If the claimed action was external, check the destination before any retry.

**Minutes two to five: establish the facts.** Write the incident note. For each claim, find the receipt: command and output, diff, record in the destination. Sort into confirmed, attempted and untouched, as [When an agent fails](/training/when-an-agent-fails/) does.

**Minutes five to ten: choose recovery.** If nothing landed, the recovery is the task, run again with a check outside the agent. Do not ask the mount to confirm its own report.

## How do you recover from a task the agent said was done?

Recovery means establishing the real state of the work, then re-running it against a check the agent does not control.

1. Re-grade the output against acceptance checks written before you read it, so a fluent answer cannot lower your standard ([Teach it where to land](/training/teach-it-where-to-land/)).
2. Set the outcome from the checks, not the message: `landed`, `partial` or `aborted`, as [Logging a flight](/manual/logging-a-flight/) defines them.
3. Re-run with the receipt required: the exact command and observed result, or the words "not run".
4. Keep the input that produced the confident wrong answer as a regression case ([Evals](/manual/evals/)).

Log review and rework time separately in the [burn report](/training/kit/burn-report/).

## Which permissions, budgets and kill switches prevent it?

The rein that prevents this pattern is a check the agent cannot write, run or grade.

| Rein | Concrete setting | Enforcement or instruction |
| --- | --- | --- |
| Acceptance checks | Written before the run, outside the agent's edit scope, graded by a mechanism or a human | Enforcement when a reviewer or CI gates on them; "verify your work" is an instruction |
| Scope | Draft-only connections, a proposal file, a patch for review | Enforcement by the connection's permissions; "do not send" is an instruction |
| Kill switch | A human accepts each deliverable before the next step starts | Enforcement when the handoff requires an approval; "ask first" is an instruction |
| Budget | A [spend cap](/manual/spend-cap/) does not catch this; budget review time instead | Instruction |
| Autonomy | Unsupervised runs end with receipts, not a closing message | Instruction, unless the harness attaches receipts; the Guild's [MCP](/agents/) anchors only duration, model and date in telemetry and marks the rest as claims |

[Reins](/manual/reins/) separates a prompt sentence from a control under it; the [kill switch chapter](/manual/kill-switch/) covers the rider's own stop.

## The illustrative example: a refund approved without a date

This example is illustrative, drawn from the worked example in [Teach it where to land](/training/teach-it-where-to-land/); no flight has logged this pattern yet.

An operator builds a draft-only support workflow and gives the agent five synthetic tickets, one missing a purchase date. The expected behavior there is a question; the tempting failure, in the lesson's words, is a warm, confident refund promise.

On the missing-date ticket, the draft says "your refund is approved". Read as a closing message, the work is done: five tickets, five drafts. Against the acceptance table, the Unknowns check fails. The fix is an explicit eligibility rule, a rerun, and a check that the clearly eligible case still passes. Nothing was sent; the connection was draft-only, and that rein turned a refund into review time.

## Questions riders ask about a false completion report

Riders bring three questions to this pattern.

**The agent said it ran the tests. Didn't it?** Not until you see the command and its output. Ask for the exact invocation and observed result, or the words "not run", as [Ship a small code change](/missions/ship-a-small-code-change/) requires, then run them yourself.

**It said the update failed. Is that also a burn?** Yes, and it is the costlier direction: a request can time out after the service accepted it, and a retry repeats the write. [When an agent fails](/training/when-an-agent-fails/) treats "the update failed" as a claim to verify in the destination.

**Can a second model check the first one's report?** It helps with subjective quality, but its agreement is not independent proof. Check its judgments against your own examples first, as [Teach it where to land](/training/teach-it-where-to-land/) advises, and anchor it with a deterministic check or a human.
