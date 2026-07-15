# Lifecycle Visual Spec

- **Reader question:** Which responsibility produces a safe document, and where does external publication begin?
- **Support:** `AU-501`, `AU-502`; `notification-retry-policy/SNAP-005/OBS-004`, `DEC-003`, `GAP-002`; qualified local workflow instructions.
- **Allowed assertions:** sources feed a Case; snapshots pin artifacts; the current successor is distinct from a frozen stale baseline; publish is a separate gated step.
- **Forbidden implications:** every artifact uses every stage; a snapshot is mutable; the workflow approves policy; the baseline is current.
- **Elements:** source, Case, snapshot, composition, shape, trace, review, local format, publish gate; a visible `baseline-r1 / SNAP-003 / frozen stale` label; a visible `successor-r2 / SNAP-005 / current-safe with GAP-002` label; caption and text equivalent.
- **Trace:** `#diagram-lifecycle`, `AU-501`, `AU-502`.
- **Accessibility:** alt: “Workflow lanes show Case-backed document stages, a frozen stale baseline, and a current successor that stops at a publication gate.” Text equivalent names the same path and status.
- **Validation:** compare node labels and status to trace; inspect desktop and narrow layout; verify no arrow bypasses the publication gate.
