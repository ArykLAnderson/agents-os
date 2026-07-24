---
name: case
description: Retrieves or curates reusable, provenance-bearing knowledge in a Casebook workspace. Use when exploring existing Cases, intaking already-understood sources, or reconciling changed Case meaning.
---

# Case

Case owns reusable knowledge semantics; the workspace-selected `casebook-persistence` variant owns storage mechanics. Infer the operation from the request:

- **Explore** existing knowledge without inventing meaning. Read [references/explore.md](references/explore.md).
- **Intake** sources whose purpose and intended reusable meaning are already understood. Read [references/intake.md](references/intake.md).
- **Reconcile** changed meaning from supplied evidence, decisions, or corrections. Read [references/reconcile.md](references/reconcile.md).

For every ordinary intake, reconcile, read, resolve, list, or search, first read and follow [references/persistence.md](references/persistence.md). Resolve persistence authority from configured environment selection before inspecting any project `.casebook` path. Invoke exactly one typed Case surface. Fail closed when the selected connector cannot establish required identity; never fall back, dual-write, or directly edit Case Markdown.

Before creating or changing a Case, read [references/contract.md](references/contract.md). For integrity checks, read [references/validation.md](references/validation.md).

Use an explicit user-provided workspace root when present; otherwise use `.casebook/` in the current project as the logical project context. This path is the persistence locator only when Markdown authority is selected. When `CASEBOOK_DATABASE_URL` selects SQLite, the configured database remains authority regardless of project-local files or missing Markdown markers. Treat Case material as private by default and request a private audience ceiling. Stable IDs, not paths, define identity. Under Markdown authority, Cases remain independently readable files; the selected connector is their only ordinary writer.

Route work into Frame when it requires broad research, unclear interpretation, consequential trade-offs, or unresolved human authority. Case itself does not resolve those uncertainties, and persistence success does not confer semantic or human authority.
