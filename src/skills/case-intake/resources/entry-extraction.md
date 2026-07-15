# Case Entry Extraction

Normalize registered source content into a working Case ledger after source registration. This phase creates candidate semantic entries and explicit gaps. It does not create `SNAP-001` or adopt binding meaning without the author.

## Entry Shape

Use one atomic statement per entry in the Case `# Entries` section:

```markdown
### OBS-001: <short lookup label>

- **Statement:** <one declarative assertion>
- **Status:** <type-controlled status>
- **Provenance:** <canonical provenance>
- **Sources:** <SRC-### / narrow locator, or none: author-origin reason>
- **Confidence:** <low, medium, or high only when uncertain>
- **Relations:** <controlled relation and entry ID, when applicable>
```

IDs use a core-type prefix and immutable sequential number. Keep the ID when a label or statement receives a non-semantic correction. Do not store source passages, transcript summaries, document sections, or reader-facing prose as entries.

## Controlled Types And Statuses

Use only these core types. Prefer a namespaced `Subtype` to a new top-level type.

| Type | Use for | Allowed statuses during intake |
|---|---|---|
| `OBS` | Supported source, code, metric, inferred, or synthesized observation | current, historical, disputed, superseded |
| `INT` | Attributable desired outcome or purpose | proposed, accepted, superseded |
| `DEC` | Author- or delegated-authority accepted choice | accepted, superseded, revoked |
| `REQ` | Reviewable behavior, quality, or condition | proposed, accepted, satisfied, superseded |
| `CON` | External or chosen boundary | proposed, active, expired, superseded |
| `ALT` | Considered option that is not the accepted decision | considered, preferred, rejected, superseded |
| `RISK` | Possible negative outcome | open, accepted, mitigated, realized, closed |
| `ASM` | Belief used despite incomplete support | active, validated, invalidated, superseded |
| `GAP` | Missing information, ambiguity, contradiction, or unresolved question | open, blocked, resolved, wont-resolve |
| `ACT` | Work with an owner or explicit unknown owner | open, blocked, done, canceled |
| `VIS` | Communicative visual candidate | candidate, accepted, produced, rejected, superseded |

Use only these relations when a relation is needed: `supports`, `contradicts`, `derived-from`, `answers`, `resolves`, `supersedes`, `depends-on`, `mitigates`, `implements`, `selects`, `motivates`, and `visualizes`.

## Provenance And Authority

Every semantic entry uses exactly one canonical provenance value:

| Provenance | Use when |
|---|---|
| `source-direct` | The entry restates explicit source content without material interpretation. |
| `source-quoted` | Exact wording or attribution is independently material. |
| `agent-inferred` | A bounded inference follows from source content. |
| `agent-synthesized` | The entry combines multiple supported sources or entries. |
| `author-stated` | The author supplied the content directly. |
| `author-approved` | The author explicitly accepted or corrected proposed content. |

Only `author-stated`, `author-approved`, or explicitly declared delegated authority may produce an accepted `DEC`. A source-reported historical decision is an `OBS` until the author adopts it. A preferred meeting proposal remains an `ALT` or other proposed entry. Do not treat agent agreement as authority.

Use `Confidence` only for uncertain support, interpretation, or attribution. Source reliability remains on the `SRC` record and never substitutes for entry confidence or authority.

## Source-Sensitive Normalization

- Current author conversation: direct choices may be `INT`, `DEC`, `REQ`, or `CON` with `author-stated` provenance. Author uncertainty becomes `GAP`, `ASM`, `RISK`, or proposed `ALT`.
- Attributed transcript: preserve material wording as `OBS` with `source-quoted` provenance and timestamp locator. Participant claims do not become accepted decisions.
- Weak transcript: use unknown or limited attribution, reduce confidence when material, and create a `GAP` when authority or attribution blocks interpretation.
- Existing document or ticket: preserve claims as `OBS`, proposed `REQ`, `ALT`, or other non-binding candidates. Historical decisions remain observations. Stale guidance remains historical until reaffirmed.
- Code: record implemented behavior as `OBS`, not desired behavior. Preserve the supplied symbol, schema, diff, or commit locator.
- Metrics: record measured results as `OBS` with the dashboard, query, range, or revision locator.
- Unsupported benefit: normalize a claimed benefit to an `INT` when it is a desired outcome, or an `ASM` when it is an unverified belief. Never create a measured `OBS` without measurement support.
- Inaccessible source: do not infer content. Create a `GAP` only when the missing content affects the declared purpose or proposed binding content.

## Gaps And Contradictions

Create explicit `GAP` entries for material missing purpose, authority, attribution, owner, evidence, dependency, metric definition, stale guidance, unsupported benefit, or contradictory claims. Link a contradiction to every conflicting entry with `contradicts`; do not silently select the newest or most convenient claim.

Use a narrow source locator for each support reference: heading, timestamp range, block URL, ticket comment, code symbol, metric panel, quoted snippet, or semantic anchor. Use `unknown` instead of inventing a locator or value.

## Governed Custom Types

Do not use an undeclared custom top-level type. First declare it in `# Type Extensions` with an `EXT-###` entry containing:

- `Status`, including lifecycle or promotion status
- `Scope`
- `Semantics`
- `Why core types are insufficient`
- `Owner`
- `Introduced`
- `Example`
- `Promotion evidence`

An extension cannot redefine common fields, provenance, authority, or core-type status rules. Model-local and skill-local types do not propagate automatically.

## Boundary

- Do not create a snapshot.
- Do not silently accept decisions, requirements, constraints, source authority, or synthesized guidance.
- Do not collapse several assertions into one entry because they share a source passage.
- Do not add document composition, narrative summaries, formatting, publication, or reconciliation behavior.
