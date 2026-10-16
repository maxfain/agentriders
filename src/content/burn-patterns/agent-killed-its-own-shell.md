---
title: "The dragon killed its own shell"
seoTitle: "AI agent kill script killed its own shell"
description: "A process-name kill pattern matched the shell running the agent and stopped it mid-test (exit 144). Signals, first ten minutes, recovery and reins."
summary: "An agent's stop mechanism can terminate the agent itself when the kill command matches by process-name pattern and the invoking shell's own command line contains that pattern. The run stalls instead of stopping cleanly. In the logged example the kill script killed the agent's shell with exit 144; the fix ran the kill from a file and by port."
pattern: "agent-killed-its-own-shell"
plain_name: "self-terminating stop mechanism (kill pattern too broad)"
status: logged
logged_examples: [shipped-agentriders-phase-2]
related_chapter: "reins"
related_lesson: "build-the-harness"
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
---

## What is a kill script that kills the agent?

A self-terminating stop mechanism is a kill script whose target pattern also matches the process running it, so it stops the agent as well as, or instead of, its target. In guild terms, the dragon swung at a process and hit its own shell. In plain terms, the kill pattern was too broad.

One shape is `pkill -f <pattern>` passed inline. The `-f` flag matches each process's full command line. The harness runs that command through a shell whose own command line contains it. The shell is a match. It dies; nothing after the kill runs.

The [burn](/glossary/#burn) is in the harness, not the model.

## How do you know the kill script hit the agent itself?

The clearest signal is a tool call that exits abnormally with no output after the kill line.

- The shell exits abnormally right after a `pkill`, `killall` or `kill $(pgrep ...)` line. The logged example returned exit 144.
- The target may still be alive, its port still busy.
- The agent retries the same command and gets the same result.
- `pgrep -af <pattern>` lists the agent's own shell.

Two identical abnormal exits are enough. Read the command, not the explanation.

## The first ten minutes: stop the loop before fixing the script

The first job is to stop the retry loop with the harness's real controls, before anyone edits the kill script.

**Minutes zero to two: contain.** Cancel the run with the harness's actual control, not with another kill command. Check whether the pattern also matched something you wanted alive. Confirm the server's state by its port, not by the kill's exit code.

**Minutes two to five: establish the facts.** Record the exact command, the exit code and what `pgrep -af <pattern>` matches. The kill executed; the test run did not. Use [the burns chapter](/manual/burns/) incident note; label unknowns as unknown.

**Minutes five to ten: choose recovery.** The smallest recovery restarts the server and re-runs the tests once, with a kill that cannot match itself. Do not widen the pattern or add a `sleep` and hope.

## How do you recover from a kill script that killed the agent?

Recovery means a stop mechanism whose command line does not contain its own target, verified against the port it was meant to free.

1. Move the kill into a file and run it as `bash kill-dev.sh`. The pattern leaves the invoking shell's command line.
2. Target a port or a PID written at start, not a name; a name matches whatever mentions it.
3. Verify at the destination: the port is free. A clean exit from the script proves nothing.
4. Add a regression case: run the kill with nothing to kill. The script exits cleanly; the calling shell survives.

Re-run the tests once; if they stall again, the cause is elsewhere. Record time lost separately from charges.

## Which permissions, budgets and kill switches prevent it?

The rein that prevents this pattern is a kill mechanism scoped to a port or a PID, enforced by the shape of the command, not by a sentence in the prompt.

| Rein | Concrete setting | Enforcement or instruction |
| --- | --- | --- |
| Scope | Kill by port or PID file; name patterns only inside a script file | Enforcement: the invoking shell cannot match |
| Budget | A retry limit on the test loop; the third identical failure goes to the rider | Enforcement if the harness counts; instruction if only the prompt does |
| Kill switch | The harness cancel and the merge gate, never a script the agent runs | Enforcement: outside the agent's process tree |
| Autonomy | Server lifecycle stays autonomous; repeated failure must surface, not loop | Instruction, unless the harness escalates |

"Do not kill your own shell" in a prompt changes nothing; a kill script that takes a port is a control. [Reins](/manual/reins/) draws that line and [Build the harness](/training/build-the-harness/) tests it. The rider's own stop is covered in [kill switch](/manual/kill-switch/) and [Before the first flight](/manual/before-the-first-flight/).

## The logged example: a dev-server kill script, exit 144

This pattern is logged once, in [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/): rider maxcr, mount Claude Code, harness "Claude Code on the web (cloud session)", 2026-10-16, outcome landed.

| Field | As logged |
| --- | --- |
| What | "A local dev-server kill script repeatedly matched and killed the agent’s own shell (exit 144), stalling test runs." |
| Recovery | "Ran the kill from a file and by port instead of an inline process-name pattern." |
| Cost | `cost_usd: 0` |

The log does not name the command; the `pkill -f` above is one possibility, not a quote from the flight.

The flight's kill switch as logged: "on — human merges each milestone PR manually; secrets and infra changes gated on the owner". The log does not record that rein being used in this burn.

## Questions riders ask

Riders bring three questions to this pattern.

**Why does `pkill -f` match the agent's shell?** Because `-f` matches every process's full command line, and an inline pattern is part of the invoking shell's. A pattern inside a file is not.

**Is this a kill-switch failure or a scope failure?** A scope failure inside the agent's stop mechanism: its scope included the process that invoked it. The rider's kill switch is separate; the log does not record it being used.

**How should I log it?** As a burn: exit code, command shape, time lost, charges separate. Fill in the [burn report](/training/kit/burn-report/), then practice the first ten minutes in [When an agent fails](/training/when-an-agent-fails/).
