# Reporting and Finalization

## Report ownership

The detailed implementation report belongs in the canonical docs repository as an archived historical artifact, not in the code feature branch and not among canonical current-reference specifications.

Recommended archive shape:

```text
<docs-repo>/reports/archive/<feature>/<date>/
  report.html
  manifest.json

  inputs/
    initial/
      spec.md
      ticket-graph.json
      tickets/
    final/
      spec.md
      ticket-graph.json
      tickets/

  outcomes/
    ticket-results.json
    verification.json
    integration.json
    drift.md
    pr-links.json

  assets/
    diagrams/
    screenshots/
    evidence/
```

Follow project-specific archive conventions when they exist.

## Historical labeling

Every copied spec/ticket must say it is an immutable historical snapshot and name its canonical source. Agents must not treat archive copies as current requirements.

`manifest.json` should include:

- schema/report version
- feature/keystone identifier
- report mode and date
- code repository, target branch, and integration SHA
- docs repository and report commit/PR
- canonical source paths/URLs and source revisions
- initial/final snapshot timestamps
- code PR and included tickets
- sanitization performed

## Why preserve initial and final inputs

The archive should support later analysis of decomposition quality:

- vague or untestable acceptance criteria
- missing dependencies
- ticket shapes that overrun
- integration redesign frequency
- review/fix churn
- environmental acceptance gaps
- initial versus final scope movement
- which spec/ticket patterns produce reliable delivery

Preserve structured outcomes and provenance, not only prose screenshots.

## Report generation timing

1. Integrate all required tickets.
2. Run feature-level verification and deep review.
3. Invoke `implementation-report` in Showcase/archive mode against the exact integration SHA.
4. Create an isolated docs worktree/branch.
5. Build and validate the archive bundle.
6. Open the docs PR.
7. Open/update the code feature PR with the docs PR link.
8. Record the provenance tuple `(code PR head SHA, docs PR head SHA, archive manifest digest)` in both PRs.
9. If either PR or manifest changes, invalidate `PR READY`, update both cross-links/tuple, and revalidate.

## PR Ready gate

A feature reaches `PR READY` when:

- all required tickets are integrated
- feature verification and required manual E2E pass or approved gaps are explicit
- deep review broadly passes
- spec drift sanity check is complete
- code PR head matches the verified/reported integration SHA
- code PR checks for that head pass
- docs archive PR exists and is current
- code/docs PRs contain the same current provenance tuple
- code PR body links the archive and summarizes drift/verification

At `PR READY`:

- transition integrated tickets to `DONE` and close non-keystone tickets
- add tracker comments with code PR, integration SHA, evidence summary, and docs PR
- mark keystone child entries complete
- keep the keystone open

If later changes invalidate a ticket’s acceptance criteria, the code PR is closed/abandoned/superseded, or its recorded integration commit is no longer represented by the active PR/target, reopen every affected ticket and reconcile the keystone. Use a new ticket only for distinct work.

If the run is cancelled, preserve state/report artifacts, mark it `CANCELLED`, reconcile/reopen trackers, and clean or retain branches/worktrees according to explicit repository policy.

## Merge mode

When explicitly requested:

- continue beyond `PR READY`
- confirm current code/docs PR heads and checks
- merge according to branch policy
- verify target ancestry/result
- finalize or merge docs archive according to docs policy
- close keystone only after landing criteria are true
- record final code/docs SHAs
- clean worktrees/branches safely

Do not ask again for routine commit/push/PR/merge authorization when the user’s invocation already granted end-to-end merge authority.
