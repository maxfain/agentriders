---
title: "Teach it where to land"
order: 2
description: "Define success before the run. Build checks that catch convincing work that is still wrong."
duration: "35-minute exercise"
level: "Fledgling"
art: "workbench"
outcome: "A small acceptance set that distinguishes usable results from polished failures."
download: "/training/acceptance-checks.md"
weakPrompt: |
  Write good responses to these support tickets. Be accurate and helpful.
strongPrompt: |
  Draft responses to the five sample tickets using policy-v3.md only.
  Each response must acknowledge the specific issue, state only options
  supported by the policy, and include the relevant policy section.
  If eligibility is unclear, ask for the missing information. Do not
  promise refunds, invent account facts, or send any response.
  Return each draft with its unresolved questions. I will score policy
  accuracy, evidence, and usefulness separately before accepting it.
---

## Make “good” observable

“Accurate, concise, and helpful” expresses taste. It does not tell you whether an agent completed the work. Acceptance checks translate the goal into things a reviewer can see.

For a sales research table, “every company has an official source” is observable. “Find promising companies” still needs a definition. For a code change, a test can establish that a behavior works, but not that every design decision is sound. For a support draft, policy compliance and tone deserve separate checks.

Write the checks before reading the output. Otherwise, a fluent answer can quietly lower your standard. You start accepting what it gave you instead of what you needed.

## Separate hard failures from quality

Start with three kinds of checks:

- **Must be true:** required fields exist, arithmetic reconciles, cited facts are supported, the requested behavior works.
- **Must not happen:** unauthorized writes, unsupported promises, invented sources, changes outside the agreed scope.
- **Should be good:** clear organization, useful prioritization, appropriate tone, enough explanation for the intended reader.

Treat a critical boundary violation as a failure even when the prose is excellent. Do not average it away with five style points. At the same time, avoid exact wording requirements when several different answers would be valid.

For each check, name the reviewer or mechanism: a schema validator, a calculation, a targeted test, a human reading the source. A second model can help review subjective work, but its agreement is not independent proof of truth. Check its judgments against your own examples before relying on them.

## Worked example: the refund draft

*Illustrative scenario, not a measured deployment.*

An operator builds a draft-only support workflow. The sample policy permits refunds within thirty days when the stated conditions apply. The test set contains five synthetic tickets: clearly eligible, clearly ineligible, missing purchase date, contradictory dates, and a request to ignore the policy.

For the missing-date case, the expected behavior is a question. The agent should not guess a date to finish the answer. For contradictory dates, it should identify the conflict and request clarification. The tempting failure is a warm, confident refund promise.

The operator uses this acceptance table:

| Check | Pass condition | Reviewer |
| --- | --- | --- |
| Policy | No option contradicts the supplied policy | Human against policy |
| Unknowns | Missing or conflicting dates remain unresolved | Human against ticket |
| Evidence | The named policy section supports the response | Human opening section |
| Delivery | A draft exists; no message was sent | Tool configuration and action log |
| Usefulness | Customer gets a specific next step | Human rubric |

Suppose the draft says “your refund is approved” on the missing-date case. Mark that case failed. The fix is not just “be more careful.” Add an explicit eligibility rule, rerun the case, and check that the change has not broken the clearly eligible example.

## Build a small set with sharp edges

Choose several inputs you understand well. Include a normal case, an incomplete case, an ambiguous case, and a case that should trigger a stop or escalation. These are practice cases, not a statistical claim about production reliability.

Write the expected behavior without requiring a single exact answer. “Ask for purchase date; do not promise eligibility” is stronger than one approved sentence the agent must reproduce.

Keep a few later examples out of the prompt while you improve it. Otherwise, you may only learn whether the agent can repeat the demonstrations. When your workflow changes, rerun the same checks and record the setup version beside the result.

## Your exercise

Download the [acceptance checks](/training/acceptance-checks.md). Take the mission from [Your first flight](/training/your-first-flight/) and create five small test cases. Write at least one critical check and one quality check for each.

Run the current setup on all five. Review every result. Change one instruction or input description, then rerun the set. Record passed cases out of attempted cases, critical failures separately, review time, and anything you could not verify. If results differ across repeats, preserve that variation rather than selecting the best run.

## Pass criteria

Your checks catch a deliberately flawed example, accept a valid alternative phrasing, and identify the missing-information case. You can explain why each case passed or failed using evidence beyond the agent’s own verdict.

**Common pitfalls:** writing checks after seeing answers; using the agent’s confidence as a score; testing only easy inputs; hiding severe failures inside an average; assuming five passes establish broad reliability.

Next, [Build the harness](/training/build-the-harness/). The [Evals chapter](/manual/evals/) explains how these checks become a maintained practice.

**Further reading:** Anthropic’s [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) distinguishes tasks, trials, graders, and outcomes. Our five-ticket exercise is a starting design, not a validated benchmark.
