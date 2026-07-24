# Ephemeral Session And Candidate State

Route has no durable accepted identity, resumable planning record, or stable local ID namespace. A Route session is disposable interaction state over exact accepted Blueprint bindings and observed terrain.

A session may hold temporary notes, candidate presentations, comparison tables, and local labels while the interaction is active. Treat all of them as non-authoritative and disposable:

- do not create `routes/<id>/route.md`, a Route status, or an accepted Route revision;
- do not allocate stable Feature, Leg, or Work Item identity;
- do not require a later consumer to recover the session;
- do not publish proposed Map/Feature/Work Item semantics before exact Map acceptance;
- do not treat a transcript or cached candidate as acceptance authority.

A candidate presentation should carry a session-local candidate identifier and presentation revision only so the exact bytes under review can be distinguished. Local labels may be reused in a later, separately presented candidate and never become Atlas identity by implication.

If the session is cancelled or the Acceptance Package is lost before the Map Decision is recorded, no durable accepted plan exists. Reopen from the exact accepted Blueprints and current terrain. Re-present only when the fixed candidate, bound question/response, authority provenance, destination, or preflight conditions cannot all be reconstructed and verified. While the active session retains a complete valid Acceptance Package, publication and idempotent recovery proceed from it without asking again.

After an Atlas Map Decision exists, the Decision—not Route state—is recovery authority. Publication resumes from the Decision and Publisher receipt. Later semantic change uses a complete successor candidate under the Map's stable identity; it never edits an old Decision or revives a durable Route candidate.
