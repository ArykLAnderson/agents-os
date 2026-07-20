---
name: prune-tests
description: Evaluate and reduce an accumulated test portfolio to its strongest deep-interface owners. Use when tests duplicate behavior across layers, encode implementation details, preserve historical delivery slices, or need substantial deletion without losing critical safety contracts.
user-invocable: true
argument-hint: "[test path or repository]"
---

# Prune Tests

Reduce test sediment. The target is not fewer assertions at any cost; it is **one strongest owner per durable seam**, plus focused tests for critical code that is uneconomical to prove through that seam.

Read [`references/retention-rubric.md`](references/retention-rubric.md) before classifying tests.

## 1. Establish the portfolio baseline

Determine scope from `$ARGUMENTS`, or inspect the repository's tracked tests. Record:

- test files and lines;
- static test blocks and runtime cases;
- suite duration;
- the command that excludes unrelated fixtures or incident artifacts;
- current passing state and typecheck/build state.

Do not begin deletion from a failing baseline unless the failure is explicitly excluded and recorded.

**Complete when:** the baseline counts and exact verification commands are reproducible.

## 2. Map durable owners

Map production modules and external ports before judging individual tests. Name the strongest existing owner for each deep seam, such as:

- public API or command boundary;
- orchestration lifecycle and durable authority;
- provider or storage integration;
- signed or authenticated ingress;
- generated executable protocol;
- destructive-operation authorization;
- artifact integrity, custody, or replay protection.

Treat delivery labels, helper functions, routes, and source files as implementation history rather than ownership boundaries.

**Complete when:** every critical seam has one proposed primary test owner and any focused-unit exceptions are named.

## 3. Classify every test block

Classify each test or coherent describe block:

- **RETAIN** — strongest deep-seam owner, or focused protection for critical code.
- **CONSOLIDATE** — externally distinct rows share one setup and authority contract.
- **DELETE** — duplicate owner, thin forwarding, private state shape, source text, call order, incidental formatting, historical slice, or one-function/one-route enumeration.
- **OWNER GAP** — important invariant exists only inside a weak implementation-coupled test.

For each deletion, name the retained owner. For each focused unit, state the critical failure it isolates. Importance alone does not justify multiple owners.

Use parallel read-only reviewers by domain when the portfolio is large. Require exact names or selectors, current ranges, dependencies, and estimated reduction.

**Complete when:** all scoped blocks have a disposition and every deletion points to an owner or an explicit owner gap.

## 4. Set an aggressive target

Choose a portfolio target from the seam map, not from a percentage. Budget a small number of scenarios per authority boundary and a bounded allowance for critical algorithms.

Prefer deleting whole duplicated setups and behavior matrices. Parameterize only genuinely distinct contract cases; do not replace deleted tests with an equally large table.

**Complete when:** the target count and line budget can be explained as the sum of retained owners.

## 5. Delete in waves

Use one writer. Work in dependency order:

1. thin adapters, formatting, forwarding, and obvious duplicate variants;
2. historical feature/slice suites and private state assertions after confirming their owners;
3. consolidate lifecycle, artifact, authorization, and destructive-operation contracts;
4. rename retained suites by durable seam rather than delivery chronology.

After each wave, run focused owners, the complete scoped suite, typecheck/build, and diff checks. Commit each green wave separately. Do not change production behavior to make pruning easier.

**Complete when:** each wave is green, deletion-dominant, and independently reviewable.

## 6. Challenge for over-pruning

Have an independent architecture or domain reviewer inspect the reduced portfolio. Ask specifically for missing authority seams, race/ambiguity cases, and destructive fail-closed behavior—not general requests for more coverage.

If a seam was over-pruned, restore the minimum compact public-contract scenario. Recover intent from the deleted test, but do not restore its historical scaffolding or private-shape assertions.

**Complete when:** the reviewer passes the portfolio or every reported owner gap has one compact owner.

## 7. Close with evidence

Re-run the exact baseline commands and report:

- before/after runtime cases and test lines;
- files changed;
- focused owners retained;
- compact tests restored after challenge;
- suite/typecheck/build results;
- known excluded test pollution;
- whether production files changed.

A successful cleanup materially reduces the portfolio while making ownership easier to explain.
