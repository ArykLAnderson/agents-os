# Map Acceptance And Recoverable Publication

## Exact Trusted Human Decision

Only an unqualified confirmation of the exact complete candidate whose latest inspection passed can produce an Acceptance Package. Verify the human's identity and bounded authority for this exact Blueprint/Map decision through the configured trusted Atlas authority context/provenance. A name, handle, affirmative sentence, reviewer consensus, Issue state, or agent-written `Decision` text is insufficient.

The Acceptance Package contains the fixed complete presentation or an immutable lossless locator, candidate-local identifier/revision, verified human/provenance/date, bounded question and choice, rationale, affected proposed/existing Map, exact Blueprint bindings, expected predecessor Decision, and explicit implementation/effect non-authority.

Externally stored snapshots require a Decision-contained cryptographic binding over canonically defined bytes and content type. The locator must be immutable, versioned, durable, audience-compatible, and recoverable for accepted-history lifetime. Recording, recovery, and handoff retrieve and verify the binding. Inline immutable Decision content needs no universal digest.

Any qualification, change, unresolved question, unknown acyclicity, failed authority verification, stale predecessor, visibility mismatch, or material drift is a disposition—not acceptance. If acceptance was spoken but not durably recorded, recover fixed bytes only as input, recheck staleness, re-present the complete bounded question, and obtain fresh attributable unqualified confirmation in the recording interaction.

## Sole Durable Planning Authority

Record a clearly headed `Decision — Map candidate` in the configured Feature Atlas. This immutable Map Decision is semantic planning authority. It contains or losslessly references the complete accepted candidate, names its Blueprint bindings and predecessor when applicable, preserves trusted acceptance provenance, states whether it is current/superseding, and declares that implementation/effects remain unauthorized.

For a new Map, the Publisher may create the minimum identity shell needed to host the Decision, but it must say `no accepted candidate` and expose no proposed semantics. If Decision recording fails, the shell remains non-authoritative and publication stops. No Feature/Leg/Work Item accepted projection starts before the Decision succeeds.

Exactly one accepted Map Decision is current. Prior Decisions remain immutable and visible with successor/invalidation reason. Current bodies and child records are readable mechanical projections; during partial publication they may be incomplete or stale but must not contradict the Decision.

## Narrow Publisher Boundary

The Publisher receives one exact Acceptance Package and a configured private Atlas. It owns only:

1. preflight of destination/visibility, Atlas identity, acceptance provenance, external content binding, exact Blueprint bindings, expected predecessor, provider Decisions, existing owner chains, collisions, and access compatibility;
2. exhaustive find-before-create and tentative stable-ID allocation;
3. immutable Map Decision recording;
4. durable binding of `(Map Decision, candidate-local label)` to Feature and Work Item IDs after successful create/reuse plus reread;
5. Feature-contained Leg projection, two-pass child creation/locator resolution, and Map refresh last;
6. rendered reread, exact Decision comparison, receipts, inspection, and idempotent partial recovery.

The Publisher does not shape, review, accept, amend, infer semantic equivalence, choose a successor, resolve architecture, observe arbitrary live facts, dispatch implementation, change destination visibility, or perform source/deployment/runtime effects.

A raced ID remains tentative until a successful create/reuse plus reread establishes its binding; on collision, reread exhaustively and select another unused ID. Once established, a binding is durable and every retry reuses it. Semantic/owner conflict or duplicate durable binding stops; never overwrite, merge, recycle, or silently remap.

Publication order is Decision → identities/children → locator/dependency completion → Feature projections → Map projection/index navigation → reread. Non-transactional failure returns a truthful partial receipt naming the Decision, successful locators, failed operation, stale/pending projections, and safe resume action. Do not repost the Decision, delete successful records, roll IDs back, or create replacements to conceal partial state. After uncertain mutation, search/reread before retry.

A merely newer Blueprint/provider revision does not silently rebind exact accepted meaning; expose impact and suppress affected readiness until evaluated. Changed/unresolvable exact authority, changed expected predecessor before Decision, owner/identity conflict, contradictory accepted content, or unverifiable external snapshot stops recording/projection. The Publisher never chooses the semantic repair.

## Provider Capability Gate

Publication is unsupported until the configured provider has proven, in a separately authorized bounded prototype, trusted actor/authority provenance, immutable/versioned external snapshot retention and content-binding verification when used, exhaustive identity search, append-only accepted history/current projection behavior, and uncertain-write recovery. Failure stops realization; do not weaken exact acceptance or invent fallback storage inside Route/Publisher.
