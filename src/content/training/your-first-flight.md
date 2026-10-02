---
title: "Your first flight"
order: 1
description: "Turn one real task into a small, reviewable agent run. Learn more from the landing than the launch."
duration: "25-minute exercise"
level: "Fledgling"
art: "yard"
outcome: "A completed mission brief, one reviewed output, and an honest first flight log."
download: "/training/mission-brief.md"
weakPrompt: |
  Look through our customer feedback and tell me what we should build next.
strongPrompt: |
  Read only the five anonymized feedback notes I have attached.
  Produce a table with one row per note: customer ID, reported problem,
  exact supporting excerpt, and missing information. Then suggest up to
  three questions we should investigate. Do not invent frequency or
  recommend a roadmap from this sample. Do not contact customers or
  change any records. If a note is ambiguous, mark it unresolved.
  I will check every row against the source notes before using it.
---

## Choose work you can judge

Your first flight should end with an artifact you can inspect in a few minutes. A draft, a small patch, a comparison table, or a cleaned copy of a file. Choose a task you understand well enough to catch a plausible mistake.

Avoid starting with “run my sales operation” or “improve this entire codebase.” Both hide dozens of decisions. Narrow the first to “classify five sample inbound requests using these three categories.” Narrow the second to “explain this failing test and propose a patch on a separate branch.”

In this series, **training your agent** means configuring its environment, giving useful instructions, checking its work, and improving the setup. You are not necessarily retraining a model or changing its weights. You are practicing a repeatable way to work together. A successful run does not automatically teach the next session what happened; keep the instructions and lessons somewhere you deliberately load again.

## Write a mission that can finish

Use the [mission brief](/training/mission-brief.md). Fill in six fields before opening the session:

- **Outcome:** the artifact you want and who will use it.
- **Inputs:** the exact files, records, or sources available.
- **Scope:** the work included and the adjacent work excluded.
- **Checks:** how you will decide whether the output is usable.
- **Boundaries:** permitted actions, time or cost limit, and stop conditions.
- **Review:** the person who accepts the result and the next authorized action.

Keep the brief short enough to read once. If you need a long explanation of your company, extract the facts this task needs. Your agent does not need every internal document to sort five feedback notes.

Set boundaries in the actual environment, too. A sentence saying “do not send email” is an instruction, not an access control. For this exercise, use local sample files and leave sending tools disconnected. The [harness lesson](/training/build-the-harness/) covers enforcement in depth.

## Worked example: a founder reads feedback

*Illustrative scenario, not a reported customer result.*

A founder has five anonymized interview notes. She wants to choose her next product experiment. Her first instruction asks the agent what to build. That invites a confident roadmap from a tiny, uneven sample.

She changes the deliverable to a source-backed evidence table. One note says, “I export this every Friday because finance needs the totals.” A defensible row records a recurring export task and its excerpt. It does not assert that all finance teams need a new dashboard.

Another note says, “The report takes forever.” The agent should preserve the complaint and mark the cause unknown. Is the report slow to load, difficult to configure, or time-consuming to interpret? That distinction becomes an interview question, not a fabricated answer.

The founder checks all five rows. If a row lacks evidence, she rejects that row. If a suggested question follows from an explicit gap, she keeps it. The useful result is a clearer next conversation, not a premature product decision.

## Run once, then inspect

Keep the first run small enough that you can watch it. Note whether the agent asks a useful question, reaches beyond the inputs, or spends most of its time solving a problem you did not assign.

When it finishes, inspect the artifact itself. “Completed successfully” is the agent’s report; your check is the evidence. Open the file. Compare the rows. Run the relevant check. Record any uncertainty that remains.

If the output fails, change one part of the setup and try again. Adding a source requirement is an identifiable change. Replacing the prompt, model, files, and workflow together makes the lesson hard to recover.

## Your exercise

Choose a recurring task that normally takes you roughly fifteen minutes. Prepare a small, sanitized input. Spend five minutes on the brief, run the task, then spend the remaining time reviewing it. If the run needs longer, stop and record the partial result.

Save the brief, output, corrections, agent setup, and time spent reviewing. Record tool costs if available; mark them unknown if your tool does not expose them. Do not turn “unknown” into zero.

## Pass criteria

You pass when the artifact answers the brief, every critical claim or change survives your check, no unauthorized action occurred, and you can name one specific improvement for the next run. A stopped run can still be a useful exercise if you explain why it stopped. It is not a completed task.

**Common pitfalls:** assigning work you cannot evaluate; providing unnecessary sensitive data; calling a draft “done”; counting generation time while ignoring review time.

Continue with [Teach it where to land](/training/teach-it-where-to-land/). Keep [Before the first flight](/manual/before-the-first-flight/) and [Logging a flight](/manual/logging-a-flight/) beside your brief.

**Further reading:** Anthropic’s [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) explains the value of starting with simple approaches. This lesson’s mission and exercise are AgentRiders teaching examples.
