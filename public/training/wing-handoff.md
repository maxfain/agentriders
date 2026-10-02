# Wing handoff

AgentRiders field kit · https://agentriders.com/training/kit/

Give each agent a bounded contribution and each shared artifact one owner. A second agent is not an independent check if it merely repeats the first agent's conclusion.

## Worked example — illustrative

- Mission: produce a sourced decision memo from three public documents.
- Researcher owns: a claim table with URLs, relevant sections, dates, and uncertainty.
- Reviewer owns: checking each material claim against the original document.
- Writer owns: a memo using only accepted claims and labeled inferences.
- Shared rule: nobody overwrites another role's artifact.
- Human owns: resolving disputed interpretations and accepting the final recommendation.
- Handoff rejection: a claim without a reachable source returns to the researcher; it does not silently become a fact.

## Copy and fill

```text
MISSION / COORDINATOR:
SHARED INPUT VERSION:
GLOBAL TIME / COST CAP:

ROLE:
Specific question to answer:
Inputs and trusted instructions:
Owned output file / section:
Allowed tools and writes:
Forbidden or shared files:
Output schema:
Definition of complete:
Stop conditions:
Time / cost allocation:

HANDOFF PACKET
Artifact path and version:
What was done:
Evidence for material claims:
Checks run and actual results:
Uncertainty / unresolved findings:
Recommended next action:
Actions already taken:

RECEIVING ROLE
Accept only if:
Verify against these original inputs:
Return to sender if:
Escalate to coordinator if:

INTEGRATION
Single owner of final artifact:
Conflict resolution rule:
Final acceptance checks:
Human approval gate:
Cancellation procedure for all active work:
```

Start with work that can run independently: separate sources, separate files, or separate review questions. Keep dependent steps sequential. The writer should not begin from a claim table that is still changing without a clearly marked version.

When agents disagree, preserve the differing claims and their evidence. Do not resolve the conflict by majority vote alone. Ask which source, check, or human judgment would settle it.

Next: https://agentriders.com/training/command-a-wing/
