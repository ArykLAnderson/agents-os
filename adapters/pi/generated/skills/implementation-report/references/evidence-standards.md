# Evidence Standards

The report is an argument supported by inspectable evidence, not a decorated summary.

## Evidence hierarchy

Prefer evidence in this order:

1. **Direct preserved runtime evidence** — test result, screenshot, API response, database query, lifecycle receipt, browser/device observation.
2. **Revision-matched CI evidence** — successful job URL tied to the exact commit.
3. **Targeted local command output** — rerun against the exact implementation revision.
4. **Implementation evidence** — source code and schema relationships inspected directly.
5. **Canonical requirements** — specifications and ADRs explain intent, not proof of behavior.
6. **Inference** — useful architectural interpretation that must be labeled as inference.

A screenshot can prove visible state. It does not prove persistence, authorization, evaluation, teardown, accessibility, or another platform.

A test name can suggest intent. Preserve the result and inspect what the test actually crosses before citing it.

## Claim statuses

Use consistent language and presentation:

| Status | Meaning | Example wording |
| --- | --- | --- |
| `verified` | Machine evidence was inspected and matched the exact revision. | “The merged commit’s integration job passed.” |
| `observed` | The reporter directly saw the behavior in a manual run. | “On Android, choices appeared after playback was requested.” |
| `inferred` | Code or architecture supports the statement, but it was not executed here. | “The adapter is designed to reject unmatched targets.” |
| `unverified` | The claim was attempted or considered but remains unproven. | “Native iOS E2E remains unverified on this host.” |
| `future` | Deferred or recommended behavior. | “Issue #116 is expected to add resume selection.” |

Avoid collapsing these into a single “passed” badge.

## Evidence manifest

Create one entry per decision-relevant claim. Use the bundled JSON template.

Recommended fields:

- `id`: stable short identifier
- `claim`: reader-facing statement
- `status`: one of the statuses above
- `implementationSources`: relevant source paths and line ranges when useful
- `runtimeEvidence`: local evidence paths or CI URLs
- `limitations`: what the evidence does not prove
- `reportSections`: where the claim appears

The manifest is a working control surface. Publish it only if it is sanitized and useful to the reader.

## Freshness

Evidence should match the implementation commit in the report.

Accept older evidence only when:

- the relevant code did not change, and
- the report says that evidence was reused rather than freshly observed.

When rerunning verification, preserve the command, date, exit status, and concise output. Do not invent command results from memory.

## Manual E2E evidence

A manual E2E claim should record:

- implementation commit
- platform/device/runtime
- entry path
- controlled synthetics or fixtures and where they enter
- visible states captured
- backend or persistence assertions, when claimed
- teardown result, when the run owned infrastructure
- limitations and untested branches

Use the actual app/product interface. If a harness supplies final display data directly to the client, call it a display fixture rather than full product-path E2E.

## Sanitization

Before publishing, remove or replace:

- tokens, cookies, session headers, passwords, and environment secrets
- learner/customer identifiers
- private URLs and credentials embedded in connection strings
- absolute home-directory paths unless essential and approved
- device UUIDs when they add no value
- raw logs containing unrelated environment details
- model prompts or proprietary content not needed as evidence

Prefer a small sanitized summary artifact over a massive log dump. Preserve enough detail that a reviewer can understand what was run and why it supports the claim.

## Negative evidence and gaps

Failed and blocked runs are useful evidence. Preserve:

- the attempted command or workflow
- the exact relevant failure
- the environment/tool version
- the boundary reached
- the next action required

State whether the failure indicates:

- an implementation defect
- a test environment defect
- missing infrastructure
- a platform confidence gap
- an intentionally blocked path

Do not transform “blocked by environment” into a pass. Do not transform it into an implementation failure without evidence either.

## Evidence links

Use relative links for local report evidence. Use stable CI/PR URLs for external evidence.

An evidence index should make it possible to answer:

- Which commit is this about?
- Where is the implementation?
- What was executed?
- What was observed manually?
- What remains unverified?
- Which canonical requirement defined the expected boundary?
