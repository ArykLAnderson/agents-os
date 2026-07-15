# Exercise Invocation

This exercise is performed by following the canonical skills, not by running a parser, schema, or state validator.

## Intake

1. Invoke `case-intake` with this directory as the supplied local bundle, the purpose in `README.md`, and no discovery grant.
2. Register `SRC-001` through `SRC-003` from `sources/` in `source-records.md` before extraction.
3. Produce the non-binding candidates in `pre-approval-case.md`. Do not treat the superseded policy, transcript proposal, or channel assertion as current authority.
4. Present `author-review-prompt.md`; record the explicit response in `author-response-intake.md` and durable approval in `approvals/APR-001.md`.
5. Create `SNAP-001` only after that response. Its manifest is immutable at `snapshots/SNAP-001.entries.md`.

## Reconciliation

1. Invoke `case-reconcile` with `sources/later-capacity-evidence.md` as new evidence for this existing Case.
2. Register `SRC-004` in `source-records.md` before extracting a later observation.
3. Record the blocking, direct contradiction between the accepted three-retry decision and the capacity result in `queue/author-review.md`. Halt use of the RFC draft.
4. Apply only the explicit correction in `author-response-reconciliation.md` and `approvals/APR-002.md`; preserve `DEC-001` and create successor `DEC-002`.
5. Create immutable `SNAP-002` and issue `staleness-notice.md` without changing the RFC's pinned `SNAP-001` trace.

## Review Boundary

Use `reviewer-packet.md` for an independent source-fidelity and burden inspection. The reviewer may record findings in `reviewer-result.md`, but cannot approve entries, resolve gaps, or modify Case authority. Review findings are evidence for reconciliation only.
