# Persistence Procedure

Case owns meaning, classification, support, authority, provenance, and reconciliation judgment. The packaged `casebook` CLI owns ordinary storage mechanics. Read the [canonical CLI reference](../../casebook-persistence/references/cli.md) before every ordinary Case operation.

## Read and locate a Case

Use `casebook read case --case-id <stable-id>` for an exact Case ID. There is no public Case resolve or list command. To find candidates, use bounded `casebook search --query <text>` and inspect its results; search similarity never establishes identity. Read a candidate only after its stable ID is returned.

The optional `--owner-revision-id` on `read case` reads that named revision. Respect search bounds, cursors, completeness, and any unavailable operation as a limitation. Do not substitute filesystem globbing, grep, guessed paths, direct SQL, or provider operations.

## Create or reconcile

1. Validate the complete Case aggregate against the Case contract. Preserve private visibility, stable IDs, provenance, support, authority, and every unchanged family.
2. For a new Case, submit the aggregate once with `casebook create case --commit-basis <basis> --input-file <absolute-file>` (or the other CLI input mode).
3. For reconciliation, first read the selected Case. Make only semantically justified changes, then submit the complete aggregate once with `casebook commit case --case-id <id> --expected-revision <current-number> --commit-basis <basis> --input-file <absolute-file>`.
4. Keep the successful result's Case ID, revision, and generated operation ID as the persistence receipt.

A stale revision or other refusal requires a fresh CLI read and explicit semantic reconciliation. Never auto-merge, retry blindly, fall back, dual-write, or bypass the CLI. On exit `3`, use `casebook operation status --operation-id <exact-id>` before another mutation; do not resubmit first.

The CLI accepts one complete aggregate through `--input`, standard input via `--input -`, or `--input-file`; use exactly one mode for a mutation and none for a read or search. Let the CLI resolve workspace and store unless an explicit user-provided workspace or store is already in scope. It is SQLite-only, does not initialize stores, and has no Markdown fallback.

## Preserve semantic ownership

The CLI validates and commits storage; it does not decide purpose, boundaries, classification, authority, support, inference, disagreement, supersession, or whether a Case should exist. Preserve source locators, examination objectives, provenance, human-authority evidence, stable IDs, private visibility, and the complete aggregate. Storage success never upgrades semantic confidence or resolves a question reserved for human judgment.
