# Configured Private GitHub Issues Adapter

Use this adapter only when private GitHub Issues is the explicitly configured canonical Feature Atlas. It conforms to [the storage adapter contract](storage-adapters.md); [canonical representations](issue-representations.md) remain the semantic authority.

`gh` commands are adapter mechanics, never domain results by themselves. Consumers invoke them only as part of one named Feature Atlas operation and receive a semantic classification plus an adapter receipt.

## Destination preflight

Obtain the exact `<owner>/<repository>` and expected visibility from explicit configuration. Never infer or substitute a destination, account, or visibility. Before a read session:

```sh
gh repo view <owner>/<repository> --json nameWithOwner,visibility,hasIssuesEnabled,url
```

Proceed only when identity is exact, visibility is `PRIVATE`, Issues are enabled, and access succeeds. Use `--repo <owner>/<repository>` on every command. Repository branches, pull requests, labels, native parentage, and code Issues never become Atlas authority.

## Supported reads

Read exact known Atlas, Map, Feature, Work Item, and Decision Issue locators with explicit repository and Issue number:

```sh
gh issue view <issue-number> --repo <owner>/<repository> --comments --json number,title,body,state,url,comments
```

Follow only exact locators found in the configured record or accepted snapshot; do not discover a different destination. Verify the stable identity, owner, bound Map Decision, accepted local-label meaning, visibility, and any immutable snapshot/content binding named by that Decision. Editable bodies and comments are projections unless the canonical representation explicitly makes an immutable content-bound record authoritative.

Search may locate candidates and detect visible conflicts, but GitHub's indexed/eventually consistent search cannot prove global uniqueness or exhaustive currentness. A search result is never sufficient by itself to establish that one identity or Decision is the sole current record.

Return a receipt containing the named domain operation, repository identity/visibility, exact Issue and comment URLs read, observation time, content-binding checks, conflicts/limitations, and semantic classification. Raw JSON is retained only as provider evidence.

Return the strongest truthful domain result:

- exact historical or known-record reads may succeed when their identity and content binding verify;
- currentness, uniqueness, publication completeness, and implementation handoff succeed only when the configured Atlas includes an authoritative immutable index/snapshot or other accepted mechanism that proves those properties;
- otherwise return the applicable typed limitation, ambiguity, integrity failure, or `HandoffRefusal` rather than claiming completeness.

This preserves access to existing GitHub-backed Atlas authority without manufacturing guarantees from provider search.

## Unsupported mutations

Ordinary `gh issue create/edit/comment` does not provide Atlas-wide identity allocation, expected-predecessor compare-and-swap, or mutation-time fencing against a superseded publisher. Therefore this adapter does not publish Maps, allocate identities, append authoritative Decisions, repair projections, or recover partial writes through those commands.

A future write-capable adapter requires a separately accepted design and provider proof for:

- global identity-allocation serialization;
- expected-predecessor CAS and mutation-time fencing;
- immutable, lifetime-retained, audience-compatible Decision snapshots;
- complete post-write currentness/integrity verification; and
- recoverable partial/uncertain writes without duplicate authority.

Until then, mutation returns `capability_unproven`; do not weaken the contract, use advisory leases or reread-before-write as substitutes, or fall back to another destination.

## Observations and source links

GitHub text does not make a source fact true. Retain an observation only when its owning source/workflow supplies verifiable provenance, locator/environment, audience, observation time, integrity, limitations, and invalidators. Unverifiable facts remain `unknown`. Link to Git, tests, reports, deployments, and provider evidence rather than copying detailed facts or secrets.
