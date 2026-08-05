# Release Gates

## Proof Allocations

Choose/admit before dispatch:

| Mode/profile | Required proof |
|---|---|
| Atlas delivery | The exact current Map Decision's imported focused, convergence, review, E2E, security, cleanup, and ordering allocation |
| Direct/ad hoc task | Worker checks and task-scope Focused Validator |
| Bounded ad hoc coordinated change | Task and convergence gates; explicit risk/release intent decides whole-deliverable review |
| Prototype | Evidence answering the fixed question, evaluator observation, and limitations |

Capability limitations do not silently lower a declared gate. Generic release-gate defaults do not overwrite Atlas allocation.

## Model Routing

Use the `normal` tier for Coding Workers, task-scope Focused Validators, convergence-scope Focused Validators, targeted checks, and basic review/repair loops. Use the `smart` tier for an admitted intermediate higher-order checkpoint or other involved cross-cutting review. Use `deep` for an admitted final whole-deliverable checkpoint; outside that final position, reserve it for exceptional ambiguous and consequential architecture, diagnosis, or reconciliation. A targeted review remains at the tier declared by its owning Contract and otherwise uses `normal`. Review timing or the word “final” alone does not justify escalation: the Contract must assign the higher-order checkpoint. A stronger model does not gain authority to redesign, expand scope, alter accepted proof allocation, or convert advisory findings into blockers.

## Atlas Gate Preservation

Treat every imported gate as an accepted graph node, not as a final checklist category. Preserve its owner, prerequisites, ordering, evaluator/independence, environment, effects, observations, cleanup, pass claim, invalidators, evidence qualification, and downstream blockers.

Software Implementation may add operational commands, concrete environments, Effect Bindings, and evidence locators needed to execute the accepted gate. It must not:

- remove, weaken, replace, reorder, or OR-combine required proof;
- universally add architecture, code-quality, design-fidelity, security, or E2E gates omitted by the accepted allocation;
- turn writer proof into independent proof or fake-provider proof into bounded-live proof;
- move an early or inter-Work-Item security/live gate to the end; or
- treat an additional repository check as a new Atlas acceptance requirement.

If execution discovers a risk that makes the accepted allocation materially insufficient, stop with evidence for Route/Blueprint authority rather than silently inflating the plan. Additional commands that merely establish the same admitted claim are operational detail.

## Whole-Deliverable Review

Run only the specializations and timing admitted by the Delivery Contract. Basic specialist passes inside review and repair loops use `normal`. When an intermediate whole-deliverable suite is admitted, launch each applicable independent architecture, security, code-quality, performance, and design-fidelity reviewer at `smart` against the same integrated state, accepted design, and current evidence. When the Contract assigns the terminal whole-deliverable suite as the final higher-order checkpoint, use `deep`. Omit any specialization not admitted by the Contract. When only a targeted security or other review is admitted, run only that exact review at its accepted graph position and apply the Model Routing rule above.

Classify each finding:

1. **design-compatible defect** — create a bounded repair task automatically;
2. **inherent design flaw** — block and return concrete contradiction evidence to design authority;
3. **advisory improvement** — record as non-blocking.

Reviewer severity and consensus are advisory. Alternatives, preference, and broader opportunity do not become blockers by repetition.

Production-code repair renews proof exactly as required by the admitted allocation and evidence invalidators. For an admitted late full review suite, repair invalidates every verdict in that suite; after focused/convergence repair gates pass, rerun the complete applicable suite over one new whole-deliverable state.

## Contextual, Bounded-Live, And Final E2E

Run each accepted E2E/live proof at its graph position. Fix its operational Contract before performing effects:

```markdown
Atlas proof binding: <accepted gate identity/owner/prerequisites/downstream blocker, or not applicable>
Scenario/environment: <exact flow and target>
Effect Binding: <setup/run/cleanup authority>
Evaluator/independence: <accepted requirement and actual capability>
Observations/evidence: <what will be captured>
Cleanup: <owner, steps, terminal state>
Pass condition/claim: <functional behavior plus cleanup success>
Expense/risk limits: <ceilings>
Evidence retention/invalidators: <locators, qualification and disposition>
```

An inter-Work-Item bounded-live proof runs after its accepted upstream item and before its accepted downstream item; it is not postponed until final review. Final E2E runs only after its accepted prerequisites, which may or may not include a full review suite.

- Functional failure returns diagnostic evidence for design-compatible repair.
- Production-code repair renews affected focused/convergence/review/E2E evidence according to the imported invalidators and accepted allocation; an admitted late full review suite is rerun completely before another final E2E.
- Test/environment-only correction resets only evidence it invalidates unless the trust boundary changed.
- Cleanup failure returns `unresolved_effects` with resource/evidence locators. It blocks dependent work, retry, and PR progression until cleanup succeeds or the original effect authority gives an explicit terminal disposition within its ceiling.

## PR Gate

PR preparation begins only after every gate due before PR under the admitted graph has current passing evidence and external effects have an accepted terminal disposition. PR delivery is the default for an explicit implementation request. A draft-PR operation uses the exact derived operation binding from the active Execution Authorization Envelope; it does not require a second human confirmation. Do not ask for redundant permission for its authorized non-force push or matching draft-PR operation. Push only the bound non-protected head with a non-force update, then look up the same provider/account/repository/head/base and return a matching open PR if one exists before creating another. In stacked mode, each Feature PR uses its declared predecessor/base and lower layers are created first.

Draft PR creation does not merge, mutate a protected branch, authorize landing, deploy, configure production, grant credentials, or authorize external/live effects. It also does not authorize ready conversion. If PR delivery was explicitly excluded, the binding is ambiguous or unverifiable, or push/creation fails, return the prepared reader-oriented summary and verified delivery or integration branch.
