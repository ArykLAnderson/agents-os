---
name: document-compose
description: Create supported document substance from Case context and direct sources through one primary genre adapter. Use when a session needs claims, decisions, requirements, caveats, or a semantic draft basis.
user-invocable: true
argument-hint: "[case snapshot set] [genre]"
---

# Document Compose

Create semantic document substance from Case context and direct sources.

Composition is adapter-driven. Load exactly the relevant genre adapter from `resources/adapters/`. The adapter declares whether its structure is `adaptive`, `recommended`, or `required`; do not turn flexible guidance into a fixed template.

## Operation Contract

- **Inputs:** document intent, audience, primary genre adapter, relevant Cases or direct sources, and optionally an existing semantic artifact.
- **Outputs:** a selected-source manifest plus a loose, supported semantic basis or material expansion. The basis groups related meaning for later prose; it is not a sentence-by-sentence rendering of Case entries.
- **Quality purpose:** decide what supported meaning belongs in the document without inventing authority or evidence.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` for material missing context, competing primary genres, or an authorial decision.

Load `../document/resources/operation-result.md` before returning a result.

- Proceed from sufficient classified Case context or direct sources; use stable Case references where available.
- Load one composition adapter for the requested genre.
- Preserve Case identity in multi-Case compositions.
- Produce a selected-entry manifest for accounting and a separate semantic basis for writing. Organize the basis into meaning clusters, relationships, tensions, examples, caveats, and possible explanatory moves. Several entries may support one cluster, and one entry may support several clusters.
- Preserve support and authority at the cluster level, but do not preserve Case order, entry boundaries, ledger phrasing, or one-entry-to-one-paragraph correspondence unless the genre requires it.
- Treat the semantic basis as loose intermediate material: complete enough to trace, flexible enough for shaping to combine, split, interleave, defer, or reorder supported points into natural prose.
- Identify blocking gaps, deferrable gaps, multi-Case conflicts, relevant omitted entries, and recommended shaping strategies.
- Route semantic discoveries or proposed new accepted meaning to `document-reconcile`.
- Keep compositions and drafts inside the document session under the approved Case workspace. Do not relocate them into a tracked documentation path without explicit author intent.

## Boundary

- Do not invent unsupported facts, decisions, requirements, benefits, or caveats.
- Do not shape the reader journey beyond the adapter’s composition guidance.
- Do not trace, review, format, or publish the artifact.
- Do not load unrelated adapters.

## Progressive Resources

Load only the selected file under `resources/adapters/`.

Initial adapter skeletons:

- `rfc.md`
- `prd.md`
- `change-brief.md`
- `research-report.md`
- `implementation-report.md`
- `explanation-document.md`
- `blog-post.md`
