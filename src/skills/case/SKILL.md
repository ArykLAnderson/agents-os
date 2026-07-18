---
name: case
description: Retrieves or curates reusable, provenance-bearing knowledge in a Casebook workspace. Use when exploring existing Cases, intaking already-understood sources, or reconciling changed Case meaning.
---

# Case

Case manages reusable knowledge in independently readable Markdown files under `.casebook/cases/`. Infer the operation from the request:

- **Explore** existing knowledge without inventing meaning. Read [references/explore.md](references/explore.md).
- **Intake** sources whose purpose and intended reusable meaning are already understood. Read [references/intake.md](references/intake.md).
- **Reconcile** changed meaning from supplied evidence, decisions, or corrections. Read [references/reconcile.md](references/reconcile.md).

Before creating or changing a Case, read [references/contract.md](references/contract.md). For integrity checks, read [references/validation.md](references/validation.md).

Use an explicit user-provided workspace root when present; otherwise use `.casebook/` in the current project. Treat the workspace as private and Git-ignored by default. Stable IDs, not paths, define identity.

Route work into Frame when it requires broad research, unclear interpretation, consequential trade-offs, or unresolved human authority. Case itself does not resolve those uncertainties.
