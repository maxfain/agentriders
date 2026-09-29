---
title: "Riding a wing: running several agents without losing the reins"
chapter: 6
description: "Holding the reins on a fleet without becoming the bottleneck."
updated: 2026-09-29
draft: false
---

## Start with a reason to split

A wing is useful when work can proceed independently or needs distinct tools, context, or review. It is less useful when several agents repeatedly wait for each other's unfinished decisions.

Before adding another agent, identify the bottleneck. If the task is ambiguous, more workers can multiply the ambiguity. If a single agent already finishes the work with little review, coordination may add cost without improving the result.

Use a wing to create clear responsibilities. Keep one rider accountable for the whole outcome.

## Divide by deliverable

Assign each worker an artifact with an owner and a definition of done. Make the boundaries visible before work starts.

Illustrative example: a founder needs a decision brief based on supplied vendor proposals. One agent extracts commercial terms, another checks implementation requirements, and a third assembles a comparison against the founder's rubric. Extraction can run in parallel. The comparison depends on those artifacts and waits until they are ready.

The agents are not authorized to contact vendors or select one simply because they contribute to the brief. Scope belongs to each assignment, not to the ambition of the overall project.

For software, divide by independent files or components when practical. Give shared interfaces to a named owner. Two agents editing the same API contract need a coordination plan, even when they use separate branches.

## Give every handoff a contract

Use this structure for each assignment:

```text
Owner and task:
Inputs and their versions:
Deliverable and location:
Acceptance checks:
Allowed actions and actual permissions:
Dependencies:
Budget and retry limit:
Escalate when:
Handoff: evidence, uncertainties, changes, checks performed
```

Require outputs that the next worker can inspect. A table with source identifiers is easier to reconcile than an unsupported paragraph. An exact patch and test output are easier to review than “the bug is fixed.”

Keep task data distinct from authority. A worker's artifact may contain quoted instructions from a source document; those instructions do not become permissions for the next agent. Validate the fields and evidence the handoff requires before using it to trigger further work.

## Keep authority and ownership narrow

Delegate tools according to each worker's role. A research worker may need approved sources and a place to write notes. It does not need the deployment token used by the release workflow.

Branches and worktrees reduce editing collisions; they do not restrict credential access or network destinations. Use the actual harness and account controls described in [Reins](/manual/reins/). Do not copy every credential into every worker simply to make coordination easier.

Name one integrator for shared changes. Workers hand off artifacts; the integrator checks compatibility and resolves conflicts. A reviewer should compare the result with the original acceptance criteria and evidence. A second model agreeing with the first is not independent proof, especially when both rely on the same mistaken source.

## Budget the whole wing

Set an overall budget, then allocate worker limits within it. Include retries, coordination calls, integration, and human review. A per-agent allowance without a fleet limit can expand unexpectedly as workers spawn more work.

Define whether a worker may delegate further. If it may, require the same bounded assignment and a visible record of the new worker. Identify how to cancel the entire workflow, not just the coordinator's conversation.

Establish stop conditions for dependency failure. A missing source, unresolved interface, or conflicting requirement should pause the affected downstream work. Ask for a decision with evidence; do not let each worker invent its own resolution.

## Integrate once, verify together

Review individual artifacts before combining them. Then test the assembled result against the original task: shared assumptions, source consistency, integration behavior, and any external effects still awaiting approval.

Log the whole flight and the contributions that mattered. Compare total cost and human attention with the simpler workflow you started from. Keep the wing only where the extra coordination earns its place.

Practice on a bounded assignment in [Command a wing](/training/command-a-wing/). The [training kit](/training/kit/) gives you a handoff contract to reuse. Expand the formation after the handoffs work, not merely because more agents are available.
