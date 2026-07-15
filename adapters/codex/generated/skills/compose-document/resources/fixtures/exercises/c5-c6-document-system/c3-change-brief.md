# C3 Change Brief Exercise: Withdraw The Count-Bearing RFC Direction

- **Adapter:** `change-brief.md`
- **Pinned snapshot:** `notification-retry-policy/SNAP-005`
- **Reader:** RFC reviewer
- **Review scope:** Only the local retry-policy artifact entrypoint, current/stale revision labels, and evidence/authority distinction described below.
- **Review action:** Confirm that the normal entrypoint selects `successor-r2`, that the frozen baseline is not presented as current policy, and that `OBS-004` is not presented as authority. Do not review a replacement count, implementation, owner, schedule, rollout, or any external destination.
- **Shaping strategy exercised:** `review-briefing`

## Review Ask

Review the representation change from a stale, four-retry baseline to the current no-count boundary. Do not approve a replacement count, implementation, owner, schedule, or rollout.

## What Changed

The baseline report was based on `SNAP-003`, where `DEC-002` was the accepted four-retry direction. The post-baseline rerun (`OBS-004`) found four retries missed delivery and five exceeded latency. That evidence invalidated baseline report support. Separately, `APR-004` approved `DEC-003`, which superseded the four-retry decision with a no-count direction.

## What Did Not Change

`SNAP-005` is an integrity representation correction preserving the accepted meaning of the discovered `SNAP-004` bytes. It does not establish a numeric margin, explain the difference between runs, identify a replacement configuration, or authorize implementation.

## Evidence And Risk

The current safe entrypoint is `successor-r2`; the baseline stays frozen for comparison and is marked stale. `ALT-001` is a rejected proposal and `OBS-002` is an omitted duplicate unattributed claim. Neither is current policy. The material risk is presenting evidence as authority or treating the stale baseline as the safe reader entrypoint.

## Verification Boundary

The fixture's local trace and review record the distinction. See `c3-change-brief.trace.md` and `reviews/c3-change-brief-fidelity-genre.md`. This is not deployment, stakeholder approval, or production verification. A future count needs validation, reconciliation, and a new author-approved decision.
