---
title: "Before the first flight: scope, budget, kill switch"
chapter: 1
description: "What to set before an agent touches real work."
startHere: true
updated: 2026-09-29
draft: false
---

## Give the flight an ending

An agent needs a destination that another person can recognize. “Improve onboarding” is a direction. “Review these twenty sanitized onboarding notes and produce a table of repeated obstacles, with a source for each” is a task.

Before you open the saddle, write the deliverable, the evidence that will make it acceptable, and the actions that are outside the assignment. A useful first flight produces something you can inspect before it changes anyone else's work.

Here, **training your agent** means improving its instructions, context, tools, and checks. It does not necessarily mean changing the model's weights. You are also training yourself to delegate work that has a clear finish.

## Pick work you can judge

Choose a task you understand well enough to review. Keep the input small enough that you can compare the output with the original. If the agent is analyzing customer notes, read several yourself first. If it is fixing a bug, reproduce the bug before asking for a patch.

These are illustrative first flights, not reported results:

| Your work | A useful first assignment | Hold for human review |
| --- | --- | --- |
| Founder | Compare three supplied proposals against a written rubric | Vendor selection and outreach |
| Engineer | Reproduce one bug and propose a tested patch | Merge and deployment |
| Operator | Identify duplicate rows in a copied export | Changes to the live system |

Avoid bundling research, judgment, and external action into the first run. Learn whether the agent can produce dependable evidence before you delegate the decision that evidence supports.

## Write the landing conditions

Use this brief before the flight. Replace every bracket; an unfilled field is a decision you have deferred.

```text
Outcome: [one artifact, in one location]
Inputs: [approved files, records, or sources]
Acceptance: [checks a reviewer can repeat]
Allowed actions: [specific reads and writes]
Approval required: [named external or consequential actions]
Limits: [time, spending, attempts, records]
Stop and report: [conditions that require escalation]
Handoff: [artifact, evidence, uncertainties, changes made]
```

For the onboarding example, acceptance might require a source identifier for every obstacle, a distinction between observation and inference, and an explicit “insufficient evidence” when the notes do not support a conclusion. Do not demand a fixed number of findings when the inputs may contain fewer.

The [landing lesson](/training/teach-it-where-to-land/) turns this brief into a reviewable contract.

## Prepare the ground

Use a copied dataset, test account, or isolated workspace appropriate to the task. Remove unnecessary sensitive material before the run. Confirm which credentials and connectors the agent can actually use.

A Git branch keeps code changes organized. It does **not** stop a process from reading other files, making network requests, or using credentials available to it. Those boundaries belong in the harness and the underlying access controls. A sentence saying “do not touch production” is not a production access restriction.

Keep enough of the starting state to recover: a known commit, an export, or a tested backup. Identify the person who can approve the next stage. For shared systems, establish who owns recovery before granting write access.

## Budget the attention, too

Set a timebox and a spending limit appropriate to the task. Treat prompt-level limits as instructions; enforce them through available runtime or provider controls where possible. If a hard cap is unavailable, stay present and monitor usage.

Include your review time in the budget. A fast draft that takes longer to repair than to write has not yet saved you time. Set a retry limit so repeated failure becomes a question, rather than an unattended loop.

Know how to cancel the run and any scheduled or background work it starts. Stopping the conversation may not stop a separate job. Inspect the harness's controls before you need them.

## Pre-flight check

- Can I describe the finished artifact in one sentence?
- Can I independently check the important claims or changes?
- Do the actual permissions match the written scope?
- Do I know when to stop, and how to stop execution?
- Is there a recovery path and a named reviewer?

If those answers are clear, take [your first flight](/training/your-first-flight/). Keep the reusable brief in your [training kit](/training/kit/). Log what happened before expanding the assignment.
