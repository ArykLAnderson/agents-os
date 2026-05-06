import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import * as sdk from "./index.js";
import { createNoopDisposable } from "./index.js";

type ShimActionRegistrationForTests = sdk.KeysmithActionRegistration & {
  readonly aliases?: readonly string[];
  readonly name?: string;
  readonly sideEffect?: "none" | "local-state" | "destructive" | "external";
  readonly implementationStability?: "native" | "appAction" | "slashFallback";
};

type ShimDescriptorForTests = {
  readonly id: string;
  readonly sourceType: "compat" | "plugin" | "user";
  readonly displayName: string;
  readonly targetPackages: readonly string[];
  readonly replaces?: readonly string[];
  readonly actions: readonly ShimActionRegistrationForTests[];
  readonly defaultSpec?: Record<string, unknown>;
};

type ShimCapableSdk = typeof sdk & {
  registerKeysmithShim?: (descriptor: ShimDescriptorForTests) => sdk.Disposable;
};

type ShimRegistrySnapshotForTests = sdk.KeysmithRegistrySnapshot & {
  readonly shims?: readonly ShimDescriptorForTests[];
};

function registerShimForTest(descriptor: ShimDescriptorForTests): sdk.Disposable {
  const registerKeysmithShim = (sdk as ShimCapableSdk).registerKeysmithShim;
  expect(registerKeysmithShim, "pi-keysmith-sdk should expose registerKeysmithShim").toEqual(expect.any(Function));
  return registerKeysmithShim?.(descriptor) ?? createNoopDisposable();
}

function shimSnapshot(): ShimRegistrySnapshotForTests {
  return sdk.getKeysmithRegistry().snapshot() as ShimRegistrySnapshotForTests;
}

function countById<T extends { id: string }>(entries: readonly T[] | undefined, id: string): number {
  return entries?.filter((entry) => entry.id === id).length ?? 0;
}

function countKeymapsFromSource(source: string): number {
  return shimSnapshot().defaultKeymaps.filter((keymap) => keymap.source === source).length;
}

describe("createNoopDisposable", () => {
  it("returns an object with a callable dispose method", () => {
    expect(() => createNoopDisposable().dispose()).not.toThrow();
  });
});

describe("documentation examples", () => {
  it("keeps the third-party README notification example on the invocation context instead of stale session ctx", async () => {
    const readme = await readFile(new URL("../../../examples/third-party-extension/README.md", import.meta.url), "utf8");
    const sample = extractFencedTypeScriptBlock(readme, (block) =>
      block.includes("registerAction(") && block.includes('id: "example.say-hello"'),
    );
    const handler = extractActionHandler(sample);

    expect(handlerUsesInvocationContextForNotification(handler)).toBe(true);
    expect(handlerUsesStaleSessionContext(handler)).toBe(false);
  });

  it("documents plugin-owned shim registration with same-package replacement and compat aliases", async () => {
    const readme = await readFile(new URL("../../../examples/third-party-extension/README.md", import.meta.url), "utf8");
    const sample = extractFencedTypeScriptBlock(readme, (block) => block.includes("registerKeysmithShim(") && block.includes("replaces"));

    expect(sample).toContain("registerKeysmithShim");
    expect(sample).toMatch(/id:\s*["']plugin:@kaiserlich-dev\/pi-session-search["']/);
    expect(sample).toMatch(/targetPackages:\s*\[[\s\S]*["']npm:@kaiserlich-dev\/pi-session-search["'][\s\S]*\]/);
    expect(sample).toMatch(/replaces:\s*\[[\s\S]*["']compat:@kaiserlich-dev\/pi-session-search["'][\s\S]*\]/);
    expect(sample).toMatch(/aliases:\s*\[[\s\S]*["']pi-session-search\.sessions\.search["'][\s\S]*\]/);
  });
});

type ActionHandlerExample = {
  readonly params: string;
  readonly body: string;
};

function extractFencedTypeScriptBlock(readme: string, matches: (block: string) => boolean): string {
  const blocks = [...readme.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)].map((match) => match[1]);
  const block = blocks.find((candidate) => candidate !== undefined && matches(candidate));
  if (!block) throw new Error("Expected README to contain the third-party TypeScript sample");
  return block;
}

function extractActionHandler(sample: string): ActionHandlerExample {
  const handlerIndex = sample.indexOf("handler:");
  if (handlerIndex < 0) throw new Error("Expected README action sample to include a handler property");

  const arrowIndex = sample.indexOf("=>", handlerIndex);
  if (arrowIndex < 0) throw new Error("Expected README action handler to be an arrow function");

  const params = sample.slice(handlerIndex + "handler:".length, arrowIndex).trim();
  const bodyStart = firstNonWhitespaceIndex(sample, arrowIndex + "=>".length);
  if (bodyStart < 0 || sample[bodyStart] !== "{") {
    throw new Error("Expected README action handler to use a block body");
  }

  const bodyEnd = findMatchingBrace(sample, bodyStart);
  return { params, body: sample.slice(bodyStart + 1, bodyEnd) };
}

function firstNonWhitespaceIndex(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (!/\s/.test(source[index])) return index;
  }
  return -1;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Expected README action handler block body to close");
}

function handlerUsesInvocationContextForNotification(handler: ActionHandlerExample): boolean {
  const contextName = handler.params.match(/^\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)?$/)?.[1];
  if (contextName) {
    return new RegExp(`\\b${escapeRegExp(contextName)}\\s*\\.\\s*ui\\s*\\?*\\.\\s*notify\\s*\\(`).test(
      handler.body,
    );
  }

  return /\{[\s\S]*\bui\b[\s\S]*\}/.test(handler.params) && /\bui\s*\?*\.\s*notify\s*\(/.test(handler.body);
}

function handlerUsesStaleSessionContext(handler: ActionHandlerExample): boolean {
  const contextName = handler.params.match(/^\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)?$/)?.[1];
  if (contextName === "ctx") return false;

  return /\bctx\s*\.\s*(?:hasUI|ui)\b/.test(handler.body);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("SDK registry shim helpers", () => {
  it("exposes registerKeysmithShim as the plugin/user-owned shim registration API", () => {
    expect((sdk as ShimCapableSdk).registerKeysmithShim).toEqual(expect.any(Function));
  });

  it("registers plugin-owned shims idempotently by shim id and removes all contributions on dispose", () => {
    const handler = vi.fn();
    const descriptor: ShimDescriptorForTests = {
      id: "plugin:example-idempotent",
      sourceType: "plugin",
      displayName: "Example Idempotent Plugin",
      targetPackages: ["npm:example-idempotent"],
      actions: [
        {
          id: "example-idempotent.open",
          name: "Example: Open",
          description: "Open the example panel",
          sideEffect: "none",
          implementationStability: "native",
          handler,
        },
      ],
      defaultSpec: { e: { action: "example-idempotent.open", desc: "Example: Open" } },
    };

    const first = registerShimForTest(descriptor);
    const second = registerShimForTest(descriptor);

    try {
      const snapshot = shimSnapshot();
      expect(countById(snapshot.shims, descriptor.id)).toBe(1);
      expect(countById(snapshot.actions, "example-idempotent.open")).toBe(1);
      expect(countKeymapsFromSource(descriptor.id)).toBe(1);
      expect(snapshot.diagnostics.filter((message) => /example-idempotent|duplicate/i.test(message))).toEqual([]);
    } finally {
      second.dispose();
      first.dispose();
    }

    const afterDispose = shimSnapshot();
    expect(countById(afterDispose.shims, descriptor.id)).toBe(0);
    expect(countById(afterDispose.actions, "example-idempotent.open")).toBe(0);
    expect(countKeymapsFromSource(descriptor.id)).toBe(0);
  });

  it("rejects and diagnoses plugin-owned replacements for non-matching canonical target packages", () => {
    const descriptor: ShimDescriptorForTests = {
      id: "plugin:unrelated-cross-package-replacement",
      sourceType: "plugin",
      displayName: "Unrelated Plugin",
      targetPackages: ["npm:unrelated-plugin"],
      replaces: ["compat:@kaiserlich-dev/pi-session-search"],
      actions: [
        {
          id: "unrelated-plugin.sessions.search",
          aliases: ["pi-session-search.sessions.search"],
          description: "Unrelated: Search sessions",
          sideEffect: "none",
          implementationStability: "native",
          handler: vi.fn(),
        },
      ],
      defaultSpec: { s: { "/": { action: "unrelated-plugin.sessions.search", desc: "Unrelated: Search sessions" } } },
    };

    expect(() => registerShimForTest(descriptor)).toThrow(/replace|target package|authorized|same package/i);
    const snapshot = shimSnapshot();
    expect(countById(snapshot.shims, descriptor.id)).toBe(0);
    expect(countById(snapshot.actions, "unrelated-plugin.sessions.search")).toBe(0);
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([expect.stringMatching(/plugin:unrelated-cross-package-replacement[\s\S]*compat:@kaiserlich-dev\/pi-session-search[\s\S]*(target package|authorized|same package)/i)]),
    );
  });

  it("exposes action aliases so deprecated compat IDs forward to replacement actions", async () => {
    const handler = vi.fn();
    const disposable = registerShimForTest({
      id: "plugin:@kaiserlich-dev/pi-session-search-alias-fixture",
      sourceType: "plugin",
      displayName: "Official Session Search",
      targetPackages: ["npm:@kaiserlich-dev/pi-session-search"],
      replaces: ["compat:@kaiserlich-dev/pi-session-search"],
      actions: [
        {
          id: "pi-session-search.native.search",
          aliases: ["pi-session-search.sessions.search"],
          name: "Session Search: Search sessions",
          description: "Session Search: Search sessions",
          sideEffect: "none",
          implementationStability: "native",
          handler,
        },
      ],
      defaultSpec: { s: { "/": { action: "pi-session-search.native.search", desc: "Session Search: Search sessions" } } },
    });

    try {
      const actions = shimSnapshot().actions;
      const native = actions.find((action) => action.id === "pi-session-search.native.search");
      const alias = actions.find((action) => action.id === "pi-session-search.sessions.search");

      expect(native).toEqual(expect.objectContaining({ id: "pi-session-search.native.search" }));
      expect(alias).toEqual(expect.objectContaining({ id: "pi-session-search.sessions.search" }));
      await alias?.handler({ cwd: "/tmp/project" });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/project" }));
    } finally {
      disposable.dispose();
    }
  });
});

describe("SDK registry helpers", () => {
  it("exports registerAction and registerDefaultKeymaps helpers that return disposables", () => {
    const actionDisposable = sdk.registerAction({
      id: "example.say-hello",
      description: "Say hello",
      handler: vi.fn(),
    });
    const keymapDisposable = sdk.registerDefaultKeymaps({
      source: "example-extension",
      spec: { h: { action: "example.say-hello", desc: "Say hello" } },
    });

    try {
      expect(actionDisposable).toEqual({ dispose: expect.any(Function) });
      expect(keymapDisposable).toEqual({ dispose: expect.any(Function) });
    } finally {
      keymapDisposable.dispose();
      actionDisposable.dispose();
    }
  });

  it("uses a global singleton registry so load order and multiple imports share registrations", async () => {
    const firstImport = await import("./index.js");
    const secondImport = await import("./index.js");

    const disposable = firstImport.registerAction({
      id: "example.shared-action",
      handler: vi.fn(),
    });

    try {
      expect(secondImport.__getKeysmithRegistryForTests().snapshot().actions).toContainEqual(
        expect.objectContaining({ id: "example.shared-action" }),
      );
    } finally {
      disposable.dispose();
    }
  });

  it("exposes a deterministic version guard diagnostic when the global singleton has an incompatible version", () => {
    const symbol = Symbol.for("pi-keysmith.sdk.registry");
    const previous = (globalThis as any)[symbol];
    (globalThis as any)[symbol] = { version: 999, actions: new Map(), defaultKeymaps: [] };

    try {
      expect(() => sdk.registerAction({ id: "example.version-guard", handler: vi.fn() })).toThrow(
        /pi-keysmith SDK registry version mismatch/i,
      );
    } finally {
      if (previous === undefined) delete (globalThis as any)[symbol];
      else (globalThis as any)[symbol] = previous;
    }
  });
});
