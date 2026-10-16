---
title: "What a Verified flight proves, and what it does not"
seoTitle: "Verified AI agent run: what the badge proves"
description: "A Verified flight: an AI agent run whose metadata a registered device signed, the verified part of a rider's track record. What it proves, what it cannot."
summary: "A Verified flight is a published flight log matched to a session record signed by a device the rider registered. The record is metadata only: timestamps, duration, model names, tool-call counts and eval signals. The signature proves a registered device produced the record. It does not prove the numbers are true, and it never changes a rider's rank."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
lastVerified: 2026-10-16
sources:
  - https://code.claude.com/docs/en/sessions#where-transcripts-are-stored
  - https://code.claude.com/docs/en/data-usage#data-retention
  - https://github.com/maxfain/agentriders/tree/main/cli
  - https://github.com/maxfain/agentriders/tree/main/mcp
  - https://github.com/maxfain/agentriders/blob/main/src/lib/verify.ts
  - https://github.com/maxfain/agentriders/blob/main/src/lib/ranks.ts
---

## What does "Verified flight" mean on a log?

A Verified flight badge means a device the rider registered signed the session's metadata and the rider linked that record to the published log.

It is the verified part of a rider's track record; everything else in the log stays self-reported. The rider pairs a machine, flies a session, and runs `agentriders log` or the MCP tool `agentriders_file_flight_log`. The machine signs a metadata-only record with its Ed25519 key; the server verifies it; the rider links it to one published log. The badge appears on the log after the next site rebuild. Install from [/agents/](/agents/); format at [/logs/template/](/logs/template/).

## What leaves the rider's machine, and what never does

The signed record is ten fields of session metadata; prompts, code, file paths and command output stay on the machine.

| Field | What it holds |
|---|---|
| `cc_session_hash` | SHA-256 of the session id. One-way. |
| `started_at`, `ended_at`, `duration_seconds` | When, and for how long. |
| `models` | Model names used. |
| `tool_call_counts` | Calls per built-in tool name; MCP tools collapse to one `mcp` count, so server and tool names never leave. |
| `evals` | Six signals: eval files, frameworks, runs, fix-and-rerun cycles, pass-rate delta, workflows; counts and names only. |
| `v`, `generated_at`, `cli_version` | Format version, when the record was generated, CLI version. |

`agentriders log <session.jsonl> --dry-run` prints the exact payload and uploads nothing; the MCP tool `agentriders_draft_flight_log` does the same until `agentriders_file_flight_log` runs with `confirm: true`. The private key never leaves.

The CLI reads Claude Code's local transcript at `~/.claude/projects/<project>/<session-id>.jsonl`, a format Anthropic documents as internal and changeable; `agentriders log --latest` picks the most recently modified file there. Claude Code keeps those transcripts for 30 days by default (`cleanupPeriodDays` changes it), so sign a session before it is swept (sources: [Claude Code sessions](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored) and [data retention](https://code.claude.com/docs/en/data-usage#data-retention), last verified 2026-10-16).

## What does the server check before it accepts a record?

The server re-verifies the Ed25519 signature against the key it registered, rejects malformed or out-of-range payloads, and recomputes the eval score itself.

Both sides use identical canonical JSON: the bytes signed are the bytes checked. A revoked or unknown device gets 401. The payload stays under 16 KB; `duration_seconds` must match the timestamps within 2 seconds. Uploads are limited to 60 per hour per IP. Any score the client claims is ignored (source: `src/lib/verify.ts` and `src/pages/api/flight-records/index.ts`).

## One record per session, and devices can be revoked

A Claude Code session yields one flight record per rider, a published log carries at most one record, and a revoked device signs nothing new.

A second upload of the same session returns 409. Linking is the rider's choice, separate from signing, at `/me/devices/`, where records are linked, unlinked or deleted and devices revoked. One public key is one device on one rider. Earlier records stay after revocation, because they were valid when made.

## What the signature proves, and what it does not

A valid signature proves the record's provenance, not the truth of its contents.

| Proves | Does not prove |
|---|---|
| A device registered to this rider produced this exact record. | That any count, timestamp or eval signal is true; a doctored client can sign anything within bounds. |
| The record was not altered in transit. | That the session is the one the log describes; matching is the rider's association. |
| The eval score came from the server, not the client. | The log's cost, outcome or lesson; none are in the record. |

A logged case: [/logs/shipped-agentriders-phase-2/](/logs/shipped-agentriders-phase-2/) lists `cost_usd: 550` on a subscription plan, so the figure is an estimate; a badge would not make it measured. The record has no cost field.

## Why a Verified flight is standing, never a rank shortcut

Rank is computed only from published flights and vouches; signed records and eval scores are display-only and never enter the calculation.

Fledgling is one published flight. Rider is 20 published flights plus 2 vouches from Riders. The rank engine reads nothing else (source: `src/lib/ranks.ts`). The badge on the log and the eval stats on the profile are the standing; the Terms call them self-reported, never a rank shortcut. See [/riders/ranks/](/riders/ranks/) for the rank rules, [/manual/logging-a-flight/](/manual/logging-a-flight/) for what a log records, and [/agents/](/agents/) for how the record is made.

## Questions riders ask

**Does a Verified flight mean the numbers in the log are true?**
No. A registered device signed the session's metadata and the server confirmed it. Every count is self-attested; cost, outcome and lesson are not in the record.

**Can I see what the CLI sends before it uploads?**
Yes. `agentriders log <session.jsonl> --dry-run` prints the full payload and sends nothing. The MCP tool `agentriders_draft_flight_log` prints the same `egress_payload`. Prompts, code and paths are never in it.

**Does verifying a flight raise my rank?**
No. Rank is published flights and vouches only: one flight for Fledgling, 20 flights plus 2 Rider vouches for Rider. Badge and eval score are display-only by design.
