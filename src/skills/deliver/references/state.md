# Deliver State

Persist a compact semantic session surface at natural boundaries. Do not copy Runtime journals, task state, source diffs, test logs, resource ledgers, or tracker truth.

`delivers/<deliver-id>/deliver.md`:

```markdown
---
type: deliver
schema_version: 1
id: deliver:<collision-resistant-local-id>
status: active
route: route:<id>@<accepted-revision>
blueprint: blueprint:<id>@<accepted-revision>
---

## Outcome Boundary
## Source And Worktree Boundary
## Effect Authorizations
## Route Frontier
## Evidence And Findings
## Source-System Locators
## Temporary Effects
## Limitations
## Completion
```

Omit empty sections.

- `Route Frontier` records stable Leg/Work Item references and why they are eligible, suspended, or dispositioned; Runtime/source systems own actual execution state.
- `Evidence And Findings` retains compact locators and semantic disposition, not copied logs.
- `Source-System Locators` names commits, PRs, checks, deployments, Runtime sessions, or configured tracker records without absorbing their truth.
- `Temporary Effects` records semantic cleanup obligations and settlement evidence; tools/Runtime retain concrete resource state.
- `Effect Authorizations` records scope, duration, and survival boundary, not instructions to act.

Statuses are descriptive: `active`, `completed`, `route-invalidated`, `failed`, or `cancelled`.

One Deliver binds one accepted Route revision for its lifetime. Never update the binding in place. If the Route is materially invalidated, close this session and create a fresh Deliver only after a fresh Route candidate is human-accepted.