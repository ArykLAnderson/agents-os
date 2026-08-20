# Correction propagation

Use a correction record when an observed fact changes a material implementation, evidence, design, boundary, or delivery claim.

```markdown
Correction:
- Observed fact: <fact and evidence>
- Corrected claim: <claim before and after correction>
- Evidence owner: <code/runtime | test | provider | document projection | other observed source>
- Meaning owner: <Case, Frame boundary, Design/RFC Case, Atlas plan, human decision, provider policy, or none>
- Acceptance authority: <named human or governing acceptance process when accepted meaning or planning changes; otherwise none>
- Classification: <invalidation classification>
- Affected sources: <code, tests, contracts, or none>
- Affected projections: <documents, diagrams, plans, reports, or none>
- Invalidated evidence and gates: <proof that must be repeated or none>
- Unaffected claims: <material nearby claims and why they remain valid>
- Next owner and action: <bounded handoff>
```

## Trace dependency, not vocabulary

Propagate a correction only when another claim depends on the corrected fact. Do not update every file that mentions the same topic.

Check these dependency paths when relevant:

- implementation and immediate consumers
- public contracts and compatibility promises
- tests, reproductions, benchmarks, and manual observations
- reviewer findings and validator verdicts
- RFC text, diagrams, reports, and other projections
- Atlas tasks, prerequisites, convergence, and proof gates
- external provider state or environment assumptions

## Evidence invalidation

Invalidate evidence when the candidate, behavior, environment, dependency, accepted meaning, or safety assumption it tested has materially changed. Preserve the old result and name the invalidator. Do not rewrite history to make the old result appear current.

Repeat the smallest proof that covers the changed dependency. Broaden verification only when the correction increases the credible impact surface.

## Authority

The meaning owner reconciles a changed claim within its domain. Accepted Frame boundaries, Design/RFC Case decisions, and Atlas plans change only through their named human or governing acceptance process. Atlas owns accepted delivery-plan state, not architecture or product meaning.

An implementation worker may mark dependent design, planning, or policy claims stale but may not replace them. A reviewer or validator may report the dependency and invalidated proof but may not repair the candidate or accept new behavior.
