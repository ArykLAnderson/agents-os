# Pi Harness Adapter Reference

## Binding

Load `pi-workflow-orchestration` before dispatch. Use Pi's workflow runtime for bounded parallel launch, explicit result flow, model routing, checkpoints, and named persistent worktrees.

Do not depend on installed role files. Define each writer, reviewer, or validator responsibility in its task contract and independently select call-level `model`, `thinking`, and `tools`.

Do not use temporary patch-return worktrees as delivery worktrees. Workspace Operator creates or binds ordinary persistent Git worktrees first; workflow assignments use canonical `withWorktree(name, callback)` scopes and retain returned paths.

## Execution policy

- Ordinary implementation uses the `execution` model alias.
- Independent validation normally uses `review` with read and Bash/project-command capability.
- Architecture-level planning or reconciliation uses `planning` only when the task actually needs it.
- Research collection uses `research`; synthesis is a separate owner using `aggregation` when needed.
- Writers own fixes. Reviewers and validators return findings and never repair or finalize their candidate.

## Validation

A validator receives the accepted Contract, candidate worktree, writer evidence, and exact public proof commands. It excludes direct edit/write tools. Because Bash can mutate, this is `tool_restricted_shell_mutable`, not filesystem enforcement. Coordinated certification uses a dedicated verification checkout and inspects candidate state afterward. A same-worktree read-only review is advisory only.

Claim `filesystem_enforced` only when an actual filesystem boundary was prepared and observed.

## Continuity

Use the workflow run ID and named worktree scope for continuity. Resume only through the runtime's supported resume/retry operations and their exact source run IDs. A new launch with `parentRunId` may reuse matching named worktrees but never replays or resumes the old run.

If worker state is uncertain, stop or quarantine it and launch a fresh task-defined agent with a compact handoff. Never infer worktree restoration from session continuity.
