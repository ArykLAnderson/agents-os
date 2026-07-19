---
name: casebook-persistence
description: Validates the installed Casebook persistence package and its explicitly selected workspace authority mode, including explicit disposable store initialization and receipt recovery.
---

# Casebook Persistence

This package is a private implementation dependency of the Case and Frame semantic owners. It is not a generalized provider API and does not grant semantic or exceptional-operation authority.

Invoke versioned requests through the SQLite connector with an explicit Node interpreter:

```sh
node variants/sqlite/bin/casebook-persistence.mjs < request.json
```

Requests name protocol version `1`, explicit configuration provenance, exactly one authority mode, and the operation-specific fields. Results are versioned JSON on stdout; stderr is diagnostic text only.

Authority selection is configuration-driven. Do not probe, negotiate, fall back, hot-switch, infer from the current directory, or treat Markdown as a writable SQLite mirror. `initialize_store` is available only as an explicitly human-authorized exceptional operation against an absolute configured disposable SQLite path. It requires an operation ID and a human authority claim. After an uncertain initialization response, call `get_store_operation_receipt` under the returned active private view before any retry. In L-01 that public exceptional lookup exposes initialization receipts only; owner-commit operation IDs remain opaque `not_visible`.

Direct owner-neutral mechanical commit/read/list operations are not part of the shipped connector surface. The minimal typed SQLite surface is `case.create`, `case.read`, `frame.create`, `frame.read`, and `frame.list`. Typed create requests use request version `1`, a caller-retained UUID-based stable owner ID, exact active view-policy revision, expected revision `0`, complete minimal owner content, and a human-readable commit basis. Typed reads accept only the stable Case or Frame ID under that exact view; the façade/substrate resolves the visible home namespace without a caller-supplied mechanical namespace tuple. The Case façade owns Case profile normalization and immutable version/event/outbox allocation. The Frame façade owns Frame-plus-complete-Discovery normalization, Discovery lifecycle/category validation, and those allocations. Exact replay returns the same typed create result and receipt.

L-01 accepts only active Frames containing one or more active, non-settled Discovery items. Frame title, outcome, included/excluded scope, limitations, and completion condition are optional. Discovery dependencies must be an empty array until L-03. `frame.list` has no filters or paging selectors and returns active Frames only. Closed/settled/tombstoned lifecycle, `include_closed`, history, paging, updates, historical reads, broader lifecycle and cross-namespace authority scope, Markdown parity, generic search/export, migrations, snapshots, restore, and later capabilities remain unavailable. Typed requests use exact L-01 shapes; unsupported selectors fail rather than being ignored. Missing, partial, or incompatible stores fail closed; ordinary access never initializes or migrates them.
