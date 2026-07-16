---
name: document-review
description: Select and run document review lenses against artifacts and available context, then consolidate findings without changing accepted meaning. Use whenever current risk, genre, representation, or unresolved conditions call for review.
user-invocable: true
argument-hint: "[artifact and trace] [review scope]"
---

# Document Review

Review a Case-backed artifact through bounded, adaptive lenses.

The review system checks fidelity, genre fit, editorial quality, presentation quality, and fresh-reader comprehension. It consolidates findings by semantic issue and routes material changes through `document-reconcile`.

## Operation Contract

- **Inputs:** artifact, audience and purpose, relevant Case or trace material, target representation when present, and risk-informed lens scope.
- **Outputs:** one consolidated finding register with blocking or disclosable disposition and smallest faithful recovery path.
- **Quality purpose:** expose purpose-undermining or misleading gaps without forcing every review lens or substituting for real stakeholder approval.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` for material ambiguity, checkpoint decisions, or recovery selection.

Load `../document/resources/operation-result.md` before returning a result.

- Select lenses according to genre, risk, representation, and unresolved conditions. For substantial or high-risk Case-backed work, run case fidelity, isolated fresh-reader comprehension, and editorial quality before completion. Add genre review when the adapter declares obligations. Add presentation quality after a reader-facing target exists. Record an explicit `not-applicable` rationale for any default lens omitted.
- For substantial prose, run a low-context readability pass on the selected shaped prose after its main structure is complete. This pass evaluates naturalness, paragraph flow, conceptual grounding, and whole-article understanding without seeing the Case, trace, source accounting, prior review discussion, or author rationale.
- Do not infer readability from Case coverage, trace completeness, grammatical correctness, or the presence of every required concept. A fully supported artifact can still fail because it reads like reordered source accounting or because correct sentences are unnaturally adjacent.
- Review each meaning-bearing visual in narrative context: the prose immediately before and after it, its visual anchor, caption, textual equivalent, and intended reading size. Test whether it answers its reader question, reduces cognitive effort, and preserves the shaped takeaway without relying on a corrective caption. Recommend revision, redesign, decomposition, relocation, conversion, or removal as needed.
- Treat fresh-reader simulation as comprehension evidence, not real stakeholder approval.
- Consolidate duplicate findings and budget author-facing output.
- Send semantic changes, unsupported assertions, and material stakeholder questions to `document-reconcile`.
- Return the smallest faithful recovery route with each finding: `document-reconcile` for Case meaning or support, `document-compose` for missing or corrected substance, `document-shape` for reader flow, `document-trace` for coverage, and `document-format` for representation. After recovery, recommend rerunning only the lenses and checks made stale.
- Complete review only when the selected lenses ran, omitted default lenses have a rationale, duplicate findings are consolidated, and every material finding has a disposition and smallest recovery route.

## Boundary

- Do not replace real product, technical, security, legal, privacy, operations, QA, or stakeholder approval.
- Do not waive trace or semantic blockers.
- Do not publish external targets.
- Do not run unrelated review councils or security review unless explicitly requested by a later ticket or user.

## Progressive Resources

Available lenses live under `resources/lenses/`: case fidelity, fresh-reader comprehension, editorial quality, genre review, and presentation quality.
