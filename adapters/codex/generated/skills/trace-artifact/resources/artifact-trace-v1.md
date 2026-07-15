# Artifact Trace V1

Use this sidecar shape for each formal artifact revision.

```md
# Artifact Trace

- **Artifact:** <artifact ID and revision>
- **Snapshot set:** <case-id>/<snapshot-id>[, ...]
- **Reader action:** <action>
- **Trace status:** current | blocked | stale

## Units

### AU-001: <semantic unit name>

- **Anchor:** <stable artifact anchor>
- **Assertion:** <bounded claim or reader-facing purpose>
- **Support:** <case-id>/<snapshot-id>/<entry-id>[; ...]
- **Derivation:** direct | synthesis | omission-accounting
- **Status:** supported | unsupported | stale | blocked
- **Notes:** <authority, confidence, or scope caveat when material>
```

Use a unit for each material decision, evidence synthesis, risk or gap, reader action, table row, and visual assertion. A material table needs one unit per material row, each tied to that row's stable anchor; a table-level unit is not a substitute. `synthesis` may combine supported entries but must identify every support reference and cannot erase disagreement. `omission-accounting` identifies a selected entry deliberately absent from the artifact and the reason it is safe to omit or defer.

An artifact is blocked when any material unit is unsupported, lacks an anchor, conflicts with its support's authority/status, or has no trace for a material table or visual assertion.
