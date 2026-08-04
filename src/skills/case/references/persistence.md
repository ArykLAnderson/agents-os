# Persistence Procedure

Case owns meaning, classification, support, authority, provenance, and reconciliation judgment. The packaged `casebook` CLI owns ordinary storage mechanics. Read the [canonical CLI reference](../../casebook-persistence/references/cli.md) before every ordinary Case operation.

## Read and locate a Case

Use `casebook read case --case-id <stable-id>` for an exact Case ID. There is no public Case resolve or list command. To find candidates, use bounded `casebook search --namespace <semantic-id> --query <text>` and inspect its results; search similarity never establishes identity. Read a candidate only after its stable ID is returned.

The optional `--owner-revision-id` on `read case` reads that named revision. Respect search bounds, cursors, completeness, and any unavailable operation as a limitation. Do not substitute filesystem globbing, grep, guessed paths, direct SQL, or provider operations.

## Create or reconcile

1. Validate the complete Case aggregate against the Case contract. Preserve private visibility, stable IDs, provenance, support, authority, and every unchanged family.
2. For a new Case, use direct flags for simple useful creation, or pipe compact authoring JSON to valueless `--draft` for richer creation. Submit once with `casebook create case --namespace <semantic-id> --commit-basis <basis> ...`; do not use a file as the normal authoring path. `--input-file` remains a compatibility/fallback transport when needed.
3. For reconciliation, first read the exact selected Case. Preserve every unchanged family and stable ID, make only semantically justified changes, and submit the complete canonical aggregate once through `casebook commit case --namespace <semantic-id> --case-id <id> --expected-revision <current-number> --commit-basis <basis> --input -`. Commit accepts the full aggregate transport only; direct authoring flags and `--draft` are creation-only. The Namespace affects request placement only; it never relocates existing content implicitly.
4. To delete a Case, first read it exactly, then use `casebook delete case --namespace <semantic-id> --case-id <id> --expected-revision <current-number> --reason <text>`. This is revision-checked logical tombstoning: ordinary current reads/search hide it while durable history and receipts remain; it is not physical purge.
5. Keep the successful result's Case ID, revision, and generated operation ID as the persistence receipt.

A stale revision or other refusal requires a fresh CLI read and explicit semantic reconciliation. Never auto-merge, retry blindly, fall back, dual-write, or bypass the CLI. On exit `3`, use `casebook operation status --operation-id <exact-id>` before another mutation; do not resubmit first.

The CLI accepts one complete aggregate through `--input`, standard input via `--input -`, or compatibility/fallback `--input-file`; use exactly one mode for a full-aggregate create/commit mutation and none for a read, search, or delete. Prefer `--input -` or a pipeline-compatible transport in reconciliation examples. Creation may instead use direct flags or compact stdin `--draft`. Let the CLI resolve workspace and store unless an explicit user-provided workspace or store is already in scope. It is SQLite-only, does not initialize stores, and has no Markdown fallback.

## Preserve semantic ownership

The CLI validates and commits storage; it does not decide purpose, boundaries, classification, authority, support, inference, disagreement, supersession, or whether a Case should exist. Preserve source locators, examination objectives, provenance, human-authority evidence, stable IDs, private visibility, and the complete aggregate. Storage success never upgrades semantic confidence or resolves a question reserved for human judgment.
