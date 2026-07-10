# Report Structure

The report is a guided descent from product outcome to implementation detail.

Do not mirror the repository tree. Do not begin with package names, migrations, or interfaces.

## Opening: orient the reader

The first viewport should answer:

- What changed?
- Why does it matter?
- What is the strongest proof?
- What remains incomplete?
- Is there a decision the reader needs to make?

Recommended elements:

- specific title, not “Implementation Report” alone
- one-sentence outcome
- status ledger separated by platform/evidence type
- short architectural thesis
- explicit founder/product decision when relevant

Avoid a wall of metadata before the result.

## Executive result

Explain the user-visible capability in plain language.

Use 3–5 proof points such as:

- starts from real persisted state
- crosses the intended module boundary
- preserves server/client authority
- behaves on a real device
- cleans up owned infrastructure

Each proof point should link forward to evidence or technical explanation.

## User-visible evidence

Screenshots should form a sequence, not a gallery.

Caption order:

1. What the user sees or does
2. What state changed
3. What the image proves technically
4. What it does not prove, if ambiguity is likely

Do not make the first sentence of every screenshot caption about API URLs, provider versions, or test IDs.

## Scope boundary

Show three categories:

- shipped now
- deliberately absent
- enabled next

Name follow-up issues or milestones when available. Make the hard stop unmistakable; for example, local choice selection does not imply response submission.

## Mental model

Introduce canonical domain terms before internal implementation.

Good mental models explain separations such as:

- learner state → plan → generated lesson → persisted artifact → playable response
- command → event → projection
- source object → normalized model → rendered output

Include a terminology-trap table when common words have project-specific meanings.

## System flow

Explain one representative request or action end to end.

For each step, identify:

- owner
- input
- output
- invariant
- failure boundary

The reader should understand where trust and policy change hands.

## Internal architecture

Only after the mental model and system flow, explain:

- application coordinator
- domain functions
- interfaces/ports
- concrete adapters
- persistence and transaction owner
- client components
- lifecycle manager

Prefer “follow the data” over “here are the folders.”

## Persistence, trust, and lifecycle

Use this section when the feature’s durability or authority matters.

Explain:

- what each table/entity owns
- what is relational versus document-shaped
- what is immutable and by which mechanism
- what remains server-only
- how identity and provenance survive transformations
- who creates, resumes, expires, or tears down state

Avoid making general retention or security claims from a narrow implementation mechanism.

## Verification matrix

Use a matrix with:

- layer
- evidence
- what it proves
- what it does not prove

Separate:

- type/build verification
- unit/contract tests
- integration tests
- native/browser automation
- manual observation
- platform gaps
- deployed-environment status

## Risks and next decisions

A useful risk entry contains:

- impact
- evidence status or confidence
- concrete issue
- consequence
- recommended owner/action

Do not label an unvalidated platform “high confidence.” Keep impact and evidence confidence as separate dimensions.

End with the next product or architecture decision—not merely a list of files changed.

## Glossary

Use when the reader did not design the internals.

Include only terms that materially affect understanding. Define project-specific meanings and what the term does not mean when ambiguity is likely.

## Evidence index

Group paths by purpose:

- canonical requirements
- contracts
- implementation
- persistence/API
- client/UI
- harness/runtime evidence
- CI/PR links

Use wrapping styles for long paths on mobile.

## Suggested length

### Standard

- 7–10 major sections
- 2–3 diagrams
- 0–3 screenshots
- 10–20 minute reading time
- concise glossary only when needed

### Showcase

- 10–15 major sections
- 3–6 diagrams
- 3–6 screenshots or state captures
- 20–40 minute guided reading time
- detailed evidence index and risks

Length is not quality. Remove any section that does not improve a decision, explain a boundary, or support a claim.
