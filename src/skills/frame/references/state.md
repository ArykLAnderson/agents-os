# Frame State

Persist current reality at natural boundaries, not after every turn.

`.casebook/frames/<frame-id>/frame.md`:

```markdown
---
type: frame
schema_version: 1
id: frame:<collision-resistant-local-id>
status: active
---

## Outcome
## Scope
## Cases
## Discovery
## Downstream Work
## Active Authorizations
## Limitations
## Completion
```

Omit empty sections. `Cases` lists created or reconciled Case references and may temporarily record `Pending disposition: <bounded result and why it is not yet classifiable>` or `No Case: <material omission and reason>`. Pending disposition is boundary state, not a substitute for classification; a Frame cannot complete while a material disposition remains pending. `Discovery` contains only a stable reference to `discovery-map.md` and, when useful, a concise knowledge boundary; never copy attention items, operation outputs, resolved history, routing, or recommendations. `Downstream Work` contains stable session references and the original artifact boundary, not copied drafts, findings, or document progress. `Active Authorizations` describes current scope and duration, not instructions to act. Renew authorization after resumption unless it explicitly survives the boundary.

Statuses are descriptive: `active`, `completed`, `abandoned`, or `superseded`. They do not route work.

`.casebook/frames/<frame-id>/discovery-map.md`:

```markdown
## Fog
## Frontier
## Blocked
## Contested
## Deferred
## Out of Scope
```

Fog is unnumbered until precise. Every precise attention item has a Frame-local ID such as `AT-014`, one unresolved statement, `Human authority: not required | required | unclear`, and material dependencies or blockers. Do not persist assignment, routing, priority, confidence, timestamps, operation results, history, or recommended next actions.

Keep resolved items only while they explain an active dependency. Remove them after their meaning is durable in Cases and no active item needs the pointer.
