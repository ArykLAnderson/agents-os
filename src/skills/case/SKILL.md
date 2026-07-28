---
name: case
description: Retrieves or curates reusable, provenance-bearing knowledge in a Casebook workspace. Use when exploring existing Cases, intaking already-understood sources, or reconciling changed Case meaning.
---

# Case

Case owns reusable knowledge semantics; the packaged `casebook` CLI owns ordinary storage mechanics. Infer the operation from the request:

- **Explore** existing knowledge without inventing meaning. Read [references/explore.md](references/explore.md).
- **Intake** sources whose purpose and intended reusable meaning are already understood. Read [references/intake.md](references/intake.md).
- **Reconcile** changed meaning from supplied evidence, decisions, or corrections. Read [references/reconcile.md](references/reconcile.md).

For every ordinary intake, reconcile, read, or search, first read and follow [references/persistence.md](references/persistence.md), which links the canonical [Casebook CLI reference](../casebook-persistence/references/cli.md). Use only its supported Case commands. Do not select a database, invoke connector/provider internals, fall back, dual-write, or directly edit Case Markdown.

Before creating or changing a Case, read [references/contract.md](references/contract.md). For integrity checks, read [references/validation.md](references/validation.md). Treat Case material as private by default. Stable IDs, not paths or search similarity, define identity.

Route work into Frame when it requires broad research, unclear interpretation, consequential trade-offs, or unresolved human authority. Case itself does not resolve those uncertainties, and storage success does not confer semantic or human authority.
