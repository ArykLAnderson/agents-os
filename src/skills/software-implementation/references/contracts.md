# Portable Contracts

These schemas carry semantics across harnesses. Keep target launch syntax in adapter references.

## Delivery Contract

```markdown
Mode: route | ad_hoc | prototype
Outcome: <bounded software result or prototype question>
Why/consumer: <value and fidelity context>
Governing design: <observed Blueprint/Route revisions, or none>
Repository: <identity>
Integration base: <named authoritative starting ref>
Execution map: <stable human-readable Markdown path>
Authority:
  implementation: <allowed boundary>
  commit: <allowed boundary>
  internal integration: <allowed boundary>
  temporary effects: <allowed boundary>
  PR: <allowed boundary>
  landing: <allowed boundary>
Effect bindings: <locators or none>
Constraints/exclusions: <project instructions, scope, compatibility>
Proof profile: <task, convergence, release gates>
Final E2E: <contract locator or not required>
```

Git resolves exact revisions transiently. The map retains the named baseline, not a revision ledger.

## Task Contract

```markdown
Task: <stable human-readable identity>
Outcome/why: <bounded result and consumer value>
Deep module/public interface: <owned boundary>
Observable behavior: <outcomes and meaningful failures>
Immediate consumer: <caller/user/system>
Behavioral tests: <interface-level batch expected>
Scope/ownership: <allowed code/config/tests/modules/files>
Prerequisites/destination: <dependencies and convergence destination>
Project commands/instructions: <applicable sources and commands>
Design constraints/exclusions: <accepted constraints>
Effects: <none, or exact Effect Binding locator>
Starting baseline: <named integration ref containing prerequisites>
Repository/worktree/branch: <explicit persistent path and identities>
Commit authority: <granted for integration | not granted>
Repair context: <prior evidence/findings or none>
Handoff: <required result schema>
```

Operational enrichment cannot change accepted behavior, architecture, dependencies, Contracts, or consequential authority. A worker needs this compact Contract, not coordinator history.

## Convergence Contract

```markdown
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

Never fall back to ambient credentials, substitute a provider/account/model, or broaden a binding during repair. Provider/PR discovery does not itself grant mutation authority. PR lookup/create and E2E setup/run/cleanup consume their own declared bindings.

## Result Contracts

### Worker

`complete` carries outcome, deep interfaces, assumptions/refactoring, behavioral tests, commands/results, focused-verifier instructions, residual limits, worktree/branch, and commit disposition. `technically_blocked` is reserved for impossible continuation and carries evidence plus one discriminating question.

### Focused validator

Exactly `pass | findings | material_contradiction`, including candidate identity and enforcement tier. Findings carry observed evidence, violated Contract clause, affected interface/consumer, and smallest behavioral correction.

### Integration worker

Carries integrated behavior, included branches, conflicts/seam repairs, commands/results, assumptions, and integration branch/worktree. It never self-certifies.

### Coordinator

Carries mode/outcome, stable map locator, completed waves, convergence evidence, applicable release verdicts/E2E, assumptions/limits, and PR or integration-branch handoff.