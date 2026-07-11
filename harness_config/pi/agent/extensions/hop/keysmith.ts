import type { Disposable, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ParsedHopCommand } from "./index.ts";

const KEYSMITH_SDK_PATH = `${process.env.HOME}/.agents-os/plugins/pi-keysmith/packages/pi-keysmith-sdk/dist/index.js`;

type KeysmithInvocationContext = {
  piContext?: unknown;
  ui?: { notify(message: string, type?: "info" | "warning" | "error"): void };
};

type KeysmithSdk = {
  registerAction(registration: {
    id: string;
    name?: string;
    description?: string;
    sourceType?: string;
    sourceDisplayName?: string;
    handler: (ctx: KeysmithInvocationContext) => void | Promise<void>;
  }): Disposable;
  registerDefaultKeymaps(registration: {
    source: string;
    spec: Record<string, unknown>;
  }): Disposable;
};

export interface HopKeysmithActions {
  openPicker(ctx: ExtensionCommandContext, parsed: ParsedHopCommand): Promise<void>;
  cloneThread(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "clone" }): Promise<void>;
  freshHandoff(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "handoff" }): Promise<void>;
}

function asCommandContext(ctx: KeysmithInvocationContext): ExtensionCommandContext | undefined {
  const piContext = ctx.piContext as Partial<ExtensionCommandContext> | undefined;
  if (piContext?.sessionManager && piContext.ui && typeof piContext.cwd === "string") {
    return piContext as ExtensionCommandContext;
  }
  return undefined;
}

export async function registerHopKeysmithActions(actions: HopKeysmithActions): Promise<Disposable | undefined> {
  let sdk: KeysmithSdk;
  try {
    sdk = (await import(KEYSMITH_SDK_PATH)) as KeysmithSdk;
  } catch {
    return undefined;
  }

  const disposables: Disposable[] = [];
  const base: ParsedHopCommand = { mode: "picker", origin: "user", dryRun: false, text: "" };

  const withPiContext = (name: string, handler: (ctx: ExtensionCommandContext) => Promise<void>) => async (ctx: KeysmithInvocationContext) => {
    const piContext = asCommandContext(ctx);
    if (!piContext) {
      ctx.ui?.notify(`Hop Keysmith action ${name} needs a live Pi command context`, "warning");
      return;
    }
    await handler(piContext);
  };

  disposables.push(
    sdk.registerDefaultKeymaps({
      source: "pi-hop",
      spec: {
        h: {
          name: "hop",
          p: { action: "hop.openPicker", desc: "Hop: Open picker" },
          c: { action: "hop.cloneThread", desc: "Hop: Clone thread" },
          f: { action: "hop.freshHandoff", desc: "Hop: Fresh handoff" },
        },
      },
    }),
  );

  disposables.push(
    sdk.registerAction({
      id: "hop.openPicker",
      name: "Hop: Open picker",
      description: "Choose how to hop to a related Pi chat in a new tmux window",
      sourceType: "plugin",
      sourceDisplayName: "Pi Hop",
      handler: withPiContext("hop.openPicker", (ctx) => actions.openPicker(ctx, base)),
    }),
  );
  disposables.push(
    sdk.registerAction({
      id: "hop.cloneThread",
      name: "Hop: Clone thread",
      description: "Clone the current Pi thread into a new tmux window",
      sourceType: "plugin",
      sourceDisplayName: "Pi Hop",
      handler: withPiContext("hop.cloneThread", (ctx) => actions.cloneThread(ctx, { ...base, mode: "clone" })),
    }),
  );
  disposables.push(
    sdk.registerAction({
      id: "hop.freshHandoff",
      name: "Hop: Fresh handoff",
      description: "Generate a fresh handoff prompt and open it in a new tmux window",
      sourceType: "plugin",
      sourceDisplayName: "Pi Hop",
      handler: withPiContext("hop.freshHandoff", (ctx) => actions.freshHandoff(ctx, { ...base, mode: "handoff" })),
    }),
  );

  return {
    dispose() {
      for (const disposable of disposables.splice(0)) disposable.dispose();
    },
  };
}
