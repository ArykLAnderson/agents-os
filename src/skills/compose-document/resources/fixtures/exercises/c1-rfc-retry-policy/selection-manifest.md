# Selection Manifest

- **Artifact:** notification-retry-policy decision brief, candidate rev-02
- **Genre:** RFC
- **Pinned snapshot set:** notification-retry-policy/SNAP-003
- **Artifact type:** decision record
- **Case-backed reader action:** none; DEC-002 is already accepted
- **Supplied exercise action:** review whether the decision record faithfully presents DEC-002
- **Recommended shaping strategy:** `decision-brief`; fit confirmed because one accepted decision and one approver action are in scope

## Selected Entries

| Reference | RFC role | Treatment |
|---|---|---|
| notification-retry-policy/SNAP-003/INT-001 | Reader purpose | State the RFC-ready policy direction goal and retain the policy/planning boundary. |
| notification-retry-policy/SNAP-003/DEC-002 | Current decision | Lead the brief with the accepted four-retry direction. |
| notification-retry-policy/SNAP-003/OBS-003 | Evidence and trade-off | Explain why three and five retries are not selected. |
| notification-retry-policy/SNAP-003/DEC-001 | Historical comparison | Label as superseded context, never as current policy. |
| notification-retry-policy/SNAP-003/ALT-001 | Rejected alternative | Explain the rejected five-retry proposal through the capacity result. |
| notification-retry-policy/SNAP-003/GAP-001 | Authority boundary | State that policy authority was resolved through APR-002. |

## Omitted Or Deferred

| Reference | Disposition | Reason |
|---|---|---|
| notification-retry-policy/SNAP-003/OBS-001 | Omitted from the candidate body | It is historical source detail already represented by superseded DEC-001; retaining both would duplicate the three-retry context. |

`OBS-002` is not present in SNAP-003 and is not eligible for this composition. Its disputed, weak-authority claim remains in the Case ledger outside the pinned accepted snapshot.

## Blocking Gaps And Conflicts

No composition blocker remains for the decision record. The policy is already accepted in DEC-002 and APR-002, so the artifact has no Case-backed reader action. The supplied exercise action is external review context and cannot become Case authority, trace support, or a publication instruction. The Case does not specify an implementation owner, schedule, rollout plan, or authorization to begin implementation; the record must not imply any of those facts.

## RFC Composition Basis

1. **Decision:** use four retries for failed notification delivery during the migration.
2. **Scope:** migration retry behavior before dead-lettering; no claim about unrelated notification policy.
3. **Evidence:** three retries missed delivery rate; four sustained it; five exceeded the dead-letter latency target.
4. **Trade-off:** retain three retries only as superseded history and reject the five-retry proposal for this migration.
5. **Record boundary:** document the accepted direction as input to a later planning discussion without requesting approval, implementation, or owner assignment.
