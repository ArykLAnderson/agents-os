# Persistence Procedure

Case owns the meaning, classification, support, authority, provenance, and reconciliation judgment. `casebook-persistence` owns only storage mechanics. Use this procedure for every ordinary intake, reconcile, read, resolve, list, or search operation; do not bypass it because the selected authority happens to use readable Markdown.

## Resolve exactly one authority

1. Resolve configured authority **before inspecting a project workspace**. Read the Casebook selection variables. If `CASEBOOK_DATABASE_URL` is set, select SQLite at that exact locator. Otherwise select Markdown at the explicit user-provided workspace root or the current project's `.casebook/` root. These branches are exclusive; never inspect a Markdown marker to challenge or replace configured SQLite authority.
2. Assemble configuration provenance from `CASEBOOK_CONFIGURATION_SOURCE_KIND` and `CASEBOOK_CONFIGURATION_SOURCE_LOCATOR` plus the authority-specific locator. Convert filesystem locators to absolute paths. Blank or absent provenance is a configuration failure: do not synthesize it from the current project, `.casebook`, or database path. The project `.casebook/` path remains logical project context under SQLite; it is not the persistence store and its marker is irrelevant.
3. Select only the matching installed connector: `variants/sqlite/bin/casebook-persistence.mjs` or `variants/markdown/bin/casebook-persistence.mjs`. Invoke its `diagnose` operation first with an explicit Node interpreter and one version-1 JSON request. SQLite diagnosis includes `probe_directory`, set to an existing absolute disposable-work parent approved for temporary files. Use the connector beside the loaded generated skill, never a source-tree or live-sync fallback.
4. Diagnose validates authority selection, binding, package/schema compatibility, and connector capabilities; it does not necessarily disclose the identity bundle required by ordinary typed operations. Obtain store, view, and policy identities only from explicit configured selection or a supported typed connector result. Never discover them with direct SQL or infer them from files. If the installed protocol exposes no typed identity-discovery path and required configured identities are absent, stop with the exact `identity selection incomplete` condition; configured SQLite authority remains available but that ordinary operation cannot be constructed safely.
5. If diagnose or the typed operation reports a missing identity, incompatible schema, or unavailable capability, preserve the exact connector result and stop that operation. Distinguish `authority configured and diagnosed` from `typed operation currently constructible`. Report the connector-classified condition, not “Casebook persistence is unavailable.” Do not probe the other variant, hot-switch, initialize, migrate, import, mirror, or repair configuration during an ordinary Case operation.

Every ordinary typed request carries the selected configuration and its provenance, protocol `casebook-persistence-json` version `1`, request version `1`, explicitly configured or typed-result identities, a narrow purpose, and `requested_audience_ceiling: "private"`. Diagnose success alone does not supply undisclosed identities. Reject configuration that names both variants. There is no fallback or dual write. Never write `.casebook/cases/` directly and never treat Markdown as a writable projection of SQLite.

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
