<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Shape a Feature in the configured canonical tracker.

$ARGUMENTS

## Scope

This entry point creates or resumes the canonical Feature Atlas hierarchy and aligns one Feature's intent. It ends after intent alignment and the accepted current-state refresh.

Do not accept or publish a decomposition, create Work Item Issues, dispatch implementation, run reconciliation or cross-map workflows, migrate legacy records, or change a global/default route. Leave existing legacy routes available.

## Instructions

### 1. Load the representation and tracker rules

Read the `feature-atlas` skill and its canonical Issue representations. Follow the instructions for the already configured canonical tracker; when that tracker is private GitHub Issues, follow `configured-private-github.md` exactly.

Treat `$ARGUMENTS` and the current conversation as routing and shaping input, not as a second canonical store. Use Feature Atlas terms (`Feature Atlas`, `Atlas Index Segment`, `Feature Map`, `Feature`, and `Work Item`) for new records.

Before any mutation, establish the exact configured destination and its required visibility. Never infer the tracker from the current Git remote or create a destination for convenience. Stop without publishing when the destination, canonical authority, requested visibility, stable identity, or ownership is missing, conflicting, or ambiguous. Ask at most one bounded routing/setup question at a time.

### 2. Recover before creating

Search the configured tracker across open and closed records and historical comments for every supplied or candidate stable ID. Read the complete body and historical comments of each relevant Atlas, current Index Segment, Map, and Feature Issue; follow their canonical owner and current-segment locators rather than assuming native tracker relationships define ownership.

Recover:

- the one canonical Atlas and configured source;
- its one current `atlas-current` Index Segment;
- the Feature Map's Atlas owner and current direction;
- the Feature's Map owner, accepted intent, current proposal, lifecycle/attention, governing links, and next action;
- all named-human Decisions, clarifications, material changes, and correction comments relevant to current intent.

Only a clearly marked Decision comment naming a human grants semantic authority. Do not infer acceptance from an Issue body, label, status, link, native relationship, agent summary, silence, or prior chat. If the body and history disagree and the authoritative state cannot be recovered, stop and ask one bounded question instead of repairing or choosing a history.

Resume the single matching canonical Issue when identity and ownership agree. Never duplicate it. Before allocating a missing ID, follow the Atlas-scoped search and collision rules in the representation guidance, including the immediate pre-create search. Stop on a collision, conflicting claim, ambiguous result, multiple current Index Segments, or uncertain owner.

### 3. Create only the missing shaping hierarchy

If any hierarchy record is missing and the destination, existing identities, and owners are unambiguous, allocate as required and create only the missing records needed for the requested Atlas → Map → Feature hierarchy, from the owner downward:

1. canonical Atlas root, when absent;
2. its first bounded Atlas Index Segment, marked `atlas-current`, when absent;
3. the canonical Feature Map owned directly by the Atlas, when absent;
4. the canonical Feature owned by the Map.

Use the canonical body representations. The Index Segment is navigation only and never owns the Map. Record stable owner IDs and canonical owner locators explicitly, replace pending self-locators after creation, and use native relationships only as optional navigation.

Creation starts a proposed/shaping lifecycle; it does not accept intent. A new Feature body must show:

- `Intent status` as `Proposed`;
- `Accepted intent` as `None — shaping is in progress.`;
- `Accepted Work Item graph` as `None accepted.`;
- the working intent only under `Proposal — not accepted`;
- a `Current state` that names the next unresolved intent question.

Do not invent missing Atlas purpose, Map destination, Feature outcome, or ownership to fill a template. If one is required and unresolved, stop before the affected creation and ask one bounded question.

### 4. Recover the next material intent question

Build a concise working view from accepted body state plus historical comments. Distinguish:

- accepted intent that is already authoritative;
- the current proposal, which remains non-authoritative;
- rejected, superseded, or corrected proposals;
- the next unresolved material question.

Investigate available tracker history, governing links, project context, and code before asking. Do not re-ask anything already answered by an applicable named-human Decision or by discoverable fact.

For this stage, a question is material only when its answer changes the Feature's intended outcome, actor or need, in/out boundaries, observable acceptance, governing constraint, material dependency, or risk posture. Formatting, title wording, labels, self-locators, and routine tracker mechanics are not shaping questions.

### 5. Shape one decision at a time

Do not infer a decision-maker's personal name from a handle or agent identity. Establish the human's name before asking the first material choice. If a material answer arrives before the name is established, preserve the answer, ask only for the name, and do not refresh the body until the named-human Decision comment has been posted.

Ask exactly one unresolved material question per turn. Each question must include:

1. the bounded decision to make;
2. a recommended answer grounded in recovered context;
3. the key reason or trade-off;
4. an invitation to confirm, modify, investigate, defer, or decline.

Wait for the answer before continuing. Every answered material choice is authoritative history, including a confirmation, modification, request to investigate, deferral, or decline. Before any body edit derived from that answer, post a self-contained `## Decision — <material subject>` comment using the canonical Decision form. Name the human and date; state the exact question and choice, the rationale, affected IDs and canonical locators, consequences for the proposal, and the next step. Use the returned comment locator in the refreshed proposal/current state or governing links so a resumed agent can recover the choice without prior chat. If posting the Decision fails, do not refresh the body, ask the next material question, or imply that the choice was recorded.

After the Decision comment succeeds, handle its choice explicitly:

- **Confirm or modify:** mechanically refresh `Proposal — not accepted`, `Current state`, `Lifecycle / attention`, and relevant governing Decision links. Keep accepted sections unchanged. Set the next action to the next unresolved material question, or to final intent acceptance when none remains.
- **Investigate:** record what must be learned and the return condition without inventing an owner or evidence. Set lifecycle/attention to investigation and the next action to that bounded investigation. If the missing evidence blocks alignment, stop shaping; on resumption, record newly discovered non-decision facts before returning to proposed/shaping.
- **Defer:** set lifecycle/attention to deferred, identify the stated resume trigger and next action, and stop shaping. Do not convert deferral into rejection or acceptance.
- **Decline:** do not imply acceptance. If this is an amendment to already accepted intent, leave accepted state untouched, withdraw the current proposal from operative state, link the decline Decision, and restore the accepted Feature's appropriate lifecycle/next action. If the Feature has no accepted intent, preserve the Issue and Decision history, mark the proposal/lifecycle/current state as declined with no authorized next delivery action, and close the Feature Issue when that is the configured tracker's appropriate representation. Never delete the Issue or close its owner hierarchy merely because the Feature proposal was declined.

Treat an answer that rejects the recommendation but supplies a replacement as a modification, not as a declined Feature proposal. If the answer exposes a different unresolved material question, record and mechanically apply the first Decision before asking the next. Do not batch a checklist, ask generic document-approval questions, or turn mechanical publication into a permission prompt.

Use `Clarification` and `Material change` comments only for non-decision facts such as discovered evidence, external changes, or corrections. They cannot record, replace, or summarize a human's answered material choice. Post the applicable non-decision comment before a body refresh caused by such a fact. Proposal edits never mutate accepted sections.

Continue only while the lifecycle permits shaping. When the proposed Feature outcome, boundaries, and outcome-level acceptance are coherent and no known material intent question remains, proceed to final intent acceptance. Do not design or propose the Work Item graph during this stage.

### 6. Obtain and record intent acceptance

Present the aligned intent concisely, with accepted state and the still-proposed candidate visibly distinguished. Ask one final bounded semantic question: whether the named human accepts this exact Feature intent. Include your recommendation and material trade-off, and allow confirm, modify, investigate, defer, or decline. This is acceptance of Feature intent only, not acceptance of a specification, decomposition, Work Item graph, implementation dispatch, or publication outside the configured tracker.

Final intent acceptance is a separate Decision from every shaping choice. Only an unqualified confirmation of the exact presented intent is acceptance. On that explicit acceptance:

1. Post a comment headed `## Decision — Feature intent` using the canonical Decision form. Name the human, date, exact accepted intent question and choice, rationale, affected Atlas/Map/Feature IDs and locators, consequences, and next step.
2. Only after the Decision comment succeeds, mechanically refresh the Feature body: set intent status to accepted; place only the accepted outcome, boundaries, and acceptance in `Accepted intent`; preserve any unaccepted material under `Proposal — not accepted`; keep `Accepted Work Item graph` as `None accepted`; set lifecycle/attention appropriately; link the acceptance Decision; and set the current next action to specification/decomposition handoff.
3. Mechanically refresh affected hierarchy navigation/current-state text when needed, without representing the edit as semantic acceptance.
4. Re-read the rendered bodies and latest comments to confirm identity, ownership, accepted/proposed separation, Decision ordering, lifecycle/attention, and next action.

For any other answer to the final question, first post a separate named-human `## Decision — Feature intent disposition` comment, then apply the corresponding Section 5 rule to the proposal, lifecycle/attention, Decision links, and next action. A modification returns to shaping with the revised proposal still unaccepted. Investigation or deferral sets the corresponding blocking lifecycle/attention and next action, then stops. Decline follows the preserve-and-close or amendment-withdrawal rules above and never creates a Feature-intent acceptance Decision.

If Decision comment creation fails, do not update body state. If a later body refresh or close fails, report the Decision locator and the stale body or Issue state explicitly; do not repost, fabricate acceptance, or continue as though the lifecycle changed.

The original shaping invocation authorizes creation and maintenance of proposed/shaping Issues in the already configured tracker. Each named-human shaping Decision authorizes its described mechanical proposal/current-state refresh; the named-human intent acceptance Decision authorizes the accepted-body refresh. Do not ask again for these routine operations. Ask separately before publishing anywhere else, transferring canonical authority, or changing an understood-private destination to public.

### 7. Hand off and stop

Return a concise handoff containing:

- Atlas, current Index Segment, Map, and Feature IDs with canonical locators;
- the Feature intent status, lifecycle/attention, latest shaping or disposition Decision locator, and intent-acceptance Decision locator if accepted;
- the recovered current state;
- unresolved material intent questions or blocking investigation/deferral trigger, if any;
- the exact next action.

After intent acceptance, the next action is specification and decomposition acceptance through the owning follow-on workflow. Stop here. Do not silently produce or publish a decomposition, create/update Work Item Issues, or treat intent acceptance as decomposition authority.
