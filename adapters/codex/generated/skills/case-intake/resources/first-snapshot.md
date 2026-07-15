# First Author-Approved Snapshot

Create `SNAP-001` only after explicit author approval or correction resolves every material item required for the initial binding Case state. The snapshot freezes accepted semantic state; it is not a review queue record or a copy of the mutable working ledger.

## Material Gate

Refuse to create an accepted snapshot when required material approval is missing for:

- initiative purpose or accepted intent
- current accepted decisions
- binding requirements or constraints
- authority of an older document or ticket being adopted
- a material contradiction resolution
- agent inference or synthesis proposed as current guidance

An author may reject or defer a proposal without blocking a snapshot when the proposal is preserved as non-binding evidence and no remaining accepted state depends on its resolution. Do not create a pending or provisional semantic snapshot.

## Outcome Handling

- **Approve:** set approved proposed binding entries to their accepted type status and bind them to a durable author approval event. Preserve source-derived provenance when source evidence remains the entry's origin.
- **Correct:** replace the proposed binding statement with the author-corrected statement before acceptance, preserving its stable ID when the correction does not change the semantic subject. Bind the exact corrected wording to a durable author approval event.
- **Reject:** retain supported source material as a non-binding `OBS`, rejected `ALT`, open `GAP`, `ASM`, or `RISK`. Never leave the rejected proposal as an accepted decision, requirement, constraint, or intent.
- **Defer:** preserve the unresolved question as an open `GAP` and leave current accepted meaning unchanged. A deferral alone creates no snapshot.
- **Research:** preserve or create an open `GAP` and an open `ACT` with the bounded question and source scope. Do not perform open-ended discovery or treat a research request as approval.

## Snapshot Record

Add the first record under `# Snapshots` only after the material gate passes:

```markdown
### SNAP-001: Initial Case approved

- **Created:** <YYYY-MM-DD>
- **Reason:** intake-approved
- **Author status:** accepted
- **Approval:** APR-001
- **Entries:** manifest: snapshots/SNAP-001.entries.md (sha256:<digest>)
- **Supersedes:** none
- **Artifacts:** none
```

`SNAP-001` is stable. Its `Approval` points to the durable approval event that names the authority, identity, time, locator, outcome, and exact final wording. Refuse the snapshot when that event is missing, lacks author or declared-delegate authority, has no identity/time/locator, or does not match the final accepted wording.

The entry manifest is immutable accepted-state content, not an ID list. Store each included entry in recorded order using its complete, normalized Markdown representation, including stable ID, label, statement, status, provenance, source locators, approval reference when applicable, and semantic fields. Record the SHA-256 digest of the manifest bytes in the snapshot record. Do not rewrite the manifest or its digest when the mutable working ledger later changes. A later correction, supersession, or source update creates a later entry and snapshot; it cannot modify `SNAP-001` content. A snapshot is invalid when its manifest digest does not match or when a manifest representation differs from its accepted approval event.

Preserve non-binding observations, alternatives, assumptions, risks, and unresolved gaps in the Case and include their recorded representations when they remain relevant to the accepted state. The manifest must not include a proposal that the author rejected or deferred as accepted meaning.

Update frontmatter only after the snapshot exists:

```yaml
working_state: active
current_snapshot: SNAP-001
```

The first snapshot always records `Supersedes: none` and `Artifacts: none`. Later reconciliation, staleness, artifact references, and later snapshots belong to their dedicated flows.
