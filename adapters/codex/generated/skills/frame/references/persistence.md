# Persistence Procedure

Frame owns outcome framing, Discovery meaning, lifecycle judgment, natural-boundary accounting, and human-authority decisions. The packaged `casebook` CLI owns ordinary storage mechanics. Read the [canonical CLI reference](../../casebook-persistence/references/cli.md) before every ordinary Frame operation.

## Read, find, and change a Frame

Use `casebook read frame --frame-id <stable-id>` to resume a Frame. The optional `--owner-revision-id` reads a named revision. There is no ordinary public Frame list, resolve, Discovery, disposition, or history command. Use `casebook search --query <text>` only to find candidates, then read a returned stable Frame ID; search does not establish identity.

For a new Frame, submit one complete aggregate with `casebook create frame --commit-basis <basis> --input-file <absolute-file>`. For a change, first read the complete aggregate, preserve unchanged families and stable IDs, then submit it once with `casebook commit frame --frame-id <id> --expected-revision <current-number> --commit-basis <basis> --input-file <absolute-file>`. The CLI accepts one complete aggregate through `--input`, standard input via `--input -`, or `--input-file`; use exactly one mode for a mutation and none for a read or search.

Keep the successful Frame ID, revision, and generated operation ID as the persistence receipt. On a refusal or stale revision, read again and reconcile semantically. On exit `3`, run `casebook operation status --operation-id <exact-id>` before any further mutation; never blindly retry. Do not use direct SQL, connector/provider calls, filesystem inspection, Markdown edits, initialization, migration, fallback, or dual writes.

Let the CLI resolve workspace and store unless an explicit user-provided workspace or store is already in scope. It is SQLite-only, does not initialize stores, and has no Markdown fallback.

## Account for a natural boundary

Boundary accounting is a sequence of separate Frame and Case commits, never one implied cross-owner transaction:

1. Read the complete Frame through the CLI. Inventory every material result under one natural boundary. Preserve result summaries, retained-evidence locators, provenance, and the human judgment or authority basis for classification.
2. Give every inventoried result one explicit state: temporary `pending_classification` with a bounded reason and resume condition; classified `intake` or `reconcile` with rationale and stable Case identity while its Case work is pending; or classified `no_case` with an explicit reason.
3. Commit the complete Frame aggregate with the boundary open. This records intent; it does not claim a Case commit happened.
4. Follow Case's persistence procedure separately for each Intake or Reconcile action. Keep each returned Case revision and operation ID with its evidence.
5. Read the Frame again, reconcile any concurrent semantic change, and commit a fresh complete aggregate. Mark Intake or Reconcile settled only when the separately returned Case revision is recorded as the supporting evidence. If that evidence is unavailable, keep the boundary open and surface the limitation rather than bypassing the CLI.
6. Replace temporary pending classification only after the needed human judgment or evidence exists. Close the boundary only when every member is classified and every Intake/Reconcile result is settled. A Frame may be `completed` only when all material boundaries and completion evidence are settled; No Case reasons remain durable accounting.

One boundary can contain Intake, Reconcile, and No Case together, and an active Frame can contain more than one boundary. Complete boundary accounting means every material result is inventoried even when a temporary pending classification or awaiting Case keeps the boundary open.

## Preserve semantic ownership

The CLI validates and commits storage. It does not decide outcome, scope, reusable semantic boundary, classification, authority, evidence meaning, lifecycle, or whether a Case should exist. Preserve human judgment, provenance, counterevidence, source and Artifact locators, private visibility, stable IDs, and the complete aggregate. Storage success never upgrades semantic confidence or supplies human authority.
