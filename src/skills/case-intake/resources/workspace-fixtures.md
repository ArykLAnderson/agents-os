# Workspace Layout

The document system uses a configurable local work root selected by the author, project, or invoking environment. Prefer an existing project-local artifact root when one is declared. Otherwise ask for or choose a clearly disclosed local root; never hard-code a personal path.

## Case Layout

Each Case uses this logical storage contract:

```text
<work-root>/document-system/cases/<case-slug>/
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
