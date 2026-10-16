---
title: "An alert is not a rein"
seoTitle: "AI agent spend alert fired but nothing stopped"
description: "Monitoring mistaken for enforcement: a spend alert fires and the AI agent keeps running. Signals, first ten minutes, recovery and the reins that cap it."
summary: "Monitoring mistaken for enforcement is the burn where a spend alert fires and nothing stops the AI agent: the threshold reports the cost; the run keeps going. Riders say an alert is not a rein; the registry files it as alert-is-not-a-cap. No flight has logged it; the example is illustrative. The fix is a cap that refuses the next request."
pattern: "alert-is-not-a-cap"
plain_name: "monitoring mistaken for enforcement"
status: illustrative
logged_examples: []
related_chapter: "before-the-first-flight"
related_lesson: "build-the-harness"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is monitoring mistaken for enforcement on an AI agent?

The threshold reports the cost; nothing refuses the next request. In the industry's words, that is monitoring mistaken for enforcement: an alert taken for a budget control, so the bill is whatever the loop reached. Riders call it an alert that is not a rein; the burns registry files it as alert-is-not-a-cap. An alert is a gauge, a cap a rein.

[Build the harness](/training/build-the-harness/) draws the line: an alert may warn you after consumption has occurred; a hard cap and a notification are different controls. [Chapter 1](/manual/before-the-first-flight/) agrees: enforce the limit through runtime or provider controls; a prompt-level limit is an instruction.

## How do you know the agent's budget was monitored, not enforced?

The signal is a number that was reached and a run that did not notice.

- The alert arrived after the threshold, and the spend beside it is already higher.
- The budget lives in a prompt, a document or a dashboard email, not in the harness.
- The run, or a job it scheduled, is still live.

## The first ten minutes: stop the run the alert did not stop

The first job is to make the stop real, as [the burns chapter](/manual/burns/) sets out; the alert has already shown the harness will not.

**Minutes zero to two: contain.** Cancel the run through the harness's actual controls, then check for queued jobs, scheduled retries and child processes. Closing the chat is not cancellation; confirm the job state where it executes. If it can still spend, pull the credential.

**Minutes two to five: establish the facts.** Write the incident note: when the alert fired, what billing shows now, whether execution stopped, confirmed or not. Separate work produced before the threshold from work after. Label the rest unknown, as [When an agent fails](/training/when-an-agent-fails/) does.

**Minutes five to ten: choose recovery.** The money is spent; the question is what the run did with it, and whether anything it started still runs.

## How do you recover from an AI agent that ran past its budget?

Recovery means closing the loop that spent the money, then logging the burn so the next flight has a cap.

1. Confirm the stop. Do not move on from "not confirmed".
2. Inspect the work produced after the threshold; keep what passes acceptance checks, discard the rest.
3. Log direct charges, lost work and recovery time separately, as chapter 4 asks, and label estimates; on a subscription plan the charge is a usage window.
4. Before the next flight, add a cap that refuses the next request; the [spend-cap page](/manual/spend-cap/) lists flags, turn caps and counting hooks by mount. Keep the alert as telemetry.

## Which permissions, budgets and kill switches prevent it?

The rein that prevents this pattern is a budget the harness enforces, not one the rider reads about.

| Rein | Concrete setting | Enforcement or instruction |
| --- | --- | --- |
| Budget | A per-run cap that refuses the next request: a dollar or turn flag, or a counting hook | Enforcement; a budget line in the brief is an instruction; a threshold email is neither |
| Kill switch | A stop tested before the flight, for the run and anything it schedules | Enforcement once tested; see the [kill-switch chapter](/manual/kill-switch/) |
| Scope | A flight whose worst case is affordable; a retry limit | Enforcement when the harness bounds attempts; in the brief alone, an instruction |
| Autonomy | Unattended only behind an enforced cap; otherwise stay present and monitor usage | Instruction, by design; the rider is the cap |

[Reins](/manual/reins/) asks for both layers in writing, and an honest blank where there is no control. [The bond](/manual/agent-trust-and-autonomy/) loosens one boundary at a time, never with another emphatic sentence in the prompt.

## The illustrative example: the threshold that fired and did nothing

This example is illustrative, built from [Build the harness](/training/build-the-harness/) and [Chapter 1](/manual/before-the-first-flight/); no flight has logged this pattern, so it carries no figures.

A rider fills in the harness lesson's bridle. The Spend row's rule reads "stop at the configured limit"; in the enforcement column the rider writes the billing alert and marks the row enforced. The run goes unattended. The alert arrives after the threshold, as the lesson says it will. The line beside it is larger, and the run is still live. The console kept its promise. The rider heard a cap.

The lesson's pitfalls name the mistake: confusing a budget alert with a cap. Chapter 1 writes the honest row: if a hard cap is unavailable, stay present and monitor usage.

The one published log, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), flew on `budget: "subscription"`, which marks its cost as an estimate; it does not record this pattern. That is the honest budget line: name what enforced it, or say nothing did.

## Questions riders ask about a spend alert that did not stop the run

Three questions this page answers.

**Isn't a dashboard limit a cap?** Ask what the next request does when the number is reached. If it runs and you get an email, it is an alert. The [spend-cap page](/manual/spend-cap/) lists what each mount enforces, last verified. Test it in a disposable sandbox of your own with a harmless run.

**I put the budget in the prompt. Does that count?** As an instruction, not a control. [Build the harness](/training/build-the-harness/) is blunt about it: a spending limit written in a document does not stop billing. Mark it "instruction only" in the bridle and shrink the flight to match.

**Nothing broke. Is it still a burn worth logging?** Yes. A [burn](/glossary/#burn) is money, data or time lost; this one spent money without a rein. File the [burn report](/training/kit/burn-report/), direct charges and review time logged separately, and name the cap you added.
