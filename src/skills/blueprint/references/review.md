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

## Authority-Delta Check

Before applying review feedback, state:

1. the exact accepted Frame/Case/Blueprint authority and revision that requires the change;
2. whether the change repairs conformance, changes behavior, changes architecture, or concerns realization;
3. which authoritative artifact, canonical owner, Document projection, or completion condition would change; and
4. whether Frame reconciliation, Architect judgment, external authorization, or no new human authority is required.

If no accepted authority requires the mechanism, do not make it governing. Review-local hashes, checklists, matrices, or manifests may record what was inspected, but they are non-authoritative evidence unless separately accepted.

## Completion Review

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
