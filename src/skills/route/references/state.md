# Route State

Persist at natural operation boundaries, not after every graph edit or human answer.

`routes/<route-id>/route.md`:

```markdown
---
type: route
schema_version: 1
id: route:<collision-resistant-local-id>
status: active
current_revision: candidate-<n>
blueprint: blueprint:<id>@<accepted-revision>
---

## Destination
## Scope And Exclusions
## Current Terrain
## Accepted Blueprint
## Strategy
## Legs
## Work Items
## Dependency Graph
## Transition Coverage
## Findings And Deferrals
## Evidence And Limitations
## Acceptance
```

Omit empty sections. Use stable Route-local Leg and Work Item identities; display ordering is not identity. The graph records explicit prerequisite edges and convergence responsibilities, not runtime task state.

Route references Cases, Frames, Blueprints, prototypes, source systems, and external facts by stable locator/revision. It does not copy their authority or become an implementation tracker.

Statuses are descriptive: `active`, `accepted`, `rejected`, `abandoned`, or `superseded`. After Route acceptance, a material change to strategy; Leg boundary, order, or acceptance; dependencies; migration or compatibility; evidence strategy; cleanup or rollback; or transition assumptions invalidates the accepted Route. Stop affected implementation execution, preserve its evidence truthfully, return evidence to Route, and create a fresh Route candidate for human acceptance rather than silently rebinding execution in place. Existing implementation is evidence or potential salvage only and must re-earn inclusion.

Accumulate related human answers through a bounded Frame interview and reconcile at a natural boundary. Review outputs remain advisory Findings until correctly dispositioned.