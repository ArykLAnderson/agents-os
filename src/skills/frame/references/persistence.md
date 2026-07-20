# Persistence Procedure

Frame owns outcome framing, Discovery meaning, lifecycle judgment, natural-boundary accounting, and human-authority decisions. `casebook-persistence` owns only storage mechanics. Use this procedure for every ordinary Frame create, resume, resolve, discover, read, lifecycle change, and Case-disposition boundary; do not bypass it because the selected authority happens to use readable Markdown.

## Resolve exactly one authority

1. Resolve the logical workspace first. Use an explicit user-provided workspace root when present; otherwise use the current project's private `.casebook/` workspace. Convert every filesystem locator to an absolute path before invocation. This workspace rule does not select an authority by probing its contents.
2. Resolve one explicit installed workspace selection for the sibling `casebook-persistence` skill. A usable selection names configuration provenance (`source.kind` and `source.locator`), exactly one `authority_mode` (`sqlite` or `markdown`), that variant's absolute locator, the selected store/workspace ID, the active private view ID, and its exact policy-revision ID. A Markdown selection must agree with its `.casebook-authority.json` marker. A SQLite selection must name the configured database; neither a conventional path nor an observed file selects it implicitly.
3. Select only the matching installed connector: `variants/sqlite/bin/casebook-persistence.mjs` or `variants/markdown/bin/casebook-persistence.mjs`. Invoke it with an explicit Node interpreter and one version-1 JSON request on stdin. Use the connector beside the loaded generated skill, never a source-tree or live-sync fallback.
4. If the selection or any required identity is missing or ambiguous, stop without reading or writing Frame or Case content. Do not probe one variant and then the other, infer authority from files, hot-switch, initialize, migrate, import, mirror, or repair configuration during an ordinary Frame operation.

Every request carries the selected configuration and its provenance, protocol `casebook-persistence-json` version `1`, request version `1`, selected store ID, exact view and policy-revision IDs, a narrow purpose, and `requested_audience_ceiling: "private"`. Reject configuration that names both variants. There is no fallback or dual write. Never write `.casebook/frames/` directly, never parse a guessed Frame path as authority, and never treat Markdown as a writable projection of SQLite.

## Invoke the typed Frame operation

Use the operation supported by the selected authority:

| Semantic need | SQLite authority | Markdown authority |
| --- | --- | --- |
| Discover or list Frames | `frame.list` with bounded lifecycle/scope selectors | `frame.list`, or `common.list` / `common.search` restricted to `owner_kinds: ["frame"]` |
| Resolve an exact stable Frame ID | `frame.resolve` or `frame.read` | `common.resolve` with the stable owner ID, then `frame.read` |
| Resume complete current state | `frame.read` with `discovery: "all_selected"` and `case_dispositions: "all_selected"` when the complete accounting history is needed | `frame.read`, which returns the manifest-selected complete aggregate |
| Read one Discovery or disposition family | `frame.discovery.read` or `frame.disposition.read` | `frame.read` and inspect only the returned selected aggregate; family-history reads are unavailable |
| Read lifecycle history or recover a receipt | `frame.history` or `frame.get_operation_receipt` | unavailable; do not simulate either from files |
| Create a Frame | `frame.create` | `frame.create` |
| Commit lifecycle, Discovery, or boundary accounting | `frame.commit_revision` | `frame.commit_revision` |
| Prepare a pre-generation Markdown Frame | `frame.legacy.prepare_reconciliation` only when explicitly reconciling supplied legacy snapshots | `frame.legacy.prepare_reconciliation` against the selected legacy aggregate |

Text similarity supplies candidates, never identity. Respect bounds, cursors, completeness, visibility, hidden-reference counts, and not-visible results. Do not substitute filesystem globbing, grep, direct `frame.md` or Discovery parsing, or guessed paths for the typed surface. An unavailable capability is a limitation to surface, not permission to fall back or switch authority.

For `frame.create`, submit a caller-retained unique operation ID, `expected_revision: 0`, a human-readable commit basis, operation provenance, and one complete typed Frame aggregate, including complete disposition arrays even when they are empty. For a revision, first `frame.read` the selected complete aggregate, make only semantically justified changes, and preserve every unchanged family and stable identity. SQLite reconciliation uses the exact current `expected_revision`; Markdown reconciliation uses the exact `persistence.aggregate_digest` returned by `frame.read` as `expected_digest`. Preserve version bindings required by the selected representation: SQLite assigns immutable selected-family versions, while file-authoritative Markdown carries explicit stable boundary and disposition version IDs in its complete aggregate.

A conflict requires a fresh typed read and explicit semantic reconciliation, not merge-by-storage, fallback, or a second authority write. Treat mutation as complete only when the selected connector returns versioned JSON with `ok: true`. Preserve its Frame, concurrency evidence, completion evidence, applied-view evidence, and limitations for the receipt. A failure, malformed or uncertain result, stale revision/digest, incompatible store, missing capability, or integrity warning is not success.

### Pre-generation Markdown Frames

When file-authoritative Markdown `frame.read` reports `frame.requires_semantic_reconcile`, call `frame.legacy.prepare_reconciliation` non-mutatingly. Review its parsed Frame, selected Discovery filename, aggregate digest, disposition candidates, and `absent_in_legacy` evidence. Missing legacy Case Dispositions means `requires_semantic_reconcile`; it never means empty completion or inferred No Case. Apply human semantic judgment, assemble one complete typed Frame aggregate, and call `frame.commit_revision` with the exact prepared digest. The connector alone stages, validates, flushes, and selects the coherent generation. Do not edit the legacy files, selector, manifest, stage, or generation directories yourself.

This path preserves full Markdown-authoritative operation without making Markdown a fallback. Its selected generation remains independently readable as `frame.md` plus exactly one manifest-selected Discovery file, but only the connector may replace that aggregate.

## Account for a natural boundary

Boundary accounting is a sequence of separate Frame and Case owner commits, never one implied cross-owner transaction:

1. Read the current complete Frame through the selected connector. Inventory every material operation result under one natural boundary. Preserve result summaries, retained-evidence locators, provenance, and the human judgment or authority basis for the classification.
2. Give every inventoried result one explicit state:
   - use `classification_state: "pending_classification"` only temporarily when the result itself cannot yet be classified, with a bounded `pending_reason` and `resume_condition` and no asserted disposition;
   - use classified `disposition: "intake"` or `"reconcile"` with rationale, stable Case identity and caller-retained Case operation ID, and `realization_state: "awaiting_case"` until a separate Case commit supplies visible revision evidence;
   - use classified `disposition: "no_case"` with an explicit `no_case_reason` and no Case realization fields.
3. Commit the complete typed Frame aggregate with the boundary open. This durable accounting commit precedes or records the intent for separate Case work; it does not claim that a Case commit happened.
4. Invoke Case's persistence procedure separately for every Intake or Reconcile action against the same selected workspace authority. Keep each Case receipt, affected entry display IDs, provenance, and exact revision evidence. A successful Case commit does not mutate the Frame and a successful Frame commit does not create or reconcile a Case.
5. Read the Frame again, reconcile any concurrent semantic change, and commit a fresh complete aggregate. Change an Intake or Reconcile realization to `settled` only when the selected view exposes the exact committed Case revision as `observed_case_revision_id` or `pinned_case_revision_id`. Never invent revision evidence from a digest, path, similarity match, or successful-looking response. If the selected authority cannot provide the required revision evidence, retain `awaiting_case`, keep the boundary open, and surface the capability limitation rather than bypassing the contract.
6. Replace temporary pending classification only after the needed human judgment or evidence exists. Close the boundary only when every member is classified and every Intake/Reconcile realization is settled. A Frame may be `completed` only when all material boundaries and completion evidence are settled; No Case reasons remain durable accounting rather than disappearing.

One boundary can contain Intake, Reconcile, and No Case together, and an active Frame can contain more than one boundary. Complete boundary accounting means every material result is inventoried even when a temporary pending classification or awaiting Case keeps the boundary open.

## Preserve semantic ownership

The connector validates mechanical shape, concurrency, visibility, and selected-authority integrity. It does not decide the outcome, scope, reusable semantic boundary, classification, authority, evidence meaning, lifecycle, or whether a Case should exist. Preserve human judgment, provenance, counterevidence, source and Artifact locators, private visibility, stable IDs, and the complete selected aggregate. Mechanical persistence success never upgrades semantic confidence, supplies human authority, or permits a direct-file bypass.
