# Portable Contracts

These schemas carry semantics across harnesses. Keep target launch syntax in adapter references.

## Delivery Contract

```markdown
Mode: atlas | ad_hoc | prototype
Outcome: <bounded software result or prototype question>
Why/consumer: <value and fidelity context>
Atlas Delivery Binding: <complete binding below, or not applicable>
Governing design: <exact Blueprint revisions/locators, other accepted design, or none>
Repository: <identity>
Integration base: <named authoritative starting ref>
Execution map: <stable human-readable Markdown path>
Authority:
  implementation: <allowed boundary>
  commit: <allowed boundary>
  internal integration: <allowed boundary>
  temporary/local effects: <allowed boundary>
  external/live proof effects: <allowed boundary>
  PR: <allowed boundary>
  merge: <allowed boundary>
  deployment: <allowed boundary>
  landing: <allowed boundary>
Effect bindings: <locators or none>
Constraints/exclusions: <project instructions, scope, compatibility>
Proof allocation: <imported Atlas allocation and ordering | explicit ad hoc/prototype profile>
Stopping conditions: <binding failures, authority blockers, limits>
```

Git resolves exact source revisions transiently. The map retains the named baseline, not a revision ledger. Each authority is independent: implementation or Atlas planning authority does not imply credentials, effects, PR, merge, deployment, or landing.

### Atlas Delivery Binding

Copy this from one exact domain-level Atlas execution handoff; do not reconstruct it from display projections or summaries.

```markdown
Handoff disposition: HandoffReady | HandoffWithLimitations
Atlas: <stable identity and domain locator>
Map: <stable identity and domain locator>
Current Map Decision: <immutable identity/locator, predecessor, current effect>
Accepted snapshot integrity: <inline Decision bytes or immutable locator/content type/digest verification>
Publication integrity: <complete projection, Decision/projection consistency, adapter reread/receipt>
Blueprint bindings and coverage: <exact accepted identities/revisions/locators>
Destination/scope/exclusions/deferrals: <exact accepted values>
Strategy and rejected alternatives: <exact accepted meaning>
Identity bindings:
  Features: <candidate-local label -> stable F-* identity, Map owner, locator>
  Legs: <accepted snapshot label -> owning Feature and meaning>
  Work Items: <candidate-local label -> stable WI-* identity, Feature/Leg owner, locator>
Accepted execution graph: <WI direct prerequisites, cross-boundary endpoints, convergence owners and downstream use>
Transition obligations: <migration, compatibility, retained states, temporary mechanisms, cleanup, recovery, publication, retirement>
Proof allocation: <focused, independent convergence, contextual/bounded-live/final E2E, security, cleanup, ordering and owners>
Qualified evidence: <source locators, provenance, observation times, applicability, invalidators, freshness, limitations, revalidation>
Invalidators: <exact rules, affected claims/work, accepted consequence and owner>
Typed limitations: <exact type, affected claim/work, forbidden claim, allowed unaffected boundary, resolution/owner>
Live resolution: <authoritative sources, provenance/integrity checks, observation time and result>
Successor/currentness: <expected current Decision and successor-impact result>
Authority boundary: <explicit present/absent implementation, effects, PR, merge, deploy and landing authorities>
Storage adapter receipt: <configured adapter identity and domain reread receipt; no provider command/path dependency>
```

`HandoffReady` is not dispatch or effect authority. `HandoffWithLimitations` retains every limitation exactly. It can be admitted only when separate implementation authority permits the explicitly unaffected boundary; affected work and forbidden claims stay blocked. `HandoffRefusal`, a historical requested Decision, incomplete/ambiguous publication, a Decision/projection conflict, an unresolvable binding, or omitted authority is not a Delivery Contract.

## Atlas Currentness Check

Perform at admission, coordinator resume, before every dependency frontier, before every effectful gate, and before result. Invoke Feature Atlas domain read/verify operations through the configured storage adapter against the **bound Atlas/Map/Decision**, never against an unqualified `latest`, provider CLI, or path.

```markdown
Checkpoint: admission | resume | dependency_frontier | effectful_gate | result
Bound Decision: <exact immutable identity/locator>
Adapter/receipt: <configured adapter identity and fresh reread receipt>
Observed current Decision: <exact identity/locator>
Publication/integrity: <complete and consistent | exact failure>
Binding resolution: <Blueprint/Feature/Leg/WI/local-label/owner/edge/proof/evidence resolution>
Invalidators/evidence freshness: <clear | exact triggered/unknown item>
Disposition: clear | exact_admitted_limitation | stop
Affected execution: <allowed unaffected boundary or stopped tasks/gates/result claim>
Observation time/sources: <authoritative locators>
```

Disposition rules:

- `clear` requires the bound Decision still be the sole current Decision and every required binding/publication-integrity check resolve consistently.
- `exact_admitted_limitation` is allowed only when the admitted handoff already names that exact limitation or invalidator state, consequence, affected work/claim, and allowed unaffected boundary. It cannot be widened or treated as pass evidence.
- `stop` is mandatory for an unaccounted successor, triggered invalidator, conflict, inaccessible/unverifiable binding, publication ambiguity, changed accepted meaning, or omitted authority. Preserve evidence and request a new current Atlas handoff or owning-authority disposition; never follow the successor automatically.

Keep the latest checkpoint plus material stop evidence in the map. Do not create a mirrored Atlas history ledger.

## Task Contract

```markdown
Task: <stable execution identity; exact WI-* and local-label binding in atlas mode>
Outcome/why: <bounded result and consumer value>
Atlas owner/Decision: <Feature, Leg, current Map Decision, or not applicable>
Deep module/public interface: <owned boundary>
Observable behavior: <outcomes and meaningful failures>
Immediate consumer: <caller/user/system>
Behavioral tests: <interface-level batch expected>
Scope/ownership: <allowed code/config/tests/modules/files>
Prerequisites/destination: <accepted direct dependencies, proof barriers, and convergence destination>
Project commands/instructions: <applicable sources and commands>
Design constraints/exclusions: <accepted constraints>
Proof responsibility: <exact imported or explicit ad hoc obligation>
Effects: <none, or exact Effect Binding locator>
Starting baseline: <named integration ref containing prerequisites>
Repository/worktree/branch: <explicit persistent path and identities>
Commit authority: <granted for integration | not granted>
Repair context: <prior evidence/findings or none>
Handoff: <required result schema>
```

Operational enrichment cannot change accepted behavior, architecture, identities, owners, dependencies, convergence, proof allocation/order, limitations, or consequential authority. A worker needs this compact Contract, not coordinator history.

## Convergence Contract

```markdown
Atlas convergence binding: <owner, accepted inputs/downstream use/proof gate, or not applicable>
Integrated candidate: <branch and explicit worktree>
Prerequisite baseline: <named baseline>
Included tasks: <identities and branch/worktree locators>
Downstream consumers: <immediate consumers>
Behaviors: <cross-module or local end-to-end scenarios>
Commands/observations: <how behavior is exercised and observed>
Cleanup: <required local cleanup>
Pass condition: <observable condition>
Permitted seam repairs: <bounded behavior and writer destination>
Finding routes: <module-local | seam-spanning | material contradiction>
```

Focused Validator consumes this in `convergence` scope and remains non-implementing.

## Effect Binding

Bind every external operation separately:

```markdown
Provider/service: <identity>
Account/org/repository/project: <exact identity>
Allowed action: <operation>
Target environment/data class: <exact target>
Credential reference: <opaque reference selected outside model output>
Network/provider capabilities: <allowed capabilities>
Ceilings: <spend, duration, resources, risk>
Cleanup owner/disposition: <owner and terminal state>
```

Never fall back to ambient credentials, substitute a provider/account/model, or broaden a binding during repair. Provider/PR discovery does not itself grant mutation authority. PR lookup/create and E2E setup/run/cleanup consume their own declared bindings. An Atlas proof obligation does not supply its missing Effect Binding.

## Result Contracts

### Worker

`complete` carries outcome, exact Atlas task binding when applicable, deep interfaces, assumptions/refactoring, behavioral tests, commands/results, focused-verifier instructions, residual limits, worktree/branch, and commit disposition. `technically_blocked` is reserved for impossible continuation and carries evidence plus one discriminating question.

### Focused validator

Exactly `pass | findings | material_contradiction`, including candidate identity, bound Atlas obligation when applicable, and enforcement tier. Findings carry observed evidence, violated Contract clause, affected interface/consumer, and smallest behavioral correction.

### Integration worker

Carries integrated behavior, included branches, accepted convergence binding, conflicts/seam repairs, commands/results, assumptions, and integration branch/worktree. It never self-certifies.

### Coordinator

Carries mode/outcome, exact consumed Atlas Decision and result Currentness Check when applicable, stable map locator, completed waves, evidence under the admitted proof allocation, assumptions/exact typed limits, and PR or integration-branch handoff.