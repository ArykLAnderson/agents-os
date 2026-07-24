---
name: blueprint
description: Designs a coherent, consumer-sufficient engineering architecture from an accepted behavioral boundary. Use when module responsibilities, seams, ownership, interfaces, state placement, or failure boundaries require deliberate design before delivery planning.
---

# Blueprint

Own one resumable engineering-design session and its current authoritative candidate package. Turn accepted behavior into a Route-ready responsibility and Contract model without silently redefining behavior or planning delivery. Read [Artifact And RFC Projection](references/artifact.md) before creating, resuming, projecting, or accepting Blueprint state.

## Start Or Resume

Use an explicit Casebook workspace root when present; otherwise use `.casebook/` in the current project for Blueprint artifact placement. Before reading, creating, or declaring governing Casework unavailable, invoke `case` to resolve configured persistence authority. Project-local Blueprint placement does not select Case persistence authority. Preserve the exact selected-connector or identity-selection failure; never convert missing local Markdown state into a SQLite-unavailable exception. Create or resume `blueprints/<blueprint-id>/blueprint.md`. Bind the completed source Frame and every governing Case by stable identity and exact examined revision. Read the full persisted state and its bound authority before continuing.

Admit the subject only when its behavioral boundary is accepted and current enough to design. Separate the admission ledger into:

1. accepted behavior and qualities;
2. inherited accepted architecture;
3. Findings, contradictions, limitations, and deferrals.

Do not promote provisional or superseded Case knowledge. Reconcile the Blueprint continuously with its completed Frame Casework: after each natural boundary, compare new evidence and design consequences with the pinned Frame and Case revisions, reconcile reusable meaning into Cases when appropriate, and refresh bindings. The completed Frame need not be reopened for terrain facts, isolated architecture choices, Contract detail implied by accepted behavior, or realization questions. Return to or reopen Frame only when the proposed resolution would materially change, add, remove, or contradict the accepted behavioral boundary or qualities.

Admission does not authorize implementation, migration, or Route planning.

## Relentless Loop

Continue model-resolvable work across operation boundaries. Do not ask permission merely to advance to the next Blueprint operation. Pause only for human knowledge, authority, preference, consequential judgment, external authorization, material scope expansion, or explicit acceptance.

Choose the smallest operation that advances the current design condition:

1. [Terrain](references/terrain.md) — inspect relevant existing responsibilities, consumers, state, authority, Contracts/schemas, dependencies, failure boundaries, and friction before adding modules.
2. [Candidates](references/candidates.md) — materialize compact module candidates using the shared `Secrets`, `Contract`, `Depth`, `Unity`, and `Ownership` diagnostic lenses; compare consequential alternatives.
3. [Contracts](references/contracts.md) — refine selected interfaces, states, failures, and schemas only to the depth required by real consumers and material risks.
4. [Walkthroughs](references/walkthroughs.md) — trace each materially different consumer through declared Contracts, including relevant failure and recovery paths.
5. [Coverage](references/coverage.md) — map every accepted behavior and material quality to responsible modules, Contracts, evidence, or explicit Findings.
6. [Review](references/review.md) the coherent package against accepted behavior, applicable architecture guidance, unresolved Findings, canonization, and Route readiness.
7. [Artifact](references/artifact.md) — persist the current package at a natural boundary and maintain its verified RFC Document projection.

These are condition-selected operations, not a fixed one-pass pipeline. New evidence may return to terrain, candidates, Contracts, Frame, or Prototype.

Before completion review, run the [Requirement-Killer Pass](references/requirement-killer.md). This is an adversarial simplification operation, not another assurance ratchet. Challenge every requirement, mechanism, new abstraction, consumer-visible failure, and proof obligation introduced after admission; remove what lacks accepted behavioral authority or concrete evidence of necessity. A Blueprint cannot become eligible for acceptance while this pass has unresolved human decisions.

Do not create prose-presence tests for Blueprint guidance or artifacts. Tests that merely read Markdown and assert required wording, headings, or regex matches do not verify design behavior. Validate Blueprint changes through review, consumer walkthroughs, generated-output inspection, or executable behavioral checks where a real runtime exists.

An unmet completion condition is the next operation, not a stopping point. Once the candidate is coherent enough to review, launch the independent fresh-context reviewer in the same run; after disposition, create or repair the Document projection and verify it. If the candidate is not coherent enough to review, perform the smallest prior operation that makes it reviewable; lack of coherence is not a return condition. Return control only when the next unmet condition requires human authority or another stop named below. Never end merely by listing review, projection, or evidence as future gates that local tools can perform.

## Question Classification And Handoffs

Classify a question by the authority its answer would change, not by whether it sounds technical:

- **Terrain/evidence:** `Does the current API retry after a revision conflict?` Inspect or prototype; no human choice is implied.
- **Blueprint architecture:** `Which module owns retry policy and the canonical attempt state?` Resolve through candidates, evidence, and Architect judgment when consequential.
- **Behavioral boundary:** `Must a caller be able to cancel after a retry begins?` If the accepted Cases do not answer it and the answer materially changes behavior, return to or reopen Frame and reconcile Cases before resuming.
- **Realization:** `Which Leg migrates existing attempt rows, and in what order?` Record as a realization question for Route; do not design the Leg in Blueprint.
- **External authorization:** `May the prototype exercise the shared production queue?` Ask before the external effect; architectural acceptance does not grant it.
- **Acceptance:** `Do you accept Blueprint revision B7 and its stated trade-offs?` This is explicit Architect authority and must bind the verified RFC Document revision.

Blueprint may resolve design-local choices directly when accepted behavior is stable. Use `deliberate` when credible architecture alternatives need human-visible comparison. Supporting alternatives, evidence, and dispositions belong in Casework; the accepted Blueprint links to them and resolves exactly one architecture.

Do not bury a consequential delta inside final Blueprint acceptance. Before incorporating any proposed change that introduces or materially expands a consumer-visible failure, core interface or seam, mandatory configuration invariant, security/trust mechanism, migration burden, compatibility restriction, or proof protocol, present that delta separately through `decision-card`. State the prior design, proposed design, concrete motivating evidence or threat model, consumer and operational consequences, simpler alternatives, and what accepting the delta changes. General acceptance of a later bundled Blueprint does not retroactively authorize a delta that was never separately surfaced.

For a security-motivated delta, require a concrete security case naming the actor, controlled input, protected asset, attack path, and consequence. If that chain is absent, do not promote the proposal as a security requirement. Prefer structural removal of unsafe capability over request-time preflight, manifests, snapshots, or fail-closed behavior, and treat unsupported optional behavior as local non-applicability unless accepted product behavior requires a request failure.

Use `prototype` when an uncertain proposition materially determines authority, state ownership, external mutation, migration, compatibility, failure recovery, or another consequential boundary. Test the smallest discriminating failure condition and retain evidence and limitations.

## Persistence Cadence

Persist working reality at natural boundaries, not after every answer or graph edit. Follow the state content, proportional-depth, justified-`N/A`, authority, and projection rules in [Artifact And RFC Projection](references/artifact.md). A checkpoint is not completion and does not by itself require returning control.

When a bounded Frame handoff is required, Frame owns its interview and attention state. Accumulate related answers until a coherent checkpoint, reconcile durable meaning into Cases as one cohesive batch, then resume Blueprint against the completed Frame and exact accepted Case revisions. Do not edit governing Contracts or the candidate after every answer, and do not use Frame as a substitute for architecture work Blueprint owns.

## Human Decision Card

Apply `decision-card` to every context-bearing human question. Keep detailed alternatives, walkthroughs, evidence, and rationale in Blueprint/Casework rather than inflating the prompt.

## Authority And Stops

Proceed autonomously through research, repository inspection, modeling, candidate comparison, Contract drafting, walkthroughs, coverage, review, persistence, and Document projection work when those actions are local and non-destructive.

Confirm before:

- changing the accepted behavioral boundary;
- promoting a reviewer recommendation into the authoritative candidate package, package-membership rules, acceptance criteria, or proof protocol unless accepted authority already requires it;
- accepting a consequential architecture or trade-off on the Architect's behalf;
- adding or expanding a consumer-visible failure, core interface or seam, mandatory configuration prerequisite, security/trust mechanism, compatibility restriction, migration burden, or proof protocol, even when proposed as a reviewer correctness or security repair;
- materially expanding scope;
- performing credentialed, shared-resource, costly, destructive, deployed, or externally mutating work;
- authorizing implementation, migration, publication, or delivery; or
- marking the Blueprint or RFC Document accepted.

Local read-only inspection and disposable local prototypes may proceed under ordinary tool authority unless project guidance says otherwise.

## Completion

The Blueprint is eligible for acceptance only when:

- the pinned behavioral boundary remains current and continuous Casework reconciliation has no material unsettled contradiction;
- relevant terrain was inspected deeply enough that the design has no material unchecked architectural assumption;
- consequential alternatives were compared and linked in Casework;
- every consequential post-admission delta was separately surfaced and explicitly dispositioned by the Architect before entering the candidate;
- the Requirement-Killer Pass challenged and minimized post-admission requirements, mechanisms, abstractions, failure modes, configuration prerequisites, and proof obligations;
- the candidate resolves exactly one coherent new architecture with explicit old-to-new change;
- every material module has a unified responsibility, useful Secrets, and sufficient change/runtime lifecycle Ownership;
- selected Contracts, states, failures, and schemas are consumer-sufficient without requiring implementation Secrets;
- material state, mutation, Contract, and schema definitions have one canonical owner and derived views have reconciliation rules;
- every changed boundary passed materially distinct consumer walkthroughs;
- behavior and quality coverage is complete or unresolved items are explicitly presented for disposition;
- blocking Findings are resolved and limitations, justified deferrals, realization questions, and review dispositions remain visible;
- an independent fresh-context challenge of the coherent current candidate has completed and every resulting Finding has a recorded disposition;
- the current Blueprint and supporting Case revisions are faithfully bound to a verified RFC Document projection;
- Route can design realization without inventing behavior, module, ownership, Contract, schema, or architecture acceptance decisions; and
- persisted state records the current revision, independent review evidence and Findings dispositions, and all other required acceptance evidence.

Architect acceptance is invalid and must not be given effect or used to set `accepted` unless that independent fresh-context challenge is complete, its Findings are dispositioned, and the persisted Blueprint state and acceptance provenance identify the independent review evidence. The Architect then explicitly accepts the current Blueprint revision, its consequential trade-offs, and the bound verified Document revision. Record all acceptance provenance before setting `accepted`. A Blueprint may instead end `rejected`, `abandoned`, or `superseded`.

Before returning from an active Blueprint run, inspect every unmet completion condition. For each condition, either complete it now or record the specific human/external stop that prevents it. “Independent review not performed,” “projection not verified,” and “evidence still needed” are invalid return states when the required work is locally available. If an independent reviewer cannot be launched, identify the concrete unavailable capability or external constraint and persist it as the blocking stop; the Blueprint cannot be accepted meanwhile. If only explicit Architect acceptance remains, present the reviewed, dispositioned, projection-verified revision for acceptance rather than reporting that acceptance is a future gate.

Acceptance authorizes Route design only. It does not authorize implementation, migration, publication, deployment, external mutation, or execution. Blueprint does not author Legs, Work Items, implementation plans, or execution state.
