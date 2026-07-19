# Installing Casebook Persistence

This document is for a human operator. It is intentionally outside model-loaded skill guidance.

## Runtime prerequisites

- Node.js 22 or newer, invoked explicitly as the interpreter.
- SQLite 3.37 or newer with JSON, `STRICT`, `RETURNING`, FTS5, foreign-key enforcement, and WAL support.
- One explicit workspace authority selection: `sqlite` or `markdown`, never both.

A SQLite workspace must resolve to an absolute local filesystem path or local `file:` URL. `CASEBOOK_DATABASE_URL` may provide that value. The documented personal default is the absolute expansion of `$HOME/.casebook/casebook.sqlite3`; it is a named configuration source, never a current-working-directory fallback. `CASEBOOK_SQLITE_BIN` may select an absolute SQLite executable; otherwise a capability-checked PATH candidate may be used.

A Markdown workspace must name an absolute workspace root. It is a separate file-authoritative mode with reduced guarantees, not a mirror or fallback for SQLite.

## Explicit disposable initialization

The current slice can initialize a new disposable SQLite store only through a versioned `initialize_store` request carrying:

- explicit SQLite authority configuration and an absolute database path;
- a unique `operation_id`;
- `authority_claim.human_authorized: true` plus non-empty `acting_role` and `authority_basis`.

Initialization creates the database only when the target is absent and its parent directory already exists. It atomically installs schema version 1, immutable store identity, the initial personal namespace, one active private default view, the initial migration ledger, and a durable receipt. A compatible repeat returns the original evidence. It never initializes or migrates an existing partial or incompatible file.

Retain the returned store ID, view ID, exact view-policy revision ID, and operation ID. If response delivery is uncertain, issue `get_store_operation_receipt` with those identities and an explicit purpose before considering a retry. Do not blindly retry.

Case/Frame reads, writes, migration, export, recovery, and production cutover remain unavailable. Do not point this delivery slice at a live `.casebook` store.

## Safe diagnostic check

Run the connector with an explicit Node interpreter, a synthetic store location, and a disposable probe directory. Diagnostics never use the configured store and delete their bounded SQLite feature probe before returning.
