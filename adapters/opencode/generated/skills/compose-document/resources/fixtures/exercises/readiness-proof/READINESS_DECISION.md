# Six-Case Local Readiness Decision

- **Attempt:** `exercise-06-attempt-01`
- **Decision scope:** local preparation for ticket 06 only; no wrapper migration, external write, push, or pull request.
- **Evidence revision:** `141f5bcd26df42613789b0a1725dc1f0964868d7`
- **Decision:** **NEEDS ATTENTION - NOT READY FOR COMPATIBILITY-WRAPPER MIGRATION**
- **Decision basis:** DS-010, DS-012, the ticket-06 acceptance criteria, and the integrated C1-C6 local evidence listed below.

## Frozen Canonical Inputs

The following local files are the canonical decision inputs for this record. Their absolute paths and SHA-256 digests make later drift visible; they are not copied into this repository or treated as portable-skill inputs.

| Input | Canonical local path | SHA-256 | Relevant decision surface |
|---|---|---|---|
| Specification | `/Users/mont/workspace/mercari/ai/plans/document-system/SPEC.md` | `49f926d48f91bdab128351923d471713552d9b808169ad1d57e763c6591f89be` | Six paired cases and hard gates: `#proof-cases` (lines 429-455); no migration before proof: `#implementation-slices` (lines 343-360); deferred proof inputs: `#deferred-implementation-choices` (lines 484-497). |
| Evaluation criteria | `/Users/mont/workspace/mercari/ai/plans/document-system/DS-010-evaluation.md` | `2774c1e85bf7b9ca24bf7f91b7500026c2e49edca0b5044a7cc5d96f2f955d1f` | Paired-baseline rule: `#resolution` (lines 3-7); hard candidate failures: `#hard-gates` (lines 30-41); evaluation dimensions and reviewers: `#evaluation-dimensions` through `#review-roles` (lines 43-85); readiness gates: `#system-readiness` (lines 87-102); per-case decision contents: `#evidence-bundle` (lines 104-127). |
| Proof-artifact plan | `/Users/mont/workspace/mercari/ai/plans/document-system/DS-012-proof-artifacts.md` | `a6f21cf12a31f47339249a026dd8777d890d9b12180635c0bfe92de9f14d17dc` | Case/strategy/format matrix: `#artifact-matrix` (lines 7-16); required Case families and source reuse: `#candidate-cases` and `#source-reuse` (lines 18-35); sequence: `#sequence` (lines 37-50); required bundle: `#per-case-evidence` (lines 52-78); safe-publication proof: `#safe-publishing-proof` (lines 95-103); mutation proof: `#trace-mutation-proof` (lines 105-107). |
| Ticket 06 | `/Users/mont/workspace/mercari/ai/plans/document-system/issues-v2/06-run-readiness-proof-and-migrate-wrappers.md` | `6d9eb70f4ee7b1efec1a74b128152cf56222e4728e6af736d65845eb8270cdd0` | Required evidence, hard-gate decision, conservative blocker behavior, and post-acceptance-only wrapper migration: lines 19-45. |

## Decision Rule

DS-010 requires six paired cases: each candidate must be compared with a frozen current-workflow baseline made from the same source bundle for the same reader action. Readiness also requires representative readers, a practical author-burden tolerance, controlled trace mutations across at least three cases, and inspected rendered Notion and HTML outputs. A local simulation is comprehension evidence only; it is not a representative-reader result, stakeholder approval, or operational acceptance.

This record does not treat a stale historical artifact, a later Case-backed artifact with a changed reader action, a repository revision, local Chromium inspection, or an agent simulation as a substitute for a missing required input.

## Canonical Requirement Mapping

This mapping prevents a local evidence artifact from being promoted into a readiness result merely because it resembles a required proof artifact.

| Requirement | Canonical source | Required proof artifact or observation | Current local mapping and outcome |
|---|---|---|---|
| Same-source, same-reader-action pair for every C1-C6 case | DS-010 `#resolution`; SPEC `#proof-cases` | Frozen current-workflow baseline, candidate, input/prompt/version record, and per-case decision | C1/C4 are frozen historical controls but change snapshot and/or action; C5 names a revision, not a baseline artifact; C2/C3/C6 lack baselines. **NOT ESTABLISHED.** |
| No material fidelity/status/authority/unsupported-claim failure | DS-010 `#hard-gates`, `#fidelity`; SPEC `#proof-cases` | Independent source-fidelity review against pinned Case snapshots and trace | C1-C6 have scoped local fidelity evidence, but not six independent paired proof packets. **NOT ESTABLISHED for readiness; no known local critical failure.** |
| Complete trace support, omission accounting, and material-unit coverage | DS-010 `#trace-coverage-and-maintenance`; DS-012 `#per-case-evidence` | Candidate trace, selection manifest, trace-coverage and trace-maintenance records | Trace sidecars exist for C1-C6; only C1 has an explicit local mutation inspection. Required per-case proof bundle is incomplete. **NOT ESTABLISHED.** |
| No missed material stale unit across at least three cases | DS-010 `#trace-coverage-and-maintenance`; DS-012 `#trace-mutation-proof` | Controlled mutations covering decision, observation status, gap, requirement, anchor, table row, and visual edge, with every stale unit recorded | C1 covers decision/anchor/table cell; C4 demonstrates later staleness, not the complete controlled matrix. **NOT ESTABLISHED.** |
| Candidate usefulness, concision/value, comprehension, and burden comparison | DS-010 `#concision-and-information-value`, `#reader-comprehension-and-action`, `#author-burden`, `#system-readiness` | Ordinal baseline/candidate comparison, representative-reader responses, and paired burden record using an accepted tolerance | No fair pairs, representative readers, or burden tolerance. Simulations are qualified local comprehension evidence only. **NOT ESTABLISHED.** |
| Rendered Notion and HTML preserve meaning | DS-010 `#presentation`; SPEC `#proof-cases`; DS-012 `#artifact-matrix`, `#safe-publishing-proof` | Rendered targets, inspected navigation/tables/visuals/narrow viewports, and safe-publication/post-publish records where authorized | C4/C6 local HTML inspection is present. No rendered/fetched Notion page exists; C1/C2/C3/C5 target proof is incomplete. **NOT ESTABLISHED.** |
| Bounded, actionable consolidated review findings | DS-010 `#system-readiness`; SPEC `#review` | Source-fidelity, genre/audience, and fresh-reader reports consolidated by semantic issue for each case and across the set | Individual local exercise reviews converge; no complete six-case independent review bundle or cross-case consolidation exists. **NOT ESTABLISHED.** |
| C1-C6 artifact and format/strategy coverage | DS-012 `#artifact-matrix`, `#candidate-cases`, `#source-reuse`; SPEC `#proof-cases` | Six Case-backed candidates, required strategy combinations, required Markdown/Notion/HTML outputs, and C6 flagship visuals | All adapters have local exercise artifacts, but the evidence reuses one fixture/local instructions rather than DS-012 K1-K5 sources and lacks several required rendered formats. **NOT ESTABLISHED.** |
| Controlled Notion create/update and HTML attachment/embed proof | DS-012 `#safe-publishing-proof`; ticket 06 AC 32 | Expressly authorized controlled destination, create/update inspection, child-content safety, attachment/embed, post-publish fetch, and target locators | No destination or permission exists. This is deliberately deferred until local paired gates are ready. **BLOCKED, not waived.** |
| Wrapper delegation only after accepted readiness | SPEC `#migration`; ticket 06 AC 33 | Explicit accepted readiness decision naming the evidence revision, then local wrapper-delegation exercise | Current decision is NEEDS ATTENTION. No wrappers are implemented or migrated. **BLOCKED.** |

## Required Proof Bundle Mapping

DS-010 and DS-012 require each proof case to retain the following evidence. This is a completeness map, not a claim that a missing file should be synthesized from existing prose.

| Proof bundle item | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| Source bundle and approved/pinned Case snapshot | Local fixture evidence | Local fixture evidence | Local fixture evidence | Local fixture evidence | Local fixture evidence | Local fixture/local skill inputs |
| Frozen same-action current-workflow baseline with prompt/version and digest | Weak, action changed | Missing | Missing | Weak, inputs/action changed | Weak, repository revision only | Missing |
| Candidate selection manifest, artifact, and trace | Present | Candidate and trace; no separate readiness bundle | Candidate and trace; no separate readiness bundle | Present across local artifacts | Candidate and trace; no separate readiness bundle | Candidate and trace; no separate readiness bundle |
| Required target representations and rendered inspection | Missing required Notion | Missing required Notion | Missing required HTML | Local HTML only; Notion source unrendered | Missing required HTML | Local HTML only; Notion unrendered |
| Fidelity/genre review | Present | Present, combined local review | Present, combined local review | Present, staged local review | Present, combined local review | Present, staged local review |
| Representative reader comparison | Simulation only | Missing | Missing | Simulation only | Missing | Simulation only |
| Concision/value comparison | Qualitative only | Missing | Missing | Missing | Missing | Missing |
| Author-burden comparison against accepted threshold | Local candidate record only | Missing | Missing | Local candidate record only | Missing | Missing |
| Controlled trace-maintenance mutation evidence | Partial | Missing | Missing | Partial staleness evidence only | Missing | Missing |
| Safe-publish and post-publish verification | Blocked | Missing/blocked | Missing/blocked | Blocked | Missing/blocked | Missing/blocked |
| Per-case readiness decision | Local exercise decision only | Missing | Missing | Local artifact decision only | Missing | Local artifact decision only |

`Present` in this table means an inspectable local exercise artifact exists. It does not mean the item satisfies the corresponding DS-010 paired-proof requirement.

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

## Stage 1 HITL Request: Local Pair Gates

Acceptance of readiness is not requested. The minimum decision set needed now is limited to local paired-proof preparation; it does not authorize Notion, publication, wrappers, Git push, or pull requests.

1. **Fair baselines and same actions:** select or approve an honest named exception for each C1-C6 frozen current-workflow baseline. For every selected pair, record source-bundle digest/locator, current-workflow skill/prompt version, output digest, capture time, intended reader, and one identical reader action for baseline and candidate.
2. **Representative readers:** name actual genre-appropriate readers, distinct from artifact authors, and approve their isolated review packet and questions. The packet may expose only the required baseline/candidate materials and action; simulations remain supplemental evidence only.
3. **Burden threshold:** set the practical comparison rule before execution: acceptable interruption and question pattern, treatment of repeated source-fidelity repair, and an acceptable coarse active-author-time category for both paths.
4. **Mutation plan:** approve at least three named cases and a controlled mutation matrix covering decision, observation status, gap resolution, requirement, anchor, table row, and visual edge. Record expected affected units, expected non-affected units, and whether overflagging is acceptable maintenance cost.
5. **C3/C5 scope choice:** select a real or controlled implementation slice for C3 and C5, their same-action baseline candidates, and their intended review audience. A repository commit alone is not sufficient.

After these Stage 1 inputs are supplied, build the paired local proof bundles, run independent source-fidelity and genre/audience review, collect representative-reader and burden evidence, execute approved mutations, and record a fresh C1-C6 decision matrix. A hard-gate failure remains a blocker and must not be averaged into a score.

## Stage 2 HITL Request: Controlled Notion Proof

Request this only after Stage 1 local pair gates are ready to exercise and the artifacts have no unresolved local semantic or trace blocker. It is a separate permission, not a prerequisite for selecting baselines or readers.

1. Name a controlled private/test Notion destination and the exact permitted action for each proof artifact: create, update, or both.
2. Confirm permission to fetch existing content before any update and to inspect child-content safety, attachment/embed behavior, rendered output, and final target locators after the allowed action.
3. Confirm whether the HTML attachment/embed proof may use the same controlled destination and which native searchable summary is required.

Without this Stage 2 authorization, rendered-Notion, controlled publication, and post-publish gates remain **BLOCKED**. Local pair evidence may proceed, but it cannot be reported as satisfying those gates.

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
