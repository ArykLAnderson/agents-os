# Successor acceptance proof

Run the successor-only proof with:

```sh
node --test tests/candidate4-v2-conformance.test.mjs tests/successor-authority.test.mjs tests/profile-admission.test.mjs tests/context-lifecycle.test.mjs tests/placement-generation.test.mjs tests/successor-case-resources.test.mjs tests/successor-frame-resources.test.mjs tests/organizational-search.test.mjs tests/graph-observation-reconcile.test.mjs
```

This command is the active retained WI-016–WI-024 proof for the fresh-store Candidate-4 v2 boundary. Its maintained suites cover Candidate-4 contract admission, WI-016 authority, WI-017 Profile admission, WI-018 Context, WI-019 placement, WI-020 Case, WI-022 Frame, WI-023 organizational query, and WI-024 graph reconciliation. It includes the resolver shipping E2E coverage for the SQLite connector and generated Pi, Codex, and OpenCode package copies.

Predecessor FINAL, cutover, and schema-v1 suites are removed from the active package test surface: they assert retired contracts and cannot evidence the fresh-store Candidate-4 v2 boundary. Their historical claims are retained only in accepted design evidence, not as executable successor regressions.
