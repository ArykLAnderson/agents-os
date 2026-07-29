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

## Simplification record

These are coupled Blueprint/Route checks, not a stage or separate artifact. Complete both in this Case before fixing a routeable revision.

- **Design pruning (after architecture selection):** <unnecessary state, owners, seams, abstractions, contracts, custom machinery, duplicate responsibilities, and prototype scaffolding removed/deferred; existing mechanism retained; or `none — why each remains boundary-required`>
- **Pruned-design walkthrough rerun:** <immediate-consumer, representative applicable-failure, and fresh-worker walkthrough locators/results; architecture invention `none` or exact gap>
- **Route simplification (after route definition, before fixed routeable revision):** <redundant movements/prerequisites, duplicate ownership/proof, and prototype scaffolding removed/deferred; non-boundary work deferred; or `none — why each remains outcome-required`>
- **Simplified-route walkthrough rerun:** <immediate-consumer, representative applicable-failure, and fresh-worker walkthrough locators/results; architecture invention `none` or exact gap>

## Reconciliation log

Record only decision-changing reconciliation: finding/evidence locator, affected claim IDs, disposition, semantic change or `none`, authority when required, and rematerialization consequence.

## Materialization readiness

Materialize the Production Design RFC only when:

- all consequential claims are selected;
- evidence-dependent claims are supported within explicit limits;
- owners, consumers, contracts, state/authority, failures, and route are closed;
- a fresh-worker walkthrough identifies no architecture invention;
- applicable advisory findings are reconciled;
- the Design pruning and Route simplification record is complete, with their required walkthrough reruns showing no unresolved architecture invention; and
- the exact Case revision is fixed as document provenance.
