---
name: document-trace
description: Map consequential document content to understandable Case entries or sources. Use when genre, consequence, citation, reader trust, or maintenance requires traceability.
user-invocable: true
argument-hint: "[shaped artifact] [snapshot set]"
---

# Document Trace

Bind a shaped artifact revision to its retained Case state and direct-source basis.

Tracing records support for semantic units separately from reader-facing prose. It enables fidelity review, stale detection, visual/table coverage, target locator updates, and safe publication decisions.

## Operation Contract

- **Inputs:** semantic or shaped artifact, relevant Cases or direct sources, and trace scope determined by genre and risk.
- **Outputs:** concise trace sidecar, source/citation guidance, coverage status, and blockers where support is inadequate.
- **Quality purpose:** make consequential claims, decisions, evidence synthesis, citations, and meaning-bearing visuals checkable without a provenance ledger.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` when trace scope, audience access, or a material source conflict requires coordination.

Load `../document/resources/operation-result.md` before returning a result.

- Always load `resources/artifact-trace-v1.md`. Produce an `artifact.trace.md` sidecar for each artifact revision selected for review, target formatting, staging, release, or reuse when trace is applicable under the coordinator's genre and risk conditions.
- Bind support to identifiable Case entries or direct sources; record stable snapshot references when the Case provides them.
- Use fully qualified support references: `<case-id>/<snapshot-id>/<entry-id>`.
- Keep internal support locators separate from reader-facing references. A Case ID, local path, private workspace locator, or trace-sidecar anchor proves internal support but is not a usable citation for an audience that cannot resolve it.
- Trace semantic units rather than every sentence.
- For a retained visual anchor, trace the takeaway and each material relationship, comparison, or quantity it must show. Record prose-preserved meaning separately. Do not turn every supporting Case entry, operation, node, or validation label into a reader-facing visual requirement.
- Account for selected, intentionally omitted, and deferred Case entries.
- Identify unsupported material assertions, missing material anchors, stale support, status or authority conflicts, and untraced material visual or table assertions as blockers.
- Route semantic discoveries or unsupported new accepted meaning to `document-reconcile`.
- For each reader-facing citation or evidence link, select an audience-accessible original or approved substitute. If none exists, record the limitation and use uncited qualified prose or omit the claim as appropriate; never emit a local filesystem reference as a citation for an external or otherwise non-local audience.
- Load `resources/coverage-check.md` before declaring trace complete. Load `resources/staleness-check.md` when later support may affect the pinned artifact. Load `resources/visual-tracing.md` for every material table or visual.

## Publication Invariant

Load `../document/resources/publication-readiness.md`. Classify applicable trace blockers as non-waivable publication invariants and return semantic changes to author-approved reconciliation.

## Boundary

- Do not edit the Case directly.
- Do not perform review, formatting, external publication, or target-specific locator writes beyond trace skeleton obligations.

## Progressive Resources

Load only the trace resources needed for the current check from `resources/`.
