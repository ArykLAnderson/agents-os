---
name: route
description: Ephemerally composes exact Feature Map candidates from accepted Blueprints and current terrain. Use when accepted architecture must become an inspectable Atlas planning package without making Route a durable authority.
---

# Route

Route is an ephemeral delivery-design method. It composes one or more complete Feature Map candidates from exact accepted Blueprint revisions and current terrain, presents each exact package for a trusted human decision, and hands an accepted package to a narrow recoverable Publisher. Route is not a durable artifact, plan, queue, or implementation coordinator. Feature Atlas is the sole durable accepted planning authority.

## Open An Ephemeral Session

Admit work only when:

- at least one governing Blueprint identity and exact accepted revision are resolvable;
- current terrain names source, observation time, scope, access limits, and material uncertainty;
- the requested destination and Maps to compose or coordinate are explicit;
- missing behavior returns to Frame/human authority and missing responsibility, Contract, compatibility assumption, or invalidator returns to Blueprint;
- before Map acceptance, Route is read-only planning; a later valid Map acceptance authorizes recording and configured mechanical Atlas projection of that exact candidate, while implementation, source/runtime effects, PR, merge, and deployment remain unauthorized unless separately granted to their owning workflow.

One Blueprint ordinarily has one stable Feature Map. A session may coordinate several accepted Blueprints and their separate Maps, but it does not combine their architecture, ownership, or acceptance. Referenced provider Blueprints remain bound to their own Maps.

Use [Session and candidate state](references/state.md). Disposable notes, transcripts, caches, and candidate-local labels may aid the interaction, but no downstream consumer may depend on them and none becomes accepted planning state.

## Compose The Complete Candidate

Choose the smallest reasoning operation fitting the current uncertainty:

1. [Strategies](references/strategies.md) — compare materially different realization shapes only when consequential.
2. [Legs](references/legs.md) — form integrated behavioral movements inside each Feature and reject false slices.
3. [Work Items](references/work-items.md) — define bounded Feature-owned implementation contributions.
4. [Dependencies and convergence](references/dependencies.md) — record concrete consumer-owned prerequisites, bounded conceptual DAG inspection, and named joined proof.
5. [Coverage](references/coverage.md) — cover Blueprint meaning, transition work, deferrals, cleanup, and proof.
6. [Evidence and proof](references/evidence-proof.md) — allocate proportional focused, independent, E2E, and security evidence and qualify reuse.
7. [Review](references/review.md) — challenge fidelity and consumer sufficiency without granting authority.

Each candidate is exact and complete enough that a future Atlas consumer needs no Route scratch state. It includes:

- governing and referenced Blueprint bindings, destination, terrain basis, scope, exclusions, retained states, and deferrals;
- Blueprint coverage, selected strategy and rationale, material alternatives, and rejected-decomposition rationale;
- the complete Feature set, each Feature's contained Legs, and every Feature-owned Work Item;
- direct concrete prerequisites at their blocked consumers, cross-Feature and cross-Map edges, convergence owners, and bounded acyclicity findings;
- transition, identity/migration, compatibility, temporary-mechanism, cleanup, recovery, publication, and retirement consequences where material;
- evidence-reuse assessments and proportional verification, contextual E2E, and security allocation;
- successor/invalidation consequences when replanning;
- unresolved limitations and an authority block stating that acceptance records the Map Decision and starts configured mechanical Atlas publication, while implementation, source/runtime effects, PR, merge, and deployment remain unauthorized.

Use unique candidate-local labels for proposed Features, Legs, and Work Items that lack stable Atlas identities. Every Work Item names its owning Feature, owning Leg, immediate consumer, direct prerequisites, convergence use, evidence output, and proof responsibility. Candidate-local labels are presentation anchors, not durable IDs.

A Map owns Blueprint coverage, its Feature set, cross-Feature planning and sequencing, consumer-owned cross-Map prerequisites, Map/Feature convergence and joint proof, evidence profile, rejected-decomposition rationale, and contextual E2E/security guidance. A Feature is ordinarily one behaviorally coherent, independently mergeable PR/E2E boundary and owns its Legs and Work Item DAG. A Leg is Feature-contained by default. Every implementation Work Item belongs to exactly one Feature and one Leg. Map-owned convergence is a proof/planning boundary; any implementation needed for it still belongs to a Feature Leg.

## Coordinate Several Maps Safely

Store a durable cross-Map prerequisite only on the blocked consumer Map or Feature. Cite the provider Atlas/Map/Feature, exact Contract/output/evidence/system endpoint, observed provider Decision, satisfaction source/test, freshness and invalidators, impact, convergence use, and revalidation. Provider existence, acceptance, completion, or a broad passing suite does not by itself satisfy a consumer endpoint. Reverse `blocks`/impact views are derived navigation and may be stale.

For jointly new Maps, candidate-set-local provider labels are explanatory only. Accept, record, and publish the provider first. Resolve its stable Atlas identities and Decision, then fully re-inspect, re-present, and obtain fresh unqualified acceptance of the complete consumer candidate. Never convert a local reference mechanically, carry acceptance forward, or create conditional/joint acceptance, reservations, locks, or shared ownership.

## Inspect And Present

Inspect visible candidate/accepted nodes and every concrete prerequisite endpoint declared by a blocked consumer. Provider internals behind an endpoint are opaque unless separately visible in the same decision context. Return `dependency_cycle` with the smallest visible cycle, or `dependency_acyclicity_unknown` for an inaccessible, ambiguous, stale, or unresolvable node/endpoint. Either result prevents acceptance. Do not claim global cross-Atlas acyclicity or require a graph engine.

Present the whole fixed candidate and bounded question. Linked sections are acceptable only when all bytes are fixed, accessible to the decision-maker and future Atlas consumer, and included in the question. Any qualification, edit, unanswered question, or material change requires a new complete presentation.

## Acceptance And Publication

Follow [Map acceptance and publication](references/acceptance-publication.md). A verified human's unqualified affirmative response to the bounded question for the exact complete presentation becomes Map acceptance when Route can bind that response to the fixed candidate, exact Blueprint/Map scope, configured Atlas destination, and trusted Atlas provenance. An isolated name, handle, affirmative statement, Issue action, body edit, label, review, comment, or silence is insufficient when it cannot establish those bindings.

Human acceptance precedes durable semantic publication. The immutable Atlas Map Decision is the sole planning authority; bodies and child records are mechanical current projections. The narrow Publisher performs destination preflight, Decision recording, stable-ID binding, two-pass projection, reread, receipts, and partial recovery. It never shapes, accepts, amends, judges semantic equivalence, chooses a successor, dispatches work, or performs implementation effects.

**Default acceptance flow:** after valid exact acceptance, Route forms the Acceptance Package and immediately invokes the configured Publisher for that same Atlas destination. The acceptance is sufficient planning authority for Decision recording and mechanical projection; do not ask for a second publication confirmation. A preflight or write failure returns a typed recoverable publication result under the same grant. Ask again only when resolution requires changed meaning, destination, visibility, expected predecessor, or another boundary absent from the accepted question.

**Authority matrix:** Route composition is read-only. Verified Map acceptance authorizes accepted planning meaning and the configured Publisher's mechanical Atlas projection of that exact Decision. The Publisher's configured operational credentials authorize only those adapter writes. Implementation, source/runtime effects, provider behavior outside Atlas storage, visibility changes, spending, PR/merge/deploy actions, and lifecycle decisions remain separately authorized.

## Successors And Execution Handoff

Use [Successors and execution handoff](references/successors-handoff.md). Same-Blueprint/same-destination replanning preserves the stable `FM-*` identity and creates a complete successor Decision with one current Decision and immutable predecessor history. A new Map identity is reserved for a human/Blueprint disposition that fundamentally changes governing Blueprint identity or destination through split, combination, or replacement.

Export only a typed, bounded projection of the current accepted Atlas plan: ready, with explicit limitations, or refusal. The handoff is not a readiness verdict, baseline lock, dispatch order, or implementation record. A complete current `HandoffReady` or admissible `HandoffWithLimitations` may enter `software-implementation` only in explicit `atlas` mode with separate implementation/effect/PR/merge/deployment/landing authority. Summaries, historical/conflicted/incomplete handoffs, legacy Route packages, `HandoffRefusal`, and omitted authority remain fail-closed; never omit Atlas identity, limitations, ownership, proof allocation, or successor checks to fit a consumer.

## Stops And Non-Authority

Stop on a behavior/architecture contradiction, unverified acceptance authority, unresolved identity/owner, ambiguous endpoint, failed bounded acyclicity, stale expected predecessor, visibility mismatch, or Publisher semantic conflict. Do not invent migration of legacy Route/Atlas records, Map completion/abandonment authority, a graph service, locking, rigid Markdown, or execution orchestration.

Map acceptance authorizes accepted planning meaning and the configured Publisher's exact Atlas projection. That projection may perform the adapter writes required for Decision recording, stable-ID binding, current child/navigation projections, reread, receipts, and recovery. It does not authorize implementation, credentials outside the configured Publisher, source/runtime changes, provider effects outside Atlas storage, spending, visibility changes, PR creation or landing, merge, or deployment. Those remain separate authorities of their owning systems and workflows.
