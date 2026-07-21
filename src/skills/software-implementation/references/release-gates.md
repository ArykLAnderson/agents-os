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

Run only the specializations and timing admitted by the Delivery Contract. When a full suite is admitted, launch independent architecture, security, code-quality, and design-fidelity reviewers against the same integrated state, accepted design, and current evidence. When only a targeted security or other review is admitted, run only that exact review at its accepted graph position.

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

PR preparation begins only after every gate due before PR under the admitted graph has current passing evidence and external effects have an accepted terminal disposition. A PR operation requires its own Effect Binding. It looks up the same provider/account/repository/head/base before creation and returns a matching open PR if one exists.

PR creation does not merge or authorize landing. If authority is absent or creation fails, return the prepared reader-oriented summary and verified integration branch.