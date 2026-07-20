# Persistence Procedure

Case owns the meaning, classification, support, authority, provenance, and reconciliation judgment. `casebook-persistence` owns only storage mechanics. Use this procedure for every ordinary intake, reconcile, read, resolve, list, or search operation; do not bypass it because the selected authority happens to use readable Markdown.

## Resolve exactly one authority

1. Resolve the logical workspace first. Use an explicit user-provided workspace root when present; otherwise use the current project's private `.casebook/` workspace. Convert every filesystem locator to an absolute path before invocation. This workspace rule does not select an authority by probing its contents.
2. Resolve one explicit installed workspace selection for the sibling `casebook-persistence` skill. A usable selection names configuration provenance (`source.kind` and `source.locator`), exactly one `authority_mode` (`sqlite` or `markdown`), that variant's absolute locator, the selected store/workspace ID, the active private view ID, and its exact policy-revision ID. A Markdown selection must agree with its `.casebook-authority.json` marker. A SQLite selection must name the configured database; neither a conventional path nor an observed file selects it implicitly.
3. Select only the matching installed connector: `variants/sqlite/bin/casebook-persistence.mjs` or `variants/markdown/bin/casebook-persistence.mjs`. Invoke it with an explicit Node interpreter and one version-1 JSON request on stdin. Use the connector beside the loaded generated skill, never a source-tree or live-sync fallback.
4. If the selection or any required identity is missing or ambiguous, stop without reading or writing Case content. Do not probe one variant and then the other, infer authority from files, hot-switch, initialize, migrate, import, mirror, or repair configuration during an ordinary Case operation.

Every request carries the selected configuration and its provenance, protocol `casebook-persistence-json` version `1`, request version `1`, selected store ID, exact view and policy-revision IDs, a narrow purpose, and `requested_audience_ceiling: "private"`. Reject configuration that names both variants. There is no fallback or dual write. Never write `.casebook/cases/` directly and never treat Markdown as a writable projection of SQLite.

## Invoke the typed Case operation

Use the operation supported by the selected authority:

| Semantic need | SQLite authority | Markdown authority |
| --- | --- | --- |
| Resolve an exact stable Case ID | `case.resolve` or `case.read` | `common.resolve` with the stable owner ID, then `case.read` |
| Resolve an alias | `case.resolve` with the namespace-relative alias | `common.search` restricted to `owner_kinds: ["case"]`; inspect candidates and use `case.read` only after identity is established |
| Bounded lexical search | `case.search` | `common.search` restricted to `owner_kinds: ["case"]` |
| Read selected Case content | `case.read` | `case.read` |
| Intake a new Case | `case.create` | `case.create` |
| Reconcile an existing Case | `case.commit_revision` | `case.commit_revision` |

Markdown's `common.resolve` and `common.search` are its typed, Case-filtered reduced common surface; they do not grant Frame semantic ownership. Do not substitute filesystem globbing, grep, direct Markdown parsing, or guessed paths for these operations. Respect bounds, cursors, completeness, visibility, and not-visible results. Text similarity supplies candidates, never identity.

For `case.create`, submit a caller-retained unique operation ID, `expected_revision: 0`, a human-readable commit basis, operation provenance, and one complete typed Case aggregate. For reconcile, first `case.read` the selected aggregate, make only the semantically justified changes, preserve every unchanged family, and submit the complete aggregate. SQLite reconciliation uses the exact current `expected_revision`; Markdown reconciliation uses the exact `persistence.content_digest` returned by `case.read` as `expected_digest`. A conflict requires a fresh typed read and explicit semantic reconciliation, not merge-by-storage, fallback, or a second authority write.

Treat a mutation as complete only when the selected connector returns versioned JSON with `ok: true`. Preserve the returned Case and persistence evidence for the receipt. A failure, malformed result, uncertain response, missing capability, stale revision/digest, incompatible store, or integrity warning is not success. Follow only corrective guidance that remains within the selected ordinary surface; exceptional initialization, migration, purge, publication, or recovery requires its own authority and procedure.

## Preserve semantic ownership

Before mutation, apply the Case contract and validation checklist yourself. The connector validates mechanical shape and selection; it does not decide purpose, boundaries, classification, authority, support, inference, disagreement, supersession, or whether a Case should exist. Preserve source locators, examination objectives, provenance, human-authority evidence, stable IDs, private visibility, and the complete selected aggregate. Keep the Markdown-authoritative workspace independently readable and private, but let its connector perform the digest-guarded atomic file replacement. Mechanical storage success never upgrades semantic confidence or resolves a question reserved for human judgment.
