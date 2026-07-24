---
name: improve-architecture
description: Survey a codebase for deepening opportunities such as shallow modules, pass-through layers, leaky seams, and scattered knowledge.
user-invocable: true
argument-hint: "[optional focus area]"
---

# Improve Architecture

Survey architectural health and produce ranked improvement candidates. This skill finds opportunities; it does not perform the refactor.

1. Read the domain glossary, relevant ADRs, tests, and recent change history.
2. Load `codebase-design` as the single source of vocabulary.
3. Trace callers and dependencies through the focus area.
4. Look for shallow pass-throughs, duplicated rules, leaky interfaces, speculative seams, change scattered across callers, poor test surfaces, and knowledge living in the wrong module.
5. Apply the deletion test and assess depth, leverage, locality, blast radius, migration risk, and expected payoff.
6. Present a short ranked set of deepening opportunities. For each, identify the current seam, proposed seam, behavior hidden, callers simplified, tests enabled, and major risks.
7. Let the user select a candidate. Route it through `frame`, `blueprint`, or direct implementation according to its uncertainty and size.

Invoke `domain-modeling` only when the survey actively changes or challenges domain language. Respect accepted ADRs or explicitly identify the decision that would need reconsideration.
