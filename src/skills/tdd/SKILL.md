---
name: tdd
description: Red-green-refactor TDD methodology adapted for AI agents. Loaded when implementing features against specs or writing tested code. Provides the disciplined implementation workflow.
user-invocable: false
---

# TDD: Test-Driven Development for AI Agents

This skill encodes the red-green-refactor discipline adapted for AI-assisted development. Traditional micro-step TDD (one tiny test at a time) is inefficient for AI agents — the principles stay, but the step size adapts.

## The Cycle

### RED — Write a failing test
- Pick the next unimplemented spec test (look for `// TODO: implement` markers)
- Write the test assertion that expresses the expected behavior
- Run the test. **It must fail.** If it passes without new code, the test is trivial or wrong.

### GREEN — Make it pass
- Write the **minimum production code** to make the failing test pass
- Do not add features, handle edge cases, or refactor yet
- Run the test. **It must pass.**
- Run **all tests** to check for regressions

### REFACTOR — Clean up
- Improve code structure while keeping all tests green
- Look for: duplication, unclear names, functions doing too much, unnecessary complexity
- Run all tests after refactoring to confirm nothing broke

### Repeat
- Move to the next spec test and start the cycle again

## Vertical, Not Horizontal

Work through acceptance criteria as **vertical slices**: one criterion at a time, RED-GREEN-REFACTOR, then the next. Never write all tests first and then all implementation — that's horizontal slicing and it breaks the feedback loop.

**Correct:** Test A fails → implement A → passes → refactor → Test B fails → implement B → passes → refactor
**Wrong:** Test A + B + C + D → implement A + B + C + D → hope they all pass

If you catch yourself writing more than one failing test before making any pass, stop. You've gone horizontal.

## Adapted Step Size for AI

Uncle Bob notes: "TDD is very inefficient for AIs. Testing is essential for them but not in the micro steps that the three laws of TDD recommend."

For AI agents, the adaptation is:
- **Group related assertions** — implement 2-3 closely related spec tests in one RED-GREEN cycle if they test the same logical unit
- **Write more complete implementations** in the GREEN step — AI can hold more context than a human doing micro-steps
- **But never skip RED** — always confirm the test fails before writing production code. This is non-negotiable.
- **Never write production code and test code simultaneously** — the test must exist and fail first

## Working with Specs

When implementing against a spec file:
1. Read all the spec tests to understand the full picture
2. Identify a good implementation order (dependencies first, happy path before edge cases)
3. Work through specs one-by-one (or in small related groups) using the RED-GREEN-REFACTOR cycle
4. After all specs pass, run the full test suite

## When to Load This Skill

This skill is relevant when:
- `issue-executor` is implementing an issue that references spec files
- The user asks to implement a feature with tests
- A spec file with `// TODO: implement` markers exists
- The user explicitly asks for TDD discipline

## Coordinator Pattern (Multi-Agent)

When implementation spans multiple modules or is non-trivial, use a coordinator pattern:

1. **Test agent** writes failing tests (behavioral contracts, API shape, clamped expectations — not exact numeric values)
2. **Reviewer** validates test quality
3. **Implement agent** (fresh context) writes code to pass the tests
4. **Reviewer** validates implementation
5. Loop review → fix until the reviewer is satisfied

Independent workstreams can run in parallel. Use background agents for test writing and implementation, foreground for reviews that need coordinator judgment.

This pattern is the multi-agent version of RED-GREEN-REFACTOR — the test writer and implementer are different agents, which prevents the implementer from writing tests that just rubber-stamp their own code.

## Completion

When all spec tests pass:
1. Run the full test suite for the affected package
2. Check for remaining `// TODO: implement` markers
3. Report: what was implemented, what tests pass, any issues encountered
