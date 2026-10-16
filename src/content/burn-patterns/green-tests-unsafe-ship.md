---
title: "The burn that landed green"
seoTitle: "AI agent tests passed, code still unsafe to ship"
description: "A false-negative test suite: AI agent code that passes every test and still carries an IDOR or stored XSS. Signals, first ten minutes, recovery, reins."
summary: "A false-negative test suite is a green test run that never checks the property that matters, so agent-written code passes every test and is still unsafe to ship. In the one logged case, 38 passing tests missed an IDOR and a stored XSS; an adversarial review before merge caught both, at a logged recovery cost of $0."
pattern: "green-tests-unsafe-ship"
plain_name: "false-negative test suite (security gap behind passing tests)"
status: logged
logged_examples: [shipped-agentriders-phase-2]
related_chapter: "evals"
related_lesson: "teach-it-where-to-land"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is a false-negative test suite?

A false-negative test suite is a green test run that never asserts the property that would have failed. The code passes every test and is still unsafe to ship: nothing asked whether a second user could reach the record, or whether stored input came back as live HTML. Riders call it a burn that lands green: the rider ships what nobody checked.

A mount that writes code and tests in one session puts the same blind spot in both. "All tests pass" becomes the closing message, and the closing message becomes the merge decision.

## How do you know the passing tests missed something?

The signal is not in the test output; it is in what the tests do not say.

- Every test runs as one principal; none tries to edit another user's record.
- No test feeds hostile input and checks it comes back escaped.
- Test names describe features, not boundaries: "edit saves changes", never "edit refuses another owner".
- The agent cites the green run as proof of safety.
- The diff crosses a trust boundary with no test there.

## What do you do in the first ten minutes?

A green-but-unsafe change is handled like any [burn](/manual/burns/): contain, establish the facts, choose the smallest recovery.

**Contain (minutes zero to two).** Unmerged: block the merge and keep the agent from "quickly fixing" it on the same branch. Deployed: take the affected path out of service first.

**Establish the facts (minutes two to five).** Write the incident note: bad proposal or executed action? In production, check the audit logs for use of the path and list the records a second principal could reach or that hold untrusted content.

**Choose recovery (minutes five to ten).** Revert or disable first; patch forward second. Bring in the system owner when customer data was reachable. Practice on a harmless failure in [When an agent fails](/training/when-an-agent-fails/).

## How do you recover from code that passed tests but is unsafe?

Recovery means fixing every trust boundary of the same kind, not only the one the reviewer found.

One missing ownership check implies the same gap on every sibling path; one raw-HTML render implies it wherever that field is shown. Fix them as a set; re-verify end to end with a second principal.

Then write the test that should have failed: the wrong user is refused the edit; a hostile payload renders as text. The [evals chapter](/manual/evals/) calls this turning a burn into a regression case. The [burn report](/training/kit/burn-report/) records two repairs: the code fix, and the adversarial pass now required before merge; the second is the rein.

## Which permissions, budgets and kill switches prevent it?

No permission stops a false negative; the reins can only keep a green run from being the merge decision. [Build the harness](/training/build-the-harness/) labels each one enforced or instruction.

- **Scope.** Feature-branch PRs into `main`: a branch is not a sandbox ([Reins](/manual/reins/)), but a PR is a review space. Enforced by branch protection; "work on a branch" is an instruction.
- **Acceptance checks.** Every trust boundary ships with a must-not-happen case: a second principal is refused, hostile input is escaped ([Teach it where to land](/training/teach-it-where-to-land/)). Enforced when CI blocks the merge; "write secure code" is an instruction.
- **Kill switch.** "Tests green" is never the only merge condition ([Kill switch](/manual/kill-switch/)). Add a review pass briefed to break the change. Enforced by required review; self-review is an instruction.
- **Budget.** A [spend cap](/manual/spend-cap/) does not catch this; budget review time instead.
- **Autonomy.** No auto-merge on a green run.

## The logged example: 38 green tests, one IDOR, one stored XSS

This pattern is logged once, in [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), a five-hour Claude Code flight by maxcr on 2026-10-16 that landed with three burns. The first, as logged:

> **What:** The first M2 submission pipeline reached the review stage with an IDOR (any rider could hijack or lock another rider’s published log through the edit path) and a stored XSS (rider markdown rendered as raw HTML).
>
> **Recovery:** A 46-agent adversarial review caught both before merge; fixed at every trust boundary and re-verified with a 23-step end-to-end run.
>
> **Cost:** $0

Its lesson, as logged: "Tests pass" is not "safe to ship": agent-written code needs an adversarial review pass before merge — ours caught an IDOR and a stored XSS that 38 green tests missed.

The merge gate held, and the review pass was the enforcement. Direct cost is logged as $0; review time is not broken out. The same flight logged [wrong principal](/burns/wrong-principal/) and [agent killed its own shell](/burns/agent-killed-its-own-shell/).

## Questions riders ask

Three questions riders bring to this pattern.

**Does high test coverage prevent this?** No. Coverage counts lines executed, not properties asserted. A suite can cover every line of an edit path as one user and never ask whether a second is refused.

**Can the agent review its own code?** The session that wrote the gap shares the assumptions behind it. Use a separate pass briefed to break the change, not finish it. Its verdict is not proof; the regression test is.

**Is this a security incident or a burn?** Both, if it reached production; use your organization's incident process. At the merge gate, a near miss. Log it as a [burn](/glossary/#burn) anyway, with what caught it, so the next rider recognizes it sooner.
