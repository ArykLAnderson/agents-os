---
name: document
description: Coordinate an adaptive Case-backed document workflow from natural-language document intent. Use to begin or resume a document session, select document operations from unmet conditions, reach a fit-for-purpose local or staged representation, and offer publication handoff.
user-invocable: true
argument-hint: "[document request, session, or artifact]"
---

# Document

Coordinate document work without imposing a fixed sequence. Interpret natural-language document intent, establish or resume a document session, inspect available conversation, Cases, supplied files, and permitted project context, then select the operation that addresses the most important unmet condition.

## Coordinator Contract

- **Inputs:** document intent or session request, active conversation, available Cases and direct sources, optional genre, destination, and audience constraints.
- **Outputs:** a compact session manifest, current semantic and target artifacts, condition status, findings, checkpoints, and publication handoff or verified destination state.
- **Quality purpose:** move a document toward fitness for its purpose and intended audience while retaining uncertainty, preserving reusable Case context, and keeping external authorization explicit.
- **Return:** summarize work performed; changed Cases, artifacts, or remote representations; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations.

## Start Or Resume

1. Infer the active topic boundary rather than ingesting the whole conversation. Identify genre, purpose, audience, distribution boundary, available evidence, and requested target from the request and nearby context.
2. Classify the work before selecting operations. Use subject complexity, context volume, number of decisions and dependencies, expected reuse, claim consequence, audience breadth, uncertainty, conflict, and adapter obligations. Document length and genre are weak signals only.
   - **Simple:** narrow purpose, little reusable context, low consequence, and few interacting claims. Direct sources may be sufficient.
   - **Substantial:** multiple decisions or sources, reusable context, specialized terminology, consequential claims, or several interacting concepts. Create or update a durable Case through `document-intake` before relying on the context for composition.
   - **High-risk:** consequential reader action, unresolved conflict, sensitive distribution, or strict genre or destination obligations. Require durable Case intake and stronger trace, review, and checkpoint conditions.
3. Search configured Case workspace sessions for a clearly matching document. Automatically resume only one dominant candidate. When several sessions plausibly match, present a short choice; never merge sessions implicitly.
4. Before writing, resolve the Case workspace. The project-local convention is `.cases/`; verify it is not Git-visible. If it is visible, ask the human whether to add `.cases/` to ignore rules or use another private location. Recommend `.git/info/exclude` when they do not want a shared `.gitignore` change.
5. Load `resources/workflow-manifest.md`, create or update `<workspace>/documents/<document-id>/workflow.md`, and retain Case context separately under `<workspace>/cases/<case-id>/`.
6. Load `resources/operation-result.md` before consolidating an operation handoff. Record only its current conditions, findings, revisions, and recommended work in the manifest; do not reproduce an operation history.

Do not classify a document as simple merely because its requested genre is informal, its source is one conversation, or its output is intended to be short. When the subject contains a durable system design, many settled decisions, specialized language, or interacting lifecycle rules, classify it as substantial even if the requested artifact is a blog post or explanation.

## State-Space Selection

Reason over conditions, not operation order. The universal conditions are:

- intent, audience, and distribution boundary are understood enough for current work;
- context is sufficient, and material conflict is resolved, represented as contested, or disclosed;
- a fit-for-purpose semantic artifact exists;
- consequential claims, decisions, evidence synthesis, citations, and meaning-bearing visuals are traceable when genre or risk requires it;
- no unresolved blocking review finding remains;
- the applicable review scope is complete and current, with omitted default lenses explicitly marked not applicable;
- the local or staged target representation has been inspected enough for its destination;
- adaptive human checkpoints needed for length, risk, uncertainty, or prior decisions are current;
- staging and release have separate explicit authorization when the destination distinguishes them;
- a requested release has been fetched or otherwise verified.

Genre adapters may add semantic obligations and declare structure mode: `adaptive`, `recommended`, or `required`. Destination and organization constraints may add representation conditions. Select one primary genre; create sibling sessions rather than silently blending two primary genres.

Select operations by unmet condition:

- `document-intake` for reusable source registration, classification, or new Case context; run it before composition for substantial or high-risk work unless an adequate current Case already exists.
- `document-reconcile` for evidence changes, conflict, correction, supersession, or stale support.
- `document-compose` for supported semantic substance.
- `document-shape` for reader journey and structure.
- `document-trace` when consequential support, citations, maintenance, or visual meaning needs mapping.
- `document-review` for risk- and representation-appropriate independent checks.
- `document-format` for a faithful target representation and visual route.
- `document-publish` only for an explicitly authorized `stage` or `release` destination action.

Operations may repeat, run out of order, or be omitted. Consolidate each returned operation result into the manifest; operations do not own the manifest. A directly invoked operation should recover trivial inputs from context and return to `document` for material workflow gaps.

Use this skill for a request to create, continue, or coordinate a document. Do not take over ordinary file lookup, editing, or document reading merely because the request mentions a document; route focused requests to the matching `document-*` operation only when its stated capability is requested.

## Clarification And Checkpoints

Reuse available conversation, Cases, supplied files, and permitted bounded investigation before asking. Ask one short round of related material questions only when evidence cannot resolve them. If several material gaps remain, narrow scope, disclose an assumption, or pause instead of producing false authority.

Use final representation review as the normal human checkpoint. Request an earlier outline, semantic, or authorial-decision checkpoint only when length, risk, ambiguity, or rework makes it valuable. Material edits to claims, decisions, scope, evidence interpretation, audience, distribution, risk, or meaning-bearing visuals make affected trace, review, checkpoint, citation, disclosure, and representation checks stale. Grammar and meaning-preserving formatting or restructuring do not.

Use isolated subagents when available for independent investigation, fresh-reader review, or context preservation. Give each a minimal self-contained packet and explicit authority limits. Fall back to one agent when isolation is unavailable. Reconcile ordinary disagreement; ask the human only about material ambiguity or authorial preference.

## Completion And Publication

A session is complete when a fit-for-purpose final local or staged representation exists, applicable conditions are satisfied, completion blockers are resolved or explicitly overridden by the human with a reason, no publication-invariant blocker is represented as publishable, no relevant checks are stale, required checkpoints are current, and remaining limitations are recorded. Publication is optional.

At completion, provide a soft handoff: identify the ready artifact, limitations, compatible destinations, and whether the human wants to stage or release. Staging never authorizes release. For destinations without a safe adapter, provide the ready local artifact and manual handoff.

## Boundary

- Do not turn this coordinator into a workflow runtime, rigid state machine, event log, provenance ledger, or mandatory document generator.
- Do not publish, stage, or release without destination-specific authorization naming the target, mode, artifact revision, audience, and write scope.
- Do not expose private source links or verbatim private material in reader-facing output without authorization.
