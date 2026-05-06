# pi-keysmith

Monorepo for a shareable Pi leader-key control-plane engine and SDK.

`pi-keysmith` is a keyboard control plane for Pi: it centralizes discoverable leader bindings, action dispatch, and diagnostics while leaving feature ownership with Pi Core and other extensions. Built-in compatibility shims expose common Pi and ecosystem commands as Keysmith actions/default keymaps; native plugins can later replace those compat shims without breaking existing user bindings.

## Packages

- `packages/pi-keysmith`: Pi extension package.
- `packages/pi-keysmith-sdk`: public helper/types package for action, default-keymap, and shim registration.

## Features through VS-21

- Main-editor wrapper with `CustomEditor` fallback.
- Default `<ctrl+x>` leader with Pi Core thinking, model/session, reload, editor, settings, tools, actions browser, and doctor actions.
- User/project `piKeysmith` config, including Keysmith-specific `<cwd>/.pi/keybindings.json`.
- `piKeysmith.compat` controls auto-detected compatibility shims and their default keymaps.
- Delayed non-capturing which-key overlay.
- pi-vim normal-mode `<space>` leader via duck-typed `getMode() === "normal"`.
- Global SDK registry for third-party actions, default keymaps, and native replacement shims before or after Keysmith loads.
- `/keysmith-actions` action browser and `/keysmith-doctor` diagnostics slash commands.
- Lifecycle hardening for reload/restart, wrapper cleanup, SDK subscriptions, timers, and overlays.
- Dedicated diagnostics log at `~/.pi/agent/pi-keysmith.log`.

## Compatibility shim groups

Keysmith ships these control-plane compat groups. Package-backed groups are auto-detected from Pi package config when `piKeysmith.compat.autoDetect` is enabled; all groups can be opted out or have only default keymaps disabled.

| Group | Shim ID | Purpose |
| --- | --- | --- |
| Pi Core | `compat:pi-core` | Core thinking, model/session, settings, reload, external editor, and Keysmith utility actions. |
| Session Search | `compat:@kaiserlich-dev/pi-session-search` | Session listing/search/stat/reindex actions for Session Search. |
| Intercom | `compat:pi-intercom` | Session listing, pending asks, status, and reply actions. |
| Subagents | `compat:pi-subagents` | Agent/chain listing, run status, interrupt, and doctor actions. |
| Observability | `compat:pi-observability` | Dashboard, footer/path toggles, and settings actions. |
| Markdown Preview | `compat:pi-markdown-preview` | Current-file preview, browser preview, and cache clear actions. |
| Schedule Prompt | `compat:pi-schedule-prompt` | Job list, widget toggle, settings, and cleanup actions. |
| Web Access | `compat:pi-web-access` | Curator, stored results, Google account, and status actions. |
| Memory | `compat:pi-memory` | Memory search plus daily/long-term/scratchpad open actions. |
| Model Cycler | `compat:pi-model-cycler` | Favorite model picker and next/previous model actions. |

## Action browser v2 behavior

`/keysmith-actions` opens the action browser. Bound actions sort before unbound actions; bound rows are sorted by key lexicographically, and unbound actions trail after bound rows. Labels include the key sequence (or `[unbound]`), action name, action ID, source type/display name, and availability.

The action browser search/filter matches action metadata including name, description, action ID, source type, source display name, and availability/source status. Key sequences and bindings are shown for context but intentionally ignored by search so typing a key does not hide relevant actions by metadata.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run --workspace pi-keysmith
npm pack --dry-run --workspace pi-keysmith-sdk
```

## Local Pi smoke checklist

See [`docs/smoke-checklist.md`](docs/smoke-checklist.md).

## Documentation

- [Config reference](docs/config-reference.md)
- [SDK author guide](docs/sdk-author-guide.md)
- [Lifecycle/focus regression matrix](docs/lifecycle-regression-matrix.md)
- [Publish checklist](docs/publish-checklist.md)
- [Post-v1 follow-ups](docs/follow-ups.md)
- [Third-party extension example](examples/third-party-extension/README.md)

## pi-vim load order

For v1 dogfood, list/load `pi-vim` before `pi-keysmith` so Keysmith wraps pi-vim's editor factory. With the reverse order, Pi's current public editor API is a single editor-factory slot; a later factory can overwrite Keysmith. Keysmith emits a diagnostic when its wrapper becomes inactive and `/keysmith-doctor` reports wrapper state.
