# What the AgentRiders MCP server sends

Same guarantee as the CLI: filing a flight proves you did the work **without
exposing the work.** The server runs locally on your machine (the only place
your session log and device key exist) and sends a **metadata-only** record.

## What leaves your machine

- The flight-log **frontmatter and body you wrote** (title, task, outcome,
  cost, lesson, reins, burns, narrative) — this is the public log, filed into
  the review queue. It is whatever you put there; keep secrets out of it.
- On the verified path, the signed **metadata-only telemetry payload** shown by
  `agentriders_draft_flight_log` under `egress_payload`: counts, model names,
  timestamps, a one-way session hash, and eval signals. MCP tool calls are
  bucketed to a single `mcp` count, so MCP server/tool names never leave.

## What never leaves your machine

Your prompts, conversation text, source code, file contents, file paths,
directory names, command text, and command output. Your device private key
(`~/.agentriders/key.json`, `0600`) — only the public key and signatures are
sent.

## See it before it sends

`agentriders_draft_flight_log` performs **no network writes**. It prints the
exact `egress_payload` and marks every field it could not verify from telemetry
as rider-asserted. Nothing is uploaded until `agentriders_file_flight_log` is
called with `confirm: true` **and**, on clients that support MCP elicitation
(Claude Code does), you accept a prompt showing the exact log and payload. That
prompt comes from this server, not the model, so an agent can't approve its own
upload. On clients without elicitation, `confirm: true` from the agent is the
only gate — keep the file tool on "ask" rather than "always allow" there. The
signed payload is always the one the draft tool built from your session log;
the agent can't substitute its own. Everything filed goes into the human review
queue — a reviewer approves before anything reaches Git.

## Deletion

Unlink or delete a record, and revoke this device, any time from
`<baseUrl>/me/devices`.
