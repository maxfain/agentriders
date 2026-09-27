# AgentRiders — Evals Feature Spec

Two additions to AgentRiders: a Field Manual chapter teaching evals as a rider discipline, and an extension to the `agentriders` CLI that detects real eval practice in Claude Code session logs and feeds it into flight records / rank scoring.

---

## 1. Field Manual Chapter — "Evals"

**Placement:** New core chapter, alongside existing craft chapters (prompting, orchestration, etc.) — not a footnote or appendix.

### Structure

1. **What an eval is** — a repeatable check of whether your agent produced the right output, distinct from "it worked once when I watched it." Anatomy: input → expected outcome → scorer → pass/fail.

2. **Why it matters for riders** — ties into the dragon metaphor: an eval is how a rider keeps a dragon accountable rather than trusting vibes. Framed as a discipline, not a chore.

3. **Types of evals** (taxonomy riders choose from):
   - *Golden-set regression* — fixed inputs with known-good outputs, run after every change
   - *Rule-based / assertion checks* — deterministic checks (schema valid, no forbidden strings, file compiles)
   - *LLM-as-judge* — a second model scores subjective quality (tone, correctness, completeness)
   - *Human spot-check* — periodic manual review as a calibration anchor

4. **Writing your first eval** — walkthrough: take a task your agent already does, turn it into 3–5 test cases, write a scorer, run it.

5. **Practicing the loop** — write eval → run agent → check pass rate → adjust prompt/config → re-run. Emphasize iteration, not one-off creation.

6. **Field checklist:**
   - At least one eval file per active agent workflow?
   - Re-run after meaningful changes?
   - Tracking pass rate over time, not just pass/fail once?

7. **Exercises** — 2–3 short prompts riders can complete and log (e.g., "write an eval for your most-used agent task this week").

---

## 2. CLI Eval-Detection (extends `agentriders` telemetry)

**Goal:** Detect genuine eval *practice* in a rider's Claude Code session logs — not just file existence — and feed it into the flight record as a scoreable signal.

### Signals to extract

| Signal | Detection method | Why it matters |
|---|---|---|
| Eval/test file creation | File writes matching `test_*.py`, `*.test.ts`, `*.eval.*`, `*_spec.rb`, or known configs (`promptfoo.yaml`, `deepeval` imports, `braintrust` SDK calls) | Baseline: they made *something* |
| Eval framework usage | Imports/CLI invocations referencing promptfoo, deepeval, braintrust, langsmith, pytest fixtures, or custom harness keywords (`assert_eq`, `score(`) | Signals real tooling, not a stub |
| Run-and-iterate cycles | Sequence: test file written/edited → test command run (`npm test`, `pytest`, `promptfoo eval`) → failure → edit → re-run | The actual signal — proves the loop is *used* |
| Pass-rate trend | Diff pass/fail counts between consecutive runs (same or later session), if parseable from tool output | Rewards improvement, not just activity |
| Coverage breadth | Distinct agent workflows (by directory/project) with at least one associated eval file | Rewards riders who eval multiple things, not one pet project |

### Flight record schema additions

```
eval_files_created: int
eval_frameworks_detected: [string]
eval_run_count: int
eval_iteration_cycles: int      // write→run→fail→fix→run sequences
pass_rate_delta: float | null   // only if parseable from tool output
workflows_with_evals: int
```

### Scoring model

- Small points for file creation (prevents zero-signal riders from being invisible, but capped low — easiest signal to fake)
- Larger points for *iteration cycles* (the loop is the discipline being rewarded)
- Bonus for pass-rate improvement across a session
- Points scale with `workflows_with_evals`, not raw file count — rewards breadth over volume

### Anti-gaming guards

- Dedupe by file content hash — editing whitespace shouldn't re-trigger points
- Rate-limit eval points per session (cap contribution from a single session)
- Require at least one actual test *run* (not just file creation) before any points are awarded — kills the "touch a file and walk away" exploit

### Privacy

- Extract only metadata (counts, framework names, pass/fail deltas) — never the content of test files or the code under test — consistent with how the CLI already signs flight records without exposing raw session content.

---

## Prompt for Claude Code

```
I'm extending the `agentriders` CLI (zero-dependency Node tool that extracts
telemetry from Claude Code session logs and signs a "flight record" for
rank scoring on agentriders.com). I want to add eval-practice detection.

Context: the CLI already parses Claude Code session logs on the rider's
machine to extract telemetry and sign flight records without exposing raw
session content. This task adds a new detection module to that pipeline.

Build a module that scans a Claude Code session log and extracts these
signals:

1. eval_files_created (int) — count of file writes matching test/eval
   patterns: test_*.py, *.test.ts, *.eval.*, *_spec.rb, or known eval
   config files (promptfoo.yaml, deepeval config, braintrust config).
2. eval_frameworks_detected (string[]) — distinct eval frameworks referenced
   via imports, requires, or CLI invocations: promptfoo, deepeval,
   braintrust, langsmith, pytest (with fixtures), or custom harness
   keywords like assert_eq(/score(.
3. eval_run_count (int) — count of test/eval commands actually executed
   (npm test, pytest, promptfoo eval, etc.), not just written.
4. eval_iteration_cycles (int) — count of write/edit → run → failure →
   edit → re-run sequences within the session (this is the main signal;
   weight it highest).
5. pass_rate_delta (float | null) — if tool output includes parseable
   pass/fail counts, the change in pass rate between the first and last
   run in the session. Null if not parseable.
6. workflows_with_evals (int) — count of distinct project directories in
   the session with at least one associated eval file.

Requirements:
- Extract only metadata (counts, framework names, deltas) — never persist
  or transmit the content of test files or the code under test.
- Dedupe file-write events by content hash so trivial edits (whitespace)
  don't double-count.
- Cap eval_iteration_cycles and eval_files_created contributions per
  session (rate limit) to prevent gaming via file-touch spam.
- Require eval_run_count >= 1 before any of these fields contribute to
  the flight record's score — file creation alone should not earn points.
- Output should merge into the existing flight record JSON schema the CLI
  already signs, as an `evals` sub-object matching the field names above.
- Write it as its own module (e.g. eval-detector.js) that the main CLI
  pipeline calls and merges in, not inline in the existing extractor —
  keep it isolated so it can be tested and tuned independently.
- Include unit tests using a few synthetic sample session logs: one with
  no eval activity, one with file creation only (no run — should score
  zero), one with a full write→run→fail→fix→run cycle, and one showing
  a pass-rate improvement across two runs.

Ask me before you touch the existing flight-record signing logic or the
CLI's public output format — I want to review the schema addition first.
```
