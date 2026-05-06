# pi-keysmith-sdk

Public SDK helpers and types for integrating Pi extensions with `pi-keysmith`.

## Register an action

```ts
import { registerAction } from "pi-keysmith-sdk";

const disposable = registerAction({
  id: "example.say-hello",
  description: "Say hello",
  handler: ({ cwd, hasUI, ui }) => {
    if (hasUI) ui?.notify(`Hello from ${cwd}`, "info");
  },
});
```

Action handlers receive a fresh Keysmith invocation context, not the Pi session context. The context includes `cwd`, optional `model`, `hasUI`, `ui?.notify()`, `ui?.select()`, tool expansion helpers, and optional thinking-level helpers.

## Register default keymaps

```ts
import { registerDefaultKeymaps } from "pi-keysmith-sdk";

const disposable = registerDefaultKeymaps({
  source: "example-extension",
  spec: {
    e: {
      name: "example",
      h: { action: "example.say-hello", desc: "Say hello" }
    }
  }
});
```

## Register replacement shims

Use `registerKeysmithShim` when a plugin owns a native implementation that should replace a built-in compatibility shim. Keep legacy compat action IDs in `aliases` so existing user keybindings continue to work.

```ts
import { registerKeysmithShim } from "pi-keysmith-sdk";

const disposable = registerKeysmithShim({
  id: "plugin:@kaiserlich-dev/pi-session-search",
  sourceType: "plugin",
  displayName: "Pi Session Search",
  targetPackages: ["npm:@kaiserlich-dev/pi-session-search"],
  replaces: ["compat:@kaiserlich-dev/pi-session-search"],
  actions: [
    {
      id: "pi-session-search.native.search",
      aliases: ["pi-session-search.sessions.search"],
      name: "Session Search: Search sessions",
      description: "Search sessions with the native Session Search API",
      sideEffect: "none",
      implementationStability: "native",
      handler: ({ hasUI, ui }) => {
        if (hasUI) ui?.notify("Open Session Search", "info");
      },
    },
  ],
  defaultSpec: {
    s: {
      name: "sessions",
      "/": { action: "pi-session-search.native.search", desc: "Session Search: Search sessions" },
    },
  },
});
```

Dispose registrations on session shutdown/reload to avoid stale actions:

```ts
pi.on("session_shutdown", async () => disposable.dispose());
```

The registry is a versioned `globalThis` singleton, so registrations can happen before or after `pi-keysmith` loads.
