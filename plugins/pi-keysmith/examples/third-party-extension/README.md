# pi-keysmith third-party extension example

This sample registers an SDK action and a default keymap. It works whether this extension is loaded before or after `pi-keysmith`, because registrations go through the global SDK registry and Keysmith listens for registry changes.

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAction, registerDefaultKeymaps, type Disposable } from "pi-keysmith-sdk";

export default function exampleKeysmithExtension(pi: ExtensionAPI): void {
  let disposables: Disposable[] = [];

  pi.on("session_start", async (_event, ctx) => {
    for (const disposable of disposables.splice(0)) disposable.dispose();
    disposables = [
      registerAction({
        id: "example.say-hello",
        description: "Say hello from the example extension",
        handler: ({ cwd, hasUI, ui }) => {
          if (hasUI) ui?.notify(`Hello from ${cwd}`, "info");
        },
      }),
      registerDefaultKeymaps({
        source: "example-keysmith-extension",
        spec: {
          e: {
            name: "example",
            h: { action: "example.say-hello", desc: "Say hello" },
          },
        },
      }),
    ];
  });

  pi.on("session_shutdown", async () => {
    for (const disposable of disposables.splice(0)) disposable.dispose();
  });
}
```

A plugin can also replace a compatibility shim for the same package when it owns a native implementation. Keep the legacy compat action ID as an alias so existing user keybindings continue to work:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerKeysmithShim, type Disposable } from "pi-keysmith-sdk";

export default function sessionSearchKeysmithShim(pi: ExtensionAPI): void {
  let shim: Disposable | undefined;

  pi.on("session_start", async () => {
    shim?.dispose();
    shim = registerKeysmithShim({
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
  });

  pi.on("session_shutdown", async () => {
    shim?.dispose();
    shim = undefined;
  });
}
```

Manual smoke check:

1. Build this repo and install/link both the sample extension and `pi-keysmith` into Pi.
2. Load the sample before `pi-keysmith`; press `<ctrl+x>`, pause to see `+example`, then press `e h` and confirm the notification appears.
3. Reverse the extension order so the sample loads after `pi-keysmith`; repeat the same key sequence.
4. Run `/reload` and repeat; the action should invoke once, with no duplicate-action warning.
