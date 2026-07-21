---
name: feature-atlas
description: Sole durable representation rules for accepted Feature Map planning. Use when reading or mechanically projecting Atlas, Index, Map, Feature, contained Leg, Work Item, Decision, or observation records in a configured tracker.
---

# Feature Atlas Representations

Feature Atlas is the sole durable accepted planning authority after an exact trusted-human Map Decision. Route sessions and candidate labels are ephemeral; tracker bodies and child records are current projections of the immutable current Map Decision, not competing authorities.

1. Read [the canonical representations](references/issue-representations.md) for identity, ownership, Map Decision authority, current projections, history, dependencies, observations, and successors.
2. When the configured canonical tracker is private GitHub Issues, also follow [the configured private GitHub boundary](references/configured-private-github.md), including its fail-closed provider-capability gate.
3. Keep tracker mechanics separate from Feature Atlas semantics. Locators, issue numbers, titles, labels, and native parent relationships aid navigation but never define identity, ownership, acceptance, currentness, or prerequisite satisfaction.
4. Treat Map, Feature, Leg, and Work Item ownership as semantic: Map owns Blueprint coverage and cross-Feature/cross-Map planning; Feature owns its contained Legs and Work Item DAG; every implementation Work Item belongs to exactly one Feature and Leg.
5. Preserve source-system authority. Git, tests, reports, PRs, deployments, runtimes, and providers own their facts; Atlas records minimum qualified locators and verified observations.

This skill defines durable representation and projection invariants. Ephemeral composition belongs to Route; exact semantic acceptance belongs to the verified human Map Decision; recoverable mutation belongs to the narrow Publisher; implementation/effects belong to separately authorized workflows. Atlas representation does not itself define Map completion/abandonment, migration of legacy records, execution dispatch, PR landing, or deployment.
