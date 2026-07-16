# Change Brief Composition Adapter

Use this adapter when a reviewer needs to assess a bounded proposed or completed change without reconstructing its intent from source material.

**Structure mode:** adaptive. Lead with the review action, but select only the sections the bounded change needs.

## Reader Contract

- State the review action, change boundary, and decision requested in the opening section.
- Present what changes, why it changes, what stays unchanged, how it was checked, and the material risk or unresolved question.
- Distinguish an implemented observation from a proposed change, and a test result from a production or stakeholder outcome.

## Selection And Gaps

- Select current decision, affected behavior, evidence, constraints, alternatives, and verification evidence relevant to review.
- Keep evidence and authority separate. A source observation can explain a change without authorizing it.
- Account for rejected alternatives, stale baselines, and omitted context when they could cause an incorrect review conclusion.
- Block a review brief that cannot identify the change boundary, current revision, or requested review action.

## Draft Basis

Use stable anchors for the requested review, behavior delta, evidence, risk, and verification. Recommend `review-briefing` when the reader should review a known change; do not use it to conceal an unresolved product decision.

Route new requirements, an untraced claim of completion, or a scope/authority change to `document-reconcile`.
