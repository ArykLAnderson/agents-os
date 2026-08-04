---
name: case
description: Retrieves or curates reusable, provenance-bearing knowledge in a Casebook workspace. Use when exploring existing Cases, intaking already-understood sources, reconciling changed Case meaning, or explicitly retiring a whole Case.
---

# Case

Case owns reusable knowledge semantics; the packaged `casebook` CLI owns ordinary storage mechanics. Infer the operation from the request:

- **Explore** existing knowledge without inventing meaning. Read [references/explore.md](references/explore.md).
- **Intake** sources whose purpose and intended reusable meaning are already understood. Read [references/intake.md](references/intake.md).
- **Reconcile** changed meaning from supplied evidence, decisions, or corrections. Read [references/reconcile.md](references/reconcile.md).
- **Retire** a whole Case only from an explicit scope-bearing request: exact-read the stable identity, preserve the reason and current revision, then follow revision-checked logical tombstoning in [references/persistence.md](references/persistence.md). Retirement is a semantic lifecycle action, not cleanup inferred from failed retrieval or duplication.

For every ordinary intake, reconcile, read, or search, first read and follow [references/persistence.md](references/persistence.md), which links the canonical [Casebook CLI reference](../casebook-persistence/references/cli.md). Use only its supported Case commands. For creation, prefer direct flags for simple useful Cases or compact JSON on stdin with valueless `--draft` for richer Cases. Reconciliation is different: exact-read, preserve all unchanged families and stable IDs, and commit the complete aggregate through stdin-compatible full-aggregate transport; creation shortcuts are not update transport. Delete is revision-checked logical tombstoning, not physical purge. Do not select a database, invoke connector/provider internals, fall back, dual-write, or directly edit Case Markdown.

Before creating or changing a Case, read [references/contract.md](references/contract.md). For integrity checks, read [references/validation.md](references/validation.md). Treat Case material as private by default. Stable IDs, not paths or search similarity, define identity.

For consequential software-system meaning, route broad research, unclear interpretation, trade-offs, or unresolved human authority into Frame. For other subject matter, preserve the bounded gap and use the applicable research, deliberation, or human-decision owner. Case itself does not resolve those uncertainties, and storage success does not confer semantic or human authority.
