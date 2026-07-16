---
name: document-shape
description: Organize supported document substance into a reader journey using selected shaping strategy resources. Use whenever structure, hierarchy, or information flow needs improvement without inventing meaning.
user-invocable: true
argument-hint: "[composition artifact] [strategy]"
---

# Document Shape

Turn composed material into a readable artifact for a specific audience and action.

Shaping rewrites the semantic basis into prose. It may reorder, compress, expand, split, consolidate, interleave, tabulate, visualize, move material to appendices, and remove low-value prose only when meaning, authority, confidence, scope, and reader action remain faithful to the pinned Case snapshots.

## Operation Contract

- **Inputs:** semantic artifact, audience and reader action, and a suitable shaping strategy when one is needed.
- **Outputs:** reader-oriented artifact with stable semantic anchors and accounted-for omissions.
- **Quality purpose:** improve comprehension and decision flow while preserving supported meaning.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` when no strategy fits, a material reader decision is unresolved, or the semantic basis is insufficient.

Load `../document/resources/operation-result.md` before returning a result.

- Load one primary strategy and at most one bounded secondary strategy from `resources/strategies/`.
- When the selected genre adapter explicitly says no strategy resource is needed, shape the stated reader journey directly and record that adaptive choice. Do not invent a bespoke strategy resource.
- Treat audience, reader action, density, disclosure, evidence visibility, visual weight, risk visibility, and length as parameters.
- Establish the reader's prerequisites before leaning on specialized terms, actors, artifacts, relationships, or lifecycle rules. For a system explanation, close the world early enough that an unfamiliar reader can identify what the system is, who acts, what enters, what persists, how work is selected, what leaves, and which decisions remain human-owned.
- Give the artifact an effective entry point appropriate to its genre. A hook may be a concrete problem, observation, tension, promise, decision, or question; it must orient the reader into the actual subject rather than rely on privileged context, unexplained in-medias-res action, or atmosphere alone.
- Maintain a grounded-concept set while shaping. A beat or section may rely only on concepts the intended audience brings as prerequisites or that an earlier section has introduced. When a term names a new concept, land the idea and term together.
- Shape from meaning clusters and their relationships, not from the order of Case entries or selection rows. Mix support from several clusters when one paragraph needs it; split one cluster across the article when grounding, example, and consequence belong at different moments.
- Optimize paragraph adjacency explicitly. Each sentence should arise naturally from the previous sentence's subject, implication, contrast, question, or example. Flag an abrupt adjacency when two supported statements are individually correct but their connection exists only in the author's private model.
- Do not expose trace structure as prose structure. Readers should encounter a coherent explanation, not a visible march through source accounting. Trace the resulting semantic units after shaping.
- Give every visual opportunity one recorded disposition: `retained`, `converted-to-prose`, `deferred`, or `declined`, with a brief reader-effort rationale.
- For each retained opportunity, shape one **explanatory beat** with its surrounding prose. Decide its placement, one-sentence takeaway, reader prerequisites, prose before and after it, cognitive budget, details to omit, and semantic form such as comparison table, cards, boundary model, lineage, chart, or diagram.
- Create one visual anchor from `resources/visual-anchor.md` for each retained meaning-bearing visual. The anchor owns semantic scope, narrative role, and semantic form; formatting owns target realization. Do not expand a reader-facing visual to satisfy trace or implementation accounting.
- Preserve accepted Case meaning and explicit uncertainty.
- Create stable visible or hidden semantic anchors for downstream tracing.
- Account for selected entries that are omitted or deferred from the reader-facing artifact.
- Send unsupported discoveries, material caveat changes, or proposed accepted meaning to `document-reconcile`.
- Complete shaping only when material semantic units have stable locators, selected omissions are accounted for, every visual opportunity has a disposition, and every retained meaning-bearing visual has a stable visual anchor.

## Boundary

- Do not create new accepted Case meaning.
- Do not trace, review, format, publish, or reconcile on your own.
- Do not hide critical decisions, risks, caveats, or review asks behind progressive disclosure.
- Stop rather than inventing a bespoke strategy when no selected strategy fits honestly.

## Progressive Resources

Load only selected strategy files under `resources/strategies/`.

Load `resources/visual-anchor.md` when the shaped artifact retains a meaning-bearing visual.

Initial strategy skeletons:

- `decision-brief.md`
- `evidence-synthesis.md`
- `review-briefing.md`
- `mental-model.md`
