# pi-keysmith

Pi extension package for the Keysmith leader-key control-plane engine.

Keysmith is a keyboard control plane, not a replacement for Pi Core or companion extensions. It registers actions, groups them behind leader-key defaults, shows discoverability UI, and reports diagnostics. Compatibility shims expose known Pi commands through stable Keysmith action IDs; plugin-owned native shims can replace compat shims while keeping aliases for existing user keybindings.

## Quickstart

Build/link this package into Pi, then start Pi. With no config, the default leader is `<ctrl+x>`.

- `<ctrl+x> t`: open the Pi Core thinking group.
- `<ctrl+x> t e`: toggle tool-output expansion.
- `<ctrl+x> t t`: pick a thinking level; `<ctrl+x> t n`/`p` cycle next/previous.
- Pause after `<ctrl+x>`: show which-key hints.
- `/keysmith-actions`: list and invoke registered Keysmith actions.
- `/keysmith-doctor`: inspect config layers, contexts, conflicts, missing actions, disabled defaults, invalid entries, wrapper state, and log path.

## Compatibility shim groups

Package-backed compatibility groups are auto-detected when their package appears in Pi package config and `piKeysmith.compat.autoDetect` is true. `compat:pi-core` is built in. Each group can be disabled entirely or left available with its default keymap disabled.

| Group | Shim ID |
| --- | --- |
| Pi Core | `compat:pi-core` |
| Session Search | `compat:@kaiserlich-dev/pi-session-search` |
| Intercom | `compat:pi-intercom` |
| Subagents | `compat:pi-subagents` |
| Observability | `compat:pi-observability` |
| Markdown Preview | `compat:pi-markdown-preview` |
| Schedule Prompt | `compat:pi-schedule-prompt` |
| Web Access | `compat:pi-web-access` |
| Memory | `compat:pi-memory` |
| Model Cycler | `compat:pi-model-cycler` |

## Config

Add a `piKeysmith` block to `~/.pi/agent/settings.json`, `~/.pi/agent/keybindings.json`, project `.pi/settings.json`, or project `.pi/keybindings.json`.

Project `.pi/keybindings.json` is Keysmith-specific behavior; Pi core does not document loading project keybindings from this file.

```json
{
  "piKeysmith": {
    "leader": "<ctrl+x>",
    "enabledWhen": ["editor"],
    "whichKeyDelayMs": 300,
    "sequenceTimeoutMs": 1000,
    "compat": {
      "autoDetect": true,
      "defaultKeymapsEnabled": true,
      "shims": {
        "compat:pi-core": {},
        "compat:pi-intercom": { "defaultKeymapEnabled": false },
        "compat:pi-memory": { "enabled": false }
      }
    },
    "spec": {
      "t": {
        "name": "thinking",
        "o": { "action": "pi-core.thinking.off", "desc": "Pi Core: Thinking off" },
        "t": { "action": "pi-core.thinking.pick", "desc": "Pi Core: Pick thinking level" },
        "n": { "action": "pi-core.thinking.next", "desc": "Pi Core: Next thinking level" },
        "p": { "action": "pi-core.thinking.previous", "desc": "Pi Core: Previous thinking level" },
        "l": { "action": "pi-core.thinking.low", "desc": "Pi Core: Low thinking" },
        "m": { "action": "pi-core.thinking.medium", "desc": "Pi Core: Medium thinking" },
        "h": { "action": "pi-core.thinking.high", "desc": "Pi Core: High thinking" },
        "x": { "action": "pi-core.thinking.xhigh", "desc": "Pi Core: Max thinking" },
        "e": { "action": "pi-keysmith.tools.expand.toggle", "desc": "Pi Core: Toggle tools expansion" }
      },
      ",": { "action": "pi-core.settings.open", "desc": "Pi Core: Settings" }
    }
  }
}
```

Supported key notation includes plain sequences plus `<ctrl+x>`, `<c-x>`, `<space>`, `<tab>`, `<cr>`, `<esc>`, and leading `<leader>`.

See [`../../docs/config-reference.md`](../../docs/config-reference.md) for full `piKeysmith.compat` semantics and null unbind behavior.

## Action browser v2

`/keysmith-actions` opens the action browser. Bound actions sort before unbound actions; bound rows are sorted by key lexicographically, and unbound rows appear after bound rows. Rows show source type/display name and availability so users can distinguish core, compat, plugin, user, and project actions.

The action browser search/filter matches action metadata: name, description, action ID, source type, source display name, and availability/source status. It does not search key sequences or bindings; key sequences stay visible only as context for dispatch.

## pi-vim `<space>` leader

For v1 dogfood, list/load `pi-vim` before `pi-keysmith` so Keysmith wraps pi-vim's editor factory.

```json
{
  "piKeysmith": {
    "leader": "<space>",
    "enabledWhen": ["editor", "vim.normal"]
  }
}
```

In pi-vim normal mode, `<space>` starts leader mode. In insert mode, `<space>` is delegated as a literal space. If the wrapper is inactive or the editor does not expose `getMode()`, Keysmith delegates and reports diagnostics through `/keysmith-doctor` and `~/.pi/agent/pi-keysmith.log`.

## Built-in actions

Default bindings use the Pi Core compatibility shim under `compat:pi-core`:

- `pi-core.thinking.off`
- `pi-core.thinking.pick`
- `pi-core.thinking.next`
- `pi-core.thinking.previous`
- `pi-core.thinking.low`
- `pi-core.thinking.medium`
- `pi-core.thinking.high`
- `pi-core.thinking.xhigh`
- `pi-keysmith.tools.expand.toggle`
- `pi-core.settings.open`
- `pi-core.reload`
- `pi-core.editor.external`
- `pi-core.model.pick`
- `pi-core.model.next`
- `pi-core.model.previous`
- `pi-core.model.scoped`
- `pi-core.session.resume`
- `pi-core.session.tree`
- `pi-core.session.info`
- `pi-core.session.fork`
- `pi-core.session.clone`
- `pi-core.session.new`
- `pi-core.session.compact`

Additional Keysmith actions are also registered:

- `pi-keysmith.thinking.next`
- `pi-keysmith.thinking.previous`
- `pi-keysmith.actions.open`
- `pi-keysmith.doctor.open`

## Conflict policy

- Explicit user/project bindings win over defaults.
- Conflicting default bindings fail closed.
- Illegal prefix/action ambiguity is invalid.
- Explicit `null` unbind disables a default without warning.
- Missing actions remain visible as unavailable and warn only when invoked.

## SDK integrations

Use `pi-keysmith-sdk` from another extension to register actions/default keymaps or a native replacement shim via `registerKeysmithShim`. Registrations work before or after Keysmith loads and should be disposed on `session_shutdown`.

```ts
import { registerAction, registerDefaultKeymaps } from "pi-keysmith-sdk";

const action = registerAction({
  id: "example.say-hello",
  description: "Say hello",
  handler: ({ cwd, hasUI, ui }) => {
    if (hasUI) ui?.notify(`Hello from ${cwd}`, "info");
  },
});

const keymap = registerDefaultKeymaps({
  source: "example-extension",
  spec: { e: { h: { action: "example.say-hello", desc: "Say hello" } } },
});
```

## Diagnostics

- `/keysmith-doctor` is the main runtime report.
- Nonfatal startup diagnostics are written to `~/.pi/agent/pi-keysmith.log`.
- Keysmith warns if another extension overwrites its editor wrapper.

## Uninstall / rollback

Remove `pi-keysmith` from your Pi package list or uninstall the local package, then reload/restart Pi. Remove any `piKeysmith` blocks from settings/keybindings files if you no longer want Keysmith-specific config.
