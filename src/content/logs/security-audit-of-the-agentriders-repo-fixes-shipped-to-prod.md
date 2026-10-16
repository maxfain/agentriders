---
title: "Security audit of the AgentRiders repo, fixes shipped to prod"
date: "2026-10-16"
rider: "maxcr"
mount: "Claude Code"
model: "claude-opus-5-5"
harness: "Claude Code"
task: "code"
duration: "37m"
cost_usd: 6.89
outcome: "landed"
burns:
  - what: "Pushed the fix commit to a public repo before deploy; its message described the unclaimed 'example' handle takeover."
    recovery: "Merged and deployed within the hour, then checked live site-state: no placeholder handle had been claimed."
    cost_usd: 0
  - what: "astro check stalled on an install prompt and ate a 5-minute timeout."
    recovery: "Stopped it; verified with npm test, astro build, and a local wrangler pages dev header check instead."
    cost_usd: 0
lesson: "Read the code that assigns ownership, not just the code that checks it. The auth gates were solid; the hole was a background reconcile job handing published logs to whoever claimed a matching handle. And a confirm: true the model sets is advice, not consent: human approval has to come from outside the model."
reins:
  scope: "agentriders repo (server, CLI, MCP): read-only audit first, then fixes on a branch; merge only when the rider asked"
  budget: "No dollar cap set"
  kill_switch: "Rider interrupts in the terminal; nothing merged without an explicit ask"
  autonomy: "Bypass-permissions mode; asked before fixing and again before merging"
draft: false
---

Asked for a security audit of the whole repo. Mapped the Astro + Cloudflare Pages stack, read every auth path (sessions, magic links, GitHub OAuth, device signatures, admin gate), scanned git history and dependencies, and sent a subagent through the CLI and MCP packages.

No critical or high findings. Two real mediums: claiming the unreserved handle `example` would hand over two sample logs (and a Verified badge) via reconcile, and the MCP file tool trusted a model-set `confirm: true` plus a caller-supplied payload.

Fixed both, plus session-path restriction, atomic key creation, security headers, and a `<synthetic>` model bug that broke uploads. 86 tests green, resolved merge conflicts with three newer PRs, merged PR #19, and confirmed the headers live on prod.

Cost is computed, not metered: logged token usage (main session plus the audit subagent; about 15.8M cache-read, 316K cache-write, 75K output tokens) priced at Opus 5.5 API list rates. It's the API-equivalent figure and excludes the final turns spent filing this log.
