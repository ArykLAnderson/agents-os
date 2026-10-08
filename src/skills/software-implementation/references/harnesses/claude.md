# Claude Code Harness Adapter Reference

## Binding

Use the native `Agent` tool for launch. Select an installed generated profile through `subagent_type` only after it appears in the session's available agent types; otherwise launch `general-purpose` and bind the portable role and complete Contract inline in the prompt. A call-level `model` (`haiku`, `sonnet`, `opus`) overrides the profile model when the Task Contract needs a different capability tier.

The `Agent` tool has no working-directory parameter, so every child inherits the parent session's directory. State the explicit persistent worktree path in every assignment and require absolute paths or `git -C <worktree>` for every file and shell operation. Treat a child result that touches paths outside its assigned worktree as a scope violation.

Do not use `isolation: "worktree"` for delivery work. It creates a temporary worktree that is cleaned up automatically, which is the patch-return pattern the portable contract excludes. Workspace Operator creates or binds ordinary persistent Git worktrees first.

## Profiles And Tools

Generated profiles in `~/.claude/agents` carry `tools`, `disallowedTools`, `model`, and `permissionMode`. Treat them as policy carriers, not semantic authority.

A validator profile that disallows `Write`, `Edit`, and `NotebookEdit` but allows `Bash` is `tool_restricted_shell_mutable`. Claude Code's command sandbox is configured per session, not per child, so do not claim `filesystem_enforced` for a child. Use a dedicated verification checkout and inspect candidate state after the run.

## Results And Parallelism

Multiple `Agent` calls in one message run concurrently and return one correlated result each. Use `run_in_background` for long assignments; the harness notifies the parent on completion, so do not poll. Record each child's returned agent ID against its Task Contract.

A noninteractive `claude -p --output-format json` process started inside the target worktree is an allowable adapter-owned fallback only after its correlation and concurrency are proven.

## Continuity

`SendMessage` to a recorded agent ID continues that child with its context intact. Cancellation is `supported` only when a stop tool for background tasks is surfaced in the session; otherwise report it as `unsupported`. When child state is uncertain, Workspace Operator establishes exclusive safe state and a fresh child receives the role Contract, Task Contract, compact prior evidence, and explicit worktree path.
