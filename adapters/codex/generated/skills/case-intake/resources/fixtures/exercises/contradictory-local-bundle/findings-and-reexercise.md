# Accepted Findings And Re-Exercise

These findings were accepted as remediation scope. This record is not Case authority and does not replace either author approval event.

## Before Remediation

| Finding | Observed issue | Evidence |
|---|---|---|
| F-EX01-001 | Intake and reconciliation records were split across two roots, so no single Case root contained complete history. | Initial exercise `README.md` linked to a sibling fixture. |
| F-EX01-002 | Some decision records paired `author-approved` provenance with source evidence, obscuring that approval and evidence are distinct. | Initial `SNAP-001` and sibling reconciliation records. |
| F-EX01-003 | Invocation and reviewer language did not make the human-executed skill path and reviewer non-authority boundary explicit enough. | Initial exercise README and reviewer observations. |
| F-EX01-004 | The later capacity evidence and contradiction were distributed across roots, weakening direct inspection of the stale-artifact result. | Initial sibling reconciliation fixture. |
| DSK1-REV-001 | Author-review prose had no-padding guidance but its example still implied minimum bullet counts; reconciliation still had a three-question target. | `author-approval.md` and `reconciliation.md`. |

## After Re-Exercise

Follow `INVOCATION.md` against this single root.

1. `source-records.md` registers `SRC-001` through `SRC-003` before `pre-approval-case.md`; `APR-001` creates immutable `SNAP-001`.
2. `SRC-004` is registered in the same source inventory before the reconciliation queue is considered.
3. `OBS-003` directly contradicts `DEC-001` and `ALT-001`; `ARI-001` records a blocking immediate interrupt rather than adopting capacity evidence as policy.
4. The author correction is separately durable in `APR-002`. `SNAP-002` retains its historical provenance/authority representation and digest; it is not rewritten. `APR-003` explicitly approves the corrected representation in successor `SNAP-003`.
5. `SNAP-003` preserves source-derived provenance and source locators for source-backed entries while retaining `APR-001` and `APR-002` as authority records. `STALE-001` preserves the RFC's original pinned snapshot set and requires review before reader action.
6. The author prompt and reconciliation resource both permit zero through seven material questions and explicitly prohibit padding.

## Result

The re-exercise closes the accepted findings through inspectable Markdown records. It makes no claim of automated semantic validation, independent stakeholder approval, or external publication.
