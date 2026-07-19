# Terrain

Build a scoped model of the existing architecture relevant to the accepted behavior before proposing new boundaries.

Inspect only enough terrain to remove material unchecked assumptions:

- current responsibilities, modules, and package/file placement;
- caller-visible Contracts, deliberate omissions, and hidden Secrets;
- materially different consumers and behavior paths;
- canonical state, derived state, mutation ownership, and reconciliation;
- dependency and runtime relationships;
- trust, deployment, process, and failure boundaries;
- observation, operation, repair, migration, and retirement paths;
- friction, repeated remediation, and relevant architectural history;
- applicable project, stack, assurance, and diagnostic guidance.

Distinguish observed facts from inferred responsibilities and design judgments. Cite repository paths, executable evidence, retained artifacts, and Case entries. Record drift from admission inputs without treating drift alone as invalidation.

Stop terrain work when candidate designs no longer depend on important unchecked architectural assumptions. Do not turn the survey into whole-codebase documentation or select a future boundary inside the terrain record.

End with:

- the current responsibility and interaction model;
- material behavior paths and authority crossings;
- constraints the candidate design must preserve;
- friction or poor allocation worth testing;
- explicit unknowns and their destinations;
- which existing boundaries could plausibly adapt, which genuinely new responsibility may be needed, and which allocation may require refactoring—without choosing among them.