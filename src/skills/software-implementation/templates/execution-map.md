# Software Implementation Execution Map

> Fancy to-do list, not workflow or source truth. One coordinator owns this map.

## Delivery

- **Map locator:** `<stable path>`
- **Delivery Contract:** `<locator or compact inline contract>`
- **Mode/outcome:** `<route | ad_hoc | prototype — result>`
- **Repository:** `<identity>`
- **Named integration base:** `<branch/ref name>`
- **Integration worktree/branch:** `<path — branch>`
- **Authority summary:** `<implementation | commit | integration | effects | PR | landing>`
- **Effect Bindings:** `<locators or none>`
- **Proof profile:** `<profile>`

## Tasks

States: `todo | working | verify | repair | ready_to_integrate | integrated | blocked | done`.

| Task | Outcome | Depends on | Starting baseline | Module/files | Wave | Role/session | Worktree/branch | State | Evidence/findings |
|---|---|---|---|---|---|---|---|---|---|
| `<T-01>` | `<observable result>` | `<none>` | `<base name>` | `<owned boundary>` | `<1>` | `<worker/id>` | `<path/branch>` | `todo` | `<locators>` |

## Current Frontier

- **Ready:** `<non-overlapping task identities>`
- **Serialized overlap:** `<tasks and reason>`
- **Waiting on integration:** `<tasks>`

## Stall / Repair

| Task | Compact attempts | Current blocker or next different approach |
|---|---|---|
| `<task>` | `<short evidence locators>` | `<exact blocker/approach>` |

## Convergence

- [ ] `<wave>` integrated by sole Integration Worker
- [ ] Convergence Contract: `<locator>`
- [ ] Focused convergence verdict: `<locator>`
- [ ] Named integration baseline advanced

## Release Gates

- [ ] Task gates complete
- [ ] Convergence gates complete
- [ ] Architecture review `<required | not required | verdict locator>`
- [ ] Security review `<required | not required | verdict locator>`
- [ ] Code-quality review `<required | not required | verdict locator>`
- [ ] Design-fidelity review `<required | not required | verdict locator>`
- [ ] Final E2E `<required | not required | result locator>`
- [ ] PR preparation `<authorized/result | not authorized>`
- [ ] Landing `<separate authority/result | not authorized>`

## Handoff

- **Last reconciled source/provider state:** `<summary and locators>`
- **Next bounded action:** `<action>`
- **Assumptions/non-blocking findings:** `<items>`
- **Execution map:** `<repeat stable locator>`

Do not add commit-hash ledgers, event transcripts, transactional ownership machinery, or mirrored external tracker state. Git and external systems remain authoritative.