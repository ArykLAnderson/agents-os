# Design/RFC Case: <outcome>

**Case identity:** <stable identity / storage locator>
**Frame source:** <locator/revision>
**Readiness:** route-selected | fresh-worker executable candidate
**Rigor:** direct | focused | full — <trigger>
**Last reconciled evidence:** <locators/limits>
**Materialized RFC:** none | <document identity/revision derived from this Case revision>

This Case is the working semantic authority for Design. Keep claims atomic. Do not maintain a parallel prose RFC draft. A reader-facing RFC is materialized from one fixed routeable Case revision and rematerialized after claim changes.

## Claim format

Each claim contains:

- **ID:** stable local claim identifier
- **Kind:** responsibility | state-authority | consumer-contract | invariant | failure-recovery | evidence | limitation | alternative | unresolved-question | route-implication
- **Status:** selected | provisional | blocked | refuted | deferred
- **Claim:** one atomic semantic statement
- **Owner / consumer:** where applicable
- **Provenance:** Frame authority | human decision | accepted architecture | prototype evidence | terrain, with locator/revision
- **Evidence / limit:** only what supports or bounds this claim
- **Depends on / affects:** claim IDs where consequential
- **Invalidation trigger:** concrete fact that would reopen the claim

Do not encode task order, file layout, temporary prototype mechanics, raw transcripts, review wishlists, or implementation detail that does not select responsibility, contract, authority, invariant, failure semantics, or route.

For every material consumer seam defined by Blueprint, use linked atomic `consumer-contract`, responsibility, invariant, and limitation claims—not one oversized form—to make the result of consumer-seam interrogation inspectable. Establish, where applicable: each distinct immediate consumer and callable/projection shape; caller-provided choices versus owner-resolved machinery; each material input's role, observable effect, and source; whether each behavior control is required or omittable and, when omittable, its deterministic default, supported overrides, and precedence—or why those semantics are inapplicable; identity versus label, scope, and lifetime; canonical owner/source meaning and derived-projection reconciliation; information retained, excluded, and stopped; composition-selected collaborators; and the evidence or consumer authority that justifies a rich Contract. Do not invent fields, DTOs, or seams to complete this account.

## External boundary references

Link the accepted Frame claims; do not duplicate their prose.

## Atomic design claims

### <claim-id> — <short name>

- **Kind:**
- **Status:**
- **Claim:**
- **Owner / consumer:**
- **Provenance:**
- **Evidence / limit:**
- **Depends on / affects:**
- **Invalidation trigger:**

## Open human decision queue

Only consequential unresolved authority choices. Use `none` when accepted authority or evidence fixes the answer.

## Routeability view

- **Recognizable vertical outcome:**
- **Required selected claim IDs:**
- **Direct prerequisites at consumers:**
- **Convergence owner:**
- **Proof allocation:**
- **Blocked/provisional claim IDs:**
- **Architecture a fresh worker would still have to invent:** none | <exact gap>

## Requirement-Killer reconciliation

This is one adversarial operation applied through the coupled Blueprint and Route lenses, not a stage or separate artifact. Complete both applications in this Case before fixing a routeable revision.

- **Design application (after architecture selection):** <post-admission inventory and retain/simplify/remove/defer/human-decision dispositions for requirements, state, owners, seams, abstractions, contracts, custom machinery, failure/configuration/security/migration/proof burdens, duplicate responsibilities, and prototype scaffolding; authority/evidence or absence; existing mechanism reuse>
- **Pruned-design walkthrough rerun:** <immediate-consumer, representative applicable-failure, and fresh-worker walkthrough locators/results; architecture invention `none` or exact gap>
- **Route application (after route definition, before fixed routeable revision):** <dispositions for redundant movements, handoffs, convergence points, prerequisites, duplicate ownership/proof, non-blocking work, and prototype scaffolding; outcome-required justification for every retention>
- **Simplified-route walkthrough rerun:** <immediate-consumer, representative applicable-failure, and fresh-worker walkthrough locators/results; architecture invention `none` or exact gap>
- **Pass identity/currentness:** <fresh-context identity/mandate; affected claim IDs and dependency/route consequences; material expansion since pass `none` or exact invalidation requiring rerun>

## Reconciliation log

Record only decision-changing reconciliation: finding/evidence locator, affected claim IDs, disposition, semantic change or `none`, authority when required, and rematerialization consequence.

## Materialization readiness

Materialize the Production Design RFC only when:

- all consequential claims are selected;
- evidence-dependent claims are supported within explicit limits;
- owners, consumers, contracts, state/authority, failures, and route are closed, and every material consumer seam has passed consumer-seam interrogation;
- a fresh-worker walkthrough identifies no architecture invention;
- applicable advisory findings are reconciled;
- the current Requirement-Killer reconciliation has dispositioned every post-admission addition through its Design and Route applications, no unresolved human decision is hidden in a selected claim, and required walkthrough reruns show no unresolved architecture invention; and
- the exact Case revision is fixed as document provenance.
