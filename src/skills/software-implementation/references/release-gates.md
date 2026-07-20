# Release Gates

## Proof Profiles

Choose before dispatch:

| Profile | Required proof |
|---|---|
| Direct/ad hoc task | Worker checks and task-scope Focused Validator |
| Bounded coordinated change | Task gates and convergence gate; risk/release intent decides whole-deliverable review |
| Prototype | Evidence answering the fixed question, evaluator observation, and limitations |
| Blueprint/Route feature | Task and convergence gates, full review suite, final E2E, authorized PR preparation |

Capability limitations do not silently lower a declared gate.

## Whole-Deliverable Review

After convergence passes, launch independent architecture, security, code-quality, and design-fidelity reviewers against the same integrated state, accepted design, and current evidence. Reviewers are read-only and return observed evidence plus explicit design compatibility.

Classify each finding:

1. **design-compatible defect** — create a bounded repair task automatically;
2. **inherent design flaw** — block and return concrete contradiction evidence to design authority;
3. **advisory improvement** — record as non-blocking.

Reviewer severity and consensus are advisory. Alternatives, preference, and broader opportunity do not become blockers by repetition.

Any production-code repair invalidates every verdict in the suite. After focused and convergence repair gates pass, rerun the entire suite over one new whole-deliverable state.

## Final E2E

Fix the Final E2E Contract before implementation:

```markdown
Scenario/environment: <exact flow and target>
Effect Binding: <setup/run/cleanup authority>
Observations/evidence: <what will be captured>
Cleanup: <owner, steps, terminal state>
Pass condition: <functional behavior plus cleanup success>
Expense/risk limits: <ceilings>
Evidence retention: <locators/disposition>
```

Run E2E only after the complete review suite passes. The operator performs only declared effects.

- Functional failure returns diagnostic evidence for design-compatible repair.
- A production-code repair after E2E resets task-focused verification as affected, convergence, and the entire review suite before another E2E attempt.
- Test/environment-only correction resets review only when it changes a trust boundary or invalidates what the prior test proved.
- Cleanup failure returns `unresolved_effects` with resource/evidence locators. It blocks retry and PR progression until cleanup succeeds or the original effect authority gives an explicit terminal disposition without broadening the ceiling.

## PR Gate

PR preparation begins only after every declared gate has current passing evidence and external effects have an accepted terminal disposition. A PR operation requires its own Effect Binding. It looks up the same provider/account/repository/head/base before creation and returns a matching open PR if one exists.

PR creation does not merge or authorize landing. If authority is absent or creation fails, return the prepared reader-oriented summary and verified integration branch.