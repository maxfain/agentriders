---
title: "A branch is not the Yard"
seoTitle: "Git branch is not a sandbox for an AI agent"
description: "False isolation boundary: an AI agent on a git branch or worktree keeps its credentials and network reach. Signals, first ten minutes, recovery, reins."
summary: "A false isolation boundary is the burn where a git branch or worktree is treated as a sandbox for an AI agent while the process keeps its filesystem, network and credentials. Riders call it branch-is-not-a-sandbox. The branch separates diffs for review; it stops no read, request or push. No flight has logged it yet; the example is illustrative."
pattern: "branch-is-not-a-sandbox"
plain_name: "false isolation boundary"
status: illustrative
logged_examples: []
related_chapter: "reins"
related_lesson: "build-the-harness"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is a false isolation boundary around an AI agent?

A false isolation boundary is the [burn](/glossary/#burn) where a git branch or worktree is treated as a sandbox for an AI agent while the process keeps the filesystem, network and credentials it started with. The branch separates diffs for review; it stops no read, request or push. Riders call it branch-is-not-a-sandbox: the branch was taken for the Yard.

[Reins](/manual/reins/) says neither a branch nor a worktree is, by itself, a security boundary; code there still has the filesystem, network and account access of its process. [Chapter 1](/manual/before-the-first-flight/) adds that "do not touch production" is not a production access restriction.

## How do you know the branch was never a sandbox?

The signal is a side effect the diff cannot show.

- The brief's only boundary is a branch name; the bridle's enforcement column is blank.
- The agent's shell inherits the rider's `.env`, cloud login, registry token and push rights.
- A tool receipt shows a request, a push or a write to a system the task never named.

## The first ten minutes: the branch does not contain the run

Containment is about the process, not the branch, as [the burns chapter](/manual/burns/) sets out.

**Minutes zero to two: contain.** Cancel the run through the harness's actual controls; check for child processes, queued jobs and scheduled retries. Closing the chat is not cancellation. If an inherited credential can still act, revoke it at the service that issued it.

**Minutes two to five: establish the facts.** Write the incident note. The diff shows tracked file changes and nothing else; read tool receipts, shell history, service audit logs and the push log instead. The agent's account of its reach is a lead, not proof. Separate confirmed from attempted, as [When an agent fails](/training/when-an-agent-fails/) does.

**Minutes five to ten: choose recovery.** Match the recovery to the system that took the side effect. A git revert restores tracked code; it does not revoke a credential or restore a database.

## How do you recover from an AI agent with false isolation?

Recovery means closing every reach the process had, then logging the burn so the next flight has a real boundary.

1. Confirm the stop, including anything the run scheduled.
2. Rotate or revoke every credential the process could read, through the service owner, unless the audit log proves it unused.
3. Restore each affected system from its own records; log direct charges, lost work and recovery time separately; leave unknown reach unknown, not zero.
4. Mark the branch "instruction only" in the bridle, add the missing boundary, and rerun the [acceptance checks](/training/teach-it-where-to-land/) in the revised setup.

## Which permissions, budgets and kill switches prevent it?

The rein that prevents this pattern is isolation the harness enforces, checked separately for filesystem, network and credentials.

| Rein | Concrete setting | Enforcement or instruction |
| --- | --- | --- |
| Scope | Filesystem and network isolation on; a token scoped to the task; no inherited `.env` or cloud login; the branch kept for review | Enforcement once a harmless probe confirms it; "stay on the branch" is an instruction |
| Budget | A per-run cap on turns or spend; a misplaced reach gets a short window | Enforcement via flag or hook; see [spend cap](/manual/spend-cap/) |
| Kill switch | A stop that cancels the run and revokes its token, tested first | Enforcement once tested; see [kill switch](/manual/kill-switch/) |
| Autonomy | Unattended only after one allowed and one denied action pass in the Yard | Instruction, by design; until then the rider stays present |

A merge gate enforces one thing: what lands in main. The one published log, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), used a human merge on feature-branch PRs and named its Cloudflare credential separately as a scoped API token. It does not record this pattern.

## The illustrative example: a branch with production in reach

No flight has logged this pattern and no chapter narrates it; the scenario below is this page's own composite, built on the rule in [Reins](/manual/reins/) and the pitfall in [Build the harness](/training/build-the-harness/).

An engineer gives an agent a feature branch and one sentence of reins: stay on the branch, do not touch production. The agent complies. It also runs in the engineer's shell, with every credential and network route that shell has, and every command it runs to check its work carries that reach. The diff is clean. The branch did its job, organizing changes for review. Nothing did the other job.

The sourced lines are shorter than the story. [Chapter 1](/manual/before-the-first-flight/): a branch "does not stop a process from reading other files, making network requests, or using credentials available to it." Reins: "Neither is, by itself, a security boundary." Build the harness lists "assuming a branch isolates credentials" among its common pitfalls. [Logging a flight](/manual/logging-a-flight/) records it honestly: "Worked on a branch" describes organization; it does not establish filesystem or credential isolation.

## Questions riders ask about a branch that was not a sandbox

Riders bring three questions to this pattern.

**Is a worktree any safer than a branch?** No. A worktree is a second directory, not a second account. [Reins](/manual/reins/) names them together: neither is a security boundary by itself. [Riding a wing](/manual/riding-a-wing/) adds that worktrees reduce collisions, not credential or network reach.

**My tool has a sandbox setting. Am I covered?** Only for the boundaries it enables. Filesystem and network isolation are separate parts of sandboxing; a feature name does not say which is on. Inspect the configuration, then probe it as [Build the harness](/training/build-the-harness/) drills: one harmless write that should succeed, one that should fail.

**Nothing left the branch. Was it still a burn?** If audit logs show no read, request or write outside the task, it is a near miss: file it in the [burn report](/training/kit/burn-report/) as an instruction-only boundary. Otherwise the reach is unknown, not zero.
