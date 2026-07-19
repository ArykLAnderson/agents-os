---
name: casebook-persistence
description: Validates the installed Casebook persistence package and its explicitly selected workspace authority mode. The current delivery slice exposes diagnostics only.
---

# Casebook Persistence

This package is a private implementation dependency of the Case and Frame semantic owners. It is not a generalized provider API and does not grant semantic or exceptional-operation authority.

For this delivery slice, invoke only the versioned `diagnose` request through the SQLite connector with an explicit Node interpreter:

```sh
node variants/sqlite/bin/casebook-persistence.mjs < request.json
```

The request must name protocol version `1`, operation `diagnose`, explicit configuration provenance, exactly one authority mode, and an absolute disposable probe directory. Results are versioned JSON on stdout; stderr is diagnostic text only.

Authority selection is configuration-driven. Do not probe, negotiate, fall back, hot-switch, infer from the current directory, or treat Markdown as a writable SQLite mirror. Case/Frame mutation, initialization, and every exceptional operation are not implemented in this slice and must return an explicit `not_yet_implemented` failure.
