---
title: "Evals: how a rider keeps a dragon accountable"
chapter: 7
description: "Repeatable checks of an agent's work — golden sets, assertions, judges — and the loop that makes them count."
updated: 2026-09-27
draft: false
---

## What an eval is

An eval is a repeatable check that your agent produced the right output. Not "it worked once while I watched." A check you can run again tomorrow, after the model updates, after you loosen the reins.

Every eval has the same anatomy: an input, an expected outcome, a scorer, and a pass or fail. The input is the task as the agent receives it. The expected outcome is what right looks like, written down before the run. The scorer is whatever compares the two — a string match, a script, a second model, or you. The pass or fail gets recorded, dated, and kept.

If any of the four is missing, it isn't an eval. It's a vibe.

## Why it matters for riders

You will not be watching every flight. That is the point of riding: the dragon works while you do something else. An eval is how you stay accountable for work you didn't watch, and how the dragon stays accountable to you.

The bond chapter says loosen the reins on evidence. Evals are the evidence. A rider with a pass rate loosens the reins on numbers; a rider without one loosens them on mood. This is a discipline, not a chore — the same discipline as logging: nobody trusts a flight that wasn't logged, and nobody should trust an output that was never checked twice.

## Types of evals

Four kinds cover almost everything. Pick the cheapest one that would catch the failure you fear.

- **Golden-set regression.** A fixed set of inputs with known-good outputs, run after every change to the prompt, the model, or the reins. When output drifts, you hear it from the set, not from whoever found it in production.
- **Rule-based checks.** Deterministic assertions: the JSON parses, the schema validates, the file compiles, the forbidden string is absent. Cheap, fast, no judgment involved. Start here.
- **LLM-as-judge.** A second model scores what rules can't: tone, correctness, completeness. Useful and fallible — judges drift too, so anchor them with the next kind.
- **Human spot-check.** You, reading a sample on a schedule. Slowest and most honest. Use it to calibrate the other three, not to replace them.

## Writing your first eval

Take a task your agent already does every week. Not a new one — one with real stakes and real examples.

1. Collect 3–5 real inputs from past flights.
2. For each, write down what a right answer is. Be concrete. If you can't write it down, you can't check it, and neither can a scorer.
3. Write the scorer. A dozen lines of assertions beats an elaborate judge on day one.
4. Run the agent against all of them. Record the pass rate.

That number — 3 of 5, whatever it is — is your baseline. It is allowed to be bad. It is not allowed to be unknown.

## Practicing the loop

The eval is not the discipline. The loop is: write the eval, run the agent, check the pass rate, adjust the prompt or the reins, run it again.

One pass through the loop proves you can write an eval. Ten passes, with the pass rate moving, prove you can ride. Keep the number from every run: a pass rate tracked over time tells you when a change helped, when it burned something else, and when the mount shifted under you.

## Field checklist

- At least one eval file per active agent workflow?
- Re-run after every meaningful change — prompt, model, reins?
- Tracking the pass rate over time, not pass/fail once?

Three yeses and you are flying instrumented. Anything less is trusting vibes at altitude.

## Exercises

Do one this week. Log it as a flight.

1. Write an eval for your most-used agent task: 3–5 real inputs, expected outcomes, a scorer. Record the baseline pass rate.
2. Take a flight that burned. Turn the burn into a test case that would have caught it, and add it to your set.
3. Run your set before and after your next prompt change. Log both numbers and what changed.
