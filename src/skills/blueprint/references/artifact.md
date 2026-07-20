# Blueprint Artifact And RFC Projection

The persisted Blueprint is the architecture authority. It records one evolving candidate while active and exactly one architecture when accepted. An RFC is its verified reader-facing projection, produced through Document; it is not a second architecture authority.

## Authority Split

- **Casework (Frame and Cases)** owns the accepted behavioral boundary, reusable meaning, evidence-backed decisions, and supporting alternatives and their dispositions. A completed Frame remains completed while its accepted boundary holds; Cases may be reconciled as new durable meaning becomes clear.
- **Blueprint** owns the selected architecture: old-to-new responsibility allocation, modules, Contracts, schemas, canonical state and mutation authority, ownership, and architecture Findings. It links to alternatives in Casework rather than making rejected or fallback designs part of the accepted architecture.
- **Document** owns RFC composition, reader journey, representation verification, acceptance state as a document, and publication. Its semantic source binding pins the Blueprint and supporting Case revisions. It may explain but must not silently add or choose architecture.

Repository code, external systems, and implementation evidence remain authoritative for facts they own. Stable locators and examined revisions preserve that provenance.

## Persisted Blueprint State

Persist `blueprints/<blueprint-id>/blueprint.md` at natural boundaries: after admission, a coherent terrain/candidate/Contract reconciliation, disposition of material evidence or review, creation or verification of the RFC projection, and acceptance or another terminal disposition. Do not checkpoint every conversational turn.

The state binds stable identities and exact examined revisions for its source Frame and every governing Case. Keep current:

- status and Blueprint revision;
- accepted behavioral scope, qualities, exclusions, and source Frame/Case revision bindings;
- terrain evidence and limitations;
- old/current and selected new architecture views;
- modules, responsibilities, Secrets, placement, and lifecycle Ownership;
- Contracts, states, failure/recovery semantics, and schemas;
- canonical owners and definitions for state, mutation, Contracts, and schemas, including how derived views reconcile;
- unresolved behavioral questions and architecture Findings, separately from non-blocking realization questions;
- links to supporting alternatives and dispositions in Casework;
- behavior/design coverage, consumer sufficiency, review Findings and dispositions, evidence, limitations, and justified deferrals;
- the Document projection identity/revision, its pinned semantic-source binding, and representation verification state; and
- Architect acceptance provenance: accepting human/role, explicit acceptance evidence or statement locator, accepted Blueprint revision, accepted Document revision, consequential trade-offs accepted, and acceptance time when available.

An active state may mark a required item unresolved. Do not use omission or `N/A` to conceal it. Once accepted, the architecture section contains only the selected architecture; historical candidates survive through Casework links and provenance.

## Canonical Abstract RFC Structure

An RFC representation may rename or combine headings, but it preserves this semantic order and distinction:

1. **Authority and decision** — RFC identity/status; pinned Blueprint, Frame, and Case revisions; scope; Architect acceptance provenance.
2. **Context and accepted boundary** — problem, accepted behaviors and qualities, exclusions, constraints, terrain evidence, and limitations.
3. **Old view** — current modules, responsibilities, interactions, state/mutation authority, Contracts/schemas, and material friction.
4. **New view** — exactly one selected architecture and the consequential old-to-new changes.
5. **Modules and ownership** — each module's responsibility, Secrets, omissions, placement, dependencies, and change/operate/observe/repair/migrate/retire ownership.
6. **Contracts and information model** — consumer promises, operations, states, invariants, failures/recovery, authority crossings, and canonical schemas or explicitly owned schema references.
7. **Consequences and sufficiency** — walkthrough and coverage conclusions, trade-offs, evidence, limitations, review disposition, and why consumers and Route have enough architecture.
8. **Questions and alternatives** — unresolved behavioral or architecture blockers; non-blocking realization questions; links to Casework alternatives and their dispositions.
9. **Projection verification** — Blueprint revision projected, Document revision, representations inspected, semantic differences found and repaired, and publication state when applicable.

The old and new views are explicit even when compact; do not force readers to reconstruct the change from a module inventory. Diagrams and tables are views, not independent authority. Every material name in them resolves to the canonical module, Contract, state, or schema definition.

## Proportional Depth

Use the smallest representation that makes the decision and its consequences unambiguous.

A **compact** RFC still includes authority bindings, a concise old-to-new view, selected responsibilities and ownership, consumer-significant Contract/state/failure/schema semantics, alternatives links, sufficiency, projection verification, and acceptance provenance. Compress prose and combine sections; do not remove applicable meaning.

Use a **full** treatment where fan-out, trust or authority crossings, durable state, compatibility, failure recovery, schema evolution, operational ownership, or irreversibility creates material risk. Add detail only where a real consumer, owner, reviewer, or Route decision needs it. Do not prescribe file layouts, work sequencing, or implementation internals merely to make the RFC look complete.

`N/A` is valid only when the item is genuinely inapplicable and includes a short reason, for example: `Schema evolution: N/A — the design introduces no persisted or exchanged data shape.` An unknown is a Finding; a deferred choice names its owner and acceptance effect; neither is `N/A`.

## Projection And Acceptance

Before acceptance, compare the RFC's semantic claims with the pinned Blueprint and Casework revisions, repair projection drift in the owning artifact, regenerate affected representations, and record verification. A materially changed Blueprint invalidates the prior projection verification and Architect acceptance.

The Architect explicitly accepts one Blueprint revision and its consequential trade-offs, with the verified Document revision bound as its RFC projection. Acceptance does not authorize implementation, migration, publication, deployment, or external mutation. It authorizes Route to design a realization for that accepted architecture, and nothing more.
