# Skill Hierarchy Visual Spec

- **Reader question:** Which skill owns which responsibility, and where do unresolved meaning changes go?
- **Support:** `AU-503`; qualified local skill instructions.
- **Allowed assertions:** intake/reconcile own Case meaning; compose, shape, trace, review, format, and publish own bounded downstream responsibilities; proposed meaning returns to reconcile.
- **Forbidden implications:** a downstream skill can approve meaning; the hierarchy is a runtime orchestrator; review grants stakeholder approval.
- **Elements:** forward handoff nodes and adjacent arrows; a separate visible return band labeled `Proposed meaning change` that explicitly returns from downstream work to the initial `case-reconcile` node; caption and text equivalent.
- **Trace:** `#diagram-skill-hierarchy`, `AU-503`.
- **Accessibility:** alt: “A forward handoff chain assigns responsibilities to document skills. A separate return band sends a proposed meaning change from downstream work back to the initial case-reconcile node.”
- **Validation:** verify every label against the cited skill contract; ensure grouped connectors join adjacent forward steps only, the separate return band names both downstream origin and initial `case-reconcile` destination, and it is not labeled as approval.
