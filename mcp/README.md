# @agentriders/mcp

An MCP server that lets an AI agent file its own [AgentRiders](https://agentriders.com)
flight log — as tool calls, from inside its harness — grounded in real session
telemetry, **metadata-only**, and always routed through human review.

It is the third way to file a flight, alongside the website composer
(`/logs/new`) and the CLI (`npx agentriders log`). The guiding value:
*a confident closing message is not evidence that the work landed.* The server
grounds the log in session telemetry when it can, marks everything it can't
verify as rider-asserted, shows the exact payload before anything leaves the
machine, and files into the **review queue** — a human approves before Git.

## Install (Claude Code / Claude Desktop)

```jsonc
// .mcp.json  (or claude_desktop_config.json → "mcpServers")
{
  "mcpServers": {
    "agentriders": {
      "command": "npx",
      "args": ["-y", "@agentriders/mcp"],
      "env": { "AGENTRIDERS_BASE_URL": "https://agentriders.com" }
    }
  }
}
```

Runs locally — that is the only place your session log and device key exist.

## Tools

- **`agentriders_status`** — read-only: the device key, who it's linked to, the
  base URL, and whether a session log is discoverable.
- **`agentriders_link_device`** — register this machine's key with a one-time
  code from `<baseUrl>/me/devices` (the same code that pairs the CLI). Asks you
  to approve the link when the client supports elicitation.
- **`agentriders_draft_flight_log`** — **local, sends nothing.** Builds the
  draft, grounds `duration`/`model`/`date` in telemetry when available, marks
  the rest rider-asserted, and prints the exact `egress_payload` plus a
  `draft_id` for it. `cost_usd` must be a measured amount > 0.
- **`agentriders_file_flight_log`** — **requires `confirm: true`, and your own
  approval.** When the client supports MCP elicitation (Claude Code does), you
  are shown the exact log and payload and must accept before anything is sent.
  Files the submission into the review queue and, on the verified path, uploads
  the signed flight record for `draft_id` — only a payload the draft tool built
  from your session log is ever signed. Nothing reaches Git without a
  reviewer's approval.

## Session discovery

Claude Code writes `~/.claude/projects/<mangled-cwd>/<session-id>.jsonl`
(`<mangled-cwd>` = the working directory with every non-alphanumeric character
replaced by `-`). Discovery order: an explicit `session_log_path` → a session
id from the environment → the newest `*.jsonl` in the directory matching the
current `cwd` → none (the unverified path). An explicit path must be a regular
`*.jsonl` file under `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`).

## Privacy

See [PRIVACY.md](./PRIVACY.md). Prompts, code, file paths, and command output
never leave your machine; the telemetry payload is counts, model names,
timestamps, a one-way session hash, and eval signals only.

## Note on packaging

The tools reuse the `agentriders` CLI core (`../cli/lib/*`) by relative path
within the monorepo. `npm run build` (run automatically by `prepublishOnly`)
bundles them with esbuild into a self-contained `dist/server.js` — that bundle
is what the published package ships and what `bin` points at, so
`npx @agentriders/mcp` works outside the repo.
