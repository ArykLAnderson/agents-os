# Workspace Layout

The document system uses a configurable local work root selected by the author, project, or invoking environment. Prefer an existing project-local private artifact root when one is declared. Otherwise default to `<project-root>/.documents/`, following the same local-WIP convention as other hidden project artifact directories.

Document-system working files are private and uncommitted by default. Before creating the root:

1. Determine whether the selected path is inside a Git worktree.
2. If it is, check whether the planned root is ignored by Git.
3. If the root is ignored, create or reuse it without further location approval.
4. If the root is Git-visible, warn the author before writing and offer two explicit choices: add the root to the repository's ignore rules, or use another local/private path outside the committable tree.
5. Do not silently modify ignore rules, stage artifacts, or treat a hidden directory name as proof that Git ignores it.

Only create document artifacts in a tracked or otherwise committable path when the author explicitly chooses that location for material intended to be shared. Committing, publishing, or moving private working artifacts into tracked documentation is a separate action requiring explicit author intent.

## Case Layout

Each Case uses this logical storage contract:

```text
<work-root>/<case-slug>/
  CASE.md
  sources/
    bundles/
  queue/author-review.md
  snapshots/
  artifacts/<artifact-slug>/
    artifact.md
    artifact.trace.md
    artifact.notion.md
    artifact.html
    assets/
    reviews/
    publish/
```

Later skills may add source bundle files, accepted Case snapshots, generated artifacts, trace updates, review reports, and publish records inside this shape without inventing new paths.

Record the resolved work root in the Case handoff. Verify required local files and links using the host environment's ordinary filesystem capabilities; this resource does not require a particular initializer, parser, or validator.

This private-by-default rule covers the complete Case tree: supplied source copies, author responses and approvals, snapshots, composition manifests, drafts, traces, reviews, reader simulations, presentation evidence, screenshots, generated images and prompt records, publication plans, and readiness evidence.
