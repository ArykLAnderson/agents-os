---
name: wayfinder
description: Plan an effort too large and foggy for one session as a shared map of investigation tickets, with explicit autonomous or human-acceptance working modes and mandatory reconciliation at dependency convergence points.
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
- **Working modes:** the user-selected default, any ticket overrides, and mandatory reconciliation gates.
- **Decisions so far:** concise pointers to resolved tickets, never duplicated detail.
- **Not yet specified:** in-scope fog that cannot yet be phrased as a precise question.
- **Out of scope:** work beyond the destination that never graduates automatically.

Child tickets each resolve one question in one context. Every ticket records `Mode: Autonomous` or `Mode: Human acceptance required`. Use explicit blocking edges. The frontier is open, unblocked, unclaimed tickets whose required gates have been reconciled.

Ticket types route to `research`, `research-sprint`, `prototype`, `grill` plus `domain-modeling`, `deliberate`, or a prerequisite task.

## Chart a map

1. Use `grill` and `domain-modeling` to name the destination.
2. Explore breadth-first across the uncertainty. If no meaningful fog appears, stop: a map is unnecessary.
3. Create the map and record the coarse fog.
4. Create only questions precise enough to ticket now, then wire dependencies.
5. Stop. Do not also resolve a ticket in the charting session.

## Set working modes

After charting and before working the discovery tickets, ask the user to select how work proceeds. The user may set one map-level default, override individual tickets, or provide a classification rule that is written into the map.

### Autonomous

The agent may investigate, decide the ticket's stated factual question, record the resolution, and close the ticket without waiting for approval.

Autonomous mode is not authority to decide newly exposed domain intent, authorization policy, operational burden, risk acceptance, or product experience. If one of those becomes necessary, stop, change the ticket to `Human acceptance required`, and present the decision rather than silently choosing.

### Human acceptance required

The agent may investigate and draft a recommended resolution autonomously, but it must mark the ticket `Needs acceptance` and present the material decision to the user. It may close the ticket or unblock dependents only after explicit acceptance. Record what the user accepted, not merely that a conversation occurred.

## Reconciliation gates

Reconciliation is always required, regardless of ticket mode.

During charting and whenever the map changes, identify every point where independent branches converge into a shared downstream assumption or decision. Represent each as a named gate in the map. A reconciliation gate is always human-acceptance-required and cannot be made autonomous.

At a gate:

1. Gather the accepted and autonomous upstream findings without duplicating their detail.
2. Surface contradictions, changed assumptions, unresolved decisions, and consequences for the destination and dependency graph.
3. Ask the user to accept the reconciled baseline or send named findings back for revision.
4. Record the accepted baseline, ticket/DAG changes, and remaining uncertainty.
5. Only then unblock downstream tickets that rely on the combined findings.

A ticket acceptance session may also satisfy a reconciliation gate only when the gate's combined findings and downstream consequences are explicitly reviewed and recorded.

## Work a map

1. Load the low-resolution map, working-mode rules, and reconciliation gates.
2. Claim one named frontier ticket whose upstream gates are reconciled.
3. Resolve only that ticket, loading related detail as needed.
4. For `Autonomous`, record the resolution, close the ticket, and append a one-line pointer under Decisions so far.
5. For `Human acceptance required`, record the proposed resolution, mark it `Needs acceptance`, and stop for explicit user acceptance before closing it or unblocking dependents.
6. Graduate newly clarified fog into tickets, update dependencies and modes, add or move reconciliation gates, and rule newly exposed beyond-destination work out of scope.
7. Stop after one ticket or one named reconciliation gate.

When the route becomes clear and the final convergence has been reconciled, hand off to `to-spec`, or directly to implementation if discovery proved the effort small.
