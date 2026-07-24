---
name: casebook-persistence
description: Validates and operates the installed Casebook persistence package through one explicitly bound SQLite or Markdown workspace authority.
---

# Casebook Persistence

This package is a private implementation dependency of Case and Frame semantic owners. It grants neither semantic judgment nor publication, migration, purge, or other exceptional authority.

Invoke exactly one selected connector with an explicit Node interpreter:

```sh
node variants/sqlite/bin/casebook-persistence.mjs < request.json
node variants/markdown/bin/casebook-persistence.mjs < request.json
```

Requests use protocol version `1`, explicit configuration provenance, exactly one authority mode, and operation-specific exact fields. Results are versioned JSON on stdout; stderr is diagnostic text only. Never probe one connector and fall back to the other.

## Authority selection

Authority is determined by the environment: if `CASEBOOK_DATABASE_URL` is set, use the SQLite connector at that path; otherwise use the Markdown connector at the project's `.casebook/` workspace. The two modes are mutually exclusive. Apply this selection before reporting missing or ambiguous Case/Frame persistence configuration.

Apply that rule before inspecting project-local Casebook files. A missing `.casebook-authority.json` affects only a selected Markdown workspace; it says nothing about configured SQLite availability. Likewise, a project `.casebook/` directory is not a SQLite fallback, mirror, or authority probe.

This selection governs Case and Frame persistence only. It does not configure, override, conflict with, or provide a fallback for Feature Atlas storage, even when Atlas records also live beneath a directory named `.casebook`.

Begin ordinary work with the selected connector's `diagnose` operation. SQLite diagnosis requires `probe_directory`: an existing absolute disposable-work parent approved for temporary files. Treat the versioned result as authoritative for the facts it actually returns, including binding, schema compatibility, and capabilities; diagnosis may validate without disclosing the store/view/policy identity bundle needed by later operations. Obtain undisclosed identities only from explicit configuration or a supported typed connector result, never directory inspection or direct SQL. If required identities remain unavailable, report that the selected authority diagnosed successfully but the typed operation lacks an identity selection. If diagnose reports a compatibility or capability problem, report that exact condition; never collapse either case into “persistence is not configured” or try the other connector.

SQLite initialization atomically binds the configuration source locator, `authority_mode: sqlite`, and store identity. During normal operation the connector validates database-owned identity and schema facts required by each operation; callers still supply every identity required by that operation unless a typed connector result explicitly provides it. Reject dual configuration and locator, mode, or store substitution. An unbound compatible store may be bound only by an explicitly human-authorized operation under the trusted-local boundary. Authority switching is migration work, never an ordinary configuration toggle.

Markdown uses an absolute root and exact `.casebook-authority.json` marker. It is not a SQLite mirror, watcher, fallback, or writable cache. Its selected workspace, view, file digests, and Frame generation selector establish authority.

After uncertain exceptional-operation delivery, look up the exact durable receipt before retrying. After uncertain export post-rename verification, preserve both temporary and final paths, do not publish or delete either path, and require operator recovery.

## SQLite capabilities

The selected SQLite connector implements:

- `diagnose`, explicit `initialize_store`, bounded disposable migration/snapshot/restore, and store receipt recovery;
- immutable view-policy lifecycle, identity discovery, event/checkpoint/reconciliation observation, impact projection, integrity observation, and projection rebuild;
- complete typed Case and Frame create/revision/read/query/lifecycle surfaces, typed fragments, Markdown staging, and legacy Frame reconciliation preparation;
- deterministic logical export preflight and separately human-authorized atomic finalization;
- bounded synthetic-disposable Case purge inspection, exact plan binding, execution, replay, and retained audit truth;
- `common.resolve`, `common.list`, `common.search`, and deterministic `interchange.export`.

New canonical Frames must explicitly supply both `disposition_boundaries` and `case_dispositions`; explicit empty arrays are valid. Missing disposition families are legacy read/reconciliation evidence only. Frame status, Discovery lifecycle, disposition membership, realization evidence, authority scope, stable identity, and omission-free update invariants remain enforced without making semantic decisions.

Portable/public Case, Frame, and Document-trace locators share one safety rule: only credential-free `http`/`https` locators with non-local hosts may be retained. Localhost/`.local`, loopback, link-local, RFC1918, IPv6 local/private, file/data/javascript, and other non-web locators cannot be emitted as reader-safe. Any unsafe locator retained by a projection is a preflight blocker.

## Markdown capabilities

The selected Markdown connector implements read-only selected-workspace `diagnose`; current file-authoritative Case/Frame create, complete replacement commit and read; Frame list and legacy reconciliation preparation; common resolve/list/search; and deterministic interchange export/parse. Digest-verified owner files and manifest-selected coherent Frame generations preserve exact identity. Display text or similarity never establishes identity.

Markdown intentionally omits SQLite owner revision history, events, durable receipts, checkpoints, snapshots, restore, migration, and namespace-global query guarantees. It assumes one trusted logical writer. Use a separately authorized migration rather than inventing a mirror or hot switch.

## Boundaries and limitations

All exact view-policy checks, bounded scans/cursors, immutable versions, receipts, and recovery classifications are mechanical. Persistence never decides knowledge classification, Case disposition, reconciliation meaning, Frame completion, publication, or external effects. General-purpose and non-disposable migration/snapshot/restore and global search remain unsupported. Trusted-local cursor integrity detects accidental tampering; it is not hostile-client authentication.

Do not point this package at live `.casebook` state during tests or unreviewed work.
