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

- **Approve:** set approved proposed binding entries to their accepted type status and `author-approved` provenance unless the author supplied the content directly.
- **Correct:** replace the proposed binding statement with the author-corrected statement before acceptance, preserving its stable ID when the correction does not change the semantic subject. Use `author-approved` provenance.
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
- **Entries:** manifest: snapshots/SNAP-001.entries.md
- **Supersedes:** none
- **Artifacts:** none
```

`SNAP-001` is stable. The entry manifest is immutable accepted-state metadata: list the exact entry IDs included in the snapshot, in their recorded order, and do not rewrite it when the working ledger later changes. Preserve non-binding observations, alternatives, assumptions, risks, and unresolved gaps in the Case and include them in the manifest when they remain relevant to the accepted state. The manifest must not include a proposal that the author rejected or deferred as accepted meaning.

Update frontmatter only after the snapshot exists:

```yaml
working_state: active
current_snapshot: SNAP-001
```

The first snapshot always records `Supersedes: none` and `Artifacts: none`. Later reconciliation, staleness, artifact references, and later snapshots belong to their dedicated flows.
