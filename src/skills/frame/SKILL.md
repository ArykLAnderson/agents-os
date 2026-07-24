---
name: frame
description: Frames a consequential, under-specified outcome into fit-for-purpose knowledge, decisions, and requested artifacts. Use when the user explicitly asks to frame an outcome, or when material uncertainty, competing interpretations, or authority-dependent judgment requires coordinated discovery and challenge.
---

# Frame

Guide one natural-language outcome from uncertainty to human acceptance. Own navigation, legwork, and momentum; preserve human ownership of intent, authority, consequential judgment, and external authorization. Frame owns semantics; the workspace-selected `casebook-persistence` variant owns storage mechanics.

## Start Or Resume

Resolve authority through the environment: if `CASEBOOK_DATABASE_URL` is set, use SQLite at that path; otherwise use Markdown at the project's `.casebook/` workspace (or an explicit user-provided root). Resolve locators to absolute paths and treat workspace state as private and Git-ignored. Before every ordinary create, resume, discovery, lifecycle, or natural-boundary persistence operation, read and follow [references/persistence.md](references/persistence.md). Invoke the matching connector's typed Frame surface. Fail closed when the resolved database or workspace is missing or invalid; never probe both connectors, fall back, dual-write, or directly edit Frame or Discovery files.

Discover an existing Frame through the selected connector, establish its stable identity, and resume only the complete aggregate returned by `frame.read`. Otherwise create one complete typed aggregate through `frame.create` using [references/state.md](references/state.md). Reuse relevant Cases as condensed priors, not unquestionable truth.

Scale persisted state to the outcome. An explicit framing request always opens or resumes a Frame, even when the outcome needs only bounded discovery and a short artifact. Keep such Frames compact rather than routing around them. File-authoritative Markdown remains fully operational and independently readable, but its connector is the only ordinary writer.

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

   The boundary is not complete until every material operation result has been checked for reusable meaning, every selected Intake or Reconcile action is reflected in a valid Case, and every omitted material result has an explicit No Case reason. Follow the [persistence procedure](references/persistence.md): first commit complete Frame accounting, perform each Case mutation as a separate Case commit, then commit a fresh complete Frame aggregate to settle visible Case revision evidence. Use temporary `pending_classification`, Intake/Reconcile `awaiting_case` or `settled`, and classified `no_case` exactly as defined there. Cases condense reusable meaning and cite retained evidence; they do not absorb research reports, transcripts, or logs wholesale.
5. Continue model-resolvable work across operation boundaries. A persistence checkpoint or operation summary is not a stopping point: surface the concise checkpoint, then immediately begin the next model-resolvable operation in the same turn. Return control only when human knowledge, authority, preference, or judgment is required, the user asked to pause, or further work is blocked. Ask focused questions only at that point.
6. If the requested reader-facing artifact needs persistent revision, traceable claims, or release verification, continue through Document. A short artifact may be completed directly within the Frame when its accepted meaning and final location remain clear.
7. Propose completion only when the natural-language outcome, requested artifact, and any requested publication state appear satisfied and verified; ask the user to confirm, revise, or continue.

Before reporting completion, use the selected connector to read the persisted complete Frame and compare that claim with its completion evidence and linked Document state. An outcome is not complete while either state describes material work as active, stale, blocked, pending classification, awaiting Case realization, pending review, unverified, or unaccepted.

The user may redirect scope, order, depth, operation, or stopping at any time. Complete bounded directed work, then resume guided navigation unless the user pauses or establishes a continuing constraint.

Confirm before materially expanding scope, changing the primary outcome, adding an unrequested artifact or destination, or accepting a consequential trade-off.

## Optional Capabilities

Use `prototype` when disposable evidence can discriminate one question, and `deliberate` when two or three credible alternatives need forced-perspective comparison. If Prototype is unavailable, run a bounded experiment around one explicit question and report observed evidence, limitations, disposition, and exactly one verdict: `supported`, `rejected`, or `inconclusive`. If Deliberate is unavailable, compare every credible alternative against shared criteria and preserve disagreement and human judgment.

Apply Prototype's Authorization Boundary without broadening or narrowing it. Proceed autonomously with isolated, no-incremental-cost local disposable work, including prototype-owned VMs or containers, ordinary public downloads, isolated unprivileged dependencies, fault injection, reboot, process termination, and cleanup. Ask only for the conditions identified by Prototype's Authorization Boundary. When permission is required, present one grouped batch covering objective, environment, credentials, data, effects, persistence, blast radius, and expected cost. Do not renew permission merely because execution resumed; renew only when the authorization expired or the proposed effects expand beyond it.
