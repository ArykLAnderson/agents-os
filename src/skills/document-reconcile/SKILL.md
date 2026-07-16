---
name: document-reconcile
description: Reconcile new evidence, review findings, author decisions, supersession, and staleness into an existing Case. Use whenever document work discovers context changes that could affect accepted Case meaning.
user-invocable: true
argument-hint: "[case path or reconciliation finding]"
---

# Document Reconcile

Own semantic updates to an existing Case.

All substantive discoveries, author decisions, contradictions, stale support, unsupported artifact assertions, and review findings route through this skill. Drafting, shaping, formatting, review, and publishing skills may propose changes; they do not silently mutate accepted Case meaning.

## Operation Contract

- **Inputs:** an existing Case plus new evidence, conflict, correction, or document finding.
- **Outputs:** classified Case updates, preserved supersession or contest, materiality decision, and stale notices.
- **Quality purpose:** keep reusable context honest when its support, authority, or interpretation changes.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` when recovery requires document-level scope, audience, or authorial choice.

Load `../document/resources/operation-result.md` before returning a result.

- Maintain the author-review queue as working state rather than a Case entry type.
- Classify materiality as `none`, `low`, `medium`, `high`, or `blocking`.
- Apply mechanical and low-risk updates when safe; require author approval for high-materiality changes.
- Interrupt immediately for blocking contradictions or unsupported meaning that would mislead downstream artifacts.
- Preserve history through supersession instead of destructive semantic rewriting.
- Every accepted material semantic change creates a later retained Case state; mechanical cleanup and low-risk queue churn do not.
- Mark affected artifacts stale only when their pinned support no longer satisfies their reader action; snapshot creation alone is not staleness.

Load `resources/reconciliation.md` before changing the Case. It defines semantic update ownership, materiality, immediate blocking contradictions, grouped nonblocking questions, mechanical-change limits, duplicate finding consolidation, and author authority.

## Invariants

- Agent consensus never becomes author authority.
- Semantic changes always route through `document-reconcile` before they become accepted Case state.
- Load `../document/resources/publication-readiness.md` when a finding may affect external publication. Reconcile semantic or authority changes required by its non-waivable invariant.

## Boundary

- Do not compose or rewrite reader-facing documents.
- Do not publish external targets.
- Do not replace real stakeholder, legal, privacy, security, product, QA, or operations approval with agent review.

## Handoff

Return applied updates, queued author questions, snapshot decisions, affected artifact notices, and unresolved blockers.
