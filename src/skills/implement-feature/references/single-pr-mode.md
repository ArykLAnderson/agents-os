# Single PR Mode

Use single PR mode for prototypes, small features, or repositories where one combined review is acceptable.

## Branch Shape

```text
target branch
  └─ feature integration branch
       └─ one feature PR
```

The feature integration branch is both the acceptance branch and the review branch.

## Process

1. Integrate approved ticket commit ranges into the feature integration branch in dependency order.
2. Run the feature verification plan against the exact feature integration SHA.
3. Create one feature-level implementation report.
4. Open one code PR from the feature integration branch to the target branch.
5. Keep the code PR body, report, and evidence tied to the current PR head SHA.

## PR Ready Gate

Single PR mode reaches `PR READY` when:

- the feature integration branch contains every included ticket;
- the code PR is open and current;
- required checks/reviews apply to the current PR head SHA;
- the feature-level implementation report is current;
- acceptance, E2E/manual, drift, and risk evidence are current for the same SHA.

## Merge Mode

When merge authority is granted, merge according to repository policy. Verify that the target branch contains the approved feature head or merge result before closing the feature.
