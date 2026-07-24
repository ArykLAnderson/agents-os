# Software Implementation Execution Map

> Fancy to-do list, not workflow, source, or Atlas truth. One coordinator owns this map.

## Delivery

- **Map locator:** `<stable path>`
- **Delivery Contract:** `<locator or compact inline contract>`
- **Mode/outcome:** `<atlas | ad_hoc | prototype — result>`
- **Repository:** `<identity>`
- **Named integration base:** `<branch/ref name>`
- **Delivery shape:** `<single_pr | stacked_feature_prs>`
- **Integration worktree/branch:** `<path — branch>`
- **Execution Authorization Envelope:** `<stable grant locator and concise allowed/absent boundary>`
- **Effect Bindings:** `<locators or none>`
- **Proof allocation:** `<imported Atlas allocation | explicit ad hoc/prototype profile>`

## Atlas Delivery Binding

Use `not applicable` outside Atlas mode. Preserve exact values rather than a prose summary.

- **Handoff disposition:** `<HandoffReady | HandoffWithLimitations>`
- **Atlas / Map / current Decision:** `<stable IDs and domain/immutable locators>`
- **Accepted snapshot / publication integrity:** `<binding verification and adapter receipt>`
- **Blueprint bindings / coverage:** `<exact revisions and locators>`
- **Feature bindings:** `<local labels ↔ F-* IDs, owners, locators>`
- **Leg bindings:** `<snapshot labels ↔ Feature owners/meaning>`
- **Work Item bindings:** `<local labels ↔ WI-* IDs, Feature/Leg owners, locators>`
- **Prerequisites / convergence:** `<accepted direct edges/endpoints and owners>`
- **Transition / compatibility / cleanup:** `<accepted obligations>`
- **Proof / E2E / security allocation:** `<accepted gates, order, owners and claims>`
- **Invalidators / qualified evidence:** `<exact rules, source locators, freshness and revalidation>`
- **Typed limitations:** `<type, affected claim/work, forbidden claim, allowed boundary, owner>`
- **Atlas authority boundary:** `<explicit present/absent implementation/effect/PR/merge/deploy/landing authority>`

## Currentness

Store the latest check and material stop only; do not mirror Atlas history.

- **Checkpoint / observation time:** `<admission | resume | dependency_frontier | effectful_gate | result — time>`
- **Bound / observed current Decision:** `<exact identities>`
- **Adapter / reread receipt:** `<configured adapter and domain receipt>`
- **Publication / binding / invalidator result:** `<concise result and source locators>`
- **Disposition / affected execution:** `<clear | exact_admitted_limitation | stop — boundary>`

## Tasks

States: `todo | working | verify | repair | ready_to_integrate | integrated | blocked | done`.

| Task | Atlas WI / local label / Feature / Leg | Outcome | Depends on | Starting baseline | Module/files | Wave | Role/session | Worktree/branch | State | Evidence/findings |
|---|---|---|---|---|---|---|---|---|---|---|
| `<T-01>` | `<WI-* / label / F-* / leg, or n/a>` | `<observable result>` | `<accepted direct prerequisites>` | `<base name>` | `<owned boundary>` | `<1>` | `<worker/id>` | `<path/branch>` | `todo` | `<locators>` |

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

Do not add commit-hash ledgers, event transcripts, transactional ownership machinery, or mirrored Atlas/tracker state. Git, Feature Atlas domain records, and external systems remain authoritative.
