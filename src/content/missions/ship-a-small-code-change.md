---
title: "Ship a small code change"
description: "Give an agent a broken function, six acceptance checks, and a boundary small enough to inspect."
audience: "Engineers"
duration: "30–45 minutes"
art: "workbench"
outcome: "A reviewed local patch, observed test output, and a record of what changed."
---

## The mission

Fix one function that counts ticket statuses. Keep the input unchanged. Prove the behavior with checks written before the agent begins. Here, “ship” means hand over a reviewed local artifact; publishing a package or changing production is outside the exercise.

This is a practice fixture, not a report of a real flight. You need a local Node.js installation and an empty exercise folder. Use an agent that can edit that folder, or ask a chat-only agent to return a replacement function for you to paste. No network access, package installation, credentials, or customer data is needed.

If this is your first run, read [Your first flight](/training/your-first-flight/) and copy the [mission brief](/training/kit/) before starting.

## Set up the fixture

Create `summarize.cjs` with this intentionally incomplete implementation:

```js
function summarize(statuses) {
  return {
    open: statuses.filter(s => s === 'open').length,
    closed: statuses.filter(s => s === 'closed').length,
    unknown: 0,
    total: statuses.length,
  };
}
module.exports = { summarize };
```

The contract: the argument is always an array. Count each entry exactly once. Normalize string entries by trimming surrounding whitespace and converting to lowercase. Recognize only `open` and `closed`. Everything else, including empty strings and non-string values, is `unknown`. Return exactly the four numeric fields shown. Do not mutate the supplied array.

Create `check.cjs` yourself. Keep it outside the agent's permitted edit scope:

```js
const assert = require('node:assert/strict');
const { summarize } = require('./summarize.cjs');

const cases = [
  [[], { open: 0, closed: 0, unknown: 0, total: 0 }],
  [['open', 'closed'],
    { open: 1, closed: 1, unknown: 0, total: 2 }],
  [[' OPEN ', 'Closed', 'pending'],
    { open: 1, closed: 1, unknown: 1, total: 3 }],
  [['', '   ', null, 7],
    { open: 0, closed: 0, unknown: 4, total: 4 }],
  [['reopened', 'open', 'open'],
    { open: 2, closed: 0, unknown: 1, total: 3 }],
];

let passed = 0;
for (const [input, expected] of cases) {
  try {
    assert.deepEqual(summarize(input), expected);
    passed++;
  } catch (error) {
    console.error('FAIL:', JSON.stringify(input), error.message);
  }
}
const input = [' OPEN ', 'closed', null];
const original = [...input];
try {
  summarize(input);
  assert.deepEqual(input, original);
  passed++;
} catch (error) {
  console.error('FAIL: input preservation', error.message);
}
console.log(`${passed}/6 checks passed`);
process.exitCode = passed === 6 ? 0 : 1;
```

Run `node check.cjs` once before editing. Save the actual output as your baseline. Do not replace that observation with an expected result copied from this page.

## Give the agent a bounded brief

Paste the contract and both files, then use:

```text
Fix summarize.cjs to satisfy the supplied contract.
Read both files; edit only summarize.cjs.
Do not alter the checks, add dependencies, access the network,
publish anything, or expand the function's public interface.
Keep the input unchanged. Prefer a small, readable patch.

First restate the behavior and edit boundary. Then implement.
Run node check.cjs if execution is available. Report the exact
command and observed result; otherwise say "not run".
Return the patch, a brief explanation, and any unresolved issue.
Stop after one implementation and one corrective attempt.
```

Restrict file and tool access in the environment where possible. A sentence in the prompt is not a filesystem permission. If your tool cannot enforce a narrow edit scope, use the chat-only path and apply the proposed replacement yourself.

## Inspect before accepting

Run the checks yourself after the edit. Read the complete changed function: it should be short enough to understand without asking the agent to explain each line. Confirm that the original checks remain unchanged and that no new files, imports, or dependencies appeared.

Six passing checks are required for this fixture. They are evidence about these cases, not proof of correctness for every possible JavaScript value. Add one case of your own before accepting: for example, a mixed array with repeated unknown values. Write its expected counts manually. Check that the category counts sum to `total`.

## If it goes wrong

If a non-string causes an exception, point to the failing input and the original contract. If the agent rewrites the test, restore the test and reject that attempt. If it proposes a package or architectural rewrite, return to the one-file boundary. If the runtime is unavailable, record “not run” and stop at a proposed patch; do not mark the mission complete.

After the corrective attempt, retain any failing output and stop. A small partial result is easier to diagnose than a broad rewrite.

## Log the evidence

Keep the starting function, final patch, exact prompt, runtime version, and before/after command output. Record elapsed work time and review time separately. Record visible cost, or “not observable” if your tool does not expose it.

Use the [Flight Log template](/logs/template/), labeling this a sandbox exercise. Note the added case and the human acceptance decision. Then read [Evals](/manual/evals/) to turn this one inspection into a repeatable check for your next real change.
