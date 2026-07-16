# Document Workflow Manifest

Store one concise, human-readable `workflow.md` in each document session at `<case-workspace>/documents/<document-id>/`. It is coordination state, not an event log, trace ledger, or complete revision history.

```markdown
# Document Session: <document-id>

- **Intent:** <document genre, purpose, and working title/topic>
- **Audience:** <intended reader>
- **Distribution boundary:** <internal, external, or stated boundary>
- **Work classification:** <simple | substantial | high-risk, with one-sentence rationale>
- **Cases:** <case IDs and paths>
- **Direct sources:** <source locators not held by a Case>
- **Primary genre:** <adapter and structure mode: adaptive | recommended | required>
- **Constraints:** <organization or destination adapters>
- **Adapter conditions:** <applicable genre, organization, and destination conditions>

## Conditions

| Condition | Status | Evidence or limitation |
|---|---|---|

Use `current`, `stale`, `blocked`, `pending`, or `not-applicable` for status. Keep completed checks in this table and mark only affected checks `stale` after a material change.

For `substantial` and `high-risk` work, include a current condition showing that durable Case intake exists or that an already-current Case was selected before semantic composition. Do not use document genre, requested length, or a single conversational source as sufficient reason to classify work as `simple`.

## Artifacts And Revisions

- **Semantic artifact:** <path and simple revision>
- **Target representation:** <path or remote locator and revision>
- **Milestones:** <retained approved or recovery-relevant revisions>

## Findings And Checkpoints

- **Blocking findings:** <none or concise list>
- **Disclosable findings:** <none or concise list>
- **Human checkpoints:** <current, stale, or pending; reason>

## Publication

- **Stage:** <not requested, authorized, staged, or unavailable>
- **Stage authorization:** <target, artifact revision, audience, and write scope when authorized>
- **Remote authority/divergence:** <status when relevant>
- **Release:** <not requested, authorized, released, or pending verification>
- **Release authorization:** <target, artifact revision, audience, and write scope when authorized>

## Next Operations

- <operation and reason>
```

Retain the current semantic artifact, current target representation, and milestone revisions needed for approved direction, reconciliation comparison, staging, or recovery. Prune intermediate drafts only when they no longer help review, recovery, or explanation. Never delete Cases automatically.
