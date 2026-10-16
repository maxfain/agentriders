---
title: "The bridle named the wrong rider"
seoTitle: "AI agent hardcoded the wrong admin identity"
description: "Wrong principal: an AI agent hardcoded an admin allowlist to the wrong handle, nearly locking out the owner. Signals, first ten minutes, recovery, reins."
summary: "A wrong-principal burn is an identity misconfiguration: an agent builds an access rule for an identity that does not match the real account, so the right person is refused. In the one logged case, an admin allowlist was hardcoded to the handle max while the owner had claimed @maxcr; corrected on the branch before merge, logged cost $0."
pattern: "wrong-principal"
plain_name: "wrong principal (identity misconfiguration)"
status: logged
logged_examples: [shipped-agentriders-phase-2]
related_chapter: "reins"
related_lesson: "build-the-harness"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is a wrong principal in an AI agent's permissions?

A wrong principal is an identity misconfiguration: an access rule keyed to an identity that does not match the one the real person signs in with. The control works, for someone who does not exist. The bridle named the wrong rider; the real one cannot take the saddle.

One shape is a literal in the code. The agent needs an admin, takes a name from the repository owner, the brief or a placeholder, and the identity provider issues something else.

Too tight refuses the owner; too loose admits a stranger, which costs more.

## How do you know the access rule names the wrong identity?

The signal is a hardcoded identity on an authorization path.

- A literal handle, email or account ID in an allowlist or role check.
- The gated surface returns 404 or 403 for the person it was built to admit.
- Tests for that path sign in as a fixture the agent also wrote; none uses the identity the owner claimed.

## The first ten minutes: confirm who is refused before you fix it

The first job is to learn which way the rule failed before anyone edits it, in the order [the burns chapter](/manual/burns/) sets.

**Minutes zero to two: contain.** If the rule might admit the wrong person, take the path out of service. If it only refuses the right person, the hazard is the workaround: do not let the agent loosen the rule or mint a second identity to match the code. Unmerged, block the merge.

**Minutes two to five: establish the facts.** Write the incident note. Which identity does the code expect, and which does the auth system issue for the owner? Proposed or executed? If it shipped, read the audit log.

**Minutes five to ten: choose recovery.** The smallest recovery reads the real identity from the system of record and proves it with two sign-ins. Practice on a harmless case in [When an agent fails](/training/when-an-agent-fails/).

## How do you recover from an admin allowlist built for the wrong user?

Recovery means the principal comes from the identity provider and the role from the data layer, verified by the real owner and by a refused second account.

1. Replace the literal with a role the owner sets, read at request time.
2. Sign in as the owner's actual identity and reach the path; sign in as another and be refused.
3. Search for the same string; a hardcoded identity may have siblings.
4. Add a regression case that signs in with the identity the auth system issues. If test and code share an invented handle, they are wrong together.

Log time lost separately from charges in the [burn report](/training/kit/burn-report/).

## Which permissions, budgets and kill switches prevent it?

The rein that prevents this pattern is a split: the agent writes the check but never chooses the principal.

| Rein | Concrete setting | Enforcement or instruction |
| --- | --- | --- |
| Scope | Identity from the auth system; roles in the database, granted by the owner | Enforced if only the owner can grant; "use my handle" is instruction |
| Acceptance check | Owner's real identity admitted and a second account refused | Enforced if CI blocks the merge on it |
| Kill switch | A human merges every PR; a reviewer tries the path as the wrong user | Enforced by required review |
| Budget | No [spend cap](/manual/spend-cap/) catches this; budget review time instead | Instruction |
| Autonomy | Build the gate autonomously; the grant stays with the owner | Enforced if gated on the owner |

[Reins](/manual/reins/) draws that line; [Build the harness](/training/build-the-harness/) marks each boundary enforced, instruction only or not verified. [Teach it where to land](/training/teach-it-where-to-land/) holds the acceptance case; the [kill switch chapter](/manual/kill-switch/) holds the rider's own stop.

## The logged example: an allowlist for max, an owner named @maxcr

This pattern is logged once, in [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/): rider maxcr, mount Claude Code, 2026-10-16, outcome landed. The second of three burns, as logged:

> **What:** The admin allowlist was hardcoded to the handle max, but the owner claimed @maxcr — the admin surface would have 404'd for its own admin.
>
> **Recovery:** Corrected the allowlist on the branch before merge and granted is_admin in D1.
>
> **Cost:** $0

A near miss: corrected on the branch before merge. The log does not say what caught it, nor where the handle max came from. The same flight logged [green tests, unsafe ship](/burns/green-tests-unsafe-ship/) and [the dragon killed its own shell](/burns/agent-killed-its-own-shell/). No other flight has logged this pattern yet.

## Questions riders ask about a wrong principal

Riders bring three questions to this pattern.

**Nobody got in. Is a rule that is too tight really a burn?** Yes. A refused owner is time lost, and the mirror case, a wrong principal admitted, is the same defect. Log it as a [burn](/glossary/#burn) with what caught it.

**Why not change the handle in the code and move on?** Because the literal is the defect, not its value. The next rename or second admin breaks it again.

**Which test would have caught it?** One that signs in as the identity the owner actually claimed and reaches the admin path, plus one that signs in as someone else and is refused.
