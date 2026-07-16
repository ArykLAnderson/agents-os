# Canonical Feature Atlas Issue Representations

These are concise Markdown representations for canonical tracker records. Keep the headings readable; they are not a machine schema.

## Identity and ownership

- Domain IDs are stable and independent of Issue numbers, titles, repositories, paths, branches, and chats.
- Allocate separate readable sequences within one Feature Atlas: `FA-001` for an Atlas, `AIS-001` for an Atlas Index Segment, `FM-001` for a Map, `F-001` for a Feature, and `WI-001` for a Work Item. Numbers carry no meaning and do not encode an owner.
- Before allocating an ID, search the canonical tracker across open and closed records and their comments. Select the next number above the highest observed value in that kind's Atlas-scoped sequence, then repeat the search immediately before creation. Stop on a collision, conflicting claim, or ambiguous search result. Never recycle an ID.
- A cross-Atlas reference pairs the Atlas ID with the entity ID, for example `FA-001 / F-014`.
- Rehoming preserves the entity ID. Record the previous owner, new owner, named-human Decision, and consequences in comments before updating the current owner in the body.
- Every Map names exactly one Atlas owner. Every Feature names exactly one Map owner. Every Work Item names exactly one Atlas, Map, or Feature scope owner. Record both the stable owner ID and its canonical locator.
- Dependencies and Index Segment entries never imply ownership. Native tracker parent relationships and locators are navigation aids only.

## Progressive disclosure

The Issue body is the current operable view. A fresh reader should find current authority, state, and next action without replaying the discussion.

Comments are the append-only historical view. Before a material body change, add the applicable Decision, clarification, or material-change comment, then refresh the body. Do not turn either surface into a session log or duplicate detailed evidence already owned by Git, a pull request, a report, or another source system; link to it.

Only a comment clearly headed `Decision`, naming the human decision-maker, grants semantic authority. Issue creation, body edits, labels, links, native relationships, agent summaries, and status changes do not imply acceptance. Keep proposals clearly outside sections headed `Accepted` until such a Decision exists.

Use this Decision comment form:

```markdown
## Decision — <subject>

- **Decided by:** <named human>
- **Date:** <YYYY-MM-DD>
- **Question:** <bounded question>
- **Choice:** <chosen direction>
- **Rationale:** <why>
- **Affected scope:** <IDs and canonical locators>
- **Consequences:** <what changes or remains unchanged>
- **Next step:** <current next action>
```

Use a concise `## Clarification — <subject>` or `## Material change — <subject>` comment for non-authoritative history. Name the author/date, what was learned or changed, why the body changes, and relevant locators. Correct historical mistakes with a new correction comment rather than silently rewriting history.

## Atlas root

Keep the Atlas root small and stable. Do not copy its Maps or history into it.

```markdown
# FA-<NNN> — <Feature Atlas name>

| Field | Current value |
|---|---|
| **ID** | `FA-<NNN>` |
| **Canonical source** | <configured tracker and private destination locator> |
| **Canonical Issue** | <this Issue's canonical locator> |
| **Current Index Segment** | `AIS-<NNN>` — <canonical locator> |

## Purpose

<Enduring product/domain portfolio purpose.>

## Shared invariants

- <Current shared invariant or link to its canonical statement.>
```

The Atlas owns Maps directly. Its current Index Segment is a bounded navigation pointer, not an ownership boundary.

## Atlas Index Segment

An Index Segment is a tracker navigation record for one Atlas. It may have a stable `AIS-<NNN>` ID so links survive rotation, but it is never a scope owner or a Map parent.

```markdown
# AIS-<NNN> — <Feature Atlas name> Index

> **Navigation only.** Maps listed here remain owned directly by `FA-<NNN>`.

| Field | Current value |
|---|---|
| **ID** | `AIS-<NNN>` |
| **Canonical Issue** | <this Issue's canonical locator> |
| **Atlas** | `FA-<NNN>` — <canonical Atlas locator> |
| **Segment state** | Current / Superseded |
| **Previous segment** | <ID and locator, or None> |
| **Next segment** | <ID and locator, or None> |

## Map navigation

- `FM-<NNN>` — [<Map name>](<canonical Map locator>) — <current state>
```

Create the first segment with the Atlas and mark it current. Rotate only when the current list becomes difficult to read or use; there is no fixed Map count. On rotation, cross-link adjacent segments as useful, move the current marker, and update the Atlas root. Do not mint a new Atlas, use hashes, or make the segment a native or semantic parent of Maps.

## Feature Map

```markdown
# FM-<NNN> — <Feature Map name>

| Field | Current value |
|---|---|
| **ID** | `FM-<NNN>` |
| **Atlas** | `FA-<NNN>` |
| **Canonical owner** | Feature Atlas `FA-<NNN>` — <canonical Atlas locator> |
| **Canonical Issue** | <this Issue's canonical locator> |
| **Lifecycle / attention** | <current state> |

## Destination

<What completing this bounded initiative makes possible.>

## Current state

<Current operable summary, unresolved gate or question, and next action.>

## Features

- `F-<NNN>` — [<Feature name>](<canonical Feature locator>) — <current state>

## Governing links

- <Current accepted decisions, shared contracts, or other authoritative locators.>
```

The Feature list is current navigation, not a substitute for each canonical Feature Issue.

## Feature

```markdown
# F-<NNN> — <Feature name>

| Field | Current value |
|---|---|
| **ID** | `F-<NNN>` |
| **Atlas** | `FA-<NNN>` |
| **Canonical owner** | Feature Map `FM-<NNN>` — <canonical Map locator> |
| **Canonical Issue** | <this Issue's canonical locator> |
| **Intent status** | Proposed / Accepted |
| **Lifecycle / attention** | <current state> |

## Current state

<Current operable summary and next action or next human decision.>

## Accepted intent

<Current accepted outcome, or “None — shaping is in progress.”>

### Boundaries

- **In:** <accepted scope>
- **Out:** <accepted non-goals>

### Acceptance

- [ ] <accepted outcome-level criterion>

## Accepted Work Item graph

- `WI-<NNN>` — [<Work Item name>](<canonical Work Item locator>) — <state; dependencies>

<Or “None accepted.”>

## Proposal — not accepted

<Current proposed intent, decomposition, or amendment when one exists. Keep it visibly separate from accepted state and link the Decision question.>

## Governing links

- <Specification, Decisions, source repositories, pull request, report, or other current locator as applicable.>
```

After an applicable named-human acceptance Decision, preserve it in comments and mechanically refresh the accepted sections. Modification, investigation, deferral, and decline Decisions update only the proposal, lifecycle/attention, governing links, and current state; accepted sections remain unchanged. Never silently retarget accepted intent or an existing delivery candidate.

## Work Item

```markdown
# WI-<NNN> — <Work Item name>

| Field | Current value |
|---|---|
| **ID** | `WI-<NNN>` |
| **Atlas** | `FA-<NNN>` |
| **Scope owner** | <Feature Atlas / Feature Map / Feature> `<owner ID>` — <canonical owner locator> |
| **Canonical Issue** | <this Issue's canonical locator> |
| **Acceptance status** | Proposed / Accepted |
| **Lifecycle / attention** | <current state> |
| **Role / type** | AFK / HITL |
| **Track (optional)** | <parallel workstream, or None> |
| **Complexity** | S / M / L |

## Current behavior

<What happens now, or “N/A — greenfield.”>

## Desired result

<One bounded result.>

## Key interfaces

- <Stable type, contract, route, or behavioral seam; use “None” when no interface is relevant.>

## Scope boundaries

- **In:** <included work>
- **Out:** <explicit exclusions>

## Dependencies

- **Blocked by:** <IDs and canonical locators, or None>
- **Blocks:** <IDs and canonical locators, or None>

## Acceptance / verification

- [ ] <observable or reviewable evidence required>

## Implementation verification strategy

<Tests at the deepest practical seam and any required manual checks; mark either part not applicable when it honestly is not.>

## Current state

<Current operable summary, evidence locators, and next action.>

## Governing links

- <Accepted decomposition Decision and other authoritative locators.>
```

Implementation Work Items are Feature-owned. Atlas- or Map-owned Work Items remain valid for bounded work at those scopes. A dependency on another record never changes the declared scope owner.
