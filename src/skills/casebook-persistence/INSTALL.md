# Installing Casebook Persistence

This document is for a human operator. It is intentionally outside model-loaded skill guidance.

## Runtime prerequisites

- Node.js 22 or newer, invoked explicitly as the interpreter.
- SQLite 3.37 or newer with JSON, `STRICT`, `RETURNING`, FTS5, foreign-key enforcement, and WAL support.
- One explicit workspace authority selection: `sqlite` or `markdown`, never both.

A SQLite workspace must resolve to an absolute local filesystem path or local `file:` URL. `CASEBOOK_DATABASE_URL` may provide that value. The documented personal default is the absolute expansion of `$HOME/.casebook/casebook.sqlite3`; it is a named configuration source, never a current-working-directory fallback. `CASEBOOK_SQLITE_BIN` may select an absolute SQLite executable; otherwise a capability-checked PATH candidate may be used.

A Markdown workspace must name an absolute workspace root. It is a separate file-authoritative mode with reduced guarantees, not a mirror or fallback for SQLite. L01-W05 only implements a disposable synthetic interchange profile for compatibility proof; it is not the final L-05 operational file format.

## Explicit disposable initialization

The current slice can initialize a new disposable SQLite store only through a versioned `initialize_store` request carrying:

- explicit SQLite authority configuration and an absolute database path;
- a unique `operation_id`;
- `authority_claim.human_authorized: true` plus non-empty `acting_role` and `authority_basis`.

Initialization creates the database only when the target is absent and its parent directory already exists. It atomically installs schema version 1, immutable store identity, the initial personal namespace, one active private default view, the initial migration ledger, and a durable receipt. A compatible repeat returns the original evidence. It never initializes or migrates an existing partial or incompatible file.

Retain the returned store ID, view ID, exact view-policy revision ID, and operation ID. If response delivery is uncertain, issue `get_store_operation_receipt` with those identities and an explicit purpose before considering a retry. Do not blindly retry.

Minimal typed Case/Frame create/read, common resolve/list/bounded lexical search, deterministic synthetic SQLite export, and explicit non-mutating Markdown parse are available only within the boundaries described by the package manifest. A Markdown fixture affects SQLite only when an operator/test explicitly parses it and submits ordinary typed owner creates to a separately configured disposable store. There is no watcher, mirror, fallback, or mode toggle.

The SQLite Case surface supports exact historical revision reads by revision number or revision ID. The current Frame query surface supports exact ID/namespace-alias resolution, current reads, exact historical reads by revision number or revision ID, bounded revision history, and stable-ID Discovery reads at the current or an exact historical Frame revision. Frame listing is bounded and paged: it defaults to active Frames, while closed Frames require an explicit completed, abandoned, or superseded status selection. These operations are scoped to the exact active view; paging cursors are query-bound and preserve a stable ordered snapshot fence.

Later event, checkpoint, and snapshot query surfaces remain unavailable, as do Frame legacy preparation/reconciliation, authority-scope mutation, global search, full atomic Markdown replacement/generation selection, migration, backup/restore, recovery, production cutover, and full integration with the Case and Frame semantic skills. This package supplies persistence mechanics only; it does not make semantic or reconciliation decisions. The private owner-neutral commit/read envelope remains only an implementation seam for typed façades and synthetic validation. Do not point this delivery slice at a live `.casebook` store.

## Safe diagnostic check

Run the connector with an explicit Node interpreter, a synthetic store location, and a disposable probe directory. Diagnostics never use the configured store and delete their bounded SQLite feature probe before returning.
