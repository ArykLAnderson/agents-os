# Production Design RFC: <outcome>

> Lossless reader-facing projection from a fixed Design/RFC Case revision. Document may govern editorial representation only; do not hand-edit it as a semantic design authority. Reconcile every semantic change into the source Case, fix a new revision, and rematerialize.

**Status:** materialized-review | accepted | superseded
**Readiness:** fresh-worker executable candidate | fresh-worker executable — <blockers or evidence>
**Source Design/RFC Case:** <case identity/fixed revision>
**Materialization receipt:** <document-system receipt/revision>
**Rigor:** direct | focused | full — <why>
**Frame boundary source:** <locator/revision>
**Evidence considered:** <prototype/terrain locators and limits>
**Atlas materialization:** <Atlas identity/current decision, when accepted>

## 1. Recognizable outcome and external boundary

- **Immediate consumer and outcome:**
- **External technical guarantees:** <what consumers/operators may rely on>
- **Scope / exclusions:**
- **Boundary assumptions and unresolved authority:**
- **Open human decision queue:** <only consequential unresolved choices; `none` when accepted authority/evidence fixes them>

> Internal machinery is deliberately excluded from this section.

## 2. Selected design (internal machinery)

Describe one selected design and old-to-new change. Name only machinery needed to meet §1.

| Concern | Canonical owner | Consumer-facing contract / invariant | Failure, recovery, or reconciliation |
|---|---|---|---|
| State | | | |
| Mutation / authority | | | |
| External boundary | | | |
| Operation / repair | | | |

**Contracts/schemas:** <consumer-sufficient operations, data/state transitions, error outcomes; link rather than duplicate canonical sources>

For any irreversible external mutation exposed to interruption or restart, include:

| Persisted checkpoint before call | Irreversible call / crash interval | Restart disposition | Is another call allowed? | Observable status |
|---|---|---|---|---|
| | | | | |

## 3. Evidence and alternatives

- **Prototype/terrain result:** <claim supported/rejected/inconclusive, limits, consequence>
- **Material alternatives (including defer/do-less):** <rejected/selected rationale>
- **Human decision required:** <recommended choice, material alternative(s), trade-off, exact acceptance consequence; or `none — forced by accepted design/reversible realization`>
- **Intentional simplifications or borrowed mechanism:** <observed failure it addresses; mechanism it replaces/simplifies; deletion trigger>

## 4. Consequential walkthroughs

1. **Immediate consumer:** <analytical contract walkthrough; include real invocation/observation only when decision-changing evidence requires it>
2. **Representative applicable failure:** <analytical failure/recovery walkthrough appropriate to the accepted boundary; include exact crash/fault evidence only when that seam is decision-relevant>
3. **Recovery/cleanup:** <only if material>

State `N/A` only with a reason; unknowns are findings, not N/A.

## 5. Vertical delivery route

| Movement | Immediate consumer | Direct prerequisite | Owner | Evidence/proof | Architecture invention prohibited |
|---|---|---|---|---|---|
| | | | | | |

**Convergence / end-to-end owner:**
**Deferred work and why it does not block this outcome:**

## 6. Review and acceptance

- **Applicable advisory mandates/results:**
- **Advisory findings:** <observed condition, evidence/confidence, affected claim, proposed classification; reviewers do not accept/reject>
- **Design reconciliation:** <for every consequential finding: reconcile into source Case claims first; list affected claim IDs and disposition, then rematerialize; current readiness consequence or `none`; deferral trigger where applicable>
- **Acceptance authority/provenance:**
- **Known limitations / invalidation triggers:**

## 7. Atlas handoff

Before acceptance, use `../contracts/atlas-handoff.md` to produce a non-authoritative draft handoff candidate for routeability review, with every missing acceptance, owner, decision, and evidence input named as a blocker. After acceptance and blocker resolution, Feature Atlas records the exact current Map Decision and publishes that fixed package through the configured adapter. Atlas holds the authoritative current delivery plan; this RFC is its pinned design source.
