---
name: feature-atlas
description: Define provider-neutral domain and storage-adapter contracts for accepted Feature Map planning, with configured private GitHub Issues and local filesystem/Git-backed realizations.
---

# Feature Atlas Representations And Storage

Feature Atlas is the sole durable accepted planning authority after an exact trusted-human Map Decision. Route sessions and candidate labels are ephemeral; current Map/Feature/Work Item records are projections of the immutable current Map Decision, not competing authorities.

1. Read [the canonical representations](references/issue-representations.md) for identity, ownership, Map Decision authority, current projections, history, dependencies, observations, and successors.
2. Read [the storage adapter contract](references/storage-adapters.md). Feature Atlas domain callers use its semantic operations; provider commands, repositories, paths, issue numbers, commits, and blobs stay behind the configured adapter.
3. When private GitHub Issues is configured, follow [the private GitHub adapter](references/configured-private-github.md), including its fail-closed provider-capability gate.
4. When local filesystem records are configured, follow [the local filesystem/Git-backed adapter](references/configured-local-filesystem.md), including immutable Decision/content locators, expected-predecessor writes, reread, receipts, and recovery.
5. Treat Map, Feature, Leg, and Work Item ownership as semantic: Map owns Blueprint coverage and cross-Feature/cross-Map planning; Feature owns its contained Legs and Work Item DAG; every implementation Work Item belongs to exactly one Feature and Leg.
6. Preserve source-system authority. Git, tests, reports, PRs, deployments, runtimes, and providers own their facts; Atlas records minimum qualified locators and verified observations. Git may durably carry local records but never becomes acceptance, currentness, or semantic authority by itself.

This skill defines durable representation, domain-operation, adapter, and projection invariants. Ephemeral composition belongs to Route; exact semantic acceptance belongs to the verified human Map Decision; recoverable mutation belongs to the narrow Publisher through one configured adapter; implementation/effects belong to separately authorized workflows. Atlas representation does not itself define Map completion/abandonment, migration of legacy records, execution dispatch, PR landing, or deployment.