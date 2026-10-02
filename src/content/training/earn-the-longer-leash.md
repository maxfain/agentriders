---
title: "Earn the longer leash"
order: 5
description: "Expand one permission at a time, using evidence from the actual workflow and a clear way to pull it back."
duration: "40-minute exercise"
level: "Rider"
art: "wing"
outcome: "A written autonomy decision with evidence, limits, monitoring, and a rollback trigger."
download: "/training/autonomy-review.md"
weakPrompt: |
  You've done a great job. From now on, handle all incoming requests
  automatically and only bother me if something seems wrong.
strongPrompt: |
  Propose draft classifications for this week's request sample.
  We are evaluating permission to apply one internal label to requests
  matching the documented eligibility rule. That permission is not yet
  granted. Report case-level results, disagreements, review time, and
  critical failures against our acceptance set. Keep ambiguous cases
  for human review. Do not send messages or change ownership.
---

## Trust attaches to a workflow

An agent that summarizes documents well has not thereby earned permission to change customer records. Evidence from one task supports a decision about that task, under a particular setup.

Name the setup in your log: model or product, instructions, tools, input type, and relevant permissions. A meaningful change can invalidate old assumptions. Keep the useful history, but rerun the checks affected by the change before expanding access.

The bond is earned through observable work. It is also reversible. Reducing autonomy after a failure is ordinary maintenance, not a punishment.

## Pick the next permission precisely

“Work independently” is too broad to review. “Apply the internal billing label to eligible tickets, up to twenty per day, with an audit trail” is a decision you can examine.

Use a simple progression for one operation:

1. **Suggest:** produce a recommendation with evidence.
2. **Prepare:** create a draft or proposed change for review.
3. **Execute with approval:** perform the exact action after an enforced approval.
4. **Execute within limits:** perform the permitted action under verified controls, with monitoring and a stop mechanism.

These are workflow stages, not Guild ranks. A Wingleader may keep a consequential operation at the suggestion stage indefinitely. Faster approval is not always the right goal.

Before moving a stage, ask what new harm becomes possible, whether the action can be reversed, and who will notice a mistake. Define the acceptance bar before looking at the latest results. The bar depends on the consequences; there is no universal pass rate that makes an agent safe.

## Worked example: internal ticket labels

*Illustrative review with invented numbers, not a performance claim.*

An operator has twenty historical tickets labeled by a human. The agent proposes labels in a shadow run: it records recommendations but does not change the live queue. Eighteen match the reference, one is wrong, and one appropriately asks for review because the ticket covers two topics.

Calling that “ninety percent accurate, ready to automate” skips the decision. The operator examines which case failed. The error put a billing issue into a low-priority category. That matters more than a harmless difference between two equivalent internal labels.

She narrows the proposed permission: apply only the billing label when a defined billing condition is present; never change priority or ownership. Ambiguous cases remain in review. She revises the checks and evaluates additional examples, including mixed-topic tickets.

If the evidence later supports a limited rollout, she starts with a capped batch, verifies the first results, and retains a way to undo the label changes. Sending replies and changing priority remain separate permissions with separate evidence requirements.

The improvement is a better-shaped responsibility, not a larger claim about intelligence.

## Measure the work left for you

Track more than task completion. Record review minutes, corrections, escalations, critical failures, and the cost of running the workflow where available. Compare like with like: the same kind of input, the same quality standard, and the same definition of completion.

An agent that drafts quickly but creates a long correction queue may not save time. An agent that correctly declines uncertain cases may be doing useful work even when its automatic completion rate is lower.

Look at the cases behind the aggregate. Keep the denominator visible. A small sample can reveal obvious problems; it cannot establish a reliable rate for rare failures. Continue sampling after release, especially when the input mix changes.

## Your exercise

Open the [autonomy review](/training/autonomy-review.md). Choose one existing workflow and propose exactly one additional permission. Document the current evidence, unresolved failures, possible consequences, enforcement mechanism, and who owns the decision.

Write two triggers: one that would justify a limited trial, and one that would immediately reduce or suspend access. Include a review date. If evidence is missing, your next action is a shadow run or more evaluation, not promotion.

Run the relevant acceptance cases and inspect the actual artifacts. Decide **hold**, **limited trial**, or **reduce access**. Give a short reason tied to the evidence. Record the decision even when no permission changes.

## Pass criteria

The proposed permission is narrow, the evidence concerns the same task and setup, and the failure response is executable. Someone other than you could read the review and understand why access was held, expanded, or reduced.

**Common pitfalls:** treating a successful demo as a track record; transferring trust between unrelated tasks; measuring only average quality; expanding several permissions together; keeping autonomy after the setup changes without review.

Next, [Command a wing](/training/command-a-wing/). See [The bond](/manual/the-bond/) and [Logging a flight](/manual/logging-a-flight/) for the continuing record.

**Further reading:** Anthropic’s [evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) explains repeated trials and the distinction between capability checks and regression checks. This lesson’s autonomy stages are an AgentRiders planning framework, not a certification.
