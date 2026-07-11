# Feature Archive Bundles

A feature archive is a historical implementation corpus in the canonical docs repository. It is durable and reviewable, but it is not canonical current-reference documentation.

## Location

Follow project convention when defined. Otherwise use:

```text
reports/archive/<feature>/<date>/
  report.html
  manifest.json

  inputs/
    initial/
      spec.md
      ticket-graph.json
      tickets/
    final/
      spec.md
      ticket-graph.json
      tickets/

  outcomes/
    ticket-results.json
    verification.json
    integration.json
    drift.md
    pr-links.json

  assets/
    diagrams/
    screenshots/
    evidence/
```

## Snapshot rules

- Preserve the accepted inputs as they existed when implementation began.
- Preserve the final state used at final verification. “Final” is a snapshot, not authority to silently amend canonical sources.
- Label every snapshot `HISTORICAL SNAPSHOT — NOT CANONICAL`.
- Record canonical source path/URL and source revision.
- Do not rewrite initial snapshots to match the outcome.
- Canonical spec/ticket edits require the owning workflow and normal docs/tracker authority. Grounded clarifications may be updated by an assigned docs writer; credible unresolved intent changes remain `NEEDS ATTENTION` and are only described in the final snapshot/drift ledger until resolved.
- Sanitize private identifiers and secrets without erasing decision-relevant evidence.

## Manifest

Use the bundled manifest template. Record:

- feature/keystone identity
- report schema/version/date
- code repository, target branch, and verified integration SHA
- code PR and docs PR
- docs repository/archive revision
- initial/final source references and capture times
- included tickets and outcomes
- evidence and sanitization summary

## Outcomes for later process analysis

Prefer structured data for:

- ticket status and dependency graph
- implementation attempts
- integration/refactor events
- acceptance and verification results
- manual E2E platforms and gaps
- review findings/fix cycles
- specification drift and removed invented requirements
- PR/merge results

The archive should support later analysis of which specification and ticket structures lead to reliable delivery without treating model-generated metrics as precise productivity measurement.

## Publication

Create an isolated docs worktree/branch and a separate docs PR. Keep archive reports out of normal architecture/spec indexes unless explicitly promoted.

The code feature PR should link the docs archive PR. Record `(code PR head SHA, docs PR head SHA, archive manifest digest)` in both PRs. If any member changes, update cross-links/report claims and revalidate before declaring the feature `PR READY`.

If the current harness lacks Pi’s native `imagegen`, hand the report stage to a Pi-capable report worker. Do not silently omit required architecture diagrams or invoke wrapped model CLIs.
