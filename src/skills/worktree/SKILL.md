---
name: worktree
description: Discover Git repository topology and manage explicit persistent worktrees safely. Use when allocating, bootstrapping, inspecting, or retiring worktrees.
user-invocable: false
---

# Persistent Worktree Lifecycle

Support ordinary repositories, bare repositories with sibling worktrees, and linked-worktree checkouts. Discover the actual topology before choosing paths; do not assume every project uses one directory layout.

## Discover Topology

From an existing checkout, inspect:

```bash
git rev-parse --show-toplevel
git rev-parse --git-common-dir
git rev-parse --is-bare-repository
git worktree list --porcelain
git status --short --branch
```

Resolve relative `--git-common-dir` output against the current checkout. `git worktree list --porcelain` is authoritative for registered paths, branches, and detached checkouts. Identify the named integration base from the Delivery/Task Contract; never substitute a guessed `main`, `dev`, or current branch.

Before reuse, inspect cleanliness, branch identity, ownership, and known writer activity. Unknown prior writer activity is unsafe: confirm cessation/cancellation or quarantine that worktree and allocate a fresh one from the last safe integrated baseline.

## Allocate Explicit Persistent Worktrees

Use an absolute, stable path outside temporary harness-managed patch worktrees:

```bash
git worktree add -b <task-branch> <absolute-worktree-path> <named-baseline>
# or, for an already-created branch
git worktree add <absolute-worktree-path> <existing-branch>
```

Run this from any valid checkout or the common Git directory as topology permits. For coordinated work:

- one writer owns one worktree and branch at a time;
- every task worktree starts at its current integrated prerequisite baseline;
- dependent worktrees are created or refreshed only after prerequisites integrate;
- keep a separate integration worktree when waves must converge;
- validators use a dedicated verification checkout when certification requires candidate-state isolation; and
- pass the same explicit cwd to the harness child for every launch or replacement.

A future portable Workspace Operator CLI may automate these operations. Until it exists, these commands and checks realize the seam; do not invent runtime state, leases, or a different source-authority model.

## Bootstrap

Inspect repository instructions and project manifests before installing anything. Run only the project's documented local bootstrap steps. Keep worktree-local dependencies and generated files within that checkout when possible. Namespace containers/services by worktree and respect any declared single-stack or port constraints.

Report the worktree path, branch, named baseline, topology, bootstrap commands/results, and effective validator enforcement tier when allocating a verification checkout.

## Retire Safely

1. Confirm the writer has stopped and inspect worktree cleanliness.
2. Verify integration/retention disposition; do not discard unintegrated work.
3. Stop worktree-owned local services.
4. Move the controlling shell outside the worktree.
5. Remove and prune:

   ```bash
   git worktree remove <absolute-worktree-path>
   git worktree prune
   ```

6. Delete a local branch only after its disposition is proven. Remote deletion, force removal, and destructive cleanup require explicit authority.

## Invariants

- Never edit product files as part of administrative worktree operation.
- Never assign two writers to one worktree.
- Never use a temporary harness worktree where the Contract requires a persistent explicit cwd.
- Never infer a safe baseline, merge, cleanup, or remote mutation from path conventions.
