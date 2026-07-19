# Installing Casebook Persistence

This document is for a human operator. It is intentionally outside model-loaded skill guidance.

## Runtime prerequisites

- Node.js 22 or newer, invoked explicitly as the interpreter.
- SQLite 3.37 or newer with JSON, `STRICT`, `RETURNING`, FTS5, foreign-key enforcement, and WAL support.
- One explicit workspace authority selection: `sqlite` or `markdown`, never both.

A SQLite workspace must resolve to an absolute local filesystem path or local `file:` URL. `CASEBOOK_DATABASE_URL` may provide that value. The documented personal default is the absolute expansion of `$HOME/.casebook/casebook.sqlite3`; it is a named configuration source, never a current-working-directory fallback. `CASEBOOK_SQLITE_BIN` may select an absolute SQLite executable; otherwise a capability-checked PATH candidate may be used by later installation work.

A Markdown workspace must name an absolute workspace root. It is a separate file-authoritative mode with reduced guarantees, not a mirror or fallback for SQLite.

## Current delivery limitation

The current package slice validates packaging, configuration, assets, interpreter and SQLite capabilities only. Store initialization, reads, writes, migrations, exports, recovery, and all other operations are deliberately unavailable. Do not create a production store with this package slice.

## Safe diagnostic check

Run the connector with an explicit Node interpreter, a synthetic store location, and a disposable probe directory. Diagnostics never use the configured store and delete their bounded SQLite feature probe before returning.
