# C5 And C6 Document-System Exercise

This local, human-executed fixture exercises the C2 PRD, C3 change brief, C5 implementation report, and C6 explanation-document paths using the integrated notification retry-policy source bundle.

- **Attempt:** `exercise-05-attempt-01`
- **Inputs:** `notification-retry-policy/SNAP-005`, the frozen stale `baseline-r1`, and current safe `successor-r2`
- **Source fixture:** `../../../../../case-intake/resources/fixtures/exercises/contradictory-local-bundle/`
- **External actions:** none
- **Publication:** intentionally blocked; no destination or write authorization was supplied
- **Comparable baseline:** `baseline-r1` remains frozen and stale. It is used only to explain the evidence/authority change; it is never a current recommendation.

## Case Outcomes

| Case | Exercise output | Outcome | Reader and bounded action | Burden |
|---|---|---|---|---|
| C2 PRD | `c2-prd.md` | Reviewable requirement basis with a blocking validation/decision gap | RFC planner: keep the count out of the RFC and request no implementation plan or owner | No author question; the Case does not supply a replacement configuration, owner, schedule, or acceptance threshold. |
| C3 change brief | `c3-change-brief.md` | Reviewable change explanation | Reviewer: confirm the baseline is not used and the successor's no-count boundary is preserved | No author question; the evidence and approval transition are already recorded. |
| C5 implementation report | `c5-implementation-report.md` | Local fixture report, not a production implementation report | Engineering handoff: verify document-system outputs against recorded local checks only | No author question; deployment, stakeholder, and production evidence remain unverified. |
| C6 explanation | `c6-explanation.md` and `c6-explanation.html` | Reviewable local explanation | Fresh reader: understand the six concepts and use the safe successor entrypoint | No author question; this teaches existing workflow boundaries and creates no new policy. |

## Shared Inputs And Boundaries

- The C2/C3/C5/C6 source of accepted retry-policy meaning is `notification-retry-policy/SNAP-005`.
- The normal entrypoint is `artifacts/retry-policy-research-report/INDEX.md`, which selects `successor-r2` for current reader action.
- `OBS-004` is evidence that removes four-retry report support. `APR-004` approving `DEC-003` is the separate authority for the current no-count direction.
- C6 uses the source fixture and local shared skill instructions as qualified inputs. It is not a claim that one Case authorizes changes to the document system itself.
- The C6 concept map includes separate source, Case, artifact, trace, review, format, and publish nodes. It does not collapse them into a universal AST or a shared approval authority.

## Contents

1. `c2-prd.md`, `c3-change-brief.md`, and `c5-implementation-report.md` record representative adapter exercises.
2. `c6-explanation.md` is the portable flagship explanation; `c6-explanation.html` is its local visual companion.
3. `c6-explanation.trace.md` records semantic and visual support, selection, omissions, and blockers.
4. `visual-specs/` holds one semantic spec for each required concept.
5. `reviews/` records staged fidelity, genre, fresh-reader, and presentation review.
6. `presentation-evidence.md` records HTML inspection; `publish-plan.md` records the no-write outcome.
