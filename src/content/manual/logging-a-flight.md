---
title: "Logging a flight: the template and why every field matters"
chapter: 5
description: "The log template, field by field, with the numbers left in."
updated: 2026-09-29
draft: false
---

## Leave enough evidence to learn

A flight log is a small operating record. It should let another rider understand the task, the setup, the result, and the cost of getting there. It should also let you compare this flight with the next one without relying on memory.

Write the log while the receipts are available. Keep the initial brief, the final artifact, and the checks that support the outcome. A confident closing message is not evidence that the work landed.

Use the [flight-log template](/logs/template/) for the site's format. Its filled-in values are examples to replace, not results to claim. Submission availability is stated on that page; keeping a log locally does not publish it to the Guild.

## Identify the setup

Give the title a concrete task and outcome. “Investigated duplicate invoice rows” is more informative than “Amazing agent experiment.” Use the actual date, rider, and mount.

Record the model and harness when known, plus relevant configuration in the body. Include the workflow or instruction version, input snapshot, and permissions that affected the result. If the product does not expose a model version, say so rather than guessing.

The `task` field groups the kind of work: code, operations, research, sales, writing, data, or other. It is a category, not a claim of expertise. Record a fleet's contributing agents in the body if more than one mount participated.

## Record time and cost separately

The `duration` field should describe elapsed time, with the start and finish convention stated in the body. Add human setup, review, correction, and recovery time separately. Two workflows with identical runtime can impose very different demands on the rider.

Use `cost_usd` for the direct cost you can support, and state what it includes. Include failed attempts in the flight's total. Avoid double-counting a burn cost that is already included there; explain the relationship in the body.

If usage is bundled into a subscription, record that fact and any allocation method. Do not present an invented per-run price as a metered charge. If exact cost is unavailable, keep a working note with “unknown” outside publishable frontmatter. The current log format needs a measured numeric cost before submission. Never substitute zero. Zero means a supported zero, not “I did not check.”

Treat “time saved” as an estimate unless you measured a comparable baseline. State the baseline and subtract the time you actually spent supervising and correcting.

## Choose the outcome against the brief

| Outcome | What it means |
| --- | --- |
| `landed` | The agreed deliverable passed its acceptance checks |
| `partial` | Useful work exists, but part of the agreed result remains unmet |
| `aborted` | The run stopped without completing the agreed deliverable |

An aborted flight can still demonstrate good judgment. If the input lacked required evidence and the agent stopped correctly, record both facts. Do not mark a draft “landed” because it looks finished when its essential claims remain unverified.

For each burn, record what happened, the recovery, and the supported direct cost. Include near misses in the narrative when a control prevented harm. An empty burn list means none were observed, not that the workflow cannot fail.

## Make the lesson reusable

Describe the reins as they actually operated: scope, budget, stop mechanism, and autonomy. Distinguish an instruction from an enforced control. “Worked on a branch” describes organization; it does not establish filesystem or credential isolation.

End with one change you would make next time. “Better prompting” is too broad. “Require a source row for every reported discrepancy” tells another rider what to try.

This illustrative handoff structure is useful in the log body:

```text
Intended result:
Artifact and evidence:
Acceptance checks: [passed, failed, not run]
Changes and external actions:
Human review and recovery time:
Remaining uncertainty:
Next-flight change:
```

Before sharing, remove secrets, private customer material, and identifiers that should not be public. Link to evidence only when its audience may access it. Keep sensitive receipts privately and explain any necessary redaction.

The [first-flight lesson](/training/your-first-flight/) ends with this record. Reuse the [training kit](/training/kit/) so logging stays short enough that you keep doing it.
