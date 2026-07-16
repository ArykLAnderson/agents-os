# Architecture Baseline Revision: <revision-id>

**Status:** PROPOSED
**Updated:** YYYY-MM-DDTHH:MM:SSZ

## Identity

- Feature ID:
- Revision ID:
- Predecessor revision/fingerprint:
- Candidate manifest path:
- Candidate manifest digest:
- Graph fingerprint:
- Proposal path/digest:
- Cascade path/digest:

## Reproducible manifest contract

- Schema: `agent-os-baseline-manifest-v1`
- Encoding: UTF-8 RFC 8785 JSON Canonicalization Scheme
- Fingerprint: `sha256:` + SHA-256 of exact canonical manifest bytes
- Duplicate IDs/edges rejected: PENDING
- Mutable sources captured as immutable snapshots: PENDING
- Canonical sources sorted and content-digested: PENDING
- Ticket snapshots sorted and content-digested: PENDING
- Dependency edges lexicographically sorted: PENDING
- HITL gates and feature constraints sorted: PENDING

## Human approval

- Approval record path/digest:
- Approver identity/authority:
- Decision source/link:
- Decision timestamp:
- Exact candidate fingerprint approved: PENDING

## Downstream disposition

| Ticket/work | Old assumption | Revised contract | Disposition | Candidate/evidence applicability |
| --- | --- | --- | --- | --- |
|  |  |  | unchanged / amend / split / new-predecessor / defer / supersede / corrective-ticket | current / stale / reference-only |

## Publication reconciliation

- Canonical specs/ADRs/glossary match approved digests: PENDING
- Tracker ticket bodies match approved snapshots: PENDING
- Tracker dependencies/HITL gates match approved manifest: PENDING
- Revised immutable snapshots captured: PENDING
- `graph.md`, `drift.md`, ticket state, and tracker status agree: PENDING
- Active assignments use this revision/fingerprint: PENDING

Do not mark `ACTIVE` until every publication item is reconciled. Any content change after approval requires a new manifest fingerprint and explicit re-approval.
