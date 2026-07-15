# Six-Case Local Readiness Decision

- **Attempt:** `exercise-06-attempt-01`
- **Decision scope:** local preparation for ticket 06 only; no wrapper migration, external write, push, or pull request.
- **Evidence revision:** `141f5bcd26df42613789b0a1725dc1f0964868d7`
- **Decision:** **NEEDS ATTENTION - NOT READY FOR COMPATIBILITY-WRAPPER MIGRATION**
- **Decision basis:** DS-010, DS-012, the ticket-06 acceptance criteria, and the integrated C1-C6 local evidence listed below.

## Decision Rule

DS-010 requires six paired cases: each candidate must be compared with a frozen current-workflow baseline made from the same source bundle for the same reader action. Readiness also requires representative readers, a practical author-burden tolerance, controlled trace mutations across at least three cases, and inspected rendered Notion and HTML outputs. A local simulation is comprehension evidence only; it is not a representative-reader result, stakeholder approval, or operational acceptance.

This record does not treat a stale historical artifact, a later Case-backed artifact with a changed reader action, a repository revision, local Chromium inspection, or an agent simulation as a substitute for a missing required input.

## Evidence Inventory

| Case | Adapter and local artifact | Preserved local evidence | Frozen baseline assessment |
|---|---|---|---|
| C1 | RFC decision record, `c1-rfc-retry-policy/decision-brief.md` | SNAP-003 trace, fidelity, genre, editorial, isolated fresh-reader simulation, three mutation checks, and burden record | **Weak / not comparable.** `baseline.md` freezes a stale SNAP-001 RFC, while the candidate uses SNAP-003 and has no Case-backed reader action. It is useful historical contrast, not a same-action pair. |
| C2 | PRD, `c5-c6-document-system/c2-prd.md` | SNAP-005 trace plus local fidelity/genre review | **Missing.** No frozen current-workflow PRD baseline, paired comparison, reader evidence, burden record, mutation record, or target-render record. |
| C3 | Change brief, `c5-c6-document-system/c3-change-brief.md` | SNAP-005 trace plus local fidelity/genre review | **Missing.** No frozen current-workflow change-brief baseline, paired comparison, reader evidence, burden record, mutation record, or HTML render record. |
| C4 | Research report and target representations, `retry-policy-research-report/successor-r2/artifact.md` and `c4-retry-policy-formatting/` | SNAP-005 trace, staged review, normal-entrypoint reader simulation, local Markdown/Notion-source/HTML preservation checks, desktop and narrow HTML inspection | **Weak / not comparable.** `baseline-r1` is frozen at SNAP-003, becomes stale after later evidence, and asks whether to recommend a count; `successor-r2` at SNAP-005 says not to state one. This proves safe staleness handling, not an improvement comparison with the same inputs and action. |
| C5 | Implementation report, `c5-c6-document-system/c5-implementation-report.md` | SNAP-005 trace and local fidelity/genre review, with a named repository revision comparison | **Weak / not comparable.** `71d48b6` is a repository revision, not a frozen current-workflow implementation-report artifact for the same reader action. No reader, burden, mutation, or HTML render comparison exists. |
| C6 | Explanation document, `c5-c6-document-system/c6-explanation.md` and `.html` | SNAP-005 trace, staged five-lens-style local review, local simulated fresh reader, six semantic visual specs, desktop and narrow HTML inspection | **Missing.** No frozen current-workflow explanation baseline, paired comparison, representative reader, or burden threshold. The HTML proof is strong local presentation evidence only. |

All six cases reuse the notification-retry-policy fixture or local document-system instructions. DS-012 calls for several Case families and source reuse across K1-K5. The current evidence is therefore a representative local exercise set for the implemented seams, not the DS-012 six-case proof bundle.

## Per-Case Gate Matrix

Status meanings: **LOCAL PASS** means the cited local artifact supports the narrow claim. **NOT ESTABLISHED** means the DS-010 gate cannot be decided from the available evidence. **BLOCKED** means a prerequisite is absent or external authorization is required. None of these statuses claims external publication, Notion rendering, real-reader behavior, or approval.

| Case | Fidelity and unsupported material assertions | Trace and mutation coverage | Usefulness, comprehension, concision, burden | Render / publication | Case decision |
|---|---|---|---|---|---|
| C1 | **LOCAL PASS.** Fidelity review found no unsupported assertion, authority conflict, stale support, missing caveat, or untraced material table assertion. | **LOCAL PASS, narrow.** Decision, row-anchor, and material-table-cell mutations marked AU-001/AU-006 stale. **NOT ESTABLISHED** for DS-010 coverage: no observation status, gap, requirement, or visual mutation; only one case. | **NOT ESTABLISHED.** A simulation passed at medium confidence and no new questions were sent, but the baseline is not comparable, no representative reader participated, and no burden tolerance exists. Qualitative concision/value only. | **BLOCKED / NOT ESTABLISHED.** No Notion target, HTML target, controlled destination, or external authorization. The candidate is explicitly not publication-ready. | **NEEDS ATTENTION.** Strong local semantic exercise; not a paired readiness case. |
| C2 | **LOCAL PASS.** The review preserves the no-count direction, evidence/authority separation, and blocking gap. | **LOCAL PASS for trace existence; NOT ESTABLISHED for mutation.** No controlled mutation record. | **NOT ESTABLISHED.** No baseline, reader test, concision comparison, or burden record. | **NOT ESTABLISHED.** Markdown only in evidence; no rendered Notion inspection. | **NEEDS ATTENTION.** |
| C3 | **LOCAL PASS.** The review preserves stale/current status and limits the review ask. | **LOCAL PASS for trace existence; NOT ESTABLISHED for mutation.** No controlled mutation record. | **NOT ESTABLISHED.** No baseline, reader test, concision comparison, or burden record. | **NOT ESTABLISHED.** Required HTML output is absent from the evidence bundle and was not rendered. | **NEEDS ATTENTION.** |
| C4 | **LOCAL PASS.** The local staged review and target-preservation checks retain evidence/authority and open-validation boundaries. | **LOCAL PASS for stale-baseline handling; NOT ESTABLISHED for DS-010 mutation coverage.** The later contradiction makes `baseline-r1` stale, but there is no controlled decision/status/gap/requirement/anchor/table/visual mutation matrix covering this case. | **NOT ESTABLISHED.** The normal-entrypoint simulation is moderate-confidence comprehension evidence only. Burden records questions, not a threshold or paired burden comparison. The frozen baseline and successor have different snapshot states and actions. | **LOCAL PASS for local HTML; NOT ESTABLISHED for Notion.** Desktop/narrow Chromium inspection finds no local HTML meaning degradation. `artifact.notion.md` is source text, not a rendered Notion page. Publication is intentionally blocked. | **NEEDS ATTENTION.** Strongest local target evidence; not a fair pair and not a real Notion proof. |
| C5 | **LOCAL PASS.** The review keeps delivered, observed, and unverified outcomes distinct. | **LOCAL PASS for trace existence; NOT ESTABLISHED for mutation.** No controlled mutation record. | **NOT ESTABLISHED.** The named repository baseline does not supply a comparable current-workflow artifact; no reader, concision, or burden comparison exists. | **NOT ESTABLISHED.** Required HTML output was not rendered. | **NEEDS ATTENTION.** |
| C6 | **LOCAL PASS.** Review records evidence/authority separation, stale/current boundaries, visual limits, and no known local semantic finding. | **LOCAL PASS for semantic visual trace coverage; NOT ESTABLISHED for mutation.** Six visual specs and trace units exist, but no controlled visual-edge or anchor mutation test exists. | **NOT ESTABLISHED.** The fresh-reader simulation is expressly not a real reader result; no baseline, usefulness comparison, concision comparison, or burden record exists. | **LOCAL PASS for local HTML; NOT ESTABLISHED for Notion.** Desktop/narrow HTML evidence records six diagrams, adjacent text equivalents, no page overflow, and no browser errors. No rendered Notion page exists. | **NEEDS ATTENTION.** Strong local flagship artifact; not a paired readiness case. |

## Aggregate DS-010 Hard Gates

| DS-010 readiness gate | Outcome | Exact evidence and blocker |
|---|---|---|
| No critical fidelity failure | **NOT ESTABLISHED for system readiness; no known local critical fidelity failure.** | C1-C6 local reviews record pass/no remaining semantic finding within their limited scopes. They are not the complete independent six-case proof with the required source families and paired baseline comparison. |
| No known unsupported material assertion in publishable candidates | **NOT ESTABLISHED.** | Local reviews found none in inspected candidates, but no candidate is publishable: C1 is explicitly not publication-ready and all external publication is blocked. The condition cannot establish readiness for publishable candidates that do not exist. |
| Artifact-trace publication blockers are zero | **NOT ESTABLISHED.** | Trace sidecars exist and local reviews describe no semantic blocker for their narrow artifacts. Publication blockers have not been evaluated against rendered Notion destinations or a controlled write/post-fetch flow; absent authorization is itself a publish stop, not a zero-blocker result. |
| Controlled mutations miss no material stale unit | **NOT ESTABLISHED.** | C1 covers decision, row anchor, and table cell. C4 demonstrates stale-baseline handling. DS-010 requires decision, observation status, gap, requirement, anchor, table row, and visual edge across at least three cases. Observation-status, gap, requirement, visual-edge, and two additional case mutation coverage are absent. |
| Candidate more useful in at least five of six cases | **NOT ESTABLISHED.** | No six comparable baseline/candidate pairs exist. C1 and C4 explicitly reject measured usefulness claims; C2/C3/C5/C6 have no paired usefulness evidence. |
| No candidate worse on reader comprehension or author burden | **NOT ESTABLISHED.** | Simulations exist for C1, C4, and C6 only and are not representative-reader tests. There is no baseline comparison, no actual-reader data, and no author-selected burden threshold. |
| At least four candidates more concise or higher-value per word | **NOT ESTABLISHED.** | No paired word-count/value evidence exists. Local reviews discuss focused scope but do not establish this ordinal comparison. |
| No meaning-changing Notion or HTML render defect | **NOT ESTABLISHED.** | C4 and C6 have local HTML desktop/narrow evidence with no observed meaning-changing defect. C1/C2/C3/C5 lack required target evidence, and no actual Notion page was rendered or fetched. |
| No repeated major reader misunderstanding | **NOT ESTABLISHED.** | No misunderstanding was observed in isolated simulations for C1, C4, and C6. Actual representative reader tests across all cases are absent, so repeated misunderstanding cannot be assessed. |
| Consolidated findings are bounded and actionable | **LOCAL PASS for exercise reviews; NOT ESTABLISHED for readiness.** | C1 re-exercise and C2/C3/C5/C6 local reviews converge with no remaining semantic finding; C4 records bounded local refinement. A complete six-case independent reviewer bundle and cross-case consolidation are absent. |

## Limitations And Non-Claims

1. C1's stale SNAP-001 artifact and C4's stale `baseline-r1` are honest frozen historical controls, but neither is a fair DS-010 baseline because its later candidate has different accepted inputs and/or reader action.
2. C5's named repository revision is a stable implementation subject, not a baseline document. It cannot support a candidate-versus-current-workflow usefulness, concision, comprehension, or burden comparison.
3. The local Chromium checks establish only the inspected HTML file, viewport, and browser state. They do not establish a rendered Notion page, accessibility conformance, external embed behavior, publication correctness, or real-reader comprehension.
4. `artifact.notion.md` and C4's Notion-native source are representations, not imported or fetched Notion pages. No destination or named external action is authorized.
5. Agent fresh-reader simulations for C1, C4, and C6 are isolated comprehension evidence. They do not establish representative human-reader performance, stakeholder approval, or operational acceptance.
6. Zero or low recorded questions is not an author-burden pass without a baseline process comparison and an author-selected practical tolerance. No coarse active author time is recorded for all six cases.
7. The current local fixture demonstrates useful semantic boundaries and re-exercise behavior, but it does not cover the DS-012 K1-K5 Case diversity or the required C3/C5 implementation-slice decision.

## Decision-Ready HITL Request

Acceptance of readiness is not requested yet. To run the proof rather than manufacture it, the author or designated coordinator must provide the following bounded inputs:

1. Six frozen baseline artifacts, or explicit approval of an honest exception for a named case. For each: source bundle digest/locator, current-workflow skill/prompt version, output digest, capture time, intended reader, and reader action. Each must use the same sources and action as its candidate.
2. Actual representative readers for the genre-specific actions, distinct from artifact authors. Their review packet must contain only the frozen baseline/candidate materials and questions appropriate to the action.
3. A practical author-burden tolerance and comparison method: acceptable interruption/question pattern, whether repeated repairs fail, and coarse active-time category for both paths.
4. A controlled Notion destination and express authorization naming the system and allowed create/update actions, if rendered-Notion and safe-publication proof are required. Without this, retain the explicit Notion gate as blocked.
5. A real or controlled implementation slice and fair baseline for C3/C5, plus the intended reader actions.
6. Approval of a controlled mutation plan spanning at least three cases: decision, observation status, gap resolution, requirement, anchor, table row, and visual edge. Every affected material unit must be recorded; overflagging is a maintenance cost, not a pass substitute.

After those inputs are supplied, execute independent source-fidelity, genre/audience, and fresh-reader reviews; compare each pair ordinally; record C1-C6 decisions; and make a new readiness decision. A failure on a hard gate remains a blocker and must not be averaged into a score.

## Post-Acceptance Wrapper Migration Plan

This plan is intentionally inactive until an explicit accepted readiness decision names the evidence revision.

1. Freeze the accepted readiness record and identify the exact portable skill entrypoints each legacy workflow will delegate to.
2. Add thin wrappers for `rfc-write`, `rfc-review`, and the selected Mercari `design-*` commands outside the portable `src` tree. Each wrapper may set defaults and translate legacy artifact locations only.
3. Delegate composition, shaping, trace, review, formatting, reconciliation, and publication guards to the portable skills. Do not copy Case semantics, author-review logic, trace logic, or publication logic into a wrapper.
4. Exercise representative legacy invocations locally against the accepted proof fixtures. Verify the wrapper preserves the legacy entry contract while producing portable selection/trace/review artifacts.
5. Keep external publication, Git push, and pull-request creation separately authorized. Wrapper migration itself does not authorize any of them.
6. Add deprecation guidance only after delegation is verified and a follow-up acceptance decision approves the migration scope. Do not remove legacy behavior until its replacement path is proven and accepted.

## Local Evidence Locators

- C1 evidence: `src/skills/compose-document/resources/fixtures/exercises/c1-rfc-retry-policy/`
- C4 Case-backed research evidence: `src/skills/case-intake/resources/fixtures/exercises/contradictory-local-bundle/artifacts/retry-policy-research-report/`
- C4 local target evidence: `src/skills/format-document/resources/fixtures/exercises/c4-retry-policy-formatting/`
- C2/C3/C5/C6 evidence: `src/skills/compose-document/resources/fixtures/exercises/c5-c6-document-system/`
- C6 semantic artifact and render provenance: `src/skills/compose-document/resources/fixtures/exercises/c5-c6-document-system/artifact-provenance.md`
