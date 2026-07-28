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
Delivery shape: single_pr | stacked_feature_prs
Execution Authorization Envelope: <complete envelope below>
Effect bindings: <locators or none>
Constraints/exclusions: <project instructions, scope, compatibility>
Proof allocation: <imported Atlas allocation and ordering | explicit ad hoc/prototype profile>
Stopping conditions: <binding failures, authority blockers, limits>
```

Git resolves exact source revisions transiently. The map retains the named baseline, not a revision ledger. Atlas planning authority does not imply execution authority. Once an explicit implementation request is normalized into an Execution Authorization Envelope, every operation inside that envelope proceeds without repeated confirmation until an invalidator fires. Unknown authority blocks only the operation that needs it; explicitly absent and not-applicable authorities do not block unrelated work.

## Evidence Receipt

An Evidence Receipt is a compact, provider-neutral record connecting one exact claim to the smallest boundary that owns it. It improves retention and handoff; it is **best effort**, not a new proof gate. A passed command or observed behavior does not become blocked solely because its preferred artifact cannot be retained. Record the retention limitation, selected output, or explicit execution attestation instead. Existing cleanup/effect rules still govern `unresolved_effects`; a missing cleanup disposition is not merely an evidence-retention limitation.

Prefer the first practical form in this hierarchy:

1. authoritative provider artifact;
2. low-cost retained, sanitized artifact;
3. copied selected output; or
4. explicit execution attestation when no artifact/output can be retained.

Do not turn this into a machine schema, transcript store, or universal logging requirement. Each receipt contains enough of the following to make a claim reviewable:

```markdown
Receipt ID: <stable ID>
Claim: <exact observed claim; pass/fail/limited claim, not a broad summary>
Owning boundary: <smallest task, convergence gate, review, E2E/effect, or final handoff boundary>
Candidate: <repository + worktree/branch/ref or external target tuple>
Method: <command, provider action, or observation method>
Result/status: <pass | fail | limited | attested>
Observed: <time>
Evidence: <form plus authoritative locator, private artifact locator, or copied selected output>
Freshness/invalidators: <applicability, relevant invalidators, and stale/current status>
Sensitivity/redaction: <classification and redactions applied>
Cleanup disposition: <not applicable | terminal disposition | unresolved_effects locator>
Limitations: <retention, environment, or observation limits; none when absent>
```

Create new retained evidence beside the execution map in a private, untracked `evidence/` directory by default. Keep it until an explicit cleanup or archive disposition; never automatically commit, publish, attach, or upload it. Add a compact `evidence/INDEX.md` that maps receipt IDs to retained files, claim, boundary, and sensitivity/cleanup status. The execution map stores receipt references and short limitations only; it is not a transcript or log store. Sanitise secrets, credentials, personal data, and other sensitive output before retention. Authority to retain privately does not grant publication authority.

### Execution Authorization Envelope

Record one cumulative scoped grant for the delivery. An implementation request does include ordinary commit, exact feature-branch push, and PR lookup/creation authority, plus scoped worktree and owned-branch mechanics, for a verified non-protected `single_pr` delivery unless the requester excludes PR delivery or requests local-only work. An explicit `stacked_feature_prs` request supplies those mechanics across the declared stack graph. Do not infer merge, deployment, release, force push, protected-branch mutation, ready-for-review conversion, credentials, external/live effects, landing, Atlas closure, or unrelated effects.

```markdown
Grant identity/source: <stable execution grant and exact user/workflow instruction>
Bound outcome/Atlas Decision: <exact boundary>
Repositories and paths: <exact allowed scope>
Delivery shape: single_pr | stacked_feature_prs
Integration base: <named base>
Branch namespace: <task/feature branch namespace>
Allowed mechanics:
  persistent worktrees: <allowed | absent | not applicable>
  local source/test/doc edits and verification: <allowed boundary>
  task and Feature branches: <allowed boundary>
  commits on owned branches: <allowed boundary>
  integration of validated work into declared Feature branches: <allowed boundary>
  non-force push of owned branches: <allowed boundary>
  create/update matching draft PRs: <allowed boundary>
Stack graph: <Feature -> repository/head/base/predecessor, or not applicable>
Temporary/local effects: <allowed boundary | absent | not applicable>
External/live proof effects: <Effect Binding locators | absent | not applicable>
Explicitly absent: <force push, protected-base mutation, ready conversion, reviewer/label/project mutation, merge, deployment, release, landing, other effects>
Invalidators/expiry: <Map successor, scope/topology/destination change, conflict, cancellation, or completion>
```

The envelope is inherited by Task, Integration, Workspace, and PR operation Contracts. Restate only the applicable derived boundary and envelope locator. Ask again only for a material expansion or changed review topology, destination, visibility, risk, or absent operation.

In `stacked_feature_prs`, each accepted Feature ordinarily owns one durable integration branch and draft PR. The root Feature targets the named integration base; a dependent Feature targets its declared predecessor Feature branch. Retargeting outside the accepted stack graph requires a new grant. After a predecessor lands, updating a dependent PR to the declared integration base is permitted only when the envelope explicitly includes that transition.

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

Perform at admission, coordinator resume, before every dependency frontier, before every effectful gate, and before result. Invoke Feature Atlas domain read/verify operations through the configured storage adapter against the **bound Atlas/Map/Decision**, never against an unqualified `latest` or provider path. If the configured adapter is an executable instruction resource rather than a runtime wrapper, its documented provider CLI reads are permitted only as mechanics of the complete named semantic operation; preserve the operation's checks, classification, and receipt, and never treat raw CLI output as the result.

Resolve Atlas storage independently from Case/Frame persistence. `CASEBOOK_DATABASE_URL` is irrelevant to Atlas selection. Prefer an explicit Atlas destination from the delivery binding; otherwise use the current project's `.casebook/atlas` local filesystem default. If no dedicated local adapter executable exists, the Feature Atlas skill may execute adapter-owned filesystem reads and return the typed operations; executable absence alone is not an unverifiable binding.

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
Execution envelope / derived commit authority: <locator and task-branch boundary | not granted>
Repair context: <prior evidence/findings or none>
Evidence receipts: <worker must return receipt references, selected output, or attestation>
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
Evidence receipts: <smallest-boundary receipt requirements and retention limitations>
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
Evidence receipt: <required claim/boundary and permitted retention form>
```

Never fall back to unverified credentials, substitute a provider/account/model, or broaden a binding during repair. Provider/PR discovery does not itself grant mutation authority. For an explicit implementation request, the verified repository remote, authenticated provider account, exact non-protected head, and verified base form the default PR Delivery Binding for exact branch push plus PR lookup/create. E2E setup/run/cleanup and all external/live effects still consume separately declared Effect Bindings. An Atlas proof obligation does not supply a missing live-effect, merge, deployment, landing, or protected-branch binding.

## Result Contracts

### Worker

`complete` carries outcome, exact Atlas task binding when applicable, candidate identity, deep interfaces, assumptions/refactoring, behavioral tests, commands/results, Evidence Receipt references or selected output/attestation, focused-verifier instructions, residual limits, worktree/branch, and commit disposition. `technically_blocked` is reserved for impossible continuation and carries candidate identity, evidence receipts or attestation, plus one discriminating question.

### Focused validator

Exactly `pass | findings | material_contradiction`, including candidate identity, bound Atlas obligation when applicable, enforcement tier, and Evidence Receipt references or selected output/attestation. Findings carry observed evidence, violated Contract clause, affected interface/consumer, and smallest behavioral correction.

### Integration worker

Carries candidate identity, integrated behavior, included branches, accepted convergence binding, conflicts/seam repairs, commands/results, Evidence Receipt references or selected output/attestation, assumptions, and integration branch/worktree. It never self-certifies.

### Coordinator

Carries mode/outcome, exact consumed Atlas Decision and result Currentness Check when applicable, stable map locator, completed waves, evidence under the admitted proof allocation, final Evidence Receipt references or selected output/attestation, assumptions/exact typed limits, and PR or integration-branch handoff. It does not publish retained evidence without separate authority.
