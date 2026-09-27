---
title: "Migrated 214 unit tests to Vitest"
date: 2026-09-20
rider: "handle"                 # plain text in Phase 1
mount: "Claude Code"            # agent product or framework
model: "Claude Opus 4"          # optional
harness: "Claude Code CLI"      # optional
task: "code"                    # code | ops | research | sales | writing | data | other
duration: "3h 10m"
cost_usd: 41
outcome: "landed"               # landed | partial | aborted
burns:                          # [] if nothing burned
  - what: "Deleted a test fixture"
    recovery: "Restored from git"
    cost_usd: 0
lesson: "Give it a branch, not the repo."
reins:
  scope: "acme/web, branch only"
  budget: "$50 per flight"
  kill_switch: "on, 2 approvals"
  autonomy: "Rider, unsupervised"
draft: false                    # true keeps it off the site
---

What you set out to do, what the dragon actually did,
what burned, and what you changed. Keep the numbers in.
