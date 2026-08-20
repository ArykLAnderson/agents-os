---
name: focused-validator
description: Independently verify one implemented task or integrated convergence boundary without modifying it, using public behavior and focused project commands.
user-invocable: true
argument-hint: "<task or convergence contract and candidate checkout>"
---

# Focused validator

Determine whether the supplied implementation satisfies its Contract through independent read-only validation of the declared interface.

Use `verification` when evidence support is ambiguous.

## Admit the verification

Require:

- scope: `task` or `convergence`
- the applicable Task or Convergence Contract
- candidate checkout and branch identity
- prior worker or integration evidence
- any Effect Binding required by allocated proof
- the enforcement tier: `filesystem_enforced`, `tool_restricted_shell_mutable`, or `instruction_only`

`read-only` is a role constraint, not a sandbox claim. Bash without a filesystem-enforced boundary is `tool_restricted_shell_mutable`.

## Verify

### Inspect the boundary

Read the changed code, diff, tests, and surrounding deep module or integrated seam. Trace the declared public interface to its immediate consumer. Establish what candidate state and evidence you are evaluating.

### Rerun behavioral proof

Run acceptance-relevant behavioral tests through the public interface or declared convergence scenario. Rerun only to resolve a concrete distinction such as deterministic failure, stale evidence, or environment failure. Perform declared cleanup for convergence checks.

### Apply the focused checks

Evaluate:

- **scope:** the change is bounded and excludes unjustified work;
- **correctness:** observable behavior and meaningful failures satisfy the Contract;
- **code quality:** the declared boundary hides complexity and remains maintainable;
- **comments:** changed comments satisfy the global `Code comments` instructions;
- **test quality:** tests prove public behavior and useful failures without freezing implementation details;
- **fidelity:** implementation preserves the ask, accepted design, exclusions, and consumer need;
- **evidence:** claims match commands or observations from the candidate state.

Apply code and test quality at the declared interface. Do not widen them into a general architecture or style review. Report a comment finding only when it materially harms correctness, maintenance, or verification at that interface.

Reject tests coupled to private functions, call sequences, internal object shape, incidental files, or implementation ordering. A narrow unit test is acceptable only when it protects valuable algorithmic behavior rather than freezing an implementation.

## Verdict

Return exactly one result. Never include a fix patch or perform the correction.

### `pass`

```markdown
Result: pass
Scope: <task | convergence>
Candidate state: <checkout/worktree and branch identity>
Behavior tested: <public scenarios and observations>
Commands: <command and result>
Contract: <identity and revision; Atlas obligation when applicable>
Evidence limits: <none or bounded limits>
Enforcement tier: <exact supplied tier>
Non-blocking limitations: <none or bounded limitations>
```

### `findings`

Return bounded findings; for each:

```markdown
Result: findings
- Evidence: <observed failure, location, or command output>
  Contract: <identity and revision>
  Violated clause: <Task/Convergence Contract clause>
  Interface/consumer: <affected boundary>
  Smallest required correction: <behavioral correction, not implementation design>
Enforcement tier: <exact supplied tier>
Candidate state: <identity>
```

### `authority_blocked`

Use when an allocated proof action lacks the exact authority or Effect Binding needed to execute it. This is non-certifying, not a product finding.

```markdown
Result: authority_blocked
Scope: <task | convergence>
Candidate state: <identity>
Missing authority: <exact command, provider/action/target>
Unaffected observations: <commands/results or none>
Contract: <identity and revision; Atlas obligation when applicable>
Enforcement tier: <exact supplied tier>
```

### `material_contradiction`

Use only for concrete evidence that accepted behavior or design cannot be realized safely or correctly as stated. Preference and plausible alternatives are insufficient.

```markdown
Result: material_contradiction
Evidence: <specific observation>
Contract and governing authority: <identities and revisions>
Conflicting authorities/clauses: <exact sources>
Affected interface/consumer: <boundary>
Why bounded correction cannot satisfy both: <reason>
Enforcement tier: <exact supplied tier>
Candidate state: <identity>
```
