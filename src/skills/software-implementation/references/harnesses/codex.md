# Codex Harness Adapter Reference

## Binding

Prefer Codex native collaboration for child launch, explicit parallel fanout, wait, inspection, and cancellation when surfaced. Bind the portable role and complete Contract inline; do not depend on discovery of generated named agents.

Every assignment uses an explicit persistent cwd. For a noninteractive isolated invocation, `codex exec -C <worktree> ...` may supply JSON/schema or last-message result artifacts. This is adapter syntax, not coordinator state.

## Validation

For a top-level isolated validator, request Codex's strongest available read-only sandbox (for example `--sandbox read-only`) while retaining shell/project-command capability. Report `filesystem_enforced` only when enforcement applies to the actual validator process and checkout. If child sandbox inheritance is unproven, report the weaker observed tier and use a dedicated verification checkout plus post-run source-state inspection.

## Results And Parallelism

Preserve native child IDs and correlate each result to its Task Contract. If required native parallelism is unavailable, fail explicitly or use a proven adapter-owned bounded concurrent noninteractive mechanism; never silently serialize when parallel execution is a Delivery Contract requirement.

## Continuity

CLI/session resume is optional. A fresh child with explicit cwd, role/Task Contract, and compact prior evidence is always valid after Workspace Operator establishes exclusive safe state.