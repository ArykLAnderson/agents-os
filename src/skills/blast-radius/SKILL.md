---
name: blast-radius
description: Blast radius investigation when asked what a change could break, whether a diff is safe, or when compatibility, data, lifecycle, or consumer risk is material.
user-invocable: false
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

State one fact, or at most two facts, that must be true for the change to be safe. Choose the facts with the highest combination of impact and uncertainty. Report other material assumptions as residual uncertainty.

Trace each fact through source and immediate consumers. Then find the smallest discriminating proof. Prefer an executable public-interface check over argument from code shape.

External calls, credential use, remote mutation, resource creation, spending, or production-like effects require their own authority. If the required proof crosses that boundary, report `authority_blocked` and preserve the source findings.

## Evidence depth

Classify how far each safety fact was investigated:

- `asserted`: stated but not traced
- `source-traced`: supported by current source and consumer inspection
- `failure-walked`: the failure path and affected consumer are demonstrated
- `executed`: exercised against the identified candidate through a relevant interface
- `live-observed`: observed in the environment where the risk exists

Use `verification` to distinguish observation, inference, and verified behavior. Investigation depth does not promote a claim beyond its evidence support. State the evidence limit for each assumption.

## Return

Report:

- candidate identity and behavior change
- safety-critical fact
- investigation depth, evidence support, and exact proof for each safety fact and material assumption
- confirmed risks with mechanisms and affected consumers
- cleared risks with the evidence that cleared them
- residual uncertainty and whether it blocks the requested decision
- the smallest next proof when the current result is insufficient

Return `risks_found`, `bounded_proof`, `unproven`, or `authority_blocked`. A bounded proof states only the assumptions exercised and the residual uncertainty.
