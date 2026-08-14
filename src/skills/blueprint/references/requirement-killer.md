# Requirement-Killer Pass

Run this explicit adversarial simplification operation before a Design/RFC Case becomes `fresh-worker executable candidate` and again before acceptance if later evidence, review, or reconciliation materially expands the design. Its job is deletion: oppose accumulated assurance and completeness pressure rather than repair the current design by adding machinery.

Use a fresh-context reviewer or deliberately separate opposing perspective. Give it the accepted Frame boundary, inherited architecture, current atomic Case claims and dependencies, evidence limits, route, and reconciled findings. It sides with the immediate consumer and the simplest sufficient architecture; correctness review asks what is missing, while this pass asks what can disappear.

## Inventory The Delta

Compare the admitted boundary and inherited architecture with the current Case. Challenge every post-admission addition or expansion involving:

- a requirement, responsibility, mechanism, or algorithmic policy;
- an abstraction, interface, module, seam, state owner, schema, registry, validation phase, or handoff;
- a consumer-visible error, failure, recovery behavior, or operational burden;
- a mandatory configuration invariant, manifest, allowlist, feature flag, deployment prerequisite, or external dependency;
- a security, trust, privacy, correctness, consistency, or authority mechanism;
- a migration, compatibility, fallback, retirement, or coexistence obligation; or
- an evidence, test, review, acceptance, publication, or proof obligation.

Group additions by the premise that caused them and inspect the whole dependency chain. Several individually plausible claims may still form one unjustified cumulative redesign.

## Interrogate Contract Burden

During architecture selection, interrogate every material consumer seam identified by Blueprint; during this deletion pass, repeat the interrogation for every seam added or expanded afterward. Inspect the callable/projection shape field by field and handoff by handoff for each distinct immediate consumer; several consumers may share one answer only when they demonstrably use the same projection. Assign every material choice to its caller, receiving owner, or composition authority, keeping caller-owned intent, constraints, locators, and necessary evidence explicit while moving owner-resolved policy, derivation, context assembly, sequencing, and other machinery behind the seam. Challenge:

- derivable context, policy, sequencing, projections, or other owner-resolved machinery transferred to a caller;
- inputs with no named role—behavior control, locator, evidence/provenance, observational metadata, or a named combination—observable effect, source, or immediate consumer;
- behavior controls that do not state whether they are required or omittable and, when omittable, the deterministic default, supported overrides, and precedence—or establish why those semantics are inapplicable;
- metadata that silently controls behavior;
- speculative fields, generic option bags, and source aggregates carried for hypothetical or later consumers;
- accidental DTOs, translation layers, injection seams, or physical boundaries that merely restate a logical distinction;
- identity coupled to mutable labels, presentation values used as durable keys, and unstated scope or lifetime; and
- evidence, provenance, metadata, replay material, or rich context that continues beyond its last legitimate consumer.

Ask whether removing a field would suppress a caller-owned choice or necessary evidence, or instead let the receiving owner resolve its own machinery. Prefer relocation behind the seam when pure deletion would only move work ambiguously. When consequential, distinguish identity from label and state scope and lifetime. Separate composition-selected collaborators from invocation data and internally owned machinery. For each retained projection name its immediate consumer, canonical owner/source meaning, retained and excluded information, intentional information stop, and reconciliation rule when derived. Keep logical authority distinctions without multiplying modules, services, DTOs, registries, or seams absent another concrete benefit. Do not optimize for field count: frozen evidence, execution identity, replay, audit, reproducibility, and genuinely consumer-owned multi-decision commands may justify richness.

## Kill Or Justify Each Addition

For every addition require either exact accepted behavioral/architecture authority or concrete decision-relevant evidence of necessity. Ask:

1. Which exact accepted claim requires this, and what observable failure or threat occurs without it?
2. Who controls the trigger, what consumer or asset is affected, and what is the concrete consequence within the current phase and threat model?
3. Can the outcome **do less**, defer the capability, or remove the dependency or unsafe operation structurally?
4. Can existing machinery be reused or borrowed rather than owned anew?
5. Can responsibilities or seams be collapsed into fewer, deeper Contracts without moving necessary complexity into consumers?
6. Can unsupported optional behavior be locally inapplicable rather than a request-wide failure?
7. Is a consumer-visible failure actionable by that consumer, or does it merely expose internal configuration or assurance state?
8. If this item is deleted, where does necessary complexity reappear? If nowhere material, delete it.
9. If an input is removed from the caller, can its receiving owner resolve it from authority and information already behind the seam?
10. Does this handoff give one immediate consumer its sufficient projection, or transport a source aggregate or the union of downstream concerns?
11. Does a logical authority distinction require a physical seam here, and what concrete benefit beyond inspectability justifies it?

Reviewer preference, generic best practice, severity labels, consensus, speculative security posture, unknown possibility, and final-product completeness are not authority or evidence. A security claim without a concrete actor, controlled input/capability, protected asset, path, and consequence cannot justify a current mechanism.

## Reconcile Into The Case

Disposition every challenged addition as:

- **retain:** cite accepted authority or concrete evidence and keep the smallest sufficient mechanism;
- **simplify:** replace it with a smaller structural mechanism, reuse/borrowing, or fewer/deeper seams;
- **remove:** delete the unsupported claim and repair affected dependencies and route implications;
- **defer:** mark the claim and its activation/invalidation trigger without burdening the current route; or
- **human decision:** preserve it as blocked/provisional and present the consequential delta through `decision-card` before selection.

Apply each disposition directly to the affected atomic Design/RFC Case claims, `Depends on / affects` links, invalidation triggers, and routeability view. Record only a compact reconciliation-log entry with the pass identity/mandate, affected claim IDs, authority or evidence, disposition, and semantic consequence. Do not create a parallel simplification report or patch a materialized RFC directly. Rematerialize the RFC only after the Case is fixed again.

The pass is complete only when every inventoried addition has a disposition, no unresolved human decision is hidden inside a selected claim, all resulting dependencies and route implications are reconciled, and the current design is the smallest supported design. A pass that only requests more validation, controls, configuration, tests, or proof has failed.
