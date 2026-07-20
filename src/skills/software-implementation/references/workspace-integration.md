# Workspace And Integration

## Workspace Operator

The Workspace Operator performs repository administration, not product implementation.

### Operations

- discover repository topology, project instructions, named integration base, and cleanliness;
- allocate an integration worktree and one explicit persistent writer worktree/branch per ready task from its current integrated prerequisite baseline;
- bootstrap required dependencies without modifying product source, or report any unavoidable source mutation;
- verify that coordinated writer branches support the granted commit-and-integration handoff;
- create dedicated/disposable validator checkouts and report `filesystem_enforced | tool_restricted_shell_mutable | instruction_only`;
- report worktree/branch paths and setup evidence;
- inspect whether an existing worktree is safe to reuse;
- after validation, inspect candidate/verification state and invalidate a verdict if unexplained product-source mutation occurred; and
- remove worktrees/branches only after integration or retention disposition and cleanliness checks.

Unknown prior writer activity makes reuse unsafe. Obtain confirmed cessation/cancellation, or quarantine the old worktree and create a fresh one from the last safe integrated/committed baseline. Never assign two writers to one worktree.

Candidate B may later implement this exact port as a portable Node worktree CLI. That CLI is a substitution seam only: it must not change coordinator, worker, validator, or map semantics. It is not part of this package.

## Integration Worker

The Integration Worker is the sole writer in the integration worktree for one validated wave.

### Input

- validated task branches/worktrees and dependency order;
- named starting integration baseline;
- accepted cross-module behavior;
- Convergence Contract commands and observations; and
- bounded seam-repair permission.

### Work

Combine validated branches, resolve mechanical conflicts, and repair integration seams only within accepted behavior. Run the convergence commands as writer evidence. Apply the Coding Worker discipline to behavioral seam repair: public behavior, deep boundary, focused tests, normal checks.

A conflict requiring new product meaning, architecture, effects, or changed dependency Contracts is a material contradiction, not merge discretion.

### Output

Report included branches, integrated behavior, conflicts and repairs, commands/results, assumptions, and the integration branch/worktree ready for independent convergence validation.

The Integration Worker does not select tasks, independently validate its own result, change accepted design, open the final PR, or land an authoritative branch.