# Pi Harness Adapter Reference

## Binding

Use Pi's installed child/subagent facility from the parent coordinator for single or bounded parallel launch, correlated await/results, status, continuation, and cancellation where supported. Pass the portable role prompt, complete Contract, and explicit persistent `cwd` on every assignment.

Do not use temporary patch-return `worktree:true` as the delivery worktree. Workspace Operator creates ordinary persistent Git worktrees first; assignments bind those paths.

## Roles

Generated custom agents may preload the public Coding Worker or Focused Validator skill and can carry narrow tool policy. They are policy/discovery optimizations, not the semantic source. An inline portable role binding is valid when a named profile is unavailable.

The parent is the coordinator. Ordinary child roles never launch or coordinate other workers.

## Validation

A useful validator needs file inspection and Bash/project-command capability while excluding direct edit/write tools where Pi policy allows. Because Bash can mutate, tool restriction alone is `tool_restricted_shell_mutable`, not filesystem enforcement. Use a dedicated verification checkout, repeat the no-mutation instruction, and ask Workspace Operator to inspect candidate state afterward.

Claim `filesystem_enforced` only when an actual filesystem boundary was prepared and observed.

## Continuity

Resume the original child when status and exclusive worktree ownership are safe. Otherwise cancel/confirm cessation or quarantine uncertain state, then launch a fresh child with compact handoff. Never infer worktree restoration from session revival.