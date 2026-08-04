# Software Implementation Execution Map

> Fancy to-do list, not workflow, source, or Atlas truth. One coordinator owns this map.

## Delivery

- **Map locator:** `<stable path>`
- **Delivery Contract:** `<locator or compact inline contract>`
- **Mode/profile/outcome:** `<atlas | ad_hoc | prototype — direct_task | coordinated_change — result>`
- **Repository:** `<identity>`
- **Named integration base:** `<branch/ref name>`
- **Delivery shape:** `<single_pr | stacked_feature_prs>`
- **Integration worktree/branch:** `<path — branch | direct task delivery branch; no separate integration>`
- **Execution Authorization Envelope:** `<stable grant locator and concise allowed/absent boundary>`
- **Effect Bindings:** `<locators or none>`
- **Proof allocation:** `<imported Atlas allocation | explicit ad hoc/prototype profile>`

## Atlas Delivery Binding

Use `not applicable` outside Atlas mode. Preserve exact values rather than a prose summary.

- **Handoff disposition:** `<HandoffReady | HandoffWithLimitations>`
- **Publication:** `<method, destination, Map and current Decision locators>`
- **Blueprint:** `<accepted RFC/Blueprint revision and locator>`
- **Selected work:** `<Feature and Work Item IDs, locators, owners and outcomes>`
- **Order:** `<direct prerequisites and convergence points>`
- **Obligations:** `<compatibility, cleanup, proof responsibilities and owners>`
- **Limitations:** `<affected work, forbidden claims, invalidators and source links>`
- **Authority boundary:** `<present/absent implementation/effect/PR/merge/deploy/landing authority>`

## Currentness

Store the latest check and material stop only; do not mirror Atlas history.

- **Checkpoint / observation time:** `<admission | resume | dependency_frontier | effectful_gate | result — time>`
- **Bound / observed current Decision:** `<exact identities>`
- **Records read:** `<Map, Feature and Work Item paths or Issue URLs>`
- **Publication / limitation result:** `<concise result>`
- **Disposition / affected execution:** `<clear | exact_admitted_limitation | stop — boundary>`

## Tasks

States: `todo | working | verify | repair | ready_to_integrate | integrated | blocked | done`.

| Task | Atlas WI / Feature | Outcome | Depends on | Starting baseline | Module/files | Wave | Role/session | Worktree/branch | State | Evidence/findings |
|---|---|---|---|---|---|---|---|---|---|---|
| `<T-01>` | `<WI-* / F-*, or n/a>` | `<observable result>` | `<accepted direct prerequisites>` | `<base name>` | `<owned boundary>` | `<1>` | `<worker/id>` | `<path/branch>` | `todo` | `<locators>` |

## Feature / PR Stack

Use `not applicable` in `single_pr` mode.

| Feature | Repository | Integration worktree/branch | Declared base/predecessor | Draft PR | Pre-PR gates | State |
|---|---|---|---|---|---|---|
| `<F-*>` | `<repo>` | `<path/branch>` | `<integration base or predecessor Feature branch>` | `<URL or pending>` | `<gate identities>` | `<pending | integrating | verified | draft_open | blocked>` |

## Imported / Admitted Proof Gates

States: `pending | ready | running | passed | limited | blocked`.

| Gate | Accepted owner/claim | Depends on | Downstream blockers | Evaluator/effects/cleanup | State | Qualified evidence/limitation |
|---|---|---|---|---|---|---|
| `<G-01>` | `<Map/Feature/WI owner — exact proof claim>` | `<tasks/gates>` | `<tasks/gates>` | `<independence, Effect Binding, cleanup>` | `pending` | `<locators>` |

A bounded-live proof between two Work Items is represented as an ordinary gate node between them, not moved to final release.

## Current Frontier

- **Currentness:** `<clear check locator/result>`
- **Ready writers/gates:** `<non-overlapping task identities or admitted gates>`
- **Serialized overlap:** `<tasks and reason>`
- **Waiting on integration/proof:** `<tasks/gates>`

## Stall / Repair

| Task/gate | Compact attempts | Current blocker or next different approach |
|---|---|---|
| `<identity>` | `<short evidence locators>` | `<exact blocker/approach>` |

## Convergence

- [ ] `<wave>` integrated by sole Integration Worker
- [ ] Accepted Convergence binding / Contract: `<owner and locator>`
- [ ] Focused convergence verdict: `<required/result locator | omitted by allocation>`
- [ ] Named integration baseline advanced

## Remaining Proof / Effect / PR Gates

- [ ] Imported gates complete in accepted order `<state/locators>`
- [ ] Added operational evidence detail `<commands/locators; no changed claims>`
- [ ] External cleanup `<terminal disposition>`
- [ ] PR preparation `<authorized/result | not authorized>`
- [ ] Merge `<separate authority/result | not authorized>`
- [ ] Deployment `<separate authority/result | not authorized>`
- [ ] Landing `<separate authority/result | not authorized>`

## Handoff

- **Result Currentness Check:** `<exact bound/current Decision and disposition, or n/a>`
- **Last reconciled source/provider state:** `<summary and locators>`
- **Next bounded action:** `<action>`
- **Assumptions/exact typed limitations:** `<items>`
- **Execution map:** `<repeat stable locator>`

Do not add commit-hash ledgers, event transcripts, transactional ownership machinery, or mirrored Atlas/tracker state. Git, published Feature Atlas records, and external systems remain authoritative.
