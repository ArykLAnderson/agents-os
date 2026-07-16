<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Shape a Feature in the configured canonical tracker.

$ARGUMENTS

## Scope

This entry point creates or resumes the canonical Feature Atlas hierarchy, aligns one Feature's intent, and—after intent acceptance—carries that same Feature through durable specification, active review of a Feature-native tracer-bullet Work Item graph, a distinct named-human decomposition Decision, and mechanical publication of the accepted current state.

Do not dispatch implementation, amend an already accepted graph through reconciliation, create repositories or a live tracer hierarchy for rollout validation, run delivery, reconciliation, cross-map, visual-authoring, or legacy-migration workflows, or change a global/default route. Leave existing legacy routes available.

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

### 7. Enter specification and decomposition only from accepted intent

Continue in this workflow when the Feature has an authoritative named-human intent-acceptance Decision, `Intent status` is `Accepted`, and no lifecycle block prevents planning. Re-read the accepted intent and its Decision before deriving anything.

If the Issue already has an accepted Work Item graph, do not silently replace or extend it. When the recovered decomposition Decision, complete accepted Work Item briefs, and graph agree, repair only incomplete mechanical publication as described below or hand off the already accepted state. When they differ, or when the requested work would amend accepted intent or graph, stop and route to the owning reconciliation workflow; amendment is outside this shaping path.

### 8. Prepare the durable Feature specification

Read and apply the reasoning in the `to-spec` skill without invoking a second publication workflow or creating a separate source of authority. Explore the relevant repositories and governing links; use the domain glossary, applicable architecture decisions, established interfaces, and existing behavioral test seams. Synthesize what is already known rather than restarting discovery.

Prepare a proportionate specification inside the Feature Issue's `Proposal — not accepted` section. Keep the already accepted outcome, boundaries, and outcome-level acceptance unchanged. Include:

- problem and user-facing solution;
- sufficient numbered user stories to cover the accepted behavior and boundaries;
- durable implementation decisions expressed through stable modules, interfaces, contracts, or routes rather than brittle file checklists;
- testing decisions focused on external behavior, the deepest practical existing seams, and relevant prior art;
- explicit out-of-scope items and material notes or dependencies.

This specification and every proposed Work Item remain non-authoritative. A specification edit cannot mutate `Accepted intent` or `Accepted Work Item graph`. If specification work exposes a material intent change, conflicting domain language, an unresolved architecture choice, or a missing fact that prevents safe decomposition, stop on that ambiguity. Return to the applicable one-question shaping/investigation path and record its named-human Decision before continuing; do not bury the choice inside the specification.

### 9. Propose a Feature-native tracer-bullet Work Item graph

Read and reuse the decomposition reasoning in the `to-tickets` skill, adapted to the already accepted Feature Atlas Feature. Do not emit legacy coordination artifacts or terminology. The accepted Feature itself is the one independently releasable outcome; tracks are optional parallel workstreams, not additional Features or ownership levels.

Decompose into bounded Feature-owned implementation Work Items that:

- prove thin, observable behavior across relevant layers and can land green independently;
- have clear acceptance and fresh-verification expectations derived from the specification;
- are approximately one agent-day where practical and do not depend on unfinished sibling branches;
- use a narrow enabling seam only when a vertical slice cannot safely land first, and name the later tracer-bullet result it blocks;
- use expand–migrate–contract slices only when a wide mechanical change cannot otherwise remain green;
- state role/type (`AFK`/`HITL`), optional track (or `None`), `ready`/`needs-info` attention, estimated S/M/L complexity, current behavior, desired result, stable key interfaces, scope boundaries, direct dependencies, observable acceptance/verification, and implementation verification strategy;
- form an acyclic blocking graph and converge on the accepted Feature outcome.

Do not split the accepted intent into additional Features. If it cannot be decomposed as one independently meaningful outcome, stop because intent/ownership is ambiguous. Do not generate acceptance-test files or dispatch briefs during decomposition.

Use temporary review references such as `Proposed WI A` for missing Work Items; a proposed reference is not a stable ID. Preserve the stable ID and canonical locator of an existing matching Work Item. Allocate any missing stable IDs only during post-Decision publication, after the required tracker searches.

Mechanically refresh the Feature's non-authoritative proposal and current state with the specification, proposed graph, unresolved `needs-info` facts, and the next review action. Post any applicable non-decision fact comment before a refresh caused by discovered evidence. Do not treat this proposal refresh as acceptance or ask permission for the mechanical edit.

### 10. Present the graph for active human review

Present the named human with a concise specification summary and the complete proposed decomposition, visibly labeled **not accepted**. Include:

- each proposed Work Item's review reference, title, and complete brief: role/type, attention, optional track (or `None`), complexity, current behavior, desired result, key interfaces, boundaries, direct dependencies, observable acceptance/verification, and implementation verification strategy;
- a text or ASCII dependency DAG, total Work Item count, ready/needs-info totals, and every missing fact with its downstream effect;
- why the graph is a workable tracer-bullet path for this one Feature, the recommended disposition, and the material trade-off.

Invite the human to confirm, modify, investigate, defer, or decline the exact specification and graph. This is active semantic review, not a publication-permission prompt. Handle a requested modification through the disposition rule below before incorporating it into the non-authoritative proposal and presenting the complete revised graph again; do not infer acceptance from partial feedback, silence, intent acceptance, or prior implementation authority.

Only an unqualified confirmation of the exact presented specification and graph is decomposition acceptance. It requires a separate, self-contained comment headed `## Decision — Feature decomposition`, distinct from the Feature-intent Decision. Name the human and date; state the exact question and choice, rationale, affected Atlas/Map/Feature IDs and locators, a concise accepted-specification summary, the complete accepted brief for every Work Item, every blocking edge, consequences, and the next mechanical publication step. If that comment fails, leave the body and Work Item Issues unchanged and do not imply acceptance.

For modification, investigation, deferral, or decline, first post `## Decision — Feature decomposition disposition` in the canonical Decision form. A modification keeps the revised specification/graph proposed and returns to active review. Investigation or deferral records the missing evidence or resume trigger, updates lifecycle/attention and next action, and stops. Decline leaves accepted intent and any prior accepted graph untouched, withdraws this proposal from operative state, records the next action, and stops. None of these disposition Decisions authorizes Work Item publication.

### 11. Publish the accepted graph mechanically

The `## Decision — Feature decomposition` comment authorizes, without another permission prompt, the Feature body refresh and creation or update of the accepted canonical Work Item Issues in the configured tracker. It does not authorize another destination or implementation dispatch.

Recover before creating. Recheck open and closed Issues and comments for every accepted existing or candidate Work Item identity. Reuse one canonical Work Item when identity, Feature owner, and complete accepted brief agree, or when the decomposition Decision proves that an incomplete body is a partial projection of that same accepted Work Item. Stop on a collision, conflicting claim, ambiguous match, owner mismatch, contradictory brief, or uncertainty about whether an existing Issue represents the accepted Work Item. For each missing Work Item, allocate the next Atlas-scoped ID using the representation guidance and repeat the search immediately before creation.

Publish in a recoverable two-pass sequence:

1. Create or reuse every accepted Work Item Issue with its exact stable Atlas ID; Feature owner ID and canonical Feature locator; accepted lifecycle/attention; role/type; optional track stated as a value or `None`; complexity; current behavior; desired result; stable key interfaces; scope boundaries; dependency IDs; observable acceptance/verification; implementation verification strategy; and decomposition Decision locator. Record every returned canonical Work Item locator. A newly created body may identify a dependency locator as pending only while that dependency Issue is still being created in this same publication pass.
2. Once all Work Item locators are known, re-read and update every accepted Work Item body so it preserves that complete accepted brief, `Scope owner`, `Blocked by`, and `Blocks` contain the exact stable IDs and canonical locators, its current state names the next action, and no pending locator remains.
3. Only after the Work Item bodies are complete, refresh the Feature body. Preserve the accepted outcome, boundaries, and acceptance; move the accepted specification details under subordinate headings in `Accepted intent`, replace `Accepted Work Item graph` with every exact Work Item ID/locator/state/dependency, clear or accurately narrow `Proposal — not accepted`, link both intent and decomposition Decisions, and set lifecycle/attention and the exact next action.
4. Refresh affected Map/Index navigation only where current operable text requires it. Re-read the rendered Feature and Work Item bodies and latest comments to verify identity, exact ownership, every complete accepted brief, accepted/proposed separation, graph direction, Decision ordering, lifecycle/attention, and next actions.

GitHub Issue mutations are not transactional. If any create or update fails, stop immediately and report the decomposition Decision locator, completed Issue locators, failed operation, and every stale, incomplete, or pending body. Do not delete successfully created Issues, repost the Decision, fabricate completion, roll IDs back, or create replacements. On resumption, recover the complete accepted briefs from the authoritative decomposition Decision, reuse those exact Issues, finish the incomplete pass, and only then refresh the Feature's accepted graph. A Decision with partially published Issues remains authoritative even while the Feature body is stale; report that incomplete mechanical projection honestly and repair it by recovery.

### 12. Hand off and stop

Return a concise handoff containing:

- Atlas, current Index Segment, Map, and accepted Feature IDs with canonical locators;
- intent status, lifecycle/attention, intent-acceptance Decision locator, and decomposition Decision locator;
- every accepted Work Item ID and canonical locator with its complete accepted brief: role/type, attention, optional track (or `None`), complexity, current behavior, desired result, key interfaces, boundaries, dependencies, observable acceptance/verification, and implementation verification strategy;
- the recovered current state, any unresolved `needs-info` fact or partial-publication repair, and the exact next action.

When publication is complete, identify the first unblocked accepted Work Item or the specific prerequisite that must be resolved next, and name the separate owning implementation workflow the human may invoke. Stop without invoking it, assigning a writer, creating a repository/live tracer, or dispatching any implementation.
