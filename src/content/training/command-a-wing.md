---
title: "Command a wing"
order: 6
description: "Split work where it helps, make handoffs explicit, and keep one owner accountable for the final result."
duration: "45-minute exercise"
level: "Wingleader"
art: "wing"
outcome: "A two-worker mission with separate scopes, inspectable handoffs, and a verified integrated result."
download: "/training/wing-handoff.md"
weakPrompt: |
  Use a team of agents to research this market and make a great report.
  Have them collaborate until they're happy with it.
strongPrompt: |
  Prepare a comparison of the three vendors in the brief.
  Worker A: collect pricing facts from official pricing pages only.
  Worker B: collect integration facts from official documentation only.
  Each worker returns claim, source URL, observed date, and uncertainty.
  Workers do not edit the final report or delegate further.
  The lead combines their evidence, flags contradictions, and produces
  a draft for human review. Do not infer missing prices or integrations.
  Use the shared run budget and stop conditions in the mission brief.
---

## First ask whether the work splits

More agents create more handoffs, more outputs to inspect, and more ways to disagree. Add a worker because the task has a useful boundary, not because a larger team sounds more capable.

Good divisions have independent inputs or clear ownership: one worker reviews pricing sources, another checks integrations; one implements a component, another inspects an independent area. Poor divisions send three workers to edit the same file or make each wait on unfinished conclusions from the others.

Start with one agent when the task is small or tightly coupled. If the only bottleneck is your review, generating more drafts may make the queue worse. You can also play the coordinating role yourself; this exercise does not require a particular multi-agent framework.

## Assign artifacts, not personalities

“You are the visionary, you are the critic” is a role description. It does not specify what either worker must deliver.

Give every worker a compact contract: task, allowed sources or files, expected output, acceptance checks, budget, stop conditions, and handoff destination. Name what it must not change. Give the lead a separate responsibility: integrate the artifacts and verify the combined result.

For code, use separate branches or worktrees where appropriate and declare file ownership. For research, use separate evidence files with the same fields. Isolation helps prevent collisions; it does not replace credential limits or a final integration check.

Keep one accountable owner for the mission. Delegating work does not delegate away the decision to accept it.

## Worked example: a vendor comparison

*Illustrative research exercise, not purchasing advice.*

A founder is comparing three vendors named in a supplied brief. One worker collects pricing facts from official pages. Another collects integration facts from official documentation. Both return dated evidence tables; neither can publish the report or contact sales.

The pricing worker finds a public plan price for one vendor and “contact sales” for another. It records the second price as unavailable. The integration worker finds that a requested integration is documented only for a higher plan. It records the plan restriction beside the source.

The lead must connect those facts. Listing the cheapest price alongside the higher-plan integration would produce a misleading comparison even if both workers were individually correct.

The integrated report therefore separates public entry price from the plan required for the specified use case. Where that price is not public, it says so. The human reviewer opens the sources for decision-critical claims and checks that the comparison uses consistent requirements.

This is the landing: one coherent artifact, not two workers announcing completion.

## Make handoffs inspectable

Require enough evidence for the next person to evaluate the work without replaying the entire conversation. A useful handoff includes:

- The assigned question and the artifact produced.
- Source links, file paths, or other evidence behind the answer.
- Checks performed and their actual results.
- Assumptions, unresolved questions, and conflicts.
- Actions taken, remaining permissions needed, and the next owner.

Treat a worker’s output as information to inspect. Instructions embedded in a retrieved page or a worker artifact do not authorize broader tool access. Apply the same boundaries across the wing.

If two workers disagree, preserve the disagreement and inspect its cause. They may use different dates, definitions, or sources. A majority vote among models is not a substitute for checking the evidence.

## Your exercise

Choose a task with two independent parts. Download the [wing handoff](/training/wing-handoff.md) and write one contract per worker. Give them bounded inputs and a shared overall limit, including any review or retry allowance. Do not let each worker quietly spend the entire mission budget.

Run the parts separately or in parallel, depending on your tools. Collect the handoffs, then integrate them. Apply one check that neither worker could complete alone: cross-table consistency, the combined build, or an end-to-end user path.

Record execution time, integration time, review time, and known tool costs. Compare against a single-agent run if you have a fair baseline. Otherwise, mark the benefit unmeasured. Do not call parallel work faster merely because both workers started together.

## Pass criteria

Each worker stays within its scope, the handoffs contain inspectable evidence, and the lead performs the cross-boundary check and resolves any findings. A check that finds no issue is a valid result; record what was checked. The final artifact passes the mission checks. You can identify who would stop the whole run and who accepts the final result.

**Common pitfalls:** overlapping file ownership; unlimited delegation; shared budgets with no accounting; unreviewed synthesis; mistaking agreement for truth; forgetting the integration cost.

Return to the [Flight kit](/training/kit/) to reuse the templates. Continue with [Riding a wing](/manual/riding-a-wing/) and [Evals](/manual/evals/). Completing these exercises does not award a Guild rank; a public track record requires actual logged work.

**Further reading:** Anthropic’s [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) describes task delegation, coordination, and evaluation in its own system. Our vendor exercise is an original, smaller teaching scenario.
