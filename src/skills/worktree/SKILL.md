---
name: worktree
description: Worktree lifecycle management — setup, bootstrap, and teardown. Use when creating new worktrees for feature development, finishing features and cleaning up worktrees, or when worktree operations are relevant.
user-invocable: false
---

# Worktree Lifecycle Management

All projects use bare git repositories with worktrees for development. This skill covers the full lifecycle: creating, bootstrapping, and tearing down worktrees.

## Standard Project Layout

```
project/
  HEAD, config, refs/, objects/   # bare git data (no working files)
  _plans/                         # shared planning docs (untracked, cross-branch)
  main/                           # worktree: trunk branch
  dev/                            # worktree: development branch (if used)
  feature-xyz/                    # worktree: feature branch
```

## Setup — Creating a New Worktree

1. **Find the bare repo root**: Walk up from cwd. The bare repo root is the directory where `git rev-parse --is-bare-repository` returns true, or the parent of a worktree directory.

2. **Create the worktree**:
   ```bash
   cd <bare-repo-root>
   git worktree add <name> -b <branch>        # new branch
   git worktree add <name> <existing-branch>   # existing branch
   ```

3. **Bootstrap the worktree**:
   - Detect the project type (look for package.json, pubspec.yaml, Cargo.toml, requirements.txt, etc.)
   - Install dependencies for the detected project type
   - Run environment config generation scripts if they exist (look in `scripts/` for `generate-*` patterns)
   - Note infrastructure namespacing: container orchestration tools should use the worktree name as the project/namespace to avoid conflicts with other worktrees

4. **Ensure `_plans/` exists** at the bare repo root:
   ```bash
   mkdir -p <bare-repo-root>/_plans
   ```

5. **Report**: Worktree path, branch name, what was bootstrapped, next steps (infrastructure to start, etc.)

## Teardown — Finishing a Feature

1. **Verify the branch is merged**: Check if the feature branch has been merged into the target branch. If not, confirm with the user before proceeding.

2. **Stop infrastructure**: If any containers or services are running for this worktree, stop them.

3. **Navigate away**: You can't remove a worktree you're currently inside. Switch to a different worktree first.

4. **Remove the worktree**:
   ```bash
   cd <bare-repo-root>
   git worktree remove <name>
   ```

5. **Clean up the branch** (if merged):
   ```bash
   git branch -d <branch>                    # delete local branch
   git push origin --delete <branch>         # delete remote branch (confirm with user first)
   ```

6. **Prune stale references**:
   ```bash
   git worktree prune
   ```

7. **Clean up planning docs**: If there are plans in `_plans/` related to the completed feature, note them to the user — they may want to archive or delete them since the work is now in the code.

## Useful Commands

| Command | Purpose |
|---|---|
| `git worktree list` | Show all active worktrees |
| `git worktree add <path> <branch>` | Create a worktree for an existing branch |
| `git worktree add <path> -b <branch>` | Create a worktree with a new branch |
| `git worktree remove <path>` | Remove a worktree |
| `git worktree prune` | Clean up stale worktree references |

## Key Rules

- **Never work in the bare repo root** — it has no working files
- **Each worktree is fully independent** — own dependencies, own infrastructure, own environment
- **Infrastructure namespacing** — use the worktree name to namespace containers and avoid port/name conflicts
- **One infrastructure stack at a time** unless ports are explicitly configured per-worktree
- **Planning docs go in `_plans/`** at the bare repo root — shared across all worktrees, not version controlled
