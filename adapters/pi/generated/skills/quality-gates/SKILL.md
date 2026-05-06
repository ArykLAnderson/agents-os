---
name: quality-gates
description: Code quality standards inspired by Uncle Bob Martin — CRAP scores, cyclomatic complexity, coverage targets, and mutation testing awareness. Loaded when evaluating code quality after implementation or during review.
user-invocable: false
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Quality Gates: Code Quality Standards

Quality standards adapted from Uncle Bob Martin's agentic discipline workflow. Apply Clean Code principles — the model knows them. This skill defines the thresholds and evaluation approach.

## Thresholds

| Metric | Target | Rationale |
|--------|--------|-----------|
| **CRAP score** | < 8 per function | Forces functions to be either simple OR thoroughly tested. No middle ground. |
| **Test coverage** | > 90% | Untested code is a liability, especially AI-generated code. |
| **Cyclomatic complexity** | < 10 per function | More paths = more tests needed = harder to reason about. |
| **Function size** | Small (guideline) | Long functions do too much. Split them. |
| **File complexity** | Split at > 50 test targets | If a file needs 50+ test assertions, it's doing too much. |

## The CRAP Formula

```
CRAP(fn) = CC² × (1 - coverage)³ + CC
```

CC = cyclomatic complexity, coverage = fraction of code exercised by tests.

At CRAP < 8: you cannot have both high complexity AND low coverage.

## Project-Specific Tooling

The specific tools and commands for running quality checks vary by project. **Read `.agents-os/src/docs/quality-gates.md` if it exists** for project-specific configuration:
- Which tools to run (coverage reporters, complexity analyzers, mutation testing)
- Which commands to execute
- Any project-specific thresholds that override the defaults above
- Directories or modules to include/exclude

If no project-local config exists, evaluate quality through code review against the thresholds above — review functions for complexity, check that tests cover branching paths, and flag functions that are both complex and undertested.

## What to Report

1. **Functions of concern** — high complexity, low/no test coverage
2. **Coverage gaps** — modules or functions lacking tests
3. **Split candidates** — files or functions that are too large
4. **Clean Code violations** — naming, duplication, functions doing too much, unnecessary complexity
5. **Specific recommendations** — what to refactor or test next

Do not block work for marginal issues. Flag them and let the user prioritize.
