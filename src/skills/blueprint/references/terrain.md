# Terrain

Build a scoped, evidence-backed old/current architecture view relevant to the accepted behavior before proposing the new view.

Inspect only enough terrain to remove material unchecked assumptions:

- current responsibilities, modules, and package/file placement;
- caller-visible Contracts, canonical definitions, deliberate omissions, and leaked or hidden Secrets;
- materially different consumers and behavior paths;
- canonical state, derived state, schemas, mutation ownership, and reconciliation;
- dependency and runtime relationships;
- change, trust, deployment, process, lifecycle, and failure boundaries;
- observation, operation, repair, migration, and retirement paths and owners;
- friction, repeated remediation, and relevant architectural history;
- applicable project, stack, assurance, and diagnostic guidance.

Use `Secrets`, `Contract`, `Depth`, `Unity`, and `Ownership` as diagnostic lenses, not ratings. A terrain observation is not a design verdict merely because one lens looks weak.

Distinguish observed facts from inferred responsibilities and design judgments. Cite repository paths, executable evidence, retained artifacts, and Case entries with examined revisions. Identify duplicate or ambiguous claims of canonical authority. Record drift from admission inputs and reconcile it with pinned Casework; reopen Frame only when it would materially change the accepted behavioral boundary.

Stop terrain work when candidate designs no longer depend on important unchecked architectural assumptions. Do not turn the survey into whole-codebase documentation or select a future module inside the terrain record.

End with:

- the current responsibility and interaction model;
- material behavior paths and authority crossings;
- current Contract, state, schema, and ownership canon;
- constraints the candidate design must preserve;
- friction or poor allocation worth testing;
- explicit unknowns classified as behavioral, architectural, realization, evidence, or external-authorization questions; and
- which existing modules could plausibly adapt, which genuinely new responsibility may be needed, and which allocation may require refactoring—without choosing among them.
