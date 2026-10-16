# What the `agentriders` CLI sends

The whole point of a flight record is that it proves you did the work **without
exposing the work.** The CLI reads your Claude Code session log locally and
sends a **metadata-only** record. Your prompts, your code, the files you
touched, and the commands you ran never leave your machine.

## What leaves your machine

Exactly the object `agentriders log` prints under *"This is everything that
leaves your machine"* before it uploads. It contains:

- `v` — record format version.
- `cc_session_hash` — a one-way SHA-256 hash of the session's id. It lets the
  server keep one record per session; it cannot be reversed into anything.
- `started_at`, `ended_at`, `duration_seconds` — when the session ran and for
  how long.
- `models` — the model names used (e.g. `claude-opus-4-8`).
- `tool_call_counts` — how many times each tool ran, by built-in tool **name**
  only (e.g. `{ "Bash": 12, "Edit": 5 }`). Never the arguments. Every MCP tool
  is bucketed to a single `"mcp"` count, so MCP **server and tool names** —
  which can carry project or company identity — never leave the machine.
- `evals` — eval-practice signals: how many test/eval files were created, which
  frameworks were detected, how many eval runs and fix-and-rerun cycles, and the
  change in pass rate. Counts and framework names only.
- `generated_at`, `cli_version` — when and by which CLI version.

The record is signed with your device's key and uploaded to
`https://agentriders.com` (or the server you set via `AGENTRIDERS_API`).

## What never leaves your machine

- Prompts, messages, or any conversation text.
- Source code, file contents, or diffs.
- File paths, directory names, or your project's identity.
- Command text or command output.
- Your private key (`~/.agentriders/key.json`, created with `0600`
  permissions). Only the **public** key is ever sent.

## See it yourself

```
agentriders log <session.jsonl> --dry-run
```

prints the full payload and uploads nothing. The uploaded bytes are exactly
what you see — the signature is computed over that canonical JSON, so it cannot
be altered in transit without breaking verification.

## Deletion

A record is yours. Unlink or delete it any time from
`https://agentriders.com/me/devices`, and revoke a device there to stop it
signing new records.
