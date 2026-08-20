# Claim status

Use these labels for operational statements. They describe how a statement is supported. They do not replace Casebook knowledge classifications, design-claim states, document status, Atlas acceptance, or human authority.

| Status | Use when | Required support |
| --- | --- | --- |
| `observed` | The statement reports source, command output, provider state, or a rendered surface that was directly inspected. | Source locator or exact observation with current identity. |
| `inferred` | The statement follows from observations but was not directly exercised or confirmed. | Supporting observations and the reasoning limit. |
| `implemented` | The candidate contains the stated change. | Candidate identity and changed source or diff. |
| `verified` | The declared behavior was exercised against the current candidate through a relevant interface. | Exact command or direct observation, full result, and candidate identity. |
| `authority-accepted` | A named owner or governing system accepted a decision, scope, or effect. | Owner, accepted revision or provider state, and acceptance provenance. |
| `blocked` | A required observation or action cannot be completed because a named condition is missing. | Exact missing authority, dependency, environment, access, or evidence. |
| `invalidated` | Earlier evidence no longer supports the claim after a material change or discovered contradiction. | Prior evidence locator and the change or fact that invalidated it. |

## Usage

Label a claim when its evidence kind could otherwise be mistaken. Do not prefix every sentence.

One statement may need more than one status during delivery. For example, a change can be `implemented` but not `verified`. An accepted design can be `authority-accepted` while its feasibility remains `inferred`. Keep those facts separate.

Do not promote status through wording. Only new evidence or acceptance changes the status. After a relevant candidate, environment, dependency, design, or boundary change, reassess the evidence before reusing it.
