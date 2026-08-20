---
name: blast-radius
description: Inspect the non-local impact of a bounded change and try to prove the safety fact on which the change depends. Use when asked what a change could break, whether a small diff is safe, or when compatibility, data, lifecycle, ordering, concurrency, persistence, dependency, or external-consumer risk is material.
user-invocable: true
argument-hint: "[diff, branch, proposal, or change question]"
---

# Blast radius

Perform a read-only impact investigation. Do not edit the candidate, redesign the feature, or turn the result into a general review.

## Establish the change

Identify the baseline, candidate, observable behavior change, relevant repositories or modules, and any stated concern. Establish current source and candidate identity before drawing conclusions.

Inspect the paths by which the change can affect:

- callers and consumers
- public APIs, events, files, schemas, and serialized data
- identity, lifecycle, ordering, retries, and idempotency
- shared state, concurrency, cancellation, and cleanup
- persistence, migrations, compatibility, and rollback
- dependencies and external systems
- security, privacy, cost, and operations when the mechanism reaches those boundaries

Do not return a caller inventory as the conclusion.

## Find the safety fact

State one fact, or at most two facts, that must be true for the change to be safe. Choose the fact with the highest combination of impact and uncertainty.

Trace each fact through source and immediate consumers. Then find the smallest discriminating proof. Prefer an executable public-interface check over argument from code shape.

External calls, credential use, remote mutation, resource creation, spending, or production-like effects require their own authority. If the required proof crosses that boundary, report `authority_blocked` and preserve the source findings.

## Evidence levels

Classify each safety fact as:

- `asserted`: stated but not traced
- `source-traced`: supported by current source and consumer inspection
- `failure-walked`: the failure path and affected consumer are demonstrated
- `executed`: exercised against the identified candidate through a relevant interface
- `live-observed`: observed in the environment where the risk exists

Do not call a change safe from `asserted` evidence. Use `executed` for a material safety claim when a focused local proof is practical. State the evidence ceiling when it is not.

## Return

Report:

- candidate identity and behavior change
- safety-critical fact
- evidence level and exact proof
- confirmed risks with mechanisms and affected consumers
- cleared risks with the evidence that cleared them
- residual uncertainty and whether it blocks the requested decision
- the smallest next proof when the current result is insufficient

Use `safe_with_evidence`, `risks_found`, `unproven`, or `authority_blocked` as the result. This result is evidence for an owning workflow. It is not a Focused Validator verdict.
