---
name: tdd
description: Interface-first red-green-refactor discipline for coherent behavioral batches. Loaded when implementing tested behavior against a public module or product interface.
user-invocable: false
---

# TDD: Interface-First Behavioral Batches

Use `codebase-design` to choose the deepest public interface that expresses the required behavior. TDD owns implementation feedback discipline, not worker coordination, reviewer topology, worktree allocation, or release gates.

## Choose One Coherent Batch

A batch covers related observable outcomes through one public interface and for one immediate consumer. It may contain several assertions or scenarios when they describe the same behavior. Prefer the highest seam that remains fast and deterministic enough to give useful feedback.

Good tests survive a sound internal redesign. Avoid assertions about private functions, call order, internal object shape, incidental files, or implementation sequence. Use a narrow unit test only when it durably isolates valuable algorithmic behavior.

## RED — Establish Meaningful Missing Behavior

1. Write the coherent behavioral batch before its production implementation.
2. Run the smallest command that executes it.
3. Confirm it fails for the expected missing behavior, not because of syntax, fixture, environment, or unrelated failures.
4. Record concise red evidence: command, failing scenario/assertion, and why the failure demonstrates the absent behavior.

A test that already passes is not red evidence. Correct the test or explain why a meaningful red state cannot be produced (for example, characterization of existing behavior) rather than manufacturing a failure. Do not weaken an established interface merely to force red.

## GREEN — Satisfy The Public Behavior

Implement the smallest coherent production change that makes the whole batch pass at the selected interface. “Smallest” limits behavior and scope; it does not require a shallow patch or forbid necessary bounded refactoring.

Rerun the focused batch and inspect its output. Then run ordinary affected-project checks required by the Task Contract and repository instructions. Do not claim green from an unexecuted or unread command.

## REFACTOR — Deepen Without Changing The Contract

Improve naming, locality, encapsulation, duplication, and module depth while the behavioral batch stays green. If repeated cycles require shallow special cases, leaky seams, or accepted-contract violations, use `zoom-out` and return the resulting bounded design issue to the owning workflow.

Rerun the focused batch after refactoring. Run broader checks in proportion to the affected surface; TDD does not mandate an unrelated full-repository suite.

## Continue By Interface Batch

Move to the next coherent behavior batch only after the current batch is green and internally coherent. Do not split one behavior across ceremonial micro-tests, and do not write an entire feature's unrelated tests before implementation. Multiple related scenarios in one batch are expected when they share an interface and consumer.

## Handoff Evidence

Report:

- public interface and consumer exercised;
- behavioral tests added or changed;
- red command and expected failure evidence, or the exact reason meaningful red was not possible;
- green/refactor commands and results; and
- remaining behavior or limitations.

Role separation and independent validation are defined by the invoking Coding Worker or Software Implementation workflow, not by this skill.
