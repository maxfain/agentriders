# Autonomy review

AgentRiders field kit · https://agentriders.com/training/kit/

Change one permission at a time. Approval for a task is not approval for every task the same agent might attempt.

## Worked example — illustrative decision

- Current scope: draft ticket labels from a supplied fixture; every row reviewed.
- Proposed increase: process a larger redacted fixture with the same draft-only access.
- Evidence required: complete ID coverage, correct escalation behavior, and documented review effort across varied batches.
- Not proposed: direct CRM writes or customer messages.
- Reversal: return to the smaller fixture and full review if coverage or escalation fails.
- Decision: pending. No test results are claimed in this example.

## Copy and fill

```text
WORKFLOW / OWNER / DATE:
AGENT / MODEL / TOOL CONFIGURATION:

CURRENT SCOPE
Inputs:
Actions:
Review frequency:
Maximum batch / budget:

PROPOSED CHANGE (one dimension)
Exact added permission or reduced review:
Why it helps:
What stays behind approval:

EVIDENCE
Run IDs and input versions:
Required checks passed / attempted:
Not-run checks:
Failure types and unresolved incidents:
Human correction time:
Observed cost:
Which realistic variations were covered:
Which variations remain untested:

CONSEQUENCES
Worst plausible error within this scope:
How it would be detected:
Who can stop the run:
Recovery procedure and expected effort:

DECISION
Approve / limited pilot / decline / gather evidence:
Reviewer and rationale:
Pilot size and time window:
Sampling or full-review rule:
Immediate rollback triggers:
Recheck date:

INVALIDATION
Re-review after changes to model, instructions, tools,
permissions, input population, or failure consequences.
```

A streak of easy successes is weak evidence for an untested hard case. Include ambiguous inputs, missing facts, and cases that should be refused or escalated. Report sample size; five passes out of five means exactly that, not a guaranteed success rate.

For external messages, money movement, deletion, or sensitive data, consider the consequence of a single miss before reducing review. A draft-only workflow can remain useful indefinitely.

Next: https://agentriders.com/training/earn-the-longer-leash/
