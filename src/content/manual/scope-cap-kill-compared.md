---
title: "Four mounts, four sets of reins: scope, cap and kill a run in Claude Code, Cursor, Codex CLI and Gemini CLI"
kind: "guide"
seoTitle: "Permissions compared: Claude Code, Cursor, Codex"
description: "Permissions, approval prompts, hooks, caps, sandbox, stop keys and session logs in Claude Code, Cursor, Codex CLI and Gemini CLI. Verified 2026-10-16."
summary: "AI agent permissions, run caps and kill switches differ across Claude Code, Cursor, Codex CLI and Gemini CLI. Claude Code has allow, ask and deny rules and a per-run dollar cap in print mode. Codex sandboxes by default and fails closed. Gemini CLI ships a turn cap and a policy engine. Cursor uses a classifier, hooks and team spend limits."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
lastVerified: 2026-10-16
sources:
  - https://code.claude.com/docs/en/permissions#manage-permissions
  - https://code.claude.com/docs/en/permissions#permission-system
  - https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder
  - https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in
  - https://code.claude.com/docs/en/permission-modes#actions-no-mode-auto-approves
  - https://code.claude.com/docs/en/permission-modes#eliminate-prompts-with-auto-mode
  - https://code.claude.com/docs/en/permission-modes#common-setups
  - https://code.claude.com/docs/en/permission-modes#skip-all-checks-with-bypasspermissions-mode
  - https://code.claude.com/docs/en/cli-reference
  - https://code.claude.com/docs/en/hooks
  - https://code.claude.com/docs/en/sandboxing
  - https://code.claude.com/docs/en/sandboxing#sandbox-modes
  - https://code.claude.com/docs/en/interactive-mode#general-controls
  - https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm
  - https://code.claude.com/docs/en/sessions#where-transcripts-are-stored
  - https://code.claude.com/docs/en/data-usage#data-retention
  - https://cursor.com/docs/agent/security/run-modes
  - https://cursor.com/changelog/auto-review
  - https://cursor.com/docs/reference/permissions
  - https://cursor.com/docs/cli/reference/permissions
  - https://cursor.com/docs/agent/hooks
  - https://cursor.com/docs/account/billing/spend-limits
  - https://forum.cursor.com/t/hard-stop-for-long-running-cloud-agents/158635
  - https://cursor.com/docs/reference/sandbox
  - https://cursor.com/docs/agent/tools/terminal
  - https://cursor.com/docs/reference/keyboard-shortcuts
  - https://cursor.com/docs/cli/headless
  - https://forum.cursor.com/t/allow-storing-conversation-history-inside-the-project-directory/160515
  - https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs
  - https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs
  - https://developers.openai.com/codex/rules
  - https://developers.openai.com/codex/concepts/sandboxing/auto-review
  - https://developers.openai.com/codex/hooks
  - https://github.com/openai/codex/blob/main/codex-rs/hooks/src/lib.rs
  - https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs
  - https://github.com/openai/codex/blob/main/codex-rs/features/src/feature_configs.rs
  - https://developers.openai.com/codex/concepts/sandboxing
  - https://github.com/openai/codex/blob/main/codex-rs/utils/cli/src/shared_options.rs
  - https://github.com/openai/codex/blob/main/codex-rs/tui/src/keymap.rs
  - https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs
  - https://github.com/openai/codex/blob/main/codex-rs/rollout/src/list.rs
  - https://developers.openai.com/codex/cli/reference
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/config.ts
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/sandboxConfig.ts
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md
  - https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/nonInteractiveCli.ts
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
---

Last verified 2026-10-16: Claude Code docs; Cursor docs and the 3.6 changelog, via search excerpts of the official pages; Codex source at commit a45b8cc (release 0.163.0); Gemini CLI docs on `main` (0.64.0). Not verified marks what no official page confirmed.

Doc-derived, no winner picked: which flag, which file, what happens at the limit. Each mount enforces its reins differently; the rider still writes them down and fires each one once. [Reins](/manual/reins/) says what to write down; [the kill switch](/manual/kill-switch/) how to test the stop.

Changelog: 2026-10-16, first version.

| Rein | Claude Code | Cursor | Codex CLI | Gemini CLI |
| --- | --- | --- | --- | --- |
| Scope (allow, deny) | `permissions.allow`, `ask`, `deny` in settings.json; deny wins; `--allowedTools`, `--disallowedTools` | IDE `terminalAllowlist`, `mcpAllowlist`, no denylist. CLI `permissions.allow`, `deny` in `.cursor/cli.json` | `.rules` files, `prefix_rule` allow, prompt or forbidden; most restrictive wins | Policy Engine `[[rule]]`: `decision` allow, deny, ask_user; `priority` |
| Approval prompts | `--permission-mode` default, acceptEdits, plan, auto (interactive default, v2.1.283+), dontAsk, bypassPermissions; `ask` always prompts | Run Mode: Auto-review (default since 3.6), Allowlist, Run Everything | `approval_policy` on-request (default) or never; `approvals_reviewer = "auto_review"` | `--approval-mode` default, auto_edit, plan, yolo; `security.disableYoloMode` |
| Hooks, stop mechanism | `hooks` in settings.json; `PreToolUse` deny or exit 2; `Stop` hook; `--bare` skips | `hooks.json`; `beforeShellExecution` allow, deny, ask; exit 2 blocks; `stop` event | PreToolUse, Stop, Interrupt among 12 events; deny or exit 2; `[features] hooks = false` | `hooks` in settings.json; `BeforeTool`; exit 2 blocks; `{"continue": false}` stops the loop |
| Budget, turn caps | `--max-turns`, `--max-budget-usd`, print mode only; spend can pass the cap | None per run: not verified. Team USD limit in Dashboard > Spending | No turn or dollar flag; experimental `[features.rollout_budget] limit_tokens` | `model.maxSessionTurns` (default -1); headless exit 53; no dollar cap |
| Sandbox | Off by default; `sandbox.enabled: true`; shell commands only (Bash, PowerShell, Monitor); Seatbelt or bubblewrap; fails open unless `failIfUnavailable` | `.cursor/sandbox.json` `mode`: workspace_readwrite (default), workspace_readonly, insecure_none; network blocked | `--sandbox` read-only (enum default; a trusted directory defaults to workspace-write), workspace-write, danger-full-access; network off; fails closed | Off by default; `-s`, `GEMINI_SANDBOX=docker`, `tools.sandbox`; container or Seatbelt profile |
| How to stop a run | `Esc`; `Ctrl+X Ctrl+K` stops subagents; headless SIGINT, then SIGTERM (exit 143); `claude stop <id>` | `Cmd+Shift+Backspace` (IDE). Cloud Agents cancel, CLI stop: not verified | `Esc`; `Ctrl+C` or `/exit` quits; `codex exec` Ctrl+C sends `turn/interrupt` | `Ctrl+C`; `Ctrl+K` kills the background shell; headless non-TTY needs a signal |
| Session logs | `~/.claude/projects/<project>/<session-id>.jsonl`; 30 days (`cleanupPeriodDays`) | `~/.cursor/chats/`, `~/.cursor/projects/<path>/agent-transcripts/`: not verified | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; `--ephemeral` skips; retention: not verified | `~/.gemini/tmp/<project_hash>/chats/`; `sessionRetention.maxAge` 30d |
| Unattended mode | `claude -p --permission-mode dontAsk --allowedTools ...`; `--bare`; `--dangerously-skip-permissions` (container only) | `agent -p --force` (alias `--yolo`) writes files; `CURSOR_API_KEY` | `codex exec` forces `approval_policy = never`; `--sandbox workspace-write` to edit; `--yolo` bypasses all | `-p`; `ask_user` becomes deny; `--approval-mode=auto_edit`, yolo, or allow rules; `--skip-trust` |

## Which permission rules scope what the agent may do?

All four mounts have an allowlist; the Cursor IDE is the only surface with no documented denylist.

Claude Code evaluates deny, then ask, then allow; an allow can never carve an exception out of a deny ([manage permissions](https://code.claude.com/docs/en/permissions#manage-permissions)), and a Bash deny is not a security boundary ([CLI reference](https://code.claude.com/docs/en/cli-reference)). Codex takes the most restrictive matching decision ([rules](https://developers.openai.com/codex/rules)); Gemini CLI the highest `priority`, Admin tier first ([policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)). Cursor's deny arrays live only in the CLI's `cli.json` ([IDE permissions](https://cursor.com/docs/reference/permissions), [CLI permissions](https://cursor.com/docs/cli/reference/permissions)).

## When does each tool prompt for approval?

Every mount can prompt before a side effect, but who answers by default differs: a person in Gemini CLI, a classifier in Claude Code's auto mode (v2.1.283+) and Cursor's Auto-review, and in Codex nobody until a command tries to leave the sandbox.

Claude Code's interactive sessions start in `auto` mode on v2.1.283+, where a classifier reviews actions and hands back to a person after 3 blocks in a row or 20 in total ([auto mode](https://code.claude.com/docs/en/permission-modes#eliminate-prompts-with-auto-mode), [starting mode](https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in)). `ask` rules prompt in every mode, even `bypassPermissions` ([actions no mode auto-approves](https://code.claude.com/docs/en/permission-modes#actions-no-mode-auto-approves)). Cursor's Auto-review hands unlisted calls to a classifier that Cursor calls "best-effort convenience, not a security boundary" ([run modes](https://cursor.com/docs/agent/security/run-modes), [3.6 changelog](https://cursor.com/changelog/auto-review)). Codex prompts only to escalate out of the sandbox, and `approvals_reviewer = "auto_review"` routes that to a subagent ([protocol.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs), [auto-review](https://developers.openai.com/codex/concepts/sandboxing/auto-review)). Gemini CLI's shipped policy sends write tools to `ask_user` ([policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)); YOLO is command-line only, and `security.disableYoloMode` makes it a fatal config error ([CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md), [config.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/config.ts)).

## Can a hook block a tool call or stop the loop?

All four mounts run command hooks before a tool call, and three of them fail open in at least one documented case.

Blocking is near-uniform: exit code 2, or a JSON deny ([Claude Code hooks](https://code.claude.com/docs/en/hooks), [Codex hooks](https://developers.openai.com/codex/hooks), [Gemini CLI hooks](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)); Cursor's `beforeShellExecution` blocks on exit 2 but other non-zero exits proceed ([Cursor hooks](https://cursor.com/docs/agent/hooks)). Fail-open: Gemini CLI treats non-JSON stdout as allow; a timed-out Claude Code hook passes unless `"onFailure": "block"` (v2.1.295+); `--bare` and `disableAllHooks` skip hooks ([before you trust a folder](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)). Claude Code and Codex `Stop` hooks can refuse to let the agent stop, capped at 8 continuations in Claude Code ([Claude Code hooks](https://code.claude.com/docs/en/hooks), [hooks/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/lib.rs)).

## Which tools have a turn cap or budget cap per run?

Two of the four mounts ship a per-run cap: Claude Code caps turns and dollars in print mode and Gemini CLI caps turns, while Codex has only an experimental token budget and Cursor documents none (not verified).

Claude Code's dollar cap is a client-side estimate that spend can pass, so leave headroom ([CLI reference](https://code.claude.com/docs/en/cli-reference)). Gemini CLI's headless run exits 53 at the turn limit ([headless](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)). Codex's `[features.rollout_budget]` is experimental, key names in flux ([feature_configs.rs](https://github.com/openai/codex/blob/main/codex-rs/features/src/feature_configs.rs)). Cursor's absence is inferred from a [forum request](https://forum.cursor.com/t/hard-stop-for-long-running-cloud-agents/158635), not verified; its team USD limit stops the next request, not instantly ([spend limits](https://cursor.com/docs/account/billing/spend-limits)). Why an account limit is not a cap: [/manual/spend-cap/](/manual/spend-cap/).

## Is the sandbox on by default, and what does it cover?

Codex sandboxes every command by default and fails closed; Claude Code and Gemini CLI ship with it off; Cursor's depends on Run Mode and the host kernel.

Claude Code's covers Bash, PowerShell and Monitor commands only, not Read, Edit, WebFetch, hooks or MCP; if it cannot start, commands run unsandboxed unless `sandbox.failIfUnavailable: true`, and the model may retry unsandboxed unless `sandbox.allowUnsandboxedCommands: false` ([sandboxing](https://code.claude.com/docs/en/sandboxing), [sandbox modes](https://code.claude.com/docs/en/sandboxing#sandbox-modes)). Codex's `read-only` is the enum default, but a directory with a recorded trust decision defaults to `workspace-write` ([config_toml.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs)); which wins under `codex exec` in a trusted project: not verified. Either way it refuses what it cannot sandbox, and network is off unless `network_access = true` ([sandboxing](https://developers.openai.com/codex/concepts/sandboxing), [protocol.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)). Cursor falls back to approval prompts on an unsupported kernel ([sandbox](https://cursor.com/docs/reference/sandbox), [terminal](https://cursor.com/docs/agent/tools/terminal)). Gemini CLI's configuration page says YOLO enables the sandbox; current source shows no such linkage, so the line is likely stale, not verified at runtime ([configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md), [sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md), [sandboxConfig.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/sandboxConfig.ts)).

## How do you stop a run, interactive and headless?

An interactive stop is one keypress on every mount; a headless stop is a signal, and only Claude Code documents what the signal leaves behind.

Claude Code's `Esc` keeps the work done so far ([interactive mode](https://code.claude.com/docs/en/interactive-mode#general-controls)). Cursor's `Cmd+Backspace` rejects changes; it does not cancel ([keyboard shortcuts](https://cursor.com/docs/reference/keyboard-shortcuts)). Codex's `Esc` can be remapped or unbound under `[tui.keymap.chat]` ([keymap.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/keymap.rs)). Gemini CLI's `Ctrl+C` quits the CLI when the input is empty ([keyboard shortcuts](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md)). Headless: SIGTERM to `claude -p` exits 143, kills the Bash process tree, runs only `SessionEnd` hooks and records no result, so send SIGINT first ([headless](https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm)). `codex exec` turns Ctrl+C into `turn/interrupt` ([exec/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs)). Gemini CLI installs a Ctrl+C handler only on a TTY ([nonInteractiveCli.ts](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/nonInteractiveCli.ts)). Cursor's CLI stop and Cloud Agents cancel endpoint: not verified. A test for each mechanism, and the one logged misfire, a kill script that matched the agent's own shell (exit 144): [the kill switch](/manual/kill-switch/).

## Where are session logs stored, and for how long?

Claude Code, Codex and Gemini CLI record every session under their home directories; Claude Code and Gemini CLI delete after 30 days by default, Codex retention is not verified, and Cursor's paths are not verified.

Claude Code's format is internal and unsupported for parsing; use `--output-format json` or the hook's `transcript_path` ([sessions](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored), [data retention](https://code.claude.com/docs/en/data-usage#data-retention)). Codex `--ephemeral` writes no rollout ([rollout/src/list.rs](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/list.rs), [exec/src/cli.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs)); how long a rollout is kept: not verified. Gemini CLI's record includes tool inputs, outputs and token counts ([session management](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md)). Cursor's paths come from staff forum replies, format undocumented ([forum](https://forum.cursor.com/t/allow-storing-conversation-history-inside-the-project-directory/160515)). Whatever the mount keeps, the [log template](/logs/template/) asks for the run log you keep yourself.

## What does unattended mode auto-approve?

Unattended, every mount turns a prompt into a denial or a yes, and the flag you pass decides which.

Claude Code: pass `--permission-mode` explicitly, because a `-p` run's built-in default can be `auto` ([starting mode](https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in)). Its `--dangerously-skip-permissions` is for a container or VM only ([bypassPermissions](https://code.claude.com/docs/en/permission-modes#skip-all-checks-with-bypasspermissions-mode)). Codex: `codex exec` hard-codes `approval_policy = never` ([exec/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs)), and `--yolo` is marked "EXTREMELY DANGEROUS" in source, for externally sandboxed environments only ([shared_options.rs](https://github.com/openai/codex/blob/main/codex-rs/utils/cli/src/shared_options.rs)). `--full-auto` is gone ([CLI reference](https://developers.openai.com/codex/cli/reference)). Gemini CLI: headless turns `ask_user` into deny ([policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)), and an untrusted folder throws unless you pass `--skip-trust` ([trusted folders](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md)). Cursor: `agent -p` writes files only with `--force` ([headless](https://cursor.com/docs/cli/headless)). With nobody at the saddle, the [harness lesson](/training/build-the-harness/) records both columns: what you asked, what the flag enforces.

## Questions riders ask

**Claude Code vs Cursor: how do permissions and sandbox differ?** Claude Code has allow, ask and deny rules in settings.json and an opt-in OS sandbox for shell commands only (Bash, PowerShell, Monitor). Cursor's IDE has allowlists, no denylist, a sandbox where it can and a classifier for the rest; deny rules exist only in its CLI. Verified 2026-10-16.

**Does Codex CLI run in a sandbox by default?** Yes. `read-only` is the enum default; a directory you have trusted defaults to `workspace-write` (config_toml.rs). Which wins under `codex exec` in a trusted project: not verified. Network stays off unless `network_access = true`, and it fails closed where the platform cannot enforce it. `--yolo` removes both. Verified at release 0.163.0.

**What is Gemini CLI YOLO mode and how do I turn it off?** `--approval-mode=yolo` auto-approves every tool call; `--yolo` is deprecated, and `Ctrl+Y` toggles it in a session. It cannot be set in settings. `security.disableYoloMode: true` or `admin.secureModeEnabled: true` makes YOLO a fatal config error. Verified 2026-10-16.
