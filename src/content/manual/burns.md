---
title: "Burns: what goes wrong, what it costs, what to do in the first ten minutes"
chapter: 4
description: "Reading a burn while it happens, and the first ten minutes after."
updated: 2026-09-29
draft: false
---

## Stop the loss before explaining it

A burn can be wasted review time, an unusable artifact, a duplicate action, or damage to a shared system. The response should match the consequence. A weak draft needs correction. An agent still making unauthorized changes needs containment.

The first ten minutes are for regaining control and establishing facts. They are not a promise that every incident can be repaired in ten minutes. Use your organization's incident process when customer data, credentials, payments, or production systems are involved.

## Minutes zero to two: contain

Cancel the active run using the harness's actual controls. Check for queued jobs, scheduled retries, child processes, and other workers that may continue separately. If the agent can still take harmful actions, remove the affected access through the relevant account or service controls.

Do not assume closing the chat cancels an external job. Confirm the job state where it executes. For an uncertain write or payment request, check whether it succeeded before retrying it; an interrupted response does not prove the action failed.

Preserve the current state where practical. Avoid a broad cleanup command that destroys logs or overwrites other people's changes. If the scope is beyond your authority or expertise, bring in the system owner immediately.

## Minutes two to five: establish the facts

Make a short incident note. Record what you can verify, and label the rest unknown.

```text
Detected at:
Run and workflow version:
Last confirmed safe state:
Observed action and evidence:
Systems or records potentially affected:
Execution stopped? [confirmed / not confirmed]
Access contained? [confirmed / not confirmed]
Unknowns:
Owner and next check:
```

Inspect tool receipts, diffs, job records, and service audit logs. The agent's explanation can suggest where to look, but it is not proof of what happened. Preserve relevant evidence in an access-controlled location; do not spread sensitive content into a public log while documenting the incident.

Distinguish a bad proposal from an executed action. A proposed deletion caught by an approval gate is a useful near miss. A completed deletion requires a different recovery plan.

## Minutes five to ten: choose recovery

Choose the smallest recovery that restores the intended state without adding new damage. Review it with the appropriate owner before execution when consequences are material.

| What happened | First recovery question |
| --- | --- |
| Local file changed | Can I restore the affected change without losing other work? |
| Shared records changed | Do I have reliable before-values and exact record identifiers? |
| External message sent | Who owns correction, and what can actually be retracted? |
| Credential exposed | Has access been revoked or rotated through the service owner? |
| Duplicate operation suspected | What does the destination system confirm already happened? |

A Git revert can help recover tracked code. It does not undo an email, restore an external database, or revoke a leaked credential. Match recovery to the system that experienced the side effect.

## Repair the cause you can demonstrate

After containment, reconstruct the sequence: instruction, input, decision, tool call, result, missed check. Resist explanations that jump straight to “the model hallucinated.” Identify the actionable gap.

Illustrative failure: an agent imports the same test records twice after a timeout. A useful repair might include checking the destination before retrying and using the destination's supported duplicate-prevention mechanism. “Be more careful” does not establish whether the first import completed.

Change the smallest relevant part of the workflow. Add a regression case that represents the burn. Test the recovery and the revised workflow in an appropriate test environment before restoring access. Record which checks passed and what remains uncertain.

## Close the burn honestly

Log direct charges, damaged or lost work, and recovery time separately. Use estimates only when labeled; leave unknown costs unresolved instead of calling them zero. Explain the control you changed and the evidence required to resume.

A useful burn report helps the next rider recognize the condition earlier. Practice with a harmless failure in [When your dragon breathes fire](/training/when-your-dragon-breathes-fire/), then keep the incident note from the [training kit](/training/kit/) close to your actual stop controls.
