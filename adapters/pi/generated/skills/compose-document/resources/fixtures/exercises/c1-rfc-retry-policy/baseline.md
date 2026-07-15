# Frozen Current-Workflow Baseline

- **Attempt:** exercise-02-attempt-01
- **Baseline captured:** 2026-07-17, after SNAP-003 had superseded SNAP-001
- **Case root:** `src/skills/case-intake/resources/fixtures/exercises/contradictory-local-bundle/`
- **Case ID:** notification-retry-policy
- **Retained artifact:** `artifacts/notification-rfc/artifact.md`
- **Artifact digest:** `f891bdf167a7d85fd82282a5016beeb1ce70d3087708df6288f459fec6ca5ffc`
- **Retained trace:** `artifacts/notification-rfc/artifact.trace.md`
- **Trace digest:** `152f67d7425f4cf169b77e1512b9a48814292fc598ab2525b0cae57e55266d23`
- **Pinned baseline snapshot:** SNAP-001
- **Baseline manifest digest:** `00a501c58a4463d8104aa76b96e24ef018bb0b446efab43424180340d4f57ac4`
- **Current comparison snapshot:** SNAP-003
- **Current manifest digest:** `2ff51ce9b1e73595163254c5fe5011ca8ee6164a6182aa23f34c655235e59ec7`
- **Source records:** `source-records.md#SRC-001` through `source-records.md#SRC-004`
- **Source bundle:** `sources/existing-retry-policy.md`, `sources/planning-transcript.md`, `sources/weak-authority-claim.md`, and `sources/later-capacity-evidence.md`
- **Baseline reader action:** assess the retry-policy direction for the RFC
- **Reader:** migration technical approver
- **Re-exercise artifact:** candidate rev-03 decision record with no Case-backed reader action; supplied local review context only

## Baseline State

- The retained artifact states three retries as current policy and its trace pins that claim to `notification-retry-policy/SNAP-001/DEC-001`.
- SNAP-003 instead marks DEC-001 superseded and DEC-002 accepted at four retries after capacity validation and APR-002.
- `STALE-001` requires review before reader action; the retained artifact remains evidence of the earlier workflow, not a usable current-policy artifact.

## Qualitative Comparison

| Dimension | Retained SNAP-001 workflow artifact | SNAP-003 candidate rev-03 decision record | Result |
|---|---|---|---|
| Usefulness for the current policy question | Cannot safely answer it because its current-policy claim is stale. | States the accepted four-retry direction and keeps prior options visible as history. | Re-exercise is a usable decision record; its local review context is not a Case-backed action. |
| Value to implementation planning | Contains no tested current direction and cannot be used as planning input. | Supplies a Case-backed policy boundary, but no owner, schedule, rollout, or implementation plan. | Re-exercise informs later planning; it does not replace planning. |
| Reader comprehension | A reader could take the three-retry claim as current. | Fresh-reader evidence shows the decision, evidence boundary, and non-authorization boundary are identifiable. | Re-exercise improves comprehension for this case; no measured claim is made. |
| Author burden | Earlier approval history is retained; this comparison does not reconstruct its effort. | No new author question is sent because the Case already accepts the policy; the action is narrowed rather than inventing planning facts. | No additional burden was introduced by this re-exercise. |

The comparison is qualitative and chronological: it compares the frozen retained artifact after its staleness was known with candidate rev-03 on later SNAP-003. It does not claim measured usefulness, reader performance, or author-time savings.
