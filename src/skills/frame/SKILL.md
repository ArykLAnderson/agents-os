---
name: frame
description: Frames a consequential, under-specified outcome into fit-for-purpose knowledge, decisions, and requested artifacts. Use when the user explicitly asks to frame an outcome, or when material uncertainty, competing interpretations, or authority-dependent judgment requires coordinated discovery and challenge.
---

# Frame

Guide one natural-language outcome from uncertainty to human acceptance. Own navigation, legwork, and momentum; preserve human ownership of intent, authority, consequential judgment, and external authorization.

## Start Or Resume

Use an explicit user-provided Casebook workspace root when present; otherwise use `.casebook/` in the current project. Treat it as private and Git-ignored. Create or resume `frames/<frame-id>/frame.md` and `discovery.md` beneath that root using [references/state.md](references/state.md). Reuse relevant Cases as condensed priors, not unquestionable truth.

Scale persisted state to the outcome. An explicit framing request always opens or resumes a Frame, even when the outcome needs only bounded discovery and a short artifact. Keep such Frames compact rather than routing around them.

## Clean-Context Legwork

The Frame thread is the coordinator, not the workbench. Delegate bounded autonomous operations that create substantial iterative context—research, prototyping, repository archaeology, fault injection, broad evidence extraction—to fresh-context workers by default. Keep user interaction, scope and authorization, synthesis, Frame Discovery mutation, Case reconciliation, and consequential decisions in the Frame thread.

Before delegation, define the operation question and output, evidence standard, authorized environment and effects, prohibited resources, and the minimum relevant Case/source context. The worker owns execution, debugging, evaluation, and authorized disposal inside that boundary. It returns a compact result with the artifact locator, exact evidence or verification commands, limitations, and residual state. Preserve detailed logs in the artifact rather than streaming them into the Frame thread.

Execute legwork inline only when it is a single-pass operation requiring no iterative build or debugging and no substantial logs or scratch artifacts, or when the user explicitly requests inline execution. An agent explicitly delegated the operation is already the worker and does not delegate it again. If fresh-context workers are unavailable, surface that limitation before context-heavy legwork rather than silently importing it into the Frame thread.

## Relentless Loop

1. Restate the primary outcome and expressed scope without redefining them.
2. Identify what is unresolved and whether model work or human authority can resolve it.
3. Choose the smallest fitting internal operation:
   - [Discovery](references/discovery.md) for external or repository evidence.
   - [Interview](references/interview.md) for bounded human knowledge or judgment.
   - [Modeling](references/modeling.md) for concepts, rules, states, and interpretations.
   - [Structure](references/structure.md) for responsibilities, capabilities, and information flow.
   - [Review](references/review.md) to challenge a coherent direction.
4. At each natural boundary, sweep the completed work for **every independently reusable semantic unit or cohesive cluster**. Give each one exactly one Case disposition:
   - **Intake** newly established meaning that will reduce future discovery, interpretation, or repeated explanation.
   - **Reconcile** accepted, provisional, or contested meaning that changes, qualifies, supersedes, or materially extends an existing Case.
   - **No Case** transient process detail, raw evidence retained elsewhere, duplicate meaning, or a result that is not independently reusable; record the reason in the Frame.

   One boundary may produce multiple dispositions. Do not postpone stable subordinate meaning merely because the broader Frame remains active or contested; use `provisional` or `contested` Case entries when appropriate. Defer only when the candidate meaning itself is too unclear to state independently.

   The boundary is not complete until every material operation result has been checked for reusable meaning, every selected Intake or Reconcile action is reflected in a valid Case, and every omitted material result has an explicit No Case reason. Cases condense reusable meaning and cite retained evidence; they do not absorb research reports, transcripts, or logs wholesale.
5. Continue model-resolvable work across operation boundaries. A persistence checkpoint or operation summary is not a stopping point: surface the concise checkpoint, then immediately begin the next model-resolvable operation in the same turn. Return control only when human knowledge, authority, preference, or judgment is required, the user asked to pause, or further work is blocked. Ask focused questions only at that point.
6. If the requested reader-facing artifact needs persistent revision, traceable claims, or release verification, continue through Document. A short artifact may be completed directly within the Frame when its accepted meaning and final location remain clear.
7. Propose completion only when the natural-language outcome, requested artifact, and any requested publication state appear satisfied and verified; ask the user to confirm, revise, or continue.

Before reporting completion, compare that claim with the persisted Frame and linked Document state. An outcome is not complete while either state describes material work as active, stale, blocked, pending review, unverified, or unaccepted.

The user may redirect scope, order, depth, operation, or stopping at any time. Complete bounded directed work, then resume guided navigation unless the user pauses or establishes a continuing constraint.

Confirm before materially expanding scope, changing the primary outcome, adding an unrequested artifact or destination, or accepting a consequential trade-off.

## Optional Capabilities

Use `prototype` when disposable evidence can discriminate one question, and `deliberate` when two or three credible alternatives need forced-perspective comparison. If Prototype is unavailable, run a bounded experiment around one explicit question and report observed evidence, limitations, disposition, and exactly one verdict: `supported`, `rejected`, or `inconclusive`. If Deliberate is unavailable, compare every credible alternative against shared criteria and preserve disagreement and human judgment.

Quick local prototypes may proceed within ordinary local authority. Before dev, credentialed, shared-resource, costly, or external-write prototypes, present a grouped authorization batch covering objective, environment, credential purpose, data class, actions, persistence, blast radius, and expected cost. Approval lasts one continuous execution window by default. The user may explicitly extend it across Discovery, the Frame session, or standing project guidance. Renew after resumption unless permission explicitly survives it; expansion always requires confirmation.
