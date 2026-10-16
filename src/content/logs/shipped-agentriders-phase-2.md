---
title: "Shipped AgentRiders Phase 2"
date: "2026-10-16"
rider: "maxcr"
mount: "Claude Code"
model: "Claude Fable 5 for planning and Opus 4.8 for coding"
harness: "Claude Code on the web (cloud session)"
task: "code"
duration: "5h"
cost_usd: 550
outcome: "landed"
burns:
  - what: "The first M2 submission pipeline reached the review stage with an IDOR (any rider could hijack or lock another rider’s published log through the edit path) and a stored XSS (rider markdown rendered as raw HTML)."
    recovery: "A 46-agent adversarial review caught both before merge; fixed at every trust boundary and re-verified with a 23-step end-to-end run."
    cost_usd: 0
  - what: "The admin allowlist was hardcoded to the handle max, but the owner claimed @maxcr — the admin surface would have 404'd for its own admin."
    recovery: "Corrected the allowlist on the branch before merge and granted is_admin in D1."
    cost_usd: 0
  - what: "A local dev-server kill script repeatedly matched and killed the agent’s own shell (exit 144), stalling test runs."
    recovery: "Ran the kill from a file and by port instead of an inline process-name pattern."
    cost_usd: 0
lesson: "\"Tests pass\" is not \"safe to ship\": agent-written code needs an adversarial review pass before merge — ours caught an IDOR and a stored XSS that 38 green tests missed."
reins:
  scope: "maxfain/agentriders only — feature-branch PRs into main; Cloudflare account via a scoped API token; production D1 + Pages"
  budget: "subscription"
  kill_switch: "on — human merges each milestone PR manually; secrets and infra changes gated on the owner"
  autonomy: "High — autonomous build across milestones M0–M2, with human approval at every merge"
draft: false
---

Built Phase 2 of AgentRiders — the jump from a static publication to a product — across three shippable milestones, each a feature-branch PR into `main` with its own Cloudflare preview.

**M0 — foundations.** Added the `@astrojs/cloudflare` adapter under the existing static site (every page stays byte-identical; only `prerender = false` routes become Pages Functions), converted `wrangler.jsonc` to the Pages form, created a D1 database and KV namespace, wrote the full Phase 2 schema, and stood up `/api/health`.

**M1 — accounts.** Hand-rolled auth with no framework: GitHub OAuth and Resend magic links, both landing on peppered-hash sessions in D1. A pre-merge adversarial review caught the big one — the emailed magic link signed you in on a bare GET, so corporate mail scanners that prefetch links would burn the single-use token and receive the session. Fixed with a two-step confirm.

**M2 — submissions to publish.** Riders compose a flight log on the site, submit it to a review queue, and an admin approves it straight into git, which stays canonical. The admin approve step commits the markdown via a bot token; a lazy reconcile keeps a D1 mirror in step with the live `/logs.json`. The pre-merge review here earned its keep twice over, catching an IDOR and a stored XSS before either shipped.

Every milestone was verified against the real local Cloudflare runtime — unit tests plus end-to-end runs driving the actual D1/KV bindings — not just mocked. The reins stayed human: a PR gate before every merge, and secrets and infrastructure changes gated on the owner.
