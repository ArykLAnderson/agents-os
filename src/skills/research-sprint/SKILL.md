---
name: research-sprint
description: Parallel team investigation with cross-pollination. Use for open-ended exploration, technology evaluation, or a bounded question requiring several independent evidence tracks.
user-invocable: true
argument-hint: <research question or topic>
---

# Research Sprint

Investigate one bounded question through independent evidence tracks, targeted cross-pollination, and owner-led synthesis. Agent behavior is task-defined; do not depend on generic scout or researcher personas.

## 1. Bound The Question

Establish:

- the question and decision it informs;
- two to four genuinely distinct evidence dimensions;
- scope, source-quality expectations, and time sensitivity;
- what remains human judgment.

Use one ordinary research pass when dimensions are not independent. Completion criterion: each proposed track can produce useful evidence without another track's result.

## 2. Define Track Contracts

For each track provide:

```markdown
## Objective
The evidence question owned by this track.

## Shared context
The overall question, constraints, and sibling track names.

## Evidence standard
Preferred primary sources, local terrain, freshness, and provenance requirements.

## Deliverable
- findings with citations or file references
- confidence and limitations
- contradictions or missing evidence
- implications for the overall question

## Stop conditions
Material ambiguity, inaccessible authority, or a decision the researcher cannot make.
```

Define domain expertise directly in the task contract. Create a durable perspective only when a genuinely recurring decision lens needs persistent doctrine; topic expertise alone does not justify an agent specification.

Completion criterion: every track has a distinct evidence owner and common handoff format.

## 3. Execute Independently

On Pi, load `pi-workflow-orchestration` and use a named workflow with parallel unroled agents. Select the `workhorse` capability alias and appropriate tools per track; the track contract, not the alias, defines research behavior. Other harnesses use their native bounded parallel facility; do not copy Pi workflow syntax where unsupported.

Agents collect evidence and expose uncertainty. They do not make the final consequential recommendation.

Completion criterion: every track returns provenance-bearing findings, limitations, and implications.

## 4. Cross-Pollinate Only Materially

Compare first-round outputs for:

- contradictory claims;
- shared assumptions;
- evidence that changes another track's conclusion;
- gaps that block synthesis.

Run one targeted second pass only for affected tracks, injecting the exact conflicting evidence or changed premise. Do not run ceremonial debate rounds.

Completion criterion: every consequential contradiction is either resolved by evidence or preserved for synthesis.

## 5. Synthesize With A Stronger Owner

On Pi, use `workhorse` for ordinary synthesis, `involved` for cross-cutting synthesis, and `exceptional` only when ambiguity and consequence make the final judgment exceptional. The synthesizer receives all track outputs and owns integration, not source collection.

Produce:

```markdown
## Research Report: <topic>

### Question And Scope
### Findings By Track
### Cross-Cutting Evidence
### Contradictions And Limitations
### Recommendation
### Remaining Human Judgment
### Sources
```

Distinguish evidence from inference. Preserve consequential disagreement rather than averaging confidence or voting.

Completion criterion: every recommendation traces to evidence, every unresolved conflict is visible, and no agent-written recommendation is mistaken for human authority.
