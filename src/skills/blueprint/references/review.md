# Review

Review challenges the current Blueprint candidate; it does not own design or acceptance authority.

## Contain Reviewer Output

Every reviewer conclusion begins as an advisory Finding. Classify it before changing the candidate:

- **Correctness repair:** the current package contradicts already accepted behavior, architecture, Contract, or explicit Blueprint guidance. Repair within that existing authority and retain the review trail.
- **Evidence request:** gather or improve evidence within an already accepted obligation. Evidence may strengthen or weaken a claim but cannot invent a new acceptance rule.
- **Design proposal:** changes responsibility, Contract semantics, artifact authority, package membership, compatibility, or a consequential trade-off. Route it through ordinary candidate comparison and human judgment where required.
- **Governance proposal:** adds or changes acceptance/completion criteria, proof protocols, required manifests, review gates, or what counts as the authoritative package. Keep it only as a Finding until the human explicitly accepts it or existing accepted authority unmistakably requires it.
- **Out of scope or mistaken:** reject with reason; review severity does not create authority.

A recommendation labeled `blocker`, `must-fix`, or `not ready` remains advisory. Repeated reviewers agreeing with an unaccepted proposal do not confer authority. Never ask a later reviewer to validate a newly introduced mechanism without also asking whether that mechanism had authority to enter the package.

## Authority-Delta Check

Before applying review feedback, state:

1. the exact accepted Frame/Case/Blueprint authority that requires the change;
2. whether the change only repairs conformance or expands the design/proof contract;
3. which authoritative artifact or completion condition would change;
4. whether human disposition is required.

If no accepted authority requires the mechanism, do not make it governing. Review-local hashes, checklists, matrices, or manifests may record what was inspected, but they are non-authoritative evidence unless separately accepted.

## Completion Review

A final review checks semantic readiness against the already accepted completion contract. It may find missing evidence or contradictions. It may not redefine readiness to make its own preferred assurance mechanism mandatory.

Retain superseded review outputs as provenance only when their non-authoritative status is unmistakable. The current candidate and its accepted authority must make live versus historical Findings unambiguous.