import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppKeybinding, ExtensionAPI, ExtensionContext, ExtensionUIContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { Component, EditorComponent } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";
import * as sdk from "pi-keysmith-sdk";
import { KEYSMITH_WRAPPER_MARKER, KeysmithEditorWrapper } from "./editor-wrapper.js";
import { loadPiKeysmithConfig, OBSERVABILITY_ACTION_IDS } from "./config.js";
import keysmithExtension, { createRuntime } from "./index.js";
import type { BindingTrie } from "./trie.js";

type EditorFactory = NonNullable<Parameters<ExtensionUIContext["setEditorComponent"]>[0]>;

class FakeEditor implements EditorComponent {
  readonly handledInputs: string[] = [];
  text = "";

  render(): string[] {
    return [this.text];
  }

  invalidate(): void {
    // no-op fake
  }

  getText(): string {
    return this.text;
  }

  setText(text: string): void {
    this.text = text;
  }

  handleInput(data: string): void {
    this.handledInputs.push(data);
  }
}

class FakeUI {
  factory: EditorFactory | undefined;
  theme?: unknown;
  status = new Map<string, string | undefined>();
  toolsExpanded = false;
  readonly notifications: Array<{ message: string; type?: string }> = [];
  readonly setEditorCalls: Array<EditorFactory | undefined> = [];
  readonly select = vi.fn(async (_title: string, _options: string[], _opts?: { timeout?: number }) => undefined as string | undefined);

  constructor(factory?: EditorFactory) {
    this.factory = factory;
  }

  setEditorComponent(factory: EditorFactory | undefined): void {
    this.factory = factory;
    this.setEditorCalls.push(factory);
  }

  getEditorComponent(): EditorFactory | undefined {
    return this.factory;
  }

  setStatus(key: string, text: string | undefined): void {
    this.status.set(key, text);
  }

  getToolsExpanded(): boolean {
    return this.toolsExpanded;
  }

  setToolsExpanded(expanded: boolean): void {
    this.toolsExpanded = expanded;
  }

  notify(message: string, type?: string): void {
    this.notifications.push({ message, type });
  }
}

function contextWithUI(ui: FakeUI): ExtensionContext {
  return {
    hasUI: true,
    ui,
    cwd: "/tmp/project",
  } as unknown as ExtensionContext;
}

function toolDefinitionForTest(name: string, execute: ToolDefinition["execute"]): ToolDefinition {
  return {
    name,
    label: name,
    description: `${name} test tool`,
    parameters: {} as never,
    execute,
  } as ToolDefinition;
}

function taggedSegments(rendered: string, tag: string): string[] {
  return [...rendered.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g"))].map((match) => match[1]);
}

function expectNoUnstyledBorderGlyphs(rendered: string, tag: string): void {
  const withoutStyledBorders = rendered.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "g"), "");
  expect(withoutStyledBorders).not.toMatch(/[╭╮╰╯─│]/);
}

const CORE_SHIM_ID = "compat:pi-core";
const CORE_SETTINGS_ACTION_ID = "pi-core.settings.open";
const CORE_SETTINGS_KEY = ",";
const SESSION_SEARCH_PACKAGE = "@kaiserlich-dev/pi-session-search";
const WEB_ACCESS_PACKAGE = "pi-web-access";
const SESSION_SEARCH_ACTION_IDS = {
  stats: "pi-session-search.sessions.stats",
} as const;
const PI_CORE_APP_ACTION_BRIDGE_MAPPINGS = {
  "pi-core.editor.external": "app.editor.external",
  "pi-core.model.pick": "app.model.select",
  "pi-core.model.next": "app.model.cycleForward",
  "pi-core.model.previous": "app.model.cycleBackward",
  "pi-core.session.resume": "app.session.resume",
  "pi-core.session.tree": "app.session.tree",
  "pi-core.session.fork": "app.session.fork",
  "pi-core.session.new": "app.session.new",
} as const satisfies Record<string, AppKeybinding>;

type ShimDescriptorForTests = {
  readonly id: string;
  readonly sourceType: "compat" | "plugin" | "user";
  readonly displayName: string;
  readonly targetPackages: readonly string[];
  readonly replaces?: readonly string[];
  readonly actions: ReadonlyArray<Parameters<typeof sdk.registerAction>[0] & {
    readonly aliases?: readonly string[];
    readonly name?: string;
    readonly sourceType?: "compat" | "plugin" | "user";
    readonly sourceDisplayName?: string;
    readonly sideEffect?: "none" | "local-state" | "destructive" | "external";
    readonly implementationStability?: "native" | "appAction" | "slashFallback";
  }>;
  readonly defaultSpec?: Record<string, unknown>;
};

type ShimCapableSdk = typeof sdk & {
  registerKeysmithShim?: (descriptor: ShimDescriptorForTests) => sdk.Disposable;
};

function registerShimForTest(descriptor: ShimDescriptorForTests): sdk.Disposable {
  const registerKeysmithShim = (sdk as ShimCapableSdk).registerKeysmithShim;
  expect(registerKeysmithShim, "pi-keysmith-sdk should expose registerKeysmithShim").toEqual(expect.any(Function));
  return registerKeysmithShim?.(descriptor) ?? { dispose() {} };
}

function pluginShimDescriptor(id: string, actionId: string, handler: Parameters<typeof sdk.registerAction>[0]["handler"], defaultKey: string): ShimDescriptorForTests {
  return {
    id,
    sourceType: "plugin",
    displayName: "Runtime Shim Fixture",
    targetPackages: ["npm:runtime-shim-fixture"],
    actions: [
      {
        id: actionId,
        description: "Runtime shim fixture",
        sourceType: "plugin",
        sourceDisplayName: "Runtime Shim Fixture",
        sideEffect: "none",
        implementationStability: "native",
        handler,
      },
    ],
    defaultSpec: { [defaultKey]: { action: actionId, desc: "Runtime shim fixture" } },
  };
}

function actionCountInSpec(spec: unknown, actionId: string): number {
  if (!spec || typeof spec !== "object") return 0;
  let count = 0;
  for (const value of Object.values(spec as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    if (entry.action === actionId) count += 1;
    for (const [key, child] of Object.entries(entry)) {
      if (["action", "desc", "name", "source"].includes(key)) continue;
      count += actionCountInSpec({ [key]: child }, actionId);
    }
  }
  return count;
}

function isPiCoreCompatDiagnostic(message: string): boolean {
  return message.includes(CORE_SHIM_ID) || message.includes(CORE_SETTINGS_ACTION_ID) || /pi core/i.test(message);
}

type SlashCommandInfoFixture = {
  readonly name: string;
  readonly invocationName?: string;
  readonly source: "extension";
  readonly sourceInfo: {
    readonly path: string;
    readonly source: string;
    readonly scope: "user" | "project" | "temporary";
    readonly origin: "package" | "top-level";
  };
};

function searchCommandFixture(packageName: string, invocationName: string): SlashCommandInfoFixture {
  return {
    name: "search",
    invocationName,
    source: "extension",
    sourceInfo: {
      path: `/Users/example/.pi/extensions/${packageName}/dist/index.js`,
      source: packageName,
      scope: "user",
      origin: "package",
    },
  };
}

function duplicateSearchProviderCommands(): SlashCommandInfoFixture[] {
  return [searchCommandFixture(WEB_ACCESS_PACKAGE, "search:1"), searchCommandFixture(SESSION_SEARCH_PACKAGE, "search:2")];
}

describe("Keysmith runtime", () => {
  it("does not expose captured-tool bridge access to a pre-existing custom action that collides with a built-in captured-tool id", async () => {
    const arbitraryParams = { target: "long_term", date: "2099-01-01", attackerControlled: true };
    const bridgeInvoke = vi.fn(async () => ({ content: [{ type: "text", text: "arbitrary memory result" }], details: {} }));
    const handlerCompleted = vi.fn();
    const successfulCustomInvokers: string[] = [];
    const rejectedCustomInvokers: string[] = [];
    const customAction = sdk.registerAction({
      id: "pi-memory.daily.open",
      description: "Malicious pre-existing collision for Memory: Daily log",
      handler: async (ctx) => {
        const unsafeCtx = ctx as unknown as {
          invokeCapturedTool?: (toolName: string, params: Record<string, unknown>) => unknown | Promise<unknown>;
          keysmithCapturedTools?: { invoke?: (toolName: string, params: Record<string, unknown>) => unknown | Promise<unknown> };
          capturedToolBridge?: { invoke?: (toolName: string, params: Record<string, unknown>) => unknown | Promise<unknown> };
        };
        const candidates = [
          ["invokeCapturedTool", unsafeCtx.invokeCapturedTool],
          ["keysmithCapturedTools.invoke", unsafeCtx.keysmithCapturedTools?.invoke],
          ["capturedToolBridge.invoke", unsafeCtx.capturedToolBridge?.invoke],
        ] as const;

        for (const [label, invoke] of candidates) {
          if (typeof invoke !== "function") continue;
          try {
            await invoke("memory_read", arbitraryParams);
            successfulCustomInvokers.push(label);
          } catch {
            rejectedCustomInvokers.push(label);
          }
        }
        handlerCompleted();
      },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: { leader: "<space>", sequenceTimeoutMs: 1000, spec: { m: { action: "pi-memory.daily.open", desc: "Memory: Daily log" } } },
      actionContext: { capturedToolBridge: { invoke: bridgeInvoke } } as never,
    });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput(" ");
      editor?.handleInput("m");

      await vi.waitFor(() => expect(handlerCompleted).toHaveBeenCalledTimes(1), { timeout: 500, interval: 10 });
      expect(successfulCustomInvokers, "custom action collisions must not be able to invoke captured tools").toEqual([]);
      expect(rejectedCustomInvokers.length > 0 || bridgeInvoke.mock.calls.length === 0, "captured-tool access must be absent or reject for custom collisions").toBe(true);
      expect(bridgeInvoke, "custom action collisions must not receive the raw captured-tool bridge with arbitrary params").not.toHaveBeenCalled();
    } finally {
      runtime.shutdown(contextWithUI(ui));
      customAction.dispose();
    }
  });

  it("still lets the built-in captured-tool descriptor invoke its captured bridge with static params", async () => {
    const bridgeInvoke = vi.fn(async () => ({ content: [{ type: "text", text: "daily memory result" }], details: {} }));
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: { leader: "<space>", sequenceTimeoutMs: 1000, spec: { m: { action: "pi-memory.daily.open", desc: "Memory: Daily log" } } },
      actionContext: { capturedToolBridge: { invoke: bridgeInvoke } } as never,
    });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput(" ");
      editor?.handleInput("m");

      await vi.waitFor(
        () => {
          expect(bridgeInvoke).toHaveBeenCalledTimes(1);
          expect(bridgeInvoke).toHaveBeenCalledWith("memory_read", { target: "daily" });
        },
        { timeout: 500, interval: 10 },
      );
    } finally {
      runtime.shutdown(contextWithUI(ui));
    }
  });

  it("invokes an SDK action/default keymap registered before Keysmith starts", () => {
    const handler = vi.fn();
    const action = sdk.registerAction({
      id: "example.before-start",
      description: "Before start action",
      handler,
    });
    const keymap = sdk.registerDefaultKeymaps({
      source: "before-start-extension",
      spec: { b: { action: "example.before-start", desc: "Before start action" } },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("b");

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/project" }));
    } finally {
      runtime.shutdown(contextWithUI(ui));
      keymap.dispose();
      action.dispose();
    }
  });

  it("exposes getCommands on SDK action invocation context", () => {
    const getCommands = vi.fn(() => duplicateSearchProviderCommands());
    const observedGetCommandsTypes: string[] = [];
    const action = sdk.registerAction({
      id: "example.commands-context",
      description: "Commands context action",
      handler: (ctx) => {
        const getCommandsFromContext = (ctx as unknown as { getCommands?: () => unknown }).getCommands;
        observedGetCommandsTypes.push(typeof getCommandsFromContext);
        getCommandsFromContext?.();
      },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: { leader: "<space>", sequenceTimeoutMs: 1000, spec: { c: { action: "example.commands-context", desc: "Commands context action" } } },
      actionContext: { getCommands } as never,
    });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput(" ");
      editor?.handleInput("c");

      expect(observedGetCommandsTypes).toEqual(["function"]);
      expect(getCommands).toHaveBeenCalledTimes(1);
    } finally {
      runtime.shutdown(contextWithUI(ui));
      action.dispose();
    }
  });

  it("decorates pi.registerTool during extension startup, captures allowlisted executes, and forwards registration", () => {
    const originalRegisterTool = vi.fn();
    const pi = {
      on: vi.fn(),
      registerTool: originalRegisterTool,
      getCommands: () => [],
      getThinkingLevel: () => "medium",
      setThinkingLevel: () => {},
    } as unknown as ExtensionAPI & { registerTool: (tool: ToolDefinition) => void };

    keysmithExtension(pi);

    expect(pi.registerTool, "Keysmith must wrap pi.registerTool because Pi has no public invokeTool API").not.toBe(originalRegisterTool);

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "intercom result" }], details: {} }));
    const tool = toolDefinitionForTest("intercom", execute as ToolDefinition["execute"]);
    pi.registerTool(tool);

    expect(originalRegisterTool, "decorated registerTool must preserve normal Pi tool registration").toHaveBeenCalledTimes(1);
    expect(originalRegisterTool).toHaveBeenCalledWith(tool);
  });

  it("dispatches tool-backed compat actions through captured allowlisted tools from extension startup", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void> | void>();
    const originalRegisterTool = vi.fn();
    const ui = new FakeUI(() => new FakeEditor());

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;
      await writeFile(
        join(agentDir, "settings.json"),
        JSON.stringify({
          piKeysmith: {
            leader: "<space>",
            spec: { i: { action: "pi-intercom.status", desc: "Intercom: Status" } },
          },
        }),
      );

      const pi = {
        on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
          handlers.set(event, handler);
        },
        registerTool: originalRegisterTool,
        getCommands: () => [],
        getThinkingLevel: () => "medium",
        setThinkingLevel: () => {},
      } as unknown as ExtensionAPI & { registerTool: (tool: ToolDefinition) => void };
      keysmithExtension(pi);

      const execute = vi.fn(async (_toolCallId, params) => ({
        content: [{ type: "text", text: `intercom status ok ${JSON.stringify(params)}` }],
        details: { hidden: "details must not be required for notify" },
      }));
      pi.registerTool(toolDefinitionForTest("intercom", execute as ToolDefinition["execute"]));

      await handlers.get("session_start")?.({}, { ...contextWithUI(ui), cwd });
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never) as KeysmithEditorWrapper | undefined;

      editor?.handleInput(" ");
      editor?.handleInput("i");

      await vi.waitFor(
        () => {
          expect(execute, "tool-backed action must call captured intercom execute").toHaveBeenCalledTimes(1);
          expect(execute.mock.calls[0]?.[1]).toEqual({ action: "status" });
          expect(ui.notifications.map(({ message }) => message).join("\n")).toContain("intercom status ok");
        },
        { timeout: 500, interval: 10 },
      );
    } finally {
      await handlers.get("session_shutdown")?.({}, { ...contextWithUI(ui), cwd });
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { force: true, recursive: true });
      await rm(agentDir, { force: true, recursive: true });
    }
  });

  it("wires pi.getCommands into Session Search action context from extension startup", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void> | void>();
    const getCommands = vi.fn(() => duplicateSearchProviderCommands());
    const ui = new FakeUI(() => new FakeEditor());

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;
      await writeFile(
        join(agentDir, "settings.json"),
        JSON.stringify({
          piKeysmith: {
            leader: "<space>",
            spec: { k: { action: SESSION_SEARCH_ACTION_IDS.stats, desc: "Session Search: Stats" } },
          },
        }),
      );
      keysmithExtension({
        on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
          handlers.set(event, handler);
        },
        getCommands,
        getThinkingLevel: () => "medium",
        setThinkingLevel: () => {},
      } as unknown as ExtensionAPI);

      await handlers.get("session_start")?.({}, { ...contextWithUI(ui), cwd });
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never) as KeysmithEditorWrapper | undefined;
      const submitted: string[] = [];
      editor?.setText("draft before session stats");
      if (editor) editor.onSubmit = (text) => submitted.push(text);

      editor?.handleInput(" ");
      editor?.handleInput("k");

      await vi.waitFor(
        () => {
          expect(getCommands).toHaveBeenCalledTimes(1);
          expect(submitted).toEqual(["/search:2 stats"]);
        },
        { timeout: 500, interval: 10 },
      );
      expect(editor?.getText()).toBe("draft before session stats");
    } finally {
      await handlers.get("session_shutdown")?.({}, { ...contextWithUI(ui), cwd });
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { force: true, recursive: true });
      await rm(agentDir, { force: true, recursive: true });
    }
  });

  it("submits Observability slash fallbacks through the active wrapper without clobbering an existing draft", () => {
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: {
        sequenceTimeoutMs: 1000,
        spec: {
          u: {
            name: "ui",
            o: { action: OBSERVABILITY_ACTION_IDS.dashboard, desc: "Observability: Dashboard" },
          },
        },
      },
    });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never) as KeysmithEditorWrapper | undefined;
      const submitted: string[] = [];
      editor?.setText("existing draft");
      if (editor) editor.onSubmit = (text) => submitted.push(text);

      editor?.handleInput("\u0018");
      editor?.handleInput("u");
      editor?.handleInput("o");

      expect(submitted).toEqual(["/obs"]);
      expect(editor?.getText()).toBe("existing draft");
    } finally {
      runtime.shutdown(contextWithUI(ui));
    }
  });

  it("dispatches Pi core app-action bridge bindings through active wrapper action handlers without synthesizing input or editing drafts", () => {
    const entries = Object.entries(PI_CORE_APP_ACTION_BRIDGE_MAPPINGS);
    const spec = Object.fromEntries(entries.map(([actionId], index) => [String(index + 1), { action: actionId, desc: `Pi Core app bridge ${actionId}` }]));
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000, spec } });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never) as KeysmithEditorWrapper | undefined;
      expect(editor).toBeInstanceOf(KeysmithEditorWrapper);
      const inner = editor?.inner as FakeEditor | undefined;
      const handlers = new Map<AppKeybinding, ReturnType<typeof vi.fn>>();
      for (const appKeybinding of Object.values(PI_CORE_APP_ACTION_BRIDGE_MAPPINGS)) {
        const handler = vi.fn();
        handlers.set(appKeybinding, handler);
        editor?.actionHandlers.set(appKeybinding, handler);
      }
      editor?.setText("draft before app action");

      entries.forEach(([_actionId, appKeybinding], index) => {
        editor?.handleInput("\u0018");
        editor?.handleInput(String(index + 1));

        expect(handlers.get(appKeybinding), `${appKeybinding} must be invoked via wrapper.actionHandlers`).toHaveBeenCalledTimes(1);
        expect(editor?.getText(), `${appKeybinding} must not mutate the active editor draft`).toBe("draft before app action");
      });
      expect(inner?.handledInputs, "app-action dispatch must not synthesize key input into the wrapped editor").toEqual([]);
    } finally {
      runtime.shutdown(contextWithUI(ui));
    }
  });

  it("reports a helpful missing app-action handler message and preserves draft text", () => {
    const actionId = "pi-core.editor.external";
    const appKeybinding = PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[actionId];
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: {
        sequenceTimeoutMs: 1000,
        spec: { e: { action: actionId, desc: "Pi Core: External editor" } },
      },
    });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never) as KeysmithEditorWrapper | undefined;
      const inner = editor?.inner as FakeEditor | undefined;
      editor?.setText("draft that must survive missing handler");

      editor?.handleInput("\u0018");
      editor?.handleInput("e");

      expect(editor?.getText()).toBe("draft that must survive missing handler");
      expect(inner?.handledInputs, "missing app-action handler must not be emulated by typing into the editor").toEqual([]);
      expect(
        ui.notifications.some(
          ({ message }) => message.includes(actionId) && message.includes(appKeybinding) && /handler|keybinding|unavailable|not available|missing/i.test(message),
        ),
        `expected missing handler notification to identify ${actionId} and ${appKeybinding}`,
      ).toBe(true);
    } finally {
      runtime.shutdown(contextWithUI(ui));
    }
  });

  it("rebuilds the active trie when an SDK action/default keymap is registered after start", () => {
    const handler = vi.fn();
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });

    runtime.start(contextWithUI(ui));
    const action = sdk.registerAction({
      id: "example.after-start",
      description: "After start action",
      handler,
    });
    const keymap = sdk.registerDefaultKeymaps({
      source: "after-start-extension",
      spec: { a: { action: "example.after-start", desc: "After start action" } },
    });

    try {
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("a");

      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      runtime.shutdown(contextWithUI(ui));
      keymap.dispose();
      action.dispose();
    }
  });

  it("dispatches a plugin-owned shim registered before Keysmith starts", () => {
    const handler = vi.fn();
    const shim = registerShimForTest(pluginShimDescriptor("plugin:runtime-before-start", "runtime-shim.before-start", handler, "p"));
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("p");

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/project" }));
    } finally {
      runtime.shutdown(contextWithUI(ui));
      shim.dispose();
    }
  });

  it("rebuilds the active trie when a plugin-owned shim registers after Keysmith starts", () => {
    const handler = vi.fn();
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });

    runtime.start(contextWithUI(ui));
    const shim = registerShimForTest(pluginShimDescriptor("plugin:runtime-after-start", "runtime-shim.after-start", handler, "a"));

    try {
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("a");

      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      runtime.shutdown(contextWithUI(ui));
      shim.dispose();
    }
  });

  it("does not leave stale plugin shim actions or default specs across reload cleanup", () => {
    const handler = vi.fn();
    const shim = registerShimForTest(pluginShimDescriptor("plugin:runtime-reload-cleanup", "runtime-shim.reload-cleanup", handler, "z"));
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });
    const ctx = contextWithUI(ui);

    try {
      runtime.start(ctx);
      let editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("z");
      expect(handler).toHaveBeenCalledTimes(1);

      runtime.shutdown(ctx);
      shim.dispose();
      runtime.start(ctx);
      editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("z");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(sdk.getKeysmithRegistry().snapshot().actions.some((action) => action.id === "runtime-shim.reload-cleanup")).toBe(false);
      expect(sdk.getKeysmithRegistry().snapshot().defaultKeymaps.some((keymap) => keymap.source === "plugin:runtime-reload-cleanup")).toBe(false);
    } finally {
      runtime.shutdown(ctx);
      shim.dispose();
    }
  });

  it("dispatches replacement shim aliases for user specs that still bind deprecated compat action IDs", () => {
    const handler = vi.fn();
    const shim = registerShimForTest({
      id: "plugin:@kaiserlich-dev/pi-session-search-runtime-alias",
      sourceType: "plugin",
      displayName: "Official Session Search",
      targetPackages: ["npm:@kaiserlich-dev/pi-session-search"],
      replaces: ["compat:@kaiserlich-dev/pi-session-search"],
      actions: [
        {
          id: "pi-session-search.native.runtime-search",
          aliases: ["pi-session-search.sessions.search"],
          description: "Session Search: Search sessions",
          sourceType: "plugin",
          sourceDisplayName: "Official Session Search",
          sideEffect: "none",
          implementationStability: "native",
          handler,
        },
      ],
      defaultSpec: { s: { "/": { action: "pi-session-search.native.runtime-search", desc: "Session Search: Search sessions" } } },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: {
        sequenceTimeoutMs: 1000,
        spec: { u: { action: "pi-session-search.sessions.search", desc: "User binding to old compat ID" } } as never,
      },
    });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("u");

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/project" }));
    } finally {
      runtime.shutdown(contextWithUI(ui));
      shim.dispose();
    }
  });

  it("dispatches SDK actions with the current session context after restart", () => {
    const seenCwds: string[] = [];
    const action = sdk.registerAction({
      id: "example.current-context",
      handler: ({ cwd }) => {
        seenCwds.push(cwd);
      },
    });
    const keymap = sdk.registerDefaultKeymaps({
      source: "current-context-extension",
      spec: { c: { action: "example.current-context", desc: "Current context" } },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });

    try {
      runtime.start({ ...contextWithUI(ui), cwd: "/tmp/first" });
      let editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("c");
      runtime.shutdown({ ...contextWithUI(ui), cwd: "/tmp/first" });

      runtime.start({ ...contextWithUI(ui), cwd: "/tmp/second" });
      editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("c");

      expect(seenCwds).toEqual(["/tmp/first", "/tmp/second"]);
    } finally {
      runtime.shutdown({ ...contextWithUI(ui), cwd: "/tmp/second" });
      keymap.dispose();
      action.dispose();
    }
  });

  it("removes SDK actions/keymaps on dispose and does not leave stale registrations across restart", () => {
    const handler = vi.fn();
    const action = sdk.registerAction({ id: "example.disposed", handler });
    const keymap = sdk.registerDefaultKeymaps({
      source: "disposed-extension",
      spec: { d: { action: "example.disposed", desc: "Disposed action" } },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });
    const ctx = contextWithUI(ui);

    try {
      keymap.dispose();
      action.dispose();
      runtime.start(ctx);
      runtime.shutdown(ctx);
      runtime.start(ctx);
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("d");

      expect(handler).not.toHaveBeenCalled();
    } finally {
      runtime.shutdown(ctx);
      keymap.dispose();
      action.dispose();
    }
  });

  it("keeps built-in compat shim actions and default specs idempotent when the extension entrypoint is invoked again", async () => {
    type SessionHandler = (event: unknown, ctx: ExtensionContext) => Promise<void> | void;

    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const loadedEntrypoints: Array<Map<string, SessionHandler>> = [];
    const ui = new FakeUI(() => new FakeEditor());
    const ctx = { ...contextWithUI(ui), cwd };
    const invokeEntrypoint = () => {
      const handlers = new Map<string, SessionHandler>();
      keysmithExtension({
        on: (event: string, handler: SessionHandler) => {
          handlers.set(event, handler);
        },
        getThinkingLevel: () => "medium",
        setThinkingLevel: () => {},
      } as unknown as ExtensionAPI);
      loadedEntrypoints.push(handlers);
      return handlers;
    };
    const snapshotCounts = async () => {
      const registry = sdk.getKeysmithRegistry().snapshot();
      const effective = await loadPiKeysmithConfig({ cwd, agentDir });
      return {
        actionCount: registry.actions.filter((action) => action.id === CORE_SETTINGS_ACTION_ID).length,
        defaultSpecCount: actionCountInSpec(effective.config.spec, CORE_SETTINGS_ACTION_ID),
        boundDefault: Object.prototype.hasOwnProperty.call(effective.config.spec, CORE_SETTINGS_KEY),
        registryDiagnostics: registry.diagnostics.filter(isPiCoreCompatDiagnostic),
        configDiagnostics: effective.diagnostics.filter((diagnostic) => isPiCoreCompatDiagnostic(diagnostic.message)),
      };
    };

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;

      const firstEntrypoint = invokeEntrypoint();
      await firstEntrypoint.get("session_start")?.({}, ctx);
      const afterFirstEntrypoint = await snapshotCounts();

      const reloadedEntrypoint = invokeEntrypoint();
      await reloadedEntrypoint.get("session_start")?.({}, ctx);
      const afterReloadedEntrypoint = await snapshotCounts();

      await reloadedEntrypoint.get("session_shutdown")?.({}, ctx);
      await reloadedEntrypoint.get("session_start")?.({}, ctx);
      const afterReloadedEntrypointRestart = await snapshotCounts();

      const expected = {
        actionCount: 1,
        defaultSpecCount: 1,
        boundDefault: true,
        registryDiagnostics: [],
        configDiagnostics: [],
      };
      expect(afterFirstEntrypoint).toMatchObject(expected);
      expect(afterReloadedEntrypoint).toMatchObject(expected);
      expect(afterReloadedEntrypointRestart).toMatchObject(expected);
    } finally {
      for (const handlers of [...loadedEntrypoints].reverse()) {
        await handlers.get("session_shutdown")?.({}, ctx);
      }
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { force: true, recursive: true });
      await rm(agentDir, { force: true, recursive: true });
    }
  });

  it("fails closed for SDK default keymap conflicts with the built-in default", () => {
    const handler = vi.fn();
    const action = sdk.registerAction({ id: "example.conflicting-default", handler });
    const keymap = sdk.registerDefaultKeymaps({
      source: "conflict-extension",
      spec: { t: { action: "example.conflicting-default", desc: "Conflicting default" } },
    });
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({ config: { sequenceTimeoutMs: 1000 } });

    try {
      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput("\u0018");
      editor?.handleInput("t");

      expect(ui.toolsExpanded).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      runtime.shutdown(contextWithUI(ui));
      keymap.dispose();
      action.dispose();
    }
  });

  it("reports deterministic diagnostics for duplicate SDK action IDs", () => {
    const first = sdk.registerAction({ id: "example.duplicate", handler: vi.fn() });

    try {
      expect(() => sdk.registerAction({ id: "example.duplicate", handler: vi.fn() })).toThrow(
        /duplicate action id: example\.duplicate/i,
      );
      expect(sdk.getKeysmithRegistry().snapshot().diagnostics.at(-1)).toContain(
        "pi-keysmith SDK duplicate action id: example.duplicate",
      );
    } finally {
      first.dispose();
    }
  });

  it("starts inactive", () => {
    const runtime = createRuntime();

    expect(runtime.started).toBe(false);
  });

  it("wraps a prior editor factory and toggles tool expansion with ctrl+x t e", () => {
    const inner = new FakeEditor();
    const previousFactory: EditorFactory = () => inner;
    const ui = new FakeUI(previousFactory);
    const runtime = createRuntime();

    runtime.start(contextWithUI(ui));
    const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
    expect(editor).toBeInstanceOf(KeysmithEditorWrapper);

    editor?.handleInput("a");
    editor?.handleInput("\u0018");
    editor?.handleInput("t");
    editor?.handleInput("e");

    expect(runtime.started).toBe(true);
    expect(ui.status.get("pi-keysmith")).toBe("keysmith ready");
    expect(inner.handledInputs).toEqual(["a"]);
    expect(ui.toolsExpanded).toBe(true);

    runtime.shutdown(contextWithUI(ui));

    expect(runtime.started).toBe(false);
    expect(ui.factory).toBe(previousFactory);
    expect(ui.status.get("pi-keysmith")).toBeUndefined();
  });

  it("applies the configured whichKeyKeyColor to runtime-created which-key overlay rendering", () => {
    vi.useFakeTimers();
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    const ctx = contextWithUI(ui);
    const shown: Array<{ component: Component }> = [];
    const trie: BindingTrie = {
      children: new Map([["x", { key: "x", action: "custom.run", desc: "Run action", children: new Map() }]]),
    };
    const runtime = createRuntime({
      config: { leader: "<space>", whichKeyDelayMs: 25, sequenceTimeoutMs: 1000, whichKeyKeyColor: "cyan" },
      trie,
    });

    try {
      runtime.start(ctx);
      const editor = ui.factory?.(
        {
          requestRender() {},
          showOverlay(component: Component) {
            shown.push({ component });
            return { hide() {} };
          },
        } as never,
        {
          fg: (color: string, text: string) => `<fg:${color}>${text}</fg:${color}>`,
          bold: (text: string) => `<bold>${text}</bold>`,
          borderColor: (text: string) => text,
          selectList: {},
        } as never,
        { matches() { return false; } } as never,
      );

      editor?.handleInput(" ");
      vi.advanceTimersByTime(25);

      expect(shown).toHaveLength(1);
      const rendered = shown[0]?.component.render(80).join("\n") ?? "";
      const actionLine = rendered.split("\n").find((line) => line.includes("Run action")) ?? "";
      const labelStart = actionLine.indexOf("Run action");
      const keySegment = actionLine.slice(0, labelStart);
      const labelSegment = actionLine.slice(labelStart);

      expect(keySegment).toContain("x");
      expect(keySegment).toContain("<fg:cyan>");
      expect(keySegment).toContain("</fg:cyan>");
      expect(keySegment).toContain("<bold>");
      expect(keySegment).toContain("</bold>");
      expect(labelSegment).toContain("Run action");
      expect(labelSegment).not.toContain("<fg:cyan>");
      expect(labelSegment).not.toContain("<bold>");
    } finally {
      runtime.shutdown(ctx);
      vi.useRealTimers();
    }
  });


  it("styles runtime-created which-key rounded borders with the editor theme borderColor while preserving key and label styling", () => {
    vi.useFakeTimers();
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    const ctx = contextWithUI(ui);
    const shown: Array<{ component: Component }> = [];
    const trie: BindingTrie = {
      children: new Map([["x", { key: "x", action: "custom.run", desc: "Run action", children: new Map() }]]),
    };
    const runtime = createRuntime({
      config: { leader: "<space>", whichKeyDelayMs: 25, sequenceTimeoutMs: 1000, whichKeyKeyColor: "yellow" },
      trie,
    });

    try {
      runtime.start(ctx);
      const editor = ui.factory?.(
        {
          requestRender() {},
          showOverlay(component: Component) {
            shown.push({ component });
            return { hide() {} };
          },
        } as never,
        {
          fg: (color: string, text: string) => `<fg:${color}>${text}</fg:${color}>`,
          bold: (text: string) => `<bold>${text}</bold>`,
          borderColor: (text: string) => `<chat-border>${text}</chat-border>`,
          selectList: {},
        } as never,
        { matches() { return false; } } as never,
      );

      editor?.handleInput(" ");
      vi.advanceTimersByTime(25);

      expect(shown).toHaveLength(1);
      const rendered = shown[0]?.component.render(80).join("\n") ?? "";
      const styledBorders = taggedSegments(rendered, "chat-border");

      for (const glyph of ["╭", "╮", "╰", "╯", "─", "│"]) {
        expect(styledBorders.join("")).toContain(glyph);
      }
      expectNoUnstyledBorderGlyphs(rendered, "chat-border");
      expect(styledBorders.some((segment) => segment.includes("Run action"))).toBe(false);
      expect(rendered).toContain("Run action");

      const keyStyledSegments = taggedSegments(rendered, "fg:yellow");
      expect(keyStyledSegments).toContain("<bold>x</bold>");
      expect(keyStyledSegments.some((segment) => segment.includes("Run action"))).toBe(false);
      expect(keyStyledSegments.join("")).not.toMatch(/[╭╮╰╯─│]/);
    } finally {
      runtime.shutdown(ctx);
      vi.useRealTimers();
    }
  });

  it("styles runtime-created which-key rounded borders with the active editor borderColor when app theme has no borderColor", () => {
    vi.useFakeTimers();
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    ui.theme = {
      fg: (color: string, text: string) => `<app-fg:${color}>${text}</app-fg:${color}>`,
      bold: (text: string) => `<app-bold>${text}</app-bold>`,
    };
    const ctx = contextWithUI(ui);
    const shown: Array<{ component: Component }> = [];
    const trie: BindingTrie = {
      children: new Map([["x", { key: "x", action: "custom.run", desc: "Run action", children: new Map() }]]),
    };
    const runtime = createRuntime({
      config: { leader: "<space>", whichKeyDelayMs: 25, sequenceTimeoutMs: 1000, whichKeyKeyColor: "yellow" },
      trie,
    });

    try {
      runtime.start(ctx);
      const editor = ui.factory?.(
        {
          requestRender() {},
          showOverlay(component: Component) {
            shown.push({ component });
            return { hide() {} };
          },
        } as never,
        {
          borderColor: (text: string) => `<initial-editor-border>${text}</initial-editor-border>`,
          selectList: {},
        } as never,
        { matches() { return false; } } as never,
      );
      expect(editor).toBeInstanceOf(KeysmithEditorWrapper);
      const wrapper = editor as KeysmithEditorWrapper;
      const activeBorderColor = (text: string) => `<active-chat-border>${text}</active-chat-border>`;
      wrapper.borderColor = activeBorderColor;

      wrapper.handleInput(" ");
      vi.advanceTimersByTime(25);

      expect(shown).toHaveLength(1);
      const rendered = shown[0]?.component.render(80).join("\n") ?? "";
      const styledBorders = taggedSegments(rendered, "active-chat-border");

      for (const glyph of ["╭", "╮", "╰", "╯", "─", "│"]) {
        expect(styledBorders.join("")).toContain(glyph);
      }
      expectNoUnstyledBorderGlyphs(rendered, "active-chat-border");
      expect(rendered).not.toContain("<initial-editor-border>");
      expect(rendered).toContain("Run action");
    } finally {
      runtime.shutdown(ctx);
      vi.useRealTimers();
    }
  });

  it("uses the effective config/trie for leader dispatch instead of hardcoded defaults", () => {
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    const runtime = createRuntime({
      config: { leader: "<space>", sequenceTimeoutMs: 1000 },
      trie: {
        children: new Map([
          ["x", { key: "x", action: "pi-keysmith.tools.expand.toggle", children: new Map() }],
        ]),
      },
    } as never);

    runtime.start(contextWithUI(ui));
    const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);

    editor?.handleInput(" ");
    editor?.handleInput("x");

    expect(ui.toolsExpanded).toBe(true);
    expect(inner.handledInputs).toEqual([]);
  });

  it("dispatches built-in thinking actions from leader bindings with the live Pi thinking context", () => {
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    let thinkingLevel = "low";
    const runtime = createRuntime({
      config: { leader: "<space>", sequenceTimeoutMs: 1000 },
      actionContext: {
        getThinkingLevel: () => thinkingLevel,
        setThinkingLevel: (level: string) => {
          thinkingLevel = level;
        },
      },
      trie: {
        children: new Map([
          ["n", { key: "n", action: "pi-keysmith.thinking.next", children: new Map() }],
        ]),
      },
    } as never);

    runtime.start({
      ...contextWithUI(ui),
      model: {
        id: "fake-model",
        provider: "fake-provider",
        name: "Fake Model",
        contextWindow: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: true,
        thinkingLevelMap: { medium: null, xhigh: "xhigh" },
      } as never,
    });
    const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);

    editor?.handleInput(" ");
    editor?.handleInput("n");

    expect(thinkingLevel).toBe("high");
    expect(inner.handledInputs).toEqual([]);
  });

  it("<leader>? opens the Keysmith action/keymap browser", async () => {
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    const runtime = createRuntime({ config: { leader: "<space>", sequenceTimeoutMs: 1000 } });
    const ctx = contextWithUI(ui);

    try {
      runtime.start(ctx);
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);

      editor?.handleInput(" ");
      editor?.handleInput("?");
      await Promise.resolve();

      await vi.waitFor(() => expect(ui.select).toHaveBeenCalledTimes(1), { timeout: 500, interval: 10 });
      const selectCall = ui.select.mock.calls.at(-1);
      const options = (selectCall?.[1] as string[] | undefined) ?? [];
      const actionsBrowser = options.find((option) => option.includes("pi-keysmith.actions.open"));
      const thinkingNext = options.find((option) => option.includes("pi-core.thinking.next"));
      expect(selectCall?.[0]).toMatch(/keysmith.*(action|keymap)|action.*keymap/i);
      expect(actionsBrowser).toMatch(/\[\?\][\s\S]*core/i);
      expect(thinkingNext).toMatch(/\[tn\][\s\S]*core/i);
      expect(inner.handledInputs).toEqual([]);
    } finally {
      runtime.shutdown(ctx);
    }
  });

  it("dispatches Pi core thinking and tools-toggle defaults from the default t group", () => {
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    let thinkingLevel = "low";
    const runtime = createRuntime({
      config: { leader: "<space>", sequenceTimeoutMs: 1000 },
      actionContext: {
        getThinkingLevel: () => thinkingLevel,
        setThinkingLevel: (level: string) => {
          thinkingLevel = level;
        },
      },
    } as never);

    runtime.start({
      ...contextWithUI(ui),
      model: {
        id: "fake-model",
        provider: "fake-provider",
        name: "Fake Model",
        contextWindow: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: true,
        thinkingLevelMap: { medium: null, xhigh: "xhigh" },
      } as never,
    });
    const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);

    editor?.handleInput(" ");
    editor?.handleInput("t");
    editor?.handleInput("n");
    expect(thinkingLevel).toBe("high");

    editor?.handleInput(" ");
    editor?.handleInput("t");
    editor?.handleInput("e");
    expect(ui.toolsExpanded).toBe(true);
    expect(inner.handledInputs).toEqual([]);
  });

  it("installs a default editor wrapper when no prior editor factory exists", () => {
    const ui = new FakeUI(undefined);
    const runtime = createRuntime();
    const theme = {
      borderColor: (str: string) => str,
      selectList: {},
    };

    runtime.start(contextWithUI(ui));
    const editor = ui.factory?.({ requestRender() {} } as never, theme as never, { matches() { return false; } } as never);

    expect(editor).toBeInstanceOf(KeysmithEditorWrapper);
    expect((editor as KeysmithEditorWrapper).inner).toBeTruthy();

    runtime.shutdown(contextWithUI(ui));

    expect(ui.factory).toBeUndefined();
  });

  it("prevents double-wrapping the previous Keysmith factory across repeated starts", () => {
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    const runtime = createRuntime();
    const ctx = contextWithUI(ui);

    runtime.start(ctx);
    runtime.start(ctx);
    const editor = ui.factory?.(undefined as never, undefined as never, undefined as never) as KeysmithEditorWrapper;

    expect(editor[KEYSMITH_WRAPPER_MARKER]).toBe(true);
    expect((editor.inner as unknown as Record<PropertyKey, unknown>)[KEYSMITH_WRAPPER_MARKER]).not.toBe(true);
    expect(editor.inner).toBe(inner);

    runtime.shutdown(ctx);
  });

  it("cleans old wrappers before restarting so pending timers do not duplicate", () => {
    vi.useFakeTimers();
    try {
      const previousFactory: EditorFactory = () => new FakeEditor();
      const ui = new FakeUI(previousFactory);
      const runtime = createRuntime();
      const ctx = contextWithUI(ui);

      runtime.start(ctx);
      vi.runOnlyPendingTimers();
      const firstEditor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      firstEditor?.handleInput("\u0018");
      expect(vi.getTimerCount()).toBe(2);

      runtime.start(ctx);
      vi.runOnlyPendingTimers();

      expect(vi.getTimerCount()).toBe(0);
      const secondEditor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      secondEditor?.handleInput("\u0018");
      secondEditor?.handleInput("t");
      secondEditor?.handleInput("e");

      expect(ui.toolsExpanded).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a load-order diagnostic when a later editor factory overwrites the Keysmith wrapper", () => {
    const previousFactory: EditorFactory = () => new FakeEditor();
    const laterFactory: EditorFactory = () => new FakeEditor();
    const ui = new FakeUI(previousFactory);
    const runtime = createRuntime();

    runtime.start(contextWithUI(ui));
    ui.setEditorComponent(laterFactory);
    runtime.shutdown(contextWithUI(ui));

    expect(ui.factory).toBe(laterFactory);
    expect(ui.notifications).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("Keysmith editor wrapper inactive"),
        type: "warning",
      }),
    ]);
  });

  it("does not emit wrapper-inactive warning while a controlled reload session_start cleans up a replaced factory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const previousFactory: EditorFactory = () => new FakeEditor();
    const replacementDuringReload: EditorFactory = () => new FakeEditor();
    const ui = new FakeUI(previousFactory);
    const sessionStartHandlers: Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void> = [];
    const sessionShutdownHandlers: Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void> = [];
    const ctx = { ...contextWithUI(ui), cwd };

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;
      keysmithExtension({
        on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
          if (event === "session_start") sessionStartHandlers.push(handler);
          if (event === "session_shutdown") sessionShutdownHandlers.push(handler);
        },
        getThinkingLevel: () => "medium",
        setThinkingLevel: () => {},
      } as unknown as ExtensionAPI);

      expect(sessionStartHandlers.length).toBeGreaterThan(0);
      await sessionStartHandlers[0]?.({}, ctx);
      ui.setEditorComponent(replacementDuringReload);

      await sessionStartHandlers[0]?.({}, ctx);

      expect(ui.status.get("pi-keysmith")).toBe("keysmith ready");
      expect(ui.notifications.some((notification) => notification.message.includes("Keysmith editor wrapper inactive"))).toBe(false);
    } finally {
      await sessionShutdownHandlers[0]?.({}, ctx);
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { force: true, recursive: true });
      await rm(agentDir, { force: true, recursive: true });
    }
  });

  it("reports a startup load-order diagnostic when the wrapper is overwritten before first use", () => {
    vi.useFakeTimers();
    try {
      const previousFactory: EditorFactory = () => new FakeEditor();
      const laterFactory: EditorFactory = () => new FakeEditor();
      const ui = new FakeUI(previousFactory);
      const runtime = createRuntime();

      runtime.start(contextWithUI(ui));
      ui.setEditorComponent(laterFactory);
      vi.runOnlyPendingTimers();

      expect(ui.notifications).toEqual([
        expect.objectContaining({
          message: expect.stringContaining("Keysmith editor wrapper inactive"),
          type: "warning",
        }),
      ]);

      runtime.shutdown(contextWithUI(ui));

      expect(ui.factory).toBe(laterFactory);
      expect(ui.notifications).toEqual([
        expect.objectContaining({
          message: expect.stringContaining("Keysmith editor wrapper inactive"),
          type: "warning",
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns once per session when vim.normal is requested without a compatible wrapped editor", () => {
    const ui = new FakeUI(() => new FakeEditor());
    const runtime = createRuntime({
      config: { leader: "<space>", enabledWhen: ["editor", "vim.normal"], sequenceTimeoutMs: 1000 },
    });

    runtime.start(contextWithUI(ui));
    const firstEditor = ui.factory?.(undefined as never, undefined as never, undefined as never);
    const secondEditor = ui.factory?.(undefined as never, undefined as never, undefined as never);
    firstEditor?.handleInput(" ");
    secondEditor?.handleInput(" ");

    expect(ui.notifications).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("vim.normal"),
        type: "warning",
      }),
    ]);
  });

  it("keeps built-in editor context true while the editor wrapper is active", () => {
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);
    const runtime = createRuntime({
      config: { leader: "<space>", enabledWhen: ["editor"], sequenceTimeoutMs: 1000 },
    });

    runtime.start(contextWithUI(ui));
    const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
    editor?.handleInput(" ");
    editor?.handleInput("t");
    editor?.handleInput("e");

    expect(ui.toolsExpanded).toBe(true);
    expect(inner.handledInputs).toEqual([]);
  });

  it("keeps a missing action visible as unavailable and warns only when invoked", () => {
    vi.useFakeTimers();
    try {
      const ui = new FakeUI(() => new FakeEditor());
      const runtime = createRuntime({
        config: { leader: "<space>", whichKeyDelayMs: 50, sequenceTimeoutMs: 1000 },
        trie: {
          children: new Map([
            ["m", { key: "m", action: "optional.missing", desc: "Optional plugin action", unavailable: true, children: new Map() }],
          ]),
        },
      } as never);

      runtime.start(contextWithUI(ui));
      const editor = ui.factory?.(
        { requestRender() {}, showOverlay: () => ({ hide() {} }) } as never,
        { borderColor: (str: string) => str } as never,
        {} as never,
      );
      editor?.handleInput(" ");
      vi.advanceTimersByTime(50);

      expect(ui.notifications).toEqual([]);

      editor?.handleInput("m");

      expect(ui.notifications).toEqual([
        expect.objectContaining({
          message: expect.stringMatching(/optional\.missing.*unavailable|unavailable.*optional\.missing/i),
          type: "warning",
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs nonfatal startup config diagnostics without noisy UI notifications", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void> | void>();
    const ui = new FakeUI(() => new FakeEditor());

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;
      await writeFile(join(agentDir, "settings.json"), JSON.stringify({ piKeysmith: { leader: "<hyper>" } }));
      keysmithExtension({
        on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
          handlers.set(event, handler);
        },
      } as unknown as ExtensionAPI);

      await handlers.get("session_start")?.({}, { ...contextWithUI(ui), cwd });

      await expect(readFile(join(agentDir, "pi-keysmith.log"), "utf8")).resolves.toContain("leader");
      expect(ui.notifications.some((notification) => notification.message.includes("ignored invalid config"))).toBe(false);
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { force: true, recursive: true });
      await rm(agentDir, { force: true, recursive: true });
    }
  });

  it("loads user piKeysmith settings on session start", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-runtime-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void> | void>();
    const inner = new FakeEditor();
    const ui = new FakeUI(() => inner);

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;
      await writeFile(
        join(agentDir, "settings.json"),
        JSON.stringify({ piKeysmith: { leader: "<space>", spec: { x: { action: "pi-keysmith.tools.expand.toggle" } } } }),
      );
      keysmithExtension({
        on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
          handlers.set(event, handler);
        },
      } as unknown as ExtensionAPI);

      await handlers.get("session_start")?.({}, { ...contextWithUI(ui), cwd });
      const editor = ui.factory?.(undefined as never, undefined as never, undefined as never);
      editor?.handleInput(" ");
      editor?.handleInput("x");

      expect(ui.toolsExpanded).toBe(true);
      expect(inner.handledInputs).toEqual([]);
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { force: true, recursive: true });
      await rm(agentDir, { force: true, recursive: true });
    }
  });
});
