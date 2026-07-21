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
- `project-pins.json` — schema version 1 and exactly four canonical project IDs/nulls;
- `local-pins.json` — schema version 1 and exactly four canonical Pi conversation IDs/nulls;
- `focus-history.json` — `{ "schemaVersion": 1, "projects": { "<projectCanonicalId>": "<sessionCanonicalId>" } }`, updated after a verified successful activation or a verified `pane.focused` event;
- `action-result.json` — the most recent visible action result.
- `spaces/` — `aryk.spaces` locked pending semantic enrollment requests and full plain-workspace create receipts (workspace/tab/root-pane/terminal IDs plus canonical root), re-attested by fresh `pane get` before use.

The custom source plugins are `src/herdr-plugins/aryk.pins/` and the self-contained unified picker at `src/herdr-plugins/aryk.spaces/`. Their tests and both config files can be prepared offline; neither is linked by setup or tests. Runtime files live only in the ignored XDG state root, never in a plugin checkout.

### Authoritative registry (required)

A trusted machine-local Casebook/Steward publisher—not this plugin—must atomically publish `bindings/registry.json`. Until it exists and validates, identity-affecting actions visibly refuse. The exact schema is:

- root: `schemaVersion: 1`, `route`, `projects[]`, `sessions[]`;
- `route`: exact `sessionName: "casebook-trial"`, absolute `configPath`, absolute `socketPath`, and `protocol: 17`;
- project: nonempty opaque `canonicalId`, positive integer `generation`, `reconciliationState` (`current` or `stale`), and `stewardSessionCanonicalId`; compatible optional presentation declarations are nonempty `displayName` and absolute `declaredRoot`;
- session: nonempty opaque `canonicalId` and `projectCanonicalId`, positive integer `generation`, `reconciliationState`, `role` (`steward` or `interaction`), `officialPiSession`, and `binding`;
- `officialPiSession`: exact official Pi tuple `{ "source": "pi", "agent": "pi", "kind": "session_id"|"session_path", "value": "<nonempty official ref>" }`;
- `binding`: nonempty generation-scoped `workspaceId`, `tabId`, `paneId`, and `terminalId` replaceable locators.

Duplicate claims are not resolved first-match: they are ambiguous and unavailable. Validation additionally rejects any cross-canonical reuse of either an official Pi tuple or the exact workspace/tab/pane/terminal binding tuple. Current Herdr `agent list` evidence must exactly and uniquely agree with every official-session and locator field. Focus targets that verified public `paneId` (never an agent name), then requires an exit-zero `agent_info` response that repeats the same official tuple and all four locators with `focused: true` before history changes. Labels, CWDs, plugin context, and Herdr IDs alone never establish identity. `examples/registry.example.json` is intentionally non-authoritative and must not be copied as live authority.

Pin and history read/modify/write operations hold an exclusive fail-closed lock through durable replacement. A crash-left lock is never guessed stale or deleted; later mutations refuse after a bounded wait until an operator separately reconciles custody. Existing symlinks anywhere in a state path's parent chain are refused before reads/writes, and write parents are rechecked after creation.

The source-attested `pane.focused` hook has no cause field. The plugin therefore treats an actual Herdr focus change as user-visible focus, revalidates the event pane through a fresh official-agent snapshot and registry, and updates history silently. Background opens created by this navigation seam always set `focus=false`, so they do not emit an intentional focus change. Invalid event evidence, lock failure, or I/O failure neither mutates history nor opens a popup.

Herdr sockets/logs/runtime (including `~/.config/herdr/sessions/casebook-trial/`), Pi sessions, project registrations, credentials, custody stores, and machine-specific profiles stay in their owning local stores. Never put backend bindings in `.casebook`, project CWDs, generated adapters, or Pi session directories.

## Offline plugin preparation and later link

Offline checks do not execute Herdr:

```sh
node --test src/herdr-plugins/aryk.pins/test/*.test.mjs
node --test src/herdr-plugins/aryk.spaces/test/*.test.mjs
python3 - <<'PY'
import tomllib
for path in ('src/herdr-plugins/aryk.pins/herdr-plugin.toml',
             'src/herdr-plugins/aryk.spaces/herdr-plugin.toml',
             'src/skills/herdr-session-navigation/examples/config.toml'):
    with open(path, 'rb') as f: tomllib.load(f)
print('toml: ok')
PY
```

Each plugin is self-contained and relocation-tested; runtime imports do not escape its plugin root. Both configs bind `prefix+o` to the qualified `aryk.spaces.open-spaces` action, intentionally displacing native `open_notification_target`; native `prefix+g` remains Herdr's live session navigator. They also intentionally bind `prefix+H` and `prefix+T`; these override Herdr's defaults for swap-left and rename-tab.

Only after separate live authorization, an operator may link both reviewed source directories using `HERDR_BIN_PATH`, explicit `--session casebook-trial`, and inherited config/socket proof:

```sh
"$HERDR_BIN_PATH" --session casebook-trial plugin link "$HOME/.agents-os/src/herdr-plugins/aryk.pins"
"$HERDR_BIN_PATH" --session casebook-trial plugin link "$HOME/.agents-os/src/herdr-plugins/aryk.spaces"
```

Linking is not performed here. The registry publisher must exist first. Do not use labels or the example fixture to bootstrap it.

## Later live gate

A separately authorized trial must validate the installed version/config, protocol/schema negotiation, named socket/session identity, official Pi integration and session reference, key delivery, direct Ctrl/editor boundaries, Nord rendering, resolved state/log paths, detach/restart/rebind, duplicate/stale refusal, no-focus recovery, exact prompt delivery, and unchanged tmux rollback. Do not run `herdr config check` until that authorization because it executes the binary.
