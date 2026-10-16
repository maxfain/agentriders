---
title: "The flight log, field by field"
seoTitle: "AI agent run log schema: fields and logs.json"
description: "Every field of an AI agent run log: type, limits, enum values, the burns and reins sub-objects, the slug rule, and how to fetch and cite /logs.json."
summary: "An AgentRiders flight log is one AI agent run recorded as 14 typed frontmatter fields: title, date, rider, mount, model, harness, task, duration, cost_usd, outcome, burns, lesson, reins and draft. One schema validates every published log and every submission. /logs.json serves every published log as one JSON array, newest first."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
lastVerified: 2026-10-16
sources:
  - https://code.claude.com/docs/en/sessions#where-transcripts-are-stored
  - https://creativecommons.org/licenses/by/4.0/
  - https://agentriders.com/terms/
---

## What is a flight log, as a data object?

A flight log is one AI agent run, recorded as a markdown file whose YAML frontmatter holds 14 typed fields and whose body holds the narrative.

One definition governs every log: `src/lib/log-schema.ts`, a zod object. The content collection parses published files with it at build; the submissions API validates every composer or MCP draft with it at request time, so an approved submission cannot fail the build. Counted from that file: 10 fields required, 2 optional (`model`, `harness`), 2 defaulted (`burns`, `draft`). Why each field exists is [chapter 5](/manual/logging-a-flight/); the form to copy is [/logs/template/](/logs/template/).

## What to record for each AI agent session: the 14 fields

Every published log carries the 14 fields below; the example column is logged, from the one published flight, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/).

| Field | Type, limit | Required | Meaning | Logged example |
| --- | --- | --- | --- | --- |
| `title` | string, 1–140 | yes | Task and outcome in one line | Shipped AgentRiders Phase 2 |
| `date` | `yyyy-mm-dd`, a real calendar date | yes | Day of the flight | 2026-10-16 |
| `rider` | string, 1–60 | yes | Handle of who held the reins | maxcr |
| `mount` | string, 1–80 | yes | Agent product or framework | Claude Code |
| `model` | string, ≤ 80 | no | Model or models, when known | Claude Fable 5 for planning and Opus 4.8 for coding |
| `harness` | string, ≤ 80 | no | Where the mount ran | Claude Code on the web (cloud session) |
| `task` | enum, 7 values | yes | Kind of work | code |
| `duration` | string, 1–40 | yes | Elapsed time, rider-stated | 5h |
| `cost_usd` | number, ≥ 0 | yes | Direct cost in USD, self-reported | 550 (estimate; subscription plan) |
| `outcome` | enum, 3 values | yes | Result against the brief | landed |
| `burns` | array, max 20 | default `[]` | What lost money, data or time | 3, each cost 0 |
| `lesson` | string, 1–500 | yes | One change for next time | in the JSON below |
| `reins` | object, 4 strings | yes | Scope, budget, kill switch, autonomy | in the JSON below |
| `draft` | boolean | default `false` | `true` hides the log and keeps it out of `/logs.json` | false |

Zero in `cost_usd` means a supported zero, never "did not check". A subscription-billed flight has no per-run bill, so its cost is an allocation the rider computed, and the site labels it an estimate.

## What goes in burns[] and reins{}?

`burns` is a list of up to 20 incidents, each with what happened, the recovery and its direct cost; `reins` is one object of four required strings: `scope`, `budget`, `kill_switch`, `autonomy`.

| `burns[]` key | Type, limit | Required |
| --- | --- | --- |
| `what` | string, 1–280 | yes |
| `recovery` | string, 1–280 | yes |
| `cost_usd` | number, ≥ 0 | default 0 |

| `reins` key | Limit | Meaning |
| --- | --- | --- |
| `scope` | 1–280 | What the agent could touch |
| `budget` | 1–120 | The spend cap, or the billing it ran under |
| `kill_switch` | 1–120 | How the run could be stopped |
| `autonomy` | 1–120 | How much it did without a person |

An empty list means none were observed, not that the setup cannot fail. A burn cost already inside the flight's `cost_usd` is explained in the body, not counted twice. Reins describe enforcement, not instructions; [chapter 2](/manual/reins/) draws the line. The logged reins and one of the three logged burns are in the JSON entry below.

## What are the allowed values for task and outcome?

`task` accepts exactly seven strings and `outcome` exactly three; any other value fails validation at build and at submission.

| Field | Values | Meaning |
| --- | --- | --- |
| `task` | `code`, `ops`, `research`, `sales`, `writing`, `data`, `other` | The kind of work; a category, not a claim of expertise |
| `outcome` | `landed` | The agreed deliverable passed its acceptance checks |
| | `partial` | Useful work exists, but part of the agreed result remains unmet |
| | `aborted` | The run stopped without completing the agreed deliverable |

Facet pages under `/logs/` group flights by `task`, `outcome`, `mount` and whether `burns` is non-empty.

## How is a log's slug and URL decided?

The slug is the file name without `.md`: lowercase ASCII letters, digits and hyphens, 1 to 80 characters, starting and ending with a letter or digit; it becomes `/logs/<slug>/` and never changes once published.

`SLUG_REGEX` in `src/lib/log-schema.ts` is `^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$`. A hand-filed log is named by its author. A submission takes the slug it supplies, or `slugify(title)`: lowercase, accents stripped, punctuation removed, spaces and underscores to single hyphens, cut at 80. "Shipped AgentRiders Phase 2" became `shipped-agentriders-phase-2`.

## What does one logs.json entry look like?

Each entry is the log's frontmatter without `draft`, plus its canonical `url`, in one JSON array sorted newest first.

`src/pages/logs.json.ts` builds it: logs with `draft: false`, sorted by `date` descending; `url` absolute with a trailing slash; `date` a `yyyy-mm-dd` string; `model` and `harness` omitted when absent, never `null`; numbers stay numbers; served as `application/json; charset=utf-8`. The live entry, with two of its three burns cut for length:

```json
[
  {
    "url": "https://agentriders.com/logs/shipped-agentriders-phase-2/",
    "title": "Shipped AgentRiders Phase 2",
    "date": "2026-10-16",
    "rider": "maxcr",
    "mount": "Claude Code",
    "model": "Claude Fable 5 for planning and Opus 4.8 for coding",
    "harness": "Claude Code on the web (cloud session)",
    "task": "code",
    "duration": "5h",
    "cost_usd": 550,
    "outcome": "landed",
    "burns": [
      {
        "what": "A local dev-server kill script repeatedly matched and killed the agent’s own shell (exit 144), stalling test runs.",
        "recovery": "Ran the kill from a file and by port instead of an inline process-name pattern.",
        "cost_usd": 0
      }
    ],
    "lesson": "\"Tests pass\" is not \"safe to ship\": agent-written code needs an adversarial review pass before merge — ours caught an IDOR and a stored XSS that 38 green tests missed.",
    "reins": {
      "scope": "maxfain/agentriders only — feature-branch PRs into main; Cloudflare account via a scoped API token; production D1 + Pages",
      "budget": "subscription",
      "kill_switch": "on — human merges each milestone PR manually; secrets and infra changes gated on the owner",
      "autonomy": "High — autonomous build across milestones M0–M2, with human approval at every merge"
    }
  }
]
```

The 550 is an estimate: `budget` says `subscription`, so no per-run bill exists, and the log does not record how the figure was derived. [/data/methodology/](/data/methodology/) explains the label.

## How do I fetch /logs.json, and what may I do with it?

`https://agentriders.com/logs.json` is a static file with no sign-in, regenerated at every deploy, and the [Terms](/terms/) let you quote its records with attribution and a link.

```sh
curl -s https://agentriders.com/logs.json \
  | jq '.[] | {url, mount, duration, cost_usd, outcome, burns: (.burns | length)}'
```

Today it holds 1 entry from 1 rider on 1 mount: a case study, not a sample; no median is published below 10 flights from 3 or more riders. Every value is self-reported; a verified flight's device-signed record lives outside this file (`/api/public/site-state.json` lists which slugs carry one; [/agents/](/agents/) describes it). `public/_headers` sets no CORS header, so read the file from a script, server or agent, not another site's browser page.

The license lives in two places today, and they do not yet say the same thing. The `Dataset` JSON-LD on [/logs/](/logs/) declares [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for the corpus `/logs.json` distributes: the frontmatter fields, never the log bodies, which stay the author's. The visible [Terms](/terms/) are narrower: content belongs to its authors; quote it with attribution and a link; do not republish whole chapters or logs without permission; riders keep their rights and grant AgentRiders a non-exclusive licence to publish. The Terms carry no public CC BY grant, so this page promises none. Until they do: credit "AgentRiders Flight Logs, https://agentriders.com/logs.json", keep each record's `rider` handle (it is the byline), and ask hello@agentriders.com before republishing whole records. If the Terms gain a public reuse grant, this page changes with them.

## Is logs.json a transcript dataset?

No. It is a metadata-only run log: never prompts, code, file paths, command text or output.

A transcript is a different object. Claude Code stores each session as JSONL under `~/.claude/projects/<project>/<session-id>.jsonl` and documents the format as internal, changing between versions, with direct parsing unsupported ([Claude Code docs: sessions](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored), last verified 2026-10-16). A flight log is what a rider asserts about a run after reading the receipts, in 14 fields another rider can compare. Signed counts and timestamps from the `agentriders` CLI go into the verified record, not `logs.json`.

## Questions riders ask

**Is there an agent run log template I can copy?**

Yes. [/logs/template/](/logs/template/) shows the YAML frontmatter, copyable and downloadable: the 14 fields above, what to record for each AI agent session. Replace every example value and leave `draft: true` until reviewed. The composer at [/logs/new/](/logs/new/) collects the same fields; `rider` comes from your account and `draft` is set to false when an admin approves.

**Where can I download AI agent run logs as JSON?**

`https://agentriders.com/logs.json`, no sign-in, regenerated on every deploy. It is an array sorted newest first; each entry is one published flight's frontmatter plus its URL. Today it holds 1 entry, from 1 rider on 1 mount, and that flight's cost is an estimate on a subscription plan.

**Can I use logs.json in my own project or paper?**

Quote it with attribution and a link, per the [Terms](/terms/): "AgentRiders Flight Logs, https://agentriders.com/logs.json" plus each record's `rider` handle. The Dataset markup on /logs/ declares CC BY 4.0, but the Terms do not yet grant it, so ask hello@agentriders.com before republishing whole records. Do not average one flight; [/data/methodology/](/data/methodology/) says when a number is safe.
