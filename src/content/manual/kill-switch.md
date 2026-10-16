---
title: "Kill switch for an AI agent: five reins that stop the run, and a test for each"
kind: "guide"
seoTitle: "AI agent kill switch: five ways to stop a run"
description: "A kill switch for an AI agent is a stop condition plus a mechanism that enforces it. Five mechanisms, a harmless test for each, and one logged burn."
summary: "A kill switch for an AI agent is a stop condition plus a mechanism outside the model that enforces it. Five mechanisms work: a process or session kill, a hook that blocks the tool call, an approval gate before side effects, a turn or budget cap, and revoking the credential. Fire each on a harmless run before trusting it."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
lastVerified: 2026-10-16
sources:
  - https://code.claude.com/docs/en/permissions#permission-system
  - https://code.claude.com/docs/en/permissions#manage-permissions
  - https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder
  - https://code.claude.com/docs/en/permission-modes#actions-no-mode-auto-approves
  - https://code.claude.com/docs/en/interactive-mode#general-controls
  - https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm
  - https://code.claude.com/docs/en/headless#background-tasks-at-exit
  - https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs
  - https://code.claude.com/docs/en/hooks
  - https://code.claude.com/docs/en/cli-reference
  - https://cursor.com/docs/enterprise/llm-safety-and-controls
  - https://cursor.com/docs/reference/keyboard-shortcuts
  - https://cursor.com/docs/agent/hooks
  - https://cursor.com/docs/agent/security/run-modes
  - https://cursor.com/docs/cli/headless
  - https://cursor.com/docs/account/billing/spend-limits
  - https://forum.cursor.com/t/hard-stop-for-long-running-cloud-agents/158635
  - https://developers.openai.com/codex/hooks
  - https://developers.openai.com/codex/cli/slash-commands
  - https://developers.openai.com/codex/changelog
  - https://github.com/openai/codex/blob/main/codex-rs/tui/src/keymap.rs
  - https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs
  - https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs
  - https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs
  - https://github.com/openai/codex/blob/main/codex-rs/features/src/feature_configs.rs
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/nonInteractiveCli.ts
---

Every harness has an interrupt key. Fewer have a kill switch. The difference is whether you have fired it and watched what stopped.

[Chapter one](/manual/before-the-first-flight/) says know how to cancel a run before you need to. Here is how: five mechanisms, a test for each, one logged burn. Every flag and key for all four mounts sits in one table on [the comparison page](/manual/scope-cap-kill-compared/); this page is about firing them.

## What is a kill switch for an AI agent?

A kill switch is a stop condition plus a mechanism outside the model that enforces it.

"Stop if you see X" in a prompt is a condition with no mechanism; [Reins](/manual/reins/) calls that an instruction, not enforcement. The vendors agree: Claude Code enforces permission rules outside the model ([source](https://code.claude.com/docs/en/permissions#permission-system)); Cursor calls rule-based steering not a safety net ([source](https://cursor.com/docs/enterprise/llm-safety-and-controls)). Both last verified 2026-10-16.

| Mechanism | What it stops | What it does not stop |
| --- | --- | --- |
| 1. Process or session kill | The run and its children | Remote jobs, scheduled work, sent side effects |
| 2. Tool-level hook | One matching call, or the loop | Calls it never sees; runs with hooks off |
| 3. Approval gate | The named side effect, until a person says yes | Anything already auto-approved |
| 4. Turn or budget cap | The loop at the number | Overshoot past the cap |
| 5. Credential revocation | Every action needing the token | Local writes; what already happened |

## Does killing the process stop the run?

Ending the process is the first and bluntest stop, and it works only if you hit the right one.

Interactive stop keys, last verified 2026-10-16:

| Mount | Key | What it stops | Source |
| --- | --- | --- | --- |
| Claude Code | `Esc` | The response or tool call mid-turn; work done so far is kept | [interactive mode](https://code.claude.com/docs/en/interactive-mode#general-controls) |
| Cursor (IDE) | `Cmd+Shift+Backspace` | Generation. `Cmd+Backspace` rejects changes; it does not cancel | [keyboard shortcuts](https://cursor.com/docs/reference/keyboard-shortcuts) |
| Codex CLI | `Esc` | The active turn. `Ctrl+C` or `/exit` ends the session | [keymap.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/keymap.rs), [slash commands](https://developers.openai.com/codex/cli/slash-commands) |
| Gemini CLI | `Ctrl+C` | The current request. `Ctrl+K` kills the background shell | [keyboard shortcuts](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md) |

Headless is different. SIGTERM to `claude -p` exits 143. It kills the process tree of any running Bash command, runs only `SessionEnd` hooks and records no result; send SIGINT first for a clean end ([source](https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm), last verified 2026-10-16). A finished turn can still wait on background work for 10 minutes by default ([source](https://code.claude.com/docs/en/headless#background-tasks-at-exit)). `codex exec` turns Ctrl+C into `turn/interrupt` ([source](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs)). Gemini's headless run installs a Ctrl+C handler only when stdin is a TTY; piped, a signal is the stop ([source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/nonInteractiveCli.ts)). Cursor's CLI has no documented stop flag: not verified.

**Logged burn.** In [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/), the only published flight, a dev-server kill script repeatedly matched and killed the agent's own shell (exit 144), stalling test runs. Recovery: kill from a file and by port, not an inline process-name pattern. The log prices the burn at $0 direct; the stalls sit inside the flight's 5 hours, and its $550 is an estimate on a subscription plan ([how we count](/data/methodology/)). A kill by name kills whatever matches, including the runner.

**Test it.** Start a run that only sleeps. Fire the stop. Check the process list and the port: children gone, the runner alive, nothing queued.

## Can a hook block the tool call?

A hook runs outside the model before each tool call and can refuse it.

Block signals, last verified 2026-10-16:

| Mount | Hook and block signal | Where it fails open | Source |
| --- | --- | --- | --- |
| Claude Code | `PreToolUse`: `permissionDecision: "deny"`, or exit 2 with the reason on stderr | A timed-out hook passes unless `"onFailure": "block"` (v2.1.295+) | [hooks](https://code.claude.com/docs/en/hooks) |
| Cursor | `beforeShellExecution`: exit 2 blocks | Any other non-zero exit lets the action proceed | [hooks](https://cursor.com/docs/agent/hooks) |
| Codex CLI | `PreToolUse`: `permissionDecision: "deny"`, or exit 2 with the reason on stderr | What a timed-out hook does: not verified | [hooks](https://developers.openai.com/codex/hooks) |
| Gemini CLI | `BeforeTool`: exit 2, `{"decision": "deny"}`, or `{"continue": false}` to stop the whole loop | Non-JSON stdout defaults to allow | [hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md) |

Two traps. A crashed hook can fail open, as the Cursor and Gemini defaults show. And a run can start with hooks off. In Claude Code, `disableAllHooks` turns off every hook except managed ones; `--bare` skips hooks, skills, plugins, MCP servers and CLAUDE.md, and whether managed hooks survive `--bare` is not verified ([source](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)). Codex turns hooks off with `[features] hooks = false` ([source](https://developers.openai.com/codex/hooks)). Gemini's hooks do not load at all in an untrusted folder ([source](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md)).

**Test it.** Illustrative: a hook that denies `touch probe.txt`. Run a task that tries it; confirm the file is absent and the reason reached the agent. Then make the hook exit 1 and run again: that is your fail-open behaviour, written down.

## Does an approval gate stop the side effect?

An approval gate halts the run at the named action and waits for a person.

[Reins](/manual/reins/) says the approval must name the action: destination, diff, records. What each mount gates, and what the gate becomes with nobody at the saddle, last verified 2026-10-16:

| Mount | The gate | Unattended | Source |
| --- | --- | --- | --- |
| Claude Code | `ask` rules: never auto-approved in any mode, including `bypassPermissions`; deny beats ask beats allow | `--permission-prompts none` denies anything that would prompt; with `--output-format stream-json`, denials appear as `permission_denied` messages and in the result's `permission_denials` | [modes](https://code.claude.com/docs/en/permission-modes#actions-no-mode-auto-approves), [rule order](https://code.claude.com/docs/en/permissions#manage-permissions), [headless](https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs) |
| Cursor | Run Mode. The Auto-review classifier is "best-effort convenience, not a security boundary"; a `beforeShellExecution` hook can return `ask` | `agent -p` writes files only with `--force`; what a headless prompt becomes: not verified | [run modes](https://cursor.com/docs/agent/security/run-modes), [hooks](https://cursor.com/docs/agent/hooks), [headless](https://cursor.com/docs/cli/headless) |
| Codex CLI | `approval_policy = on-request` (default) prompts only to escalate out of the sandbox | `codex exec` sets `approval_policy = never` unless `approvals_reviewer = "auto_review"` is configured; then a reviewer subagent, not a person, answers escalations | [exec](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs), [config](https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs) |
| Gemini CLI | Policy `ask_user`, the default for write tools | Headless treats `ask_user` as deny | [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md) |

Unattended, a gate becomes a denial, and a denial is still a stop. Headless Codex is the exception: nobody is asked, the sandbox holds, and the failed escalation goes straight back to the model ([source](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)).

**Test it.** In Claude Code, put an `ask` rule on `Bash(git push *)`. Run a harmless commit task. Confirm the prompt names the push, decline, check the remote.

## Is a turn cap or budget cap a stop condition?

A cap ends the run when a number is reached, finished or not.

Per-run caps, last verified 2026-10-16:

| Mount | Cap | At the limit | Source |
| --- | --- | --- | --- |
| Claude Code | `--max-turns <n>`, `--max-budget-usd <amount>`; print mode only | The turn cap exits with an error. The dollar cap checks a client-side estimate that spend can pass, so leave headroom | [CLI reference](https://code.claude.com/docs/en/cli-reference) |
| Cursor | None per run documented; a team USD limit in Dashboard > Spending stops the next request | Absence inferred from forum requests: not verified | [spend limits](https://cursor.com/docs/account/billing/spend-limits), [forum](https://forum.cursor.com/t/hard-stop-for-long-running-cloud-agents/158635) |
| Codex CLI | No turn or spend flag; experimental `[features.rollout_budget] limit_tokens` | The changelog says it aborts the turn when exhausted; key names in flux | [feature_configs.rs](https://github.com/openai/codex/blob/main/codex-rs/features/src/feature_configs.rs), [changelog](https://developers.openai.com/codex/changelog) |
| Gemini CLI | `model.maxSessionTurns` (default -1, unlimited) | Headless exits 53 | [headless](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md) |

An account-level spend limit stops the next run, not this one, and an alert is not a cap ([Build the harness](/training/build-the-harness/)). More at [/manual/spend-cap/](/manual/spend-cap/).

**Test it.** Set `--max-turns 2` on a `claude -p` task that needs 5. Confirm the non-zero exit and read what the result says.

## Does revoking the credential stop the agent?

Revoking the token stops every action that needs it, including ones you did not foresee. It is the fifth rein and the backstop.

[Burns](/manual/burns/) puts this in minutes zero to two: if the agent can still act, remove the access at the service. The flight above ran Cloudflare through a scoped API token (logged); rotating it would end the agent's reach without touching the account (inference; the flight did not exercise it). Revocation does not undo what was sent or stop local writes that need no token.

**Test it.** Give a harmless run a throwaway token to a test resource and revoke it mid-run. The next call should fail, and the run should report that, not hunt for another credential.

## How do you know the kill switch works?

A kill switch you have not fired on a harmless run is an instruction, not a control.

For each mechanism, record what stopped, what kept going, the exit code or denial reason, and who can fire it. Mark it enforced, instruction only, or not verified in your bridle ([harness lesson](/training/build-the-harness/)). Then fill the `kill_switch` field when you [log the flight](/logs/template/); per-tool detail: [the comparison page](/manual/scope-cap-kill-compared/).

## Questions riders ask

**How do I stop a Claude Code run?** Interactive: `Esc` interrupts the response or tool call. Headless: SIGINT ends the turn cleanly; SIGTERM exits 143 and kills the process tree. Then check for background work. Last verified 2026-10-16.

**What is a stop condition for an agent loop?** A rule that ends the loop whether or not the task is done: a turn count, a spend estimate, a blocked action, a person's decision. Something outside the model must enforce it: `--max-turns`, a denying hook, an `ask` rule.

**Is telling the agent to stop a kill switch?** No. It is a condition with no mechanism, and the vendors say so in their own docs. Fire the real mechanism on a harmless run before you count on it.
