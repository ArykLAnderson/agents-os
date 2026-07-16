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

Ask exactly one unresolved material question per turn. Each question must include:

1. the bounded decision to make;
2. a recommended answer grounded in recovered context;
3. the key reason or trade-off;
4. an invitation to confirm, modify, or reject the recommendation.

Wait for the answer before continuing. If the answer exposes a different unresolved material question, record the first answer before asking the next. Do not batch a checklist, ask generic document-approval questions, or turn mechanical publication into a permission prompt.

Before a material proposal-body refresh, add a clearly marked `Clarification` or `Material change` comment with author, date, what changed, why, and relevant locators. Then mechanically refresh only `Proposal — not accepted` and `Current state`. A clarification is not a Decision, and proposal edits never mutate accepted sections.

Continue until the proposed Feature outcome, boundaries, and outcome-level acceptance are coherent and no known material intent question remains. Do not design or propose the Work Item graph during this stage.

### 6. Obtain and record intent acceptance

Present the aligned intent concisely, with accepted state and the still-proposed candidate visibly distinguished. Ask one final bounded semantic question: whether the named human accepts this exact Feature intent. Include your recommendation and material trade-off. This is acceptance of Feature intent only, not acceptance of a specification, decomposition, Work Item graph, implementation dispatch, or publication outside the configured tracker.

Do not infer the decision-maker's personal name from a handle or agent identity. If a human name is not already established, ask for it as the one unresolved question before recording acceptance.

On explicit acceptance:

1. Post a comment headed `## Decision — Feature intent` using the canonical Decision form. Name the human, date, exact question and choice, rationale, affected Atlas/Map/Feature IDs and locators, consequences, and next step.
2. Only after the Decision comment succeeds, mechanically refresh the Feature body: set intent status to accepted; place only the accepted outcome, boundaries, and acceptance in `Accepted intent`; preserve any unaccepted material under `Proposal — not accepted`; keep `Accepted Work Item graph` as `None accepted`; and set the current next action to specification/decomposition handoff.
3. Mechanically refresh affected hierarchy navigation/current-state text when needed, without representing the edit as semantic acceptance.
4. Re-read the rendered bodies and latest comments to confirm identity, ownership, accepted/proposed separation, Decision ordering, and next action.

If comment creation fails, do not update accepted body state. If a later body refresh fails, report the Decision locator and the stale body explicitly; do not repost or fabricate acceptance.

The original shaping invocation authorizes creation and maintenance of proposed/shaping Issues in the already configured tracker. The named-human intent Decision authorizes its mechanical accepted-body refresh. Do not ask again for these routine operations. Ask separately before publishing anywhere else, transferring canonical authority, or changing an understood-private destination to public.

### 7. Hand off and stop

Return a concise handoff containing:

- Atlas, current Index Segment, Map, and Feature IDs with canonical locators;
- the Feature intent status and named Decision locator, if accepted;
- the recovered current state;
- unresolved material intent questions, if any;
- the exact next action.

After intent acceptance, the next action is specification and decomposition acceptance through the owning follow-on workflow. Stop here. Do not silently produce or publish a decomposition, create/update Work Item Issues, or treat intent acceptance as decomposition authority.
