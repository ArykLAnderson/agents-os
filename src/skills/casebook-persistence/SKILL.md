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

Authority selection is configuration-driven. Do not probe, negotiate, fall back, hot-switch, infer from the current directory, or treat Markdown as a writable SQLite mirror. `initialize_store` is available only as an explicitly human-authorized exceptional operation against an absolute configured disposable SQLite path. It requires an operation ID and a human authority claim. After an uncertain initialization response, call `get_store_operation_receipt` under the returned active private view before any retry.

Direct owner-neutral mechanical commit/read operations are not part of the shipped connector surface; later typed Case and Frame façades own public commands. Typed Case/Frame operations, Markdown parity, migrations, event paging, and later lifecycle/query operations remain unavailable. Missing, partial, or incompatible stores must fail closed; ordinary access never initializes or migrates them.
