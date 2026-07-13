# Stacked PR Mode

Use stacked PR mode when a feature is too large for one practical review or when repository norms require multiple engineers to review manageable diffs.

## Branch Shape

```text
target branch
  └─ stack PR 1 branch
       └─ stack PR 2 branch
            └─ stack PR 3 branch

feature integration branch = combined acceptance branch containing the complete stack
```

Each stack branch starts from an approved ticket branch or a tightly coupled group of approved ticket branches. Preserve dependency order and keep each PR reviewable.

## Process

1. Decide stack boundaries from ticket dependencies, reviewer ownership, and diff size.
2. Create the first stack branch from the target branch plus the approved ticket branch commit range for PR 1.
3. Create each downstream stack branch from the previous stack branch plus the approved ticket branch commit range for that PR.
4. Prefer merge commits for stack assembly unless repository policy requires rebasing or squashing. Merge commits preserve review/debug history and avoid repeated rebase churn in long-lived stacks.
5. Keep the feature integration branch as the combined acceptance branch. It may match the stack tip or be rebuilt from the approved stack branches, but it must not replace the stack PRs as the human review surface.
6. Run per-PR verification for each stack PR and feature-level verification against the complete integration branch.
7. Create one scoped implementation report per stack PR and one feature-level rollup report.

## Non-Collapse Rule

Do not close, merge, or supersede child PRs just because the feature integration branch exists. The stack PRs are the review artifacts; the integration branch is the whole-feature acceptance artifact.

## Downstream Fixes

When a fix changes an earlier PR in the stack, downstream PR branches must be updated so they include the new upstream history. The detailed downstream-update procedure is intentionally left to a future stack-maintenance skill. Until then, record what changed, update affected downstream branches conservatively, rerun affected validation, and refresh impacted reports.

## PR Ready Gate

Stacked PR mode reaches `PR READY` when:

- every required stack PR is open and current;
- downstream PRs include upstream fixes;
- the feature integration branch contains the complete intended stack;
- each per-PR implementation report is current for its PR head SHA;
- the feature-level rollup report is current for the integration SHA;
- required checks/reviews apply to current PR heads;
- acceptance, E2E/manual, drift, and risk evidence are current.

## Merge Mode

When merge authority is granted, merge stack PRs in order according to repository policy. After each merge, verify that downstream branches still contain the intended upstream history before merging the next PR. Finalize the feature only after the target branch contains the full approved stack.
