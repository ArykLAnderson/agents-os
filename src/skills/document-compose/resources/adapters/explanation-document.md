# Explanation Document Composition Adapter

Use this adapter when a reader needs a correct mental model before taking a bounded action or evaluating a related artifact.

**Structure mode:** adaptive. Teach dependencies in the order the reader needs them rather than following a fixed outline.

## Reader Contract

- Name the audience, concept to understand, and action that understanding enables.
- Teach vocabulary and lifecycle before relying on them. A reader must not need the source Case or a diagram to recover the conclusion.
- State what the explanation does not establish, especially operational status, approval, or completeness.

## Selection And Gaps

- Select the smallest set of concepts, relationships, examples, boundaries, and caveats needed for the reader action.
- Preserve Case identity for multi-Case composition; a shared concept must not silently turn separate evidence or approvals into one authority.
- Select and account for counterexamples or omissions that prevent a plausible misunderstanding.
- Block an explanation when the needed concept depends on unresolved meaning rather than missing exposition.

## Draft Basis

Recommend `mental-model` as the primary shaping strategy. Add `review-briefing` only when the explanation ends in a specific review decision. Trace every semantic visual independently and retain a local text equivalent.

Route a new rule, authority claim, or changed meaning to `document-reconcile`.
