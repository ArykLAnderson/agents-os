# Herdr session navigation (offline trial scaffold)

This source-owned package implements the backend-neutral safety seam for the accepted tmux-to-Herdr side path. It does **not** install or run Herdr, start a service, enroll a project, edit Fish/tmux/Pi, register live capabilities, or migrate/delete state. Tmux remains the unchanged default and rollback path.

Herdr-specific tokens and configuration are attested only to pinned upstream commit `02a6e874f67800891b5a549297219ed6f3ce0f2f`; none have been validated against a local binary.

## Contents

- `lib/navigation.mjs`: canonical destination/binding resolution, stable pins, human-only focus history, no-focus opens, and approved prompt intents.
- `lib/herdr.mjs`: fail-closed pinned protocol-17/`ServerCapabilities` availability proof and proof-gated, explicitly routed non-destructive command/request plans.
- `lib/paths.mjs`: XDG-aware portable config and machine-local state paths.
- `examples/config.toml`: source-attested Nord/key scaffold with history and agent restore disabled.
- `setup.mjs`: dry-run default; explicit apply copies only the example into a non-live staging directory.
- `tests/`: synthetic fixtures and offline `node:test` coverage.

## Offline use

```sh
node --test src/skills/herdr-session-navigation/tests/*.test.mjs
node src/skills/herdr-session-navigation/setup.mjs --dry-run \
  --staging-destination "$(mktemp -d)"
node src/skills/herdr-session-navigation/setup.mjs --apply \
  --staging-destination "$(mktemp -d)"
```

`--herdr-path /absolute/path` checks that a caller-supplied file is executable but never executes it. Apply requires an existing non-symlink staging directory, resolves its physical path, refuses symlink aliases of live config/state roots, and refuses an existing `config.toml`.

## State custody

Portable configuration belongs at `~/.config/herdr/trials/casebook/config.toml`. Machine-local adapter state belongs under `${XDG_STATE_HOME:-~/.local/state}/agent-os/herdr-trials/casebook/`:

- `bindings/` — canonical owner/session ID to replaceable backend binding generations;
- `favorites.json` — canonical IDs only;
- `focus-history.json` — the last two human-focused canonical destinations only.

Herdr sockets/logs/runtime (including `~/.config/herdr/sessions/casebook-trial/`), Pi sessions, project registrations, credentials, custody stores, and machine-specific profiles stay in their owning local stores. Never put backend bindings in `.casebook`, project CWDs, generated adapters, or Pi session directories.

## Later live gate

A separately authorized trial must validate the installed version/config, protocol/schema negotiation, named socket/session identity, official Pi integration and session reference, key delivery, direct Ctrl/editor boundaries, Nord rendering, resolved state/log paths, detach/restart/rebind, duplicate/stale refusal, no-focus recovery, exact prompt delivery, and unchanged tmux rollback. Do not run `herdr config check` until that authorization because it executes the binary.
