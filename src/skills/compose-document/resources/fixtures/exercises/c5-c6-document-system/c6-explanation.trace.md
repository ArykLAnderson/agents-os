# Artifact Trace

- **Artifact:** `c6-explanation.md` and `c6-explanation.html`
- **Creation:** semantic artifact pass for `exercise-05-attempt-02`; exact Markdown/HTML digests and inspected revision are recorded by the following evidence pass
- **Pinned Case snapshot:** `notification-retry-policy/SNAP-005`
- **Qualified non-Case inputs:** local `case-intake`, `case-reconcile`, `compose-document`, `shape-document`, `trace-artifact`, `review-document`, `format-document`, and `publish-document` instructions
- **Trace status:** reviewable; publication intentionally blocked because no destination or explicit authorization exists

## Units

### AU-501: Lifecycle boundary

- **Locator:** `#lifecycle`, `#diagram-lifecycle`
- **Assertion:** The workflow distinguishes source, Case, immutable snapshot, composition, shaping, trace, review, local format, and separately authorized publication.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`; qualified local skill inputs named in the header
- **Visibility:** visible
- **Status:** supported
- **Notes:** The lifecycle describes responsibilities, not a mandatory sequence for every document.

### AU-502: Current and stale revision distinction

- **Locator:** `#lifecycle`, `#diagram-lifecycle`
- **Assertion:** `baseline-r1` remains frozen and stale; `successor-r2` pinned to `SNAP-005` is the current safe entrypoint with an open validation gap.
- **Derivation:** direct
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** supported
- **Notes:** The artifact index is the local entrypoint evidence; this unit does not claim the gap is resolved.

### AU-503: Skill hierarchy and stop points

- **Locator:** `#skill-hierarchy`, `#diagram-skill-hierarchy`
- **Assertion:** Each named skill has a bounded responsibility; a proposed meaning change from downstream document, review, format, or publish work returns to the initial reconciliation node rather than being created or approved downstream.
- **Derivation:** synthesis
- **Support:** qualified local skill inputs named in the header
- **Visibility:** visible
- **Status:** supported
- **Notes:** The HTML exposes this as a separate visible return band, not as an inverse adjacent forward edge. This is a local workflow contract, not Case policy authority.

### AU-504: Trace separates evidence and authority

- **Locator:** `#trace`, `#diagram-trace`
- **Assertion:** Trace units bind material claims to qualified snapshot entries and distinguish `OBS-004` evidence from `APR-004`/`DEC-003` authority.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** supported
- **Notes:** Approval records are Case-root inputs; the snapshot entry `DEC-003` names its approval.

### AU-505: Multi-Case composition boundary

- **Locator:** `#multi-case`, `#diagram-multi-case`
- **Assertion:** A multi-Case artifact preserves separate case/snapshot lanes and cannot transfer policy authority or rendering evidence across them.
- **Derivation:** synthesis
- **Support:** qualified local `compose-document`, `trace-artifact`, and `format-document` instructions
- **Visibility:** visible
- **Status:** supported
- **Notes:** The hypothetical second Case is illustrative only and does not represent a real Case or decision.

### AU-506: Safe publication gate

- **Locator:** `#safe-publishing`, `#diagram-safe-publishing`
- **Assertion:** External publishing requires explicit authorization, verified destination/permission, safe update assessment, clear trace and asset checks, and post-write read-back; this exercise stops before all of them.
- **Derivation:** direct
- **Support:** qualified local `publish-document` and `notion-safe-publish.md` inputs
- **Visibility:** visible
- **Status:** supported
- **Notes:** No external target was read or written.

### AU-507: Proof coverage boundary

- **Locator:** `#proof-coverage`, `#diagram-proof-coverage`
- **Assertion:** Local source/Case support, trace/review support, and presentation checks do not prove publication, stakeholder approval, or operational outcome.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`; qualified local review, format, and publish inputs
- **Visibility:** visible
- **Status:** supported
- **Notes:** The diagram makes the unverified outer boundary explicit.

### AU-508: Omitted weak claim accounting

- **Locator:** `#trace`, `#boundaries`
- **Assertion:** The duplicate unattributed `OBS-002` claim is omitted from current action but disclosed as weak, while `ALT-001` remains rejected.
- **Derivation:** omission
- **Support:** `notification-retry-policy/SNAP-005/OBS-002`; `notification-retry-policy/SNAP-005/ALT-001`
- **Visibility:** visible
- **Status:** supported
- **Notes:** Omission does not remove the need to distinguish it from current policy.

## Selection And Accounting

| Selected input | Handling | Trace units | Reader-facing treatment |
|---|---|---|---|
| `OBS-004` | current evidence | AU-502, AU-504, AU-507 | Current evidence boundary; never policy authority. |
| `DEC-003` | accepted direction | AU-501, AU-502, AU-504, AU-507 | No-count direction and current safe action. |
| `GAP-002` | open limitation | AU-501, AU-502, AU-504, AU-507 | Explains why no replacement count is stated. |
| `OBS-003`, `DEC-002` | stale comparison | AU-502 | Frozen baseline context only. |
| `ALT-001`, `OBS-002` | selected omission/context | AU-508 | Rejected/weak status disclosed; neither becomes policy. |
| Local skill instructions | qualified workflow input | AU-501, AU-503, AU-505, AU-506, AU-507 | Teach responsibility boundaries, not Case meaning. |

## Visual Coverage

Each visual specification in `visual-specs/` names its unit, support, allowed assertions, forbidden implications, required elements, textual equivalent, and validation record. The HTML diagrams are semantic CSS diagrams rather than generated images; their accessible text equivalents remain adjacent and visible in the Markdown artifact.
