---
name: wayfinder
description: Plan an effort too large and foggy for one session as a shared map of investigation tickets, resolving one decision per session until the route is clear.
user-invocable: true
argument-hint: "[loose idea or existing map]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Wayfinder

Wayfinder discovers the route to a destination; it does not charge at the destination. It produces decisions rather than implementation deliverables unless the map explicitly says otherwise.

## Map

Maintain one canonical map in the configured tracker (or local Markdown) containing:

- **Destination:** what a completed map makes possible.
- **Notes:** domain and standing workflow guidance.
- **Decisions so far:** concise pointers to resolved tickets, never duplicated detail.
- **Not yet specified:** in-scope fog that cannot yet be phrased as a precise question.
- **Out of scope:** work beyond the destination that never graduates automatically.

Child tickets each resolve one question in one context. Use explicit blocking edges. The frontier is open, unblocked, unclaimed tickets.

Ticket types route to `research`, `research-sprint`, `prototype`, `grill` plus `domain-modeling`, `deliberate`, or a prerequisite task.

## Chart a map

1. Use `grill` and `domain-modeling` to name the destination.
2. Explore breadth-first across the uncertainty. If no meaningful fog appears, stop: a map is unnecessary.
3. Create the map and record the coarse fog.
4. Create only questions precise enough to ticket now, then wire dependencies.
5. Stop. Do not also resolve a ticket in the charting session.

## Work a map

1. Load the low-resolution map.
2. Claim one named frontier ticket.
3. Resolve only that ticket, loading related detail as needed.
4. Record the resolution in the ticket, close it, and append a one-line pointer under Decisions so far.
5. Graduate newly clarified fog into tickets, update dependencies, and rule newly exposed beyond-destination work out of scope.
6. Stop after one ticket.

When the route becomes clear, hand off to `to-spec`, or directly to implementation if discovery proved the effort small.
