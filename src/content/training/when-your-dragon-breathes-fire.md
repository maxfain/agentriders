---
title: "When your dragon breathes fire"
order: 4
description: "Stop a bad run, preserve the evidence, and turn one failure into a check that survives the next revision."
duration: "35-minute exercise"
level: "Rider"
art: "yard"
outcome: "A burn report, a bounded repair, and a regression case that catches the original mistake."
download: "/training/burn-report.md"
weakPrompt: |
  You changed the wrong records. Fix everything and keep going.
strongPrompt: |
  Stop processing new work. Do not retry writes or attempt repairs.
  Report the run ID, attempted actions, confirmed changes, uncertain
  outcomes, and the last known-good checkpoint. Preserve the available
  action log without exposing secrets. Propose a bounded recovery plan
  for review, including what evidence is needed before any retry.
  Do not resume until I authorize the specific recovery action.
---

## Stop adding uncertainty

When a run goes wrong, your first job is to prevent the next unwanted action. Diagnosis comes after containment.

Use the stop mechanism you identified in the [harness lesson](/training/build-the-harness/). Pause the job and its schedule. If it can still act through a connected service, disable the relevant access while you assess the situation. Confirm that the run has stopped; a frozen interface is not confirmation.

Keep the available record of inputs, outputs, action IDs, timestamps, and errors. Avoid copying secrets or unnecessary personal data into your report. If this involves a real security incident, use your organization’s incident process and responsible owner. This lesson is a practice method for small workflow failures, not a substitute for that process.

## Separate known changes from guesses

An agent saying “the update failed” does not establish that nothing changed. A request can time out after a service has accepted it. Retrying immediately may repeat the action.

Create three lists:

- **Confirmed:** changes you can verify in the destination system or saved artifact.
- **Attempted:** actions in the log whose outcome you have not established.
- **Untouched:** items you have positive evidence were outside the run.

Keep unknown outcomes visibly unknown. Check the destination using the action or record identifier when possible. If the service supports safe duplicate prevention for a particular operation, use its documented mechanism; do not assume every write is safe to repeat.

## Worked example: the doubled import

*Illustrative failure in a disposable sample workspace.*

An operator asks an agent to create ten draft tasks. The tool times out after the first batch. The agent retries all ten. The workspace now contains fifteen drafts: five from the first attempt and ten from the retry.

The operator stops the workflow and saves the action log. She compares source item IDs with the actual draft records. That produces a concrete inventory: ten distinct source items, five duplicated destinations, fifteen destination IDs.

She does not issue “delete the extras” against the entire workspace. She proposes removal of the five confirmed duplicate IDs, checks that they are still disposable drafts, and authorizes that bounded action. If ownership or state is unclear, those records wait for review.

The immediate repair restores the sample workspace. The workflow repair adds a check of destination state after an uncertain response and a supported way to avoid repeating the same operation. The two repairs are recorded separately.

A generic “be careful with retries” instruction would leave the failure mechanism intact.

## Find the smallest useful explanation

Avoid blaming a personality trait: “the agent got lazy,” “the model was confused.” Ask which part of the setup made the mistake possible.

Was the required source missing? Was the stop condition ambiguous? Did a tool return an unclear result? Could a broad permission turn one mistaken choice into several writes? Did a check accept the wrong thing?

You may have more than one contributing factor. Record the strongest supported explanation and the evidence still missing. You do not need a perfect theory before preventing the same action from repeating.

Change one relevant part of the setup, then run the failed case again in a disposable environment. Also run the nearby successful cases. A fix that prevents all writes may stop duplicates while making the task impossible.

## Your exercise

Use a past low-impact failure or construct one with sample data. Do not create a real incident to practice. Complete the [burn report](/training/burn-report.md): intended outcome, observed behavior, timeline, confirmed impact, unknowns, containment, recovery, and prevention.

Make a regression case that would have caught the original failure. For the import example, simulate an uncertain result after some draft records exist. The check should reject duplicate destination records for the same source item.

Run the check against the faulty setup or a saved faulty output first. It must fail for the right reason. Then apply the bounded fix and rerun. Save both outcomes. Label simulated results as simulated when you share the log.

## Pass criteria

You can account for the affected artifacts, distinguish confirmed impact from possible impact, and show a check that catches the original mistake. The repair has a named reviewer. Resuming the workflow is a separate decision, with a clear scope.

**Common pitfalls:** letting the agent improvise cleanup; repeating an uncertain write; deleting evidence during recovery; declaring a root cause without support; recording only the cost of the repair while omitting review time.

Continue with [Earn the longer leash](/training/earn-the-longer-leash/). Keep the [Burns chapter](/manual/burns/) and [Evals chapter](/manual/evals/) linked from your report.

**Further reading:** Anthropic’s [evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) discusses inspecting actual outcomes and turning observed failures into evaluation cases. The sample import incident above is invented for this exercise.
