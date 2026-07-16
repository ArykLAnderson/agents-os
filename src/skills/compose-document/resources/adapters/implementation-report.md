# Implementation Report Composition Adapter

Use this adapter for a reader deciding what completed work is supported, what was checked, and what remains outside the demonstrated boundary.

## Reader Contract

- Lead with the delivered outcome, implementation revision, and handoff or verification action.
- Mark every material claim as implemented, observed, inferred, unverified, or future. Do not merge those labels into an aggregate success claim.
- State the frozen comparable baseline when the report describes a change from an earlier revision.

## Selection And Gaps

- Select change intent, revision, implementation evidence, verification evidence, limitations, residual risk, and the next decision.
- Preserve source and Case snapshot identity. For multi-Case reports, keep each Case's decision and evidence provenance distinct.
- Include only evidence inspected for the recorded revision. Mark unavailable deployment, accessibility, persistence, or user-outcome evidence as unverified instead of inferring it.
- Account for intentionally omitted low-value detail and any baseline that is historical or stale.

## Draft Basis

Recommend `review-briefing` for an engineering handoff and `mental-model` only when readers need an explanatory foundation before they can interpret evidence. Build a trace unit for every material implementation, verification, limitation, and visual assertion.

Route a new accepted outcome, changed requirement, or unsupported completion claim to `case-reconcile`.
