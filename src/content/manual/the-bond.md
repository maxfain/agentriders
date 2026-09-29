---
title: "The bond: how to give an agent more room, one flight at a time"
chapter: 3
description: "Earning trust between a rider and a mount, and when the reins can loosen."
updated: 2026-09-29
draft: false
---

## Trust a workflow, not a personality

The bond is a record of what a particular setup can do under particular conditions. It belongs to the task, inputs, instructions, model, tools, and review process together.

An agent that reliably summarizes sanitized support tickets has not thereby earned permission to issue refunds. A model update, new connector, or different customer segment may change the evidence you need. Confidence from one workflow does not automatically transfer to another.

The useful question is precise: **what can this setup do without my intervention, and how will I notice when it cannot?**

## Separate the kinds of freedom

Autonomy has several dimensions. The agent might work for longer, read more material, edit more files, or act without a final review. Each change affects a different failure surface.

Keep those choices separate. Removing a review gate while increasing the dataset and adding a new tool makes it hard to identify why the next flight changed.

| Stage | Agent responsibility | Rider responsibility |
| --- | --- | --- |
| Observe | Analyze approved inputs and propose a plan | Check understanding and evidence |
| Prepare | Produce a draft or patch in a review space | Inspect the artifact and run checks |
| Execute within bounds | Perform a limited, authorized operation | Monitor exceptions and verify outcomes |
| Repeat within bounds | Run the proven workflow on eligible inputs | Sample outputs, review metrics, handle exceptions |

This is a planning ladder, not a rank system or a guarantee. Some actions should keep human approval even when the preparation becomes highly reliable.

## Measure what you would otherwise miss

Before expanding access, define the failures that matter. An output can be polished and still cite the wrong source, silently omit records, or change something outside scope.

Track more than completion:

- Acceptance checks passed, with the number attempted.
- Missing or unsupported claims found during review.
- Out-of-scope actions attempted or performed.
- Human correction and recovery time.
- Cost per accepted result, including failed attempts.
- Cases where the agent correctly stopped for help.

A well-timed escalation is useful behavior. Do not reward an agent for always returning an answer if the correct action is to report missing evidence.

Use representative inputs, awkward cases, and examples that previously failed. Keep some evaluation cases separate from those used to revise the instructions. The [evals chapter](/manual/evals/) explains repeatable checks; the log records what those checks actually found.

## Use a promotion record

Write a short decision before granting more room:

```text
Workflow and version:
Current permissions:
Evidence reviewed: [runs, inputs, checks, exceptions]
Proposed change: [one boundary]
New failure exposure:
Monitoring and review owner:
Conditions that restore the earlier limit:
Next review date:
```

Do not make “ten successful flights” a universal rule. Ten nearly identical easy cases say little about a rare, costly failure. Match the evidence to the consequence and variety of the work. When you cannot observe errors reliably, keep the scope narrow.

Illustrative example: an operator has an agent prepare inventory corrections for review. The next step could be permitting updates to a small set of test records, with before-and-after values captured. It need not be permission to edit the entire live inventory. The proposed step should answer one question the earlier flights could not.

## Tighten the reins without drama

Return to the earlier limit when acceptance rates fall, review time rises, the input changes, or an important control fails. Preserve the evidence and identify what changed. Update the brief, tool configuration, or checks, then rerun the relevant cases.

Do not solve a failed permission boundary by adding another emphatic sentence to the prompt. Fix the execution control. Do not solve missing information by encouraging confident guesses. Add the source or require escalation.

“Grounded” means the affected workflow pauses while you repair it. It need not mean abandoning every useful task the agent performs.

Take the [longer-leash lesson](/training/earn-the-longer-leash/) when you have a workflow worth expanding. Keep the promotion record in your [training kit](/training/kit/), alongside the flight logs that justify it.
