---
name: casebook-persistence
description: Validates the installed Casebook persistence package and its explicitly selected workspace authority mode, including explicit disposable store initialization and receipt recovery.
---

# Casebook Persistence

This package is a private implementation dependency of the Case and Frame semantic owners. It is not a generalized provider API and does not grant semantic or exceptional-operation authority.

Invoke versioned requests through exactly one explicitly selected connector with an explicit Node interpreter:

```sh
node variants/sqlite/bin/casebook-persistence.mjs < request.json
node variants/markdown/bin/casebook-persistence.mjs < request.json
```

Do not try one connector and fall back to the other. Requests name protocol version `1`, explicit configuration provenance, exactly one authority mode, and the operation-specific fields. Results are versioned JSON on stdout; stderr is diagnostic text only.

Authority selection is configuration-driven. Do not probe, negotiate, fall back, hot-switch, infer from the current directory, or treat Markdown as a writable SQLite mirror. The L01-W05 Markdown connector operates only on explicitly marked disposable `l01-synthetic-interchange` workspaces under an absolute root; this proves cross-variant shape and is not the final L-05 Markdown format or production file-operation implementation. `initialize_store` is available only as an explicitly human-authorized exceptional operation against an absolute configured disposable SQLite path. It requires an operation ID and a human authority claim. After an uncertain initialization response, call `get_store_operation_receipt` under the returned active private view before any retry. In L-01 that public exceptional lookup exposes initialization receipts only; owner-commit operation IDs remain opaque `not_visible`.

Direct owner-neutral mechanical commit/read/list operations are not part of the shipped connector surface. The typed SQLite surface includes `case.create`, `case.commit_revision`, `case.read`, `frame.create`, `frame.commit_revision`, `frame.read`, and `frame.list`. Typed create requests use request version `1`, a caller-retained UUID-based stable owner ID, exact active view-policy revision, expected revision `0`, complete minimal owner content, and a human-readable commit basis. Typed reads accept only the stable Case or Frame ID under that exact view; the façade/substrate resolves the visible home namespace without a caller-supplied mechanical namespace tuple. The Case façade owns complete Case revision normalization and immutable version/event/outbox allocation. The Frame façade owns Frame-plus-complete-Discovery normalization, Discovery lifecycle/category validation, and those allocations. Exact replay returns the same typed mutation result and receipt.

The L03-W01 Frame mutation surface accepts complete canonical Frame revisions with descriptive status, optional profile fields, an authority scope fixed to the Frame home namespace, typed metadata links, authorization-provenance claims, and complete selected Discovery families. It validates active/settled/tombstoned category shapes, settlement disposition, exact reopen provenance, stable identities, dependencies, and omission-free updates; the façade allocates immutable versions/change metadata and performs no semantic decision-making. `frame.list` retains the bounded L-01 active-only shape until L03-W02.

Both selected variants expose typed `common.resolve`, `common.list`, and bounded `common.search` over normalized current Case/Frame records. The Markdown variant also supports typed minimal create/read and explicit non-mutating `interchange.parse`; the SQLite variant supports deterministic `interchange.export`, which emits no authority marker. Exact identity requires matching UUID-based frontmatter IDs plus the authority-marker-bound, digest-verified interchange manifest. Display labels, titles, and text similarity never establish identity. Current `discovery.md` and selected legacy `discovery-map.md` parse to the same logical shape; parsing never renames either file. Import into SQLite requires an explicit parse/reconciliation followed by ordinary typed owner creates—there is no watcher or mirror.

Closed-list/history/paging query breadth, historical reads, authority-scope mutation policy, legacy preparation, events, checkpoints, snapshots, global search, generalized export, full atomic Markdown replacement/generation selection, migrations, restore, and later capabilities remain unavailable. Typed requests use exact L-01 shapes; unsupported selectors fail rather than being ignored. Missing, partial, or incompatible stores fail closed; ordinary access never initializes or migrates them.
