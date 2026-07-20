# OpenCode Harness Adapter Reference

## Binding

Use OpenCode native task/child-session operations for launch, status, continuation, abort, and parallel fanout only to the extent actually proven by the installed version. Bind the portable role and complete Contract inline when generated agent profiles are not installed and discoverable.

Pass the explicit persistent directory on every assignment. Adapter-owned bounded concurrent `opencode run --dir <worktree> --format json ...` processes are an allowable fallback only after their correlation and concurrency are proven; they are not a portable coordination helper.

## Profiles And Tools

Installed generated profiles may express Bash-enabled, edit/write-disabled roles. Treat them as policy carriers, not semantic authority. Runtime discovery must be verified before relying on a named profile.

A Bash-capable validator is generally not filesystem-enforced read-only. Report `tool_restricted_shell_mutable` when edit/write tools are excluded but shell can mutate, or `instruction_only` when narrower tool policy is not effective. Use a dedicated verification checkout and Workspace Operator post-run inspection.

## Provider Preparation

Prepare the selected model/provider explicitly under any required Effect Binding. Do not fall back to stale configured models, ambient credentials, or a substitute provider. Capability discovery alone grants no call authority.

## Continuity

Child continuation is optional. When status/cancellation is unsupported or uncertain, quarantine the old worktree after the required safety checks and launch a fresh role with compact handoff in a new persistent worktree.