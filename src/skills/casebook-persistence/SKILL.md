---
name: casebook-persistence
description: Validates the installed Casebook persistence package and its explicitly selected workspace authority mode. The current delivery slice also exposes explicit human-authorized disposable SQLite initialization and store-operation receipt lookup.
---

# Casebook Persistence

This package is a private implementation dependency of the Case and Frame semantic owners. It is not a generalized provider API and does not grant semantic or exceptional-operation authority.

Invoke versioned requests through the SQLite connector with an explicit Node interpreter:

```sh
node variants/sqlite/bin/casebook-persistence.mjs < request.json
```

Requests name protocol version `1`, explicit configuration provenance, exactly one authority mode, and the operation-specific fields. Results are versioned JSON on stdout; stderr is diagnostic text only.

Authority selection is configuration-driven. Do not probe, negotiate, fall back, hot-switch, infer from the current directory, or treat Markdown as a writable SQLite mirror. `initialize_store` is available only as an explicitly human-authorized exceptional operation against an absolute configured disposable SQLite path. It requires an operation ID and a human authority claim. After an uncertain initialization response, call `get_store_operation_receipt` under the returned active private view before any retry.

Ordinary Case/Frame access, commit envelopes, migrations, and Case/Frame mutations remain unavailable. Missing, partial, or incompatible stores must fail closed; ordinary access never initializes or migrates them.
