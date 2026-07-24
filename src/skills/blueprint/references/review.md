# Review

Review challenges the current Blueprint candidate; it does not own design, artifact authority, canonization, or acceptance.

## Contain Reviewer Output

Every reviewer conclusion begins as an advisory Finding. Classify it before changing the candidate:

- **Correctness repair:** the current package contradicts already accepted behavior, architecture, Contract, canonical ownership, or explicit Blueprint guidance. Repair within that existing authority and retain the review trail.
- **Evidence request:** gather or improve evidence within an already accepted obligation. Evidence may strengthen or weaken a claim but cannot invent a new acceptance rule.
- **Design proposal:** changes responsibility, Contract/state/schema semantics, ownership, artifact authority, package membership, compatibility, or a consequential trade-off. Route it through ordinary candidate comparison and Architect judgment where required.
- **Behavior proposal:** changes, adds, removes, or contradicts the accepted behavioral boundary or qualities. Return to/reopen Frame and reconcile Casework before changing Blueprint.
- **Realization proposal:** concerns implementation order, Legs, Work Items, or execution. Record it for Route without importing it into the architecture.
- **Governance proposal:** adds or changes acceptance/completion criteria, proof protocols, required manifests, review gates, or what counts as the authoritative package. Keep it only as a Finding until the human explicitly accepts it or existing accepted authority unmistakably requires it.
- **Out of scope or mistaken:** reject with reason; review severity does not create authority.

A recommendation labeled `blocker`, `must-fix`, or `not ready` remains advisory. Repeated reviewers agreeing with an unaccepted proposal do not confer authority. Never ask a later reviewer to validate a newly introduced mechanism without also asking whether that mechanism had authority to enter the package.

Reviewer findings cannot be classified as correctness repairs merely because they use security, safety, privacy, or fail-closed language. A proposed consumer-visible failure, core interface or seam, mandatory configuration state, compatibility restriction, security mechanism, or proof obligation is a consequential delta unless exact accepted authority already specifies it. Surface that delta separately to the Architect before changing the candidate.

## Authority-Delta Check

Before applying review feedback, state:

1. the exact accepted Frame/Case/Blueprint authority and revision that requires the change;
2. whether the change repairs conformance, changes behavior, changes architecture, or concerns realization;
3. which authoritative artifact, canonical owner, Document projection, or completion condition would change; and
4. whether Frame reconciliation, Architect judgment, external authorization, or no new human authority is required.

If no accepted authority requires the mechanism, do not make it governing. Review-local hashes, checklists, matrices, or manifests may record what was inspected, but they are non-authoritative evidence unless separately accepted.

## Completion Review

Architect acceptance is invalid and must be blocked unless an independent fresh-context challenge of the coherent current candidate has completed and every resulting Finding has a recorded disposition. Use a reviewer who did not author or coordinate the candidate, and give that reviewer a bounded mandate and the evidence needed to test the actual claims, risks, affected parties, evidence quality, and acceptance conditions rather than inherited working context. Require concrete Findings with severity, evidence, affected claims, and suggested corrections.

When the current candidate is coherent, immediately launch that reviewer as the next Blueprint operation. Reviewer independence is a work assignment, not a reason to pause for the human to request review. Supply the persisted candidate, accepted behavioral authority, terrain evidence locators, and a bounded completion-review mandate; do not rely on the reviewer's inherited conversation context.

Completion review must include an independent simplification challenge from [Requirement-Killer Pass](requirement-killer.md), either as a separately assigned perspective or an explicitly independent section with an opposing mandate. Correctness review asks what is missing; simplification review asks what should be deleted. Do not let one reviewer silently optimize both objectives or let a correctness finding automatically ratchet the design toward more machinery.

Persist the reviewer identity or role, independence and fresh-context basis, bounded mandate and supplied evidence, completed review output locator, and every resulting Finding and disposition in the Blueprint state and acceptance provenance. Resolve blocking Findings before acceptance; record the reason and acceptance effect for every other disposition. Reviewers advise: they have no semantic authority, and neither their labels nor consensus can accept or redefine the Blueprint.

A final review checks semantic readiness against the accepted completion contract, including:

- one selected architecture rather than unresolved coequal targets;
- faithful old-to-new views;
- consumer-sufficient Contracts and walkthroughs;
- explicit lifecycle Ownership and one canonical owner/definition for material state, mutation, Contracts, and schemas;
- complete forward and reverse coverage;
- correctly classified behavioral, architecture, realization, evidence, and authorization questions;
- alternatives linked in Casework rather than embedded as accepted architecture;
- proportional depth and honest justified `N/A`; and
- a Document RFC projection pinned to and verified against current Blueprint and Case revisions.

Review may find missing evidence or contradictions. It may not redefine readiness to make its own preferred assurance mechanism mandatory. Retain superseded review outputs as provenance only when their non-authoritative status is unmistakable. The current candidate and its accepted authority must make live versus historical Findings unambiguous.
