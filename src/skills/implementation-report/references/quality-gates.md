# Quality Gates

Do not claim the report is complete until these gates are checked.

## Scope and revision

- [ ] Exact implementation commit is displayed.
- [ ] Issue/PR/branch references are accurate.
- [ ] Canonical requirements and ADRs were used.
- [ ] The report destination follows project instructions.
- [ ] Deferred work is named and visibly separate.

## Evidence

- [ ] Every decision-relevant claim has a status.
- [ ] Verified claims point to inspected evidence.
- [ ] Manual observations name platform/device/runtime.
- [ ] Reused evidence is not described as freshly run.
- [ ] Compile, automated pass, and manual observation are distinct.
- [ ] Platform gaps remain explicit.
- [ ] Evidence artifacts are sanitized.
- [ ] CI links match the implementation revision.
- [ ] Negative evidence includes the relevant failure and next action.

## Narrative

- [ ] The opening explains user value and strongest limitation.
- [ ] User-visible behavior appears before package/module detail.
- [ ] Canonical terms are introduced before deep internals.
- [ ] The scope boundary cannot be mistaken for completion of later slices.
- [ ] Technical detail explains why a design decision matters.
- [ ] The conclusion identifies a useful next decision.

## Diagrams

- [ ] Each diagram answers a named reader question.
- [ ] Rendering used Pi’s native `imagegen` tool.
- [ ] No model CLI wrapper was used.
- [ ] Every node and relationship was checked against evidence.
- [ ] Shipped, future, and blocked states are visually distinct.
- [ ] Labels remain legible at report size.
- [ ] Every diagram has alt text, caption, and text equivalent.
- [ ] Diagram files parse in their declared format.

## HTML and assets

- [ ] HTML opens directly from disk.
- [ ] CSS is embedded.
- [ ] Local references resolve.
- [ ] Images have non-empty alt text.
- [ ] IDs are unique.
- [ ] Heading levels do not skip unexpectedly.
- [ ] JSON evidence parses.
- [ ] No secrets, private identifiers, or unsafe absolute paths remain.
- [ ] File sizes are reasonable.

## Browser review

- [ ] Desktop reviewed around 1440×1000.
- [ ] Mobile reviewed around 390×844.
- [ ] No console or page errors.
- [ ] No broken images.
- [ ] No page-level horizontal overflow.
- [ ] Wide tables and code scroll inside their own containers.
- [ ] Navigation works with keyboard and touch.
- [ ] The mobile opening reaches the report title promptly.
- [ ] Diagrams and screenshots are readable at rendered size.

## Accessibility and print

- [ ] Text contrast meets WCAG AA for its size.
- [ ] Status is not communicated by color alone.
- [ ] Links are visibly identifiable and keyboard-focusable.
- [ ] Reduced-motion preference is respected if motion exists.
- [ ] Print/PDF layout does not cut essential figures or tables unexpectedly.
- [ ] Text equivalents preserve diagram meaning.

## Feature archive

- [ ] Archive is in the canonical docs repository, not the code feature branch.
- [ ] Initial and final specs, ticket graph, and ticket snapshots are preserved.
- [ ] Snapshots are labeled historical/non-canonical and include source provenance.
- [ ] Structured ticket outcomes, verification, integration, drift, and PR links are included.
- [ ] Manifest integration SHA matches the code PR head covered by the report.
- [ ] Code PR links the current docs archive PR.

## Publication

- [ ] Publication was explicitly authorized or delegated by an authorized implementation workflow.
- [ ] Only report-related files are staged.
- [ ] Final validation ran after staging.
- [ ] Commit/PR follows repository conventions.
- [ ] PR description names evidence and known gaps.
