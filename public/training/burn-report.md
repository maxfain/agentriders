# Burn report

AgentRiders field kit · https://agentriders.com/training/kit/

Record what happened, what is known, and what changed. Keep blame and speculation out of the timeline.

## Worked example — fictional practice incident

- Expected: one review row for each of five ticket IDs.
- Observed: ticket T-04 missing from the draft.
- Impact: incomplete local artifact; no external action taken.
- Detection: input/output ID comparison failed.
- Containment: draft rejected; original five-record fixture retained.
- Contributing factor: prompt requested a “top issues” summary instead of complete coverage.
- Change: require one row per ID and check set equality.
- Restart check: run the original fixture and a second fixture with duplicate topics.
- Unknown: whether a larger batch would also fail; not tested.

## Copy and fill

```text
INCIDENT ID / DATE:
RIDER / OWNER:
MISSION / AGENT / MODEL / SETUP VERSION:

EXPECTED:
OBSERVED (with evidence, not interpretation):
FIRST DETECTED AT:
DETECTED BY:

IMPACT
Confirmed affected artifacts / records / people:
Possible impact still being checked:
Time lost:
Observed spend (or "not observable"):
External actions already taken:

CONTAINMENT
Run stopped at:
Queued actions checked:
Access changes made:
Evidence preserved:
Recovery action and owner:

TIMELINE
Time | observed event | evidence

EXPLANATION
Confirmed contributing factors:
Hypotheses requiring a test:
What the current evidence cannot establish:

CORRECTION
Prompt / tool / permission / process change:
New regression case:
Expected result:
Restart gate:
Reviewer:

FOLLOW-UP
Recheck date:
Status: contained / recovering / resolved / unresolved
Remaining risk or open question:
```

Do not erase the failed artifact once a corrected one exists. Keep both, with timestamps or version identifiers. If the material contains private information, store evidence in its authorized location and publish only a redacted account.

A successful retry shows that the revised run worked. It does not establish that the contributing failure is impossible. Add the failure to the next review set.

Next: https://agentriders.com/training/when-your-dragon-breathes-fire/
