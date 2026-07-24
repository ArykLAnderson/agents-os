# Installing Casebook Persistence

This document is for a human operator. It is intentionally outside model-loaded skill guidance.

## Runtime prerequisites

- Node.js 22 or newer, invoked explicitly.
- SQLite 3.37 or newer with JSON, `STRICT`, `RETURNING`, FTS5, foreign-key enforcement, and WAL support.
- Authority selection: if `CASEBOOK_DATABASE_URL` is set, SQLite is used at that path; otherwise Markdown is used at the project's `.casebook/` workspace. The two modes are mutually exclusive.

A SQLite database path in `CASEBOOK_DATABASE_URL` must resolve to an absolute local path or local `file:` URL. `CASEBOOK_SQLITE_BIN` may select an absolute SQLite executable; otherwise a capability-checked `PATH` candidate is used. A Markdown authority must name an absolute workspace root with an exact `.casebook-authority.json` marker.

## Authority binding and initialization

`initialize_store` is the only operation that creates a SQLite store. It requires an absent target, a unique operation ID, and an explicit human authority claim. Initialization atomically installs the canonical schema, store identity, source locator, `authority_mode: sqlite`, initial namespace and private view, migration ledger, and durable receipt.

The source locator, authority mode, and store identity form one immutable authority binding. Every SQLite request must reproduce it. Locator, mode, dual-configuration, and store substitution fail closed. Ordinary configuration cannot hot-switch authority; switching remains separately authorized migration work. A compatible unbound store may acquire its first binding only through an operation with an explicit human authority claim under the trusted-local boundary.

Retain the returned operation ID. The store ID, view ID, and policy-revision ID are read from the database by the connector during normal operation; they do not need to be supplied externally. After uncertain exceptional-operation delivery, query `get_store_operation_receipt` before retrying.

## Implemented surface

The SQLite connector provides:

- diagnostics, explicit initialization, disposable schema migration, exact snapshot and restore, and durable store-operation receipt lookup;
- immutable view-policy create/revise/activate/retire;
- typed Case and Frame create, complete revision commit, current/historical read, discovery/query surfaces, lifecycle staging, export fragments, and reconciliation preparation;
- event paging, checkpoint CAS, reconciliation snapshots, identity discovery, impact projection, integrity observation, and projection rebuild;
- deterministic logical export preflight and separately authorized atomic finalization;
- bounded disposable Case purge planning and execution with retained audit truth;
- the typed reduced common resolve/list/search subset and deterministic interchange export.

Portable/public export retains only credential-free `http`/`https` locators with non-local hosts. Localhost, `.local`, loopback, link-local, RFC1918, IPv6 local/private, file/data/javascript, and other non-web locators are blocked or omitted with truthful blockers. Finalization does not grant publication authority. If post-rename verification fails, preserve both destination paths and use receipt-first operator recovery; do not publish, delete, or blindly retry.

The Markdown connector provides selected-workspace diagnostics; current file-authoritative Case/Frame create, complete replacement commit and read; Frame list and legacy reconciliation preparation; common resolve/list/search; and deterministic interchange export/parse. It uses digest-verified files or manifest-selected Frame generations. It has no SQLite fallback, mirror, watcher, durable receipts, owner revision history, events, checkpoints, snapshots, restore, migration, or global-query guarantees, and assumes one trusted logical writer.

## Remaining limitations

General-purpose or non-disposable migration/snapshot/restore and global search remain unsupported. Semantic classification, reconciliation judgment, publication, and external-resource mutation belong to their owning capabilities and are never inferred from persistence success. SQLite cursor integrity is a trusted-local accidental-tamper boundary, not hostile-client authentication.

Do not point tests or unreviewed requests at a live `.casebook` workspace. Diagnostics are read-only: SQLite diagnostics validate an existing store's authority binding, then use a deleted bounded feature probe without reading owner content; an absent configured target is not created. Markdown diagnostics verify the exact selected authority marker and workspace without parsing owner content or mutating files.
