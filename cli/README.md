# agentriders CLI — eval detection module

Detects genuine eval *practice* in a Claude Code session log — not just file
existence — for the flight record and rank scoring. See
`agentriders-evals-spec.md` § 2 for the feature spec, and the Evals chapter
of the Field Manual for the discipline it measures.

## Status

`eval-detector.js` is the isolated detection module plus its unit tests
(`npm test`). It is **not yet wired** into a flight-record pipeline: the
signing logic and public output format described in the spec do not exist in
this repo yet, and per the spec the schema addition below is to be reviewed
before anything feeds scoring. The module has no dependencies and runs on
Node 22 as-is.

## What it does

`detectEvals(jsonl)` takes a Claude Code session log (JSONL, as written under
`~/.claude/projects/<project>/<session>.jsonl`) and returns the proposed
`evals` sub-object for the flight record:

```json
{
  "eval_files_created": 2,
  "eval_frameworks_detected": ["pytest", "promptfoo"],
  "eval_run_count": 4,
  "eval_iteration_cycles": 2,
  "pass_rate_delta": 0.4,
  "workflows_with_evals": 1
}
```

- **eval_files_created** — distinct eval/test files written (`test_*.py`,
  `*.test.*`, `*.eval.*`, `*_spec.rb`, promptfoo/deepeval/braintrust
  configs), deduped by whitespace-insensitive content hash: reformatting a
  file, or pasting identical content under many names, counts once. Capped
  at 10 per session.
- **eval_frameworks_detected** — promptfoo, deepeval, braintrust, langsmith,
  pytest, or `custom` (harness keywords `assert_eq(` / `score(`), from file
  writes and commands.
- **eval_run_count** — test/eval commands actually executed (`pytest`,
  `npm test`, `vitest`, `jest`, `promptfoo eval`, `node --test`, …).
- **eval_iteration_cycles** — write → run → **failure** → edit → re-run
  sequences, the main signal. Capped at 5 per session.
- **pass_rate_delta** — last parseable pass rate minus the first, from
  pytest / jest / vitest / mocha / node:test / promptfoo output; `null`
  when fewer than two runs are parseable.
- **workflows_with_evals** — distinct project directories (session `cwd`)
  with at least one eval file.

## Anti-gaming guards (built in)

- Content-hash dedupe: whitespace edits and copy-paste spam don't re-count.
- Per-session caps on files (10) and cycles (5).
- `isScoreEligible(evals)` is false until `eval_run_count >= 1`: file
  creation alone never earns points.

## Scoring (provisional — review before wiring into ranks)

`scoreEvals(evals)` implements the spec's model with these proposed weights:
1 point per file (capped), 5 per iteration cycle (the discipline being
rewarded), up to 8 bonus points for a positive pass-rate delta, all scaled
up to 1.75× by workflow breadth (never by raw file count). Zero without a
run. Weights live in `DEFAULT_WEIGHTS` and are meant to be tuned.

## Privacy

Only metadata leaves the module: counts, framework names, deltas. File
contents are consumed in memory to hash and to pattern-match framework
names, then discarded — never returned, persisted, or transmitted, and the
same holds for the code under test and command output.

## Tests

```sh
npm test   # node --test cli/eval-detector.test.js
```

Synthetic session logs cover: no eval activity; file creation with no run
(scores zero); a full write→run→fail→fix→re-run cycle; a pass-rate
improvement across runs; plus dedupe, caps, breadth, and malformed-input
robustness.
