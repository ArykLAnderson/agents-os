---
name: herdr-session-navigation
description: Plan safe backend-neutral session navigation and conditionally adapt it to the isolated Herdr Casebook trial. Use for canonical destination resolution, stable pins, focus return, background opens, or approval-gated agent prompts.
user-invocable: false
---

# Herdr Session Navigation

Treat Casebook/Pi owner and conversation identity as canonical. Herdr labels and workspace/tab/pane IDs are replaceable presentation evidence only.

1. Resolve a canonical destination through `lib/navigation.mjs`. Missing, stale, or duplicate claims must remain visibly unavailable; never choose the first label match, create a third candidate, or delete either candidate.
2. Record focus history only for explicit human focus. Background create/recovery plans always use `focus: false`. Pins store canonical IDs, not Herdr locators.
3. Register Herdr effects only when `detectHerdrAvailability` proves the exact `casebook-trial` config, named session/socket handshake, pinned numeric protocol 17 and `ServerCapabilities` object, one generation-bearing current pane, expected Pi integration schema, and official Pi session reference. Environment variables and labels alone are only hints.
4. Effect constructors require the unforgeable validated availability result. Every argv includes explicit `--session casebook-trial`; socket requests carry the proven config/session/socket route. Use argv or pinned structured requests, never shell command strings.
5. Require immediate human approval for the exact target and content of `agent.prompt`. Never retry uncertain delivery against a guessed target.

This capability constructs no close, delete, stop, purge, raw-keystroke, service, installation, or Pi-mutation effect. It performs no live effects. Read [README.md](README.md) before staging the offline scaffold.
