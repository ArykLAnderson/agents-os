import type { ExtensionAPI, ExtensionCommandContext, RegisteredCommand } from "@mariozechner/pi-coding-agent";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sdk from "pi-keysmith-sdk";
import { buildEffectiveConfig } from "./config.js";
import keysmithExtension from "./index.js";

class FakePi {
  readonly commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
  readonly handlers = new Map<string, unknown[]>();
  thinkingLevel = "low";

  on(event: string, handler: unknown): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void {
    this.commands.set(name, options);
  }

  getThinkingLevel(): string {
    return this.thinkingLevel;
  }

  setThinkingLevel(level: string): void {
    this.thinkingLevel = level;
  }
}

function model(overrides: Record<string, unknown>) {
  return {
    id: "fake-model",
    provider: "fake-provider",
    name: "Fake Model",
    contextWindow: 1000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...overrides,
  } as never;
}

function commandContext(overrides: Partial<ExtensionCommandContext> = {}): ExtensionCommandContext {
  return {
    hasUI: true,
    cwd: "/tmp/project",
    model: model({ reasoning: true, thinkingLevelMap: { medium: null, xhigh: "xhigh" } }),
    ui: {
      select: vi.fn(),
      notify: vi.fn(),
      getToolsExpanded: vi.fn(() => false),
      setToolsExpanded: vi.fn(),
    },
    ...overrides,
  } as unknown as ExtensionCommandContext;
}

const CORE_SHIM_ID = "compat:pi-core";
const CORE_SETTINGS_ACTION_ID = "pi-core.settings.open";
const CORE_SETTINGS_KEY = ",";
const SESSION_SEARCH_PACKAGE = "@kaiserlich-dev/pi-session-search";
const SESSION_SEARCH_SHIM_ID = "compat:@kaiserlich-dev/pi-session-search";
const SESSION_SEARCH_ACTION_IDS = {
  list: "pi-session-search.sessions.list",
  search: "pi-session-search.sessions.search",
  stats: "pi-session-search.sessions.stats",
  reindex: "pi-session-search.sessions.reindex",
} as const;

let previousAgentDir: string | undefined;
let isolatedAgentDir: string | undefined;

beforeEach(async () => {
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  isolatedAgentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-commands-agent-dir-"));
  process.env.PI_CODING_AGENT_DIR = isolatedAgentDir;
});

afterEach(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (isolatedAgentDir) await rm(isolatedAgentDir, { recursive: true, force: true });
  isolatedAgentDir = undefined;
  previousAgentDir = undefined;
});

function expectLastSelectWithoutFiniteTimeout(select: ReturnType<typeof vi.fn>): void {
  const options = select.mock.calls.at(-1)?.[2] as { timeout?: unknown } | undefined;
  expect(Number.isFinite(options?.timeout)).toBe(false);
}

function selectedOptions(select: ReturnType<typeof vi.fn>): string[] {
  return (select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
}

type BrowserActionMetadata = {
  readonly name?: string;
  readonly sourceType?: "core" | "compat" | "plugin" | "user" | "project";
  readonly sourceDisplayName?: string;
  readonly available?: boolean;
  readonly availabilityReason?: string;
};

type ShimDescriptorForTests = {
  readonly id: string;
  readonly sourceType: "compat" | "plugin" | "user";
  readonly displayName: string;
  readonly targetPackages: readonly string[];
  readonly replaces?: readonly string[];
  readonly actions: ReadonlyArray<Parameters<typeof sdk.registerAction>[0] & BrowserActionMetadata & {
    readonly aliases?: readonly string[];
    readonly sideEffect?: "none" | "local-state" | "destructive" | "external";
    readonly implementationStability?: "native" | "appAction" | "slashFallback";
  }>;
  readonly defaultSpec?: Record<string, unknown>;
};

type ShimCapableSdk = typeof sdk & {
  registerKeysmithShim?: (descriptor: ShimDescriptorForTests) => sdk.Disposable;
};

function registerBrowserAction(registration: Parameters<typeof sdk.registerAction>[0] & BrowserActionMetadata): sdk.Disposable {
  return sdk.registerAction(registration as Parameters<typeof sdk.registerAction>[0]);
}

function registerShimForTest(descriptor: ShimDescriptorForTests): sdk.Disposable {
  const registerKeysmithShim = (sdk as ShimCapableSdk).registerKeysmithShim;
  expect(registerKeysmithShim, "pi-keysmith-sdk should expose registerKeysmithShim").toEqual(expect.any(Function));
  return registerKeysmithShim?.(descriptor) ?? { dispose() {} };
}

function browserOption(options: readonly string[], actionId: string): string {
  const option = options.find((candidate) => candidate.includes(actionId));
  expect(option, `expected browser option for ${actionId}`).toBeDefined();
  return option ?? "";
}

function expectNoBrowserOption(options: readonly string[], actionId: string): void {
  expect(options.some((candidate) => candidate.includes(actionId)), `expected no browser option for ${actionId}`).toBe(false);
}

function browserOptions(options: readonly string[], actionId: string): string[] {
  const matches = options.filter((candidate) => candidate.includes(actionId));
  expect(matches, `expected browser option for ${actionId}`).not.toHaveLength(0);
  return matches;
}

function optionIndex(options: readonly string[], actionId: string): number {
  return options.indexOf(browserOptions(options, actionId)[0] ?? "");
}

function optionDisplaysLeaderRelativeSequence(option: string, sequence: string): boolean {
  return sequenceDisplayPattern(sequence).test(option);
}

function expectActionSequencesDisplayed(options: readonly string[], actionId: string, sequences: readonly string[]): void {
  const matches = browserOptions(options, actionId);
  const combinedRows = matches.join("\n");

  for (const sequence of sequences) {
    expect(
      matches.some((option) => optionDisplaysLeaderRelativeSequence(option, sequence)),
      `expected ${actionId} to display leader-relative sequence ${sequence}`,
    ).toBe(true);
  }
  expect(combinedRows).not.toMatch(/<leader>/i);
}

function expectBoundRowsLexicallySortedByDisplayedSequence(options: readonly string[], expectedSequencesByAction: ReadonlyMap<string, readonly string[]>): void {
  const rows = options.flatMap((option) => {
    for (const [actionId, expectedSequences] of expectedSequencesByAction) {
      if (!option.includes(actionId)) continue;
      const displayedSequences = expectedSequences.filter((sequence) => optionDisplaysLeaderRelativeSequence(option, sequence));
      expect(displayedSequences, `expected ${actionId} row to display at least one bound key sequence`).not.toHaveLength(0);
      expect(sequencesInDisplayOrder(option, displayedSequences), `expected ${actionId} row key sequences to be displayed lexically`).toEqual(
        [...displayedSequences].sort(compareKeySequences),
      );
      return [{ sortKey: [...displayedSequences].sort(compareKeySequences)[0] ?? "" }];
    }
    return [];
  });

  expect(rows, "expected at least one bound browser row").not.toHaveLength(0);
  expect(rows.map((row) => row.sortKey), "expected all bound browser rows to be sorted by key sequence").toEqual(
    rows.map((row) => row.sortKey).sort(compareKeySequences),
  );
}

function sequencesInDisplayOrder(option: string, sequences: readonly string[]): string[] {
  return [...sequences].sort((left, right) => option.search(sequenceDisplayPattern(left)) - option.search(sequenceDisplayPattern(right)));
}

function compareKeySequences(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sequenceDisplayPattern(sequence: string): RegExp {
  const compact = sequence.replace(/\s+/g, "");
  const sequencePattern = compact.split("").map(escapeRegExp).join("\\s*");
  return new RegExp(`(^|[^\\p{L}\\p{N}._-])${sequencePattern}($|[^\\p{L}\\p{N}._-])`, "iu");
}

function searchCorpusForOption(options: readonly string[], opts: unknown, option: string): string {
  const optionIndex = options.indexOf(option);
  const maybeRecord = opts as Record<string, unknown> | undefined;
  const searchText = maybeRecord?.searchText ?? maybeRecord?.getSearchText ?? maybeRecord?.itemSearchText;
  if (typeof searchText === "function") return String(searchText(option, optionIndex));

  for (const key of ["searchByOption", "searchTextByOption", "searchCorpusByOption"]) {
    const byOption = maybeRecord?.[key];
    if (byOption && typeof byOption === "object" && option in byOption) return String((byOption as Record<string, unknown>)[option]);
  }

  for (const key of ["searchCorpus", "searchText", "searches"]) {
    const byIndex = maybeRecord?.[key];
    if (Array.isArray(byIndex) && optionIndex >= 0) return String(byIndex[optionIndex]);
  }

  return option;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

describe("Keysmith slash commands", () => {
  it("registers /keysmith-actions and /keysmith-doctor once when the extension loads", () => {
    const pi = new FakePi();

    keysmithExtension(pi as unknown as ExtensionAPI);
    keysmithExtension(pi as unknown as ExtensionAPI);

    expect([...pi.commands.keys()].sort()).toEqual(["keysmith-actions", "keysmith-doctor"]);
  });

  it("/keysmith-actions uses the VS-13 browser for normal actions without metadata and invokes the selected action", async () => {
    const pi = new FakePi();
    const handler = vi.fn();
    const handles: sdk.Disposable[] = [];

    try {
      handles.push(
        sdk.registerAction({ id: "example.available", description: "Available action", handler }),
        sdk.registerDefaultKeymaps({
          source: "plugin:example-source",
          spec: {
            a: { action: "example.available", desc: "Available action" },
            m: { action: "example.missing", desc: "Missing action" },
          },
        }),
      );
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext();
      vi.mocked(ctx.ui.select).mockImplementation(async (_title, options) => browserOption(options, "example.available"));

      await pi.commands.get("keysmith-actions")?.handler("", ctx);

      expect(ctx.ui.select).toHaveBeenCalled();
      const selectCall = vi.mocked(ctx.ui.select).mock.calls.at(-1);
      const options = selectedOptions(vi.mocked(ctx.ui.select));
      const available = browserOption(options, "example.available");
      const missing = browserOption(options, "example.missing");
      expect(selectCall?.[0]).toBe("Keysmith actions");
      expectActionSequencesDisplayed(options, "example.available", ["a"]);
      expect(available).toMatch(/available action/i);
      expect(available).toMatch(/plugin.*example-source|example-source.*plugin/i);
      expect(available).toMatch(/available/i);
      expectActionSequencesDisplayed(options, "example.missing", ["m"]);
      expect(missing).toMatch(/plugin.*example-source|example-source.*plugin/i);
      expect(missing).toMatch(/missing|unavailable/i);
      expectLastSelectWithoutFiniteTimeout(vi.mocked(ctx.ui.select));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/project" }));
    } finally {
      for (const handle of handles.reverse()) handle.dispose();
    }
  });

  it("/keysmith-actions keeps deprecated compat action IDs launchable through replacement shim aliases", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-actions-shim-alias-cwd-"));
    const handler = vi.fn();
    const shim = registerShimForTest({
      id: "plugin:@kaiserlich-dev/pi-session-search-browser-alias",
      sourceType: "plugin",
      displayName: "Official Session Search",
      targetPackages: ["npm:@kaiserlich-dev/pi-session-search"],
      replaces: [SESSION_SEARCH_SHIM_ID],
      actions: [
        {
          id: "pi-session-search.native.browser-search",
          aliases: [SESSION_SEARCH_ACTION_IDS.search],
          name: "Session Search: Search sessions",
          description: "Session Search: Search sessions",
          sourceType: "plugin",
          sourceDisplayName: "Official Session Search",
          sideEffect: "none",
          implementationStability: "native",
          handler,
        },
      ],
      defaultSpec: { s: { "/": { action: "pi-session-search.native.browser-search", desc: "Session Search: Search sessions" } } },
    });

    try {
      await mkdir(join(cwd, ".pi"), { recursive: true });
      await writeFile(
        join(cwd, ".pi", "keybindings.json"),
        JSON.stringify({ piKeysmith: { spec: { u: { action: SESSION_SEARCH_ACTION_IDS.search, desc: "User binding to old Session Search ID" } } } }),
      );
      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext({ cwd });
      vi.mocked(ctx.ui.select).mockImplementation(async (_title, options) => browserOption(options, SESSION_SEARCH_ACTION_IDS.search));

      await pi.commands.get("keysmith-actions")?.handler("", ctx);

      const options = selectedOptions(vi.mocked(ctx.ui.select));
      const aliasOption = browserOption(options, SESSION_SEARCH_ACTION_IDS.search);
      expectActionSequencesDisplayed(options, SESSION_SEARCH_ACTION_IDS.search, ["u"]);
      expect(aliasOption).toMatch(/Session Search/i);
      expect(aliasOption).toMatch(/plugin|Official Session Search/i);
      expect(aliasOption).toMatch(/available/i);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cwd }));
    } finally {
      shim.dispose();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("/keysmith-actions lists unavailable actions from effective project keybindings", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-actions-cwd-"));
    try {
      await mkdir(join(cwd, ".pi"), { recursive: true });
      await writeFile(
        join(cwd, ".pi", "keybindings.json"),
        JSON.stringify({ piKeysmith: { spec: { m: { action: "manual.missing", desc: "Manual missing action" } } } }),
      );
      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext({ cwd });
      vi.mocked(ctx.ui.select).mockResolvedValue(undefined);

      await pi.commands.get("keysmith-actions")?.handler("", ctx);

      expect(ctx.ui.select).toHaveBeenCalled();
      const selectCall = vi.mocked(ctx.ui.select).mock.calls.at(-1);
      const options = selectedOptions(vi.mocked(ctx.ui.select));
      const missing = browserOption(options, "manual.missing");
      expect(selectCall?.[0]).toBe("Keysmith actions");
      expectActionSequencesDisplayed(options, "manual.missing", ["m"]);
      expect(missing).toMatch(/manual missing action/i);
      expect(missing).toMatch(/project/i);
      expect(missing).toMatch(/missing|unavailable/i);
      expectLastSelectWithoutFiniteTimeout(vi.mocked(ctx.ui.select));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("/keysmith-actions builds the VS-13 browser rows with key sequences, ordering, source attribution, and metadata-only search", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-browser-cwd-"));
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-browser-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const handles: sdk.Disposable[] = [];

    try {
      process.env.PI_CODING_AGENT_DIR = agentDir;
      await mkdir(join(cwd, ".pi"), { recursive: true });
      await writeFile(
        join(agentDir, "keybindings.json"),
        JSON.stringify({ piKeysmith: { spec: { u: { action: "vs.three.user", desc: "Open neutral panel" } } } }),
      );
      await writeFile(
        join(cwd, ".pi", "keybindings.json"),
        JSON.stringify({
          piKeysmith: {
            compat: { defaultKeymapsEnabled: false },
            spec: {
              z: { action: "vs.three.project", desc: "Open neutral panel" },
              y: { action: "vs.three.missing", desc: "Open neutral panel" },
            },
          },
        }),
      );

      const expectedBoundSequences = new Map<string, readonly string[]>([
        ["vs.three.alpha", ["a"]],
        ["vs.three.multi", ["b", "cr"]],
        ["vs.three.gamma", ["gq"]],
        ["vs.three.keyonly", ["q"]],
        ["vs.three.user", ["u"]],
        ["vs.three.missing", ["y"]],
        ["vs.three.project", ["z"]],
      ]);

      handles.push(
        registerBrowserAction({ id: "vs.three.alpha", name: "Bound One", description: "Open neutral panel", sourceType: "plugin", sourceDisplayName: "Sample Plugin", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.multi", name: "Multi Bound", description: "Open neutral panel", sourceType: "plugin", sourceDisplayName: "Multi Source", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.gamma", name: "Bound Two", description: "Open neutral panel", sourceType: "compat", sourceDisplayName: "Sample Shim", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.project", name: "Bound Three", description: "Open neutral panel", sourceType: "project", sourceDisplayName: "Project keybindings", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.user", name: "Bound Four", description: "Open neutral panel", sourceType: "user", sourceDisplayName: "User keybindings", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.keyonly", name: "Session Browser", description: "Session Browser", sourceType: "plugin", sourceDisplayName: "Search Source", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.aaa-unbound-beta", name: "Zulu", description: "Neutral unbound", sourceType: "plugin", sourceDisplayName: "Beta Source", handler: vi.fn() }),
        registerBrowserAction({ id: "vs.three.zzz-unbound-alpha", name: "Alpha", description: "Neutral unbound", sourceType: "plugin", sourceDisplayName: "Alpha Source", handler: vi.fn() }),
        sdk.registerDefaultKeymaps({ source: "plugin:sample-plugin", spec: { a: { action: "vs.three.alpha", desc: "Open neutral panel" } } }),
        sdk.registerDefaultKeymaps({ source: "plugin:multi-source", spec: { b: { action: "vs.three.multi", desc: "Open neutral panel" }, c: { name: "multi", r: { action: "vs.three.multi", desc: "Open neutral panel" } } } }),
        sdk.registerDefaultKeymaps({ source: "compat:sample-shim", spec: { g: { name: "neutral", q: { action: "vs.three.gamma", desc: "Open neutral panel" } } } }),
        sdk.registerDefaultKeymaps({ source: "plugin:search-source", spec: { q: { action: "vs.three.keyonly", desc: "Session Browser" } } }),
      );

      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext({ cwd });
      vi.mocked(ctx.ui.select).mockResolvedValue(undefined);

      await pi.commands.get("keysmith-actions")?.handler("", ctx);

      const selectCall = vi.mocked(ctx.ui.select).mock.calls.at(-1);
      const options = selectedOptions(vi.mocked(ctx.ui.select));
      const alpha = browserOption(options, "vs.three.alpha");
      const gamma = browserOption(options, "vs.three.gamma");
      const project = browserOption(options, "vs.three.project");
      const user = browserOption(options, "vs.three.user");
      const missing = browserOption(options, "vs.three.missing");
      const keyOnly = browserOption(options, "vs.three.keyonly");
      const multiRows = browserOptions(options, "vs.three.multi");
      const unboundBeta = browserOption(options, "vs.three.aaa-unbound-beta");
      const unboundAlpha = browserOption(options, "vs.three.zzz-unbound-alpha");
      const core = browserOption(options, CORE_SETTINGS_ACTION_ID);

      for (const [actionId, sequences] of expectedBoundSequences) {
        expectActionSequencesDisplayed(options, actionId, sequences);
      }
      expectBoundRowsLexicallySortedByDisplayedSequence(options, expectedBoundSequences);
      expect(multiRows.flatMap((option) => ["b", "cr"].filter((sequence) => optionDisplaysLeaderRelativeSequence(option, sequence))).sort(compareKeySequences)).toEqual(["b", "cr"]);

      const lastBoundFixtureIndex = Math.max(...[...expectedBoundSequences.keys()].map((actionId) => optionIndex(options, actionId)));
      expect(lastBoundFixtureIndex).toBeLessThan(optionIndex(options, "vs.three.aaa-unbound-beta"));
      expect(lastBoundFixtureIndex).toBeLessThan(optionIndex(options, "vs.three.zzz-unbound-alpha"));
      expect(optionIndex(options, "vs.three.zzz-unbound-alpha")).toBeLessThan(optionIndex(options, "vs.three.aaa-unbound-beta"));

      expect(core).toMatch(/core/i);
      expect(gamma).toMatch(/compat|shim/i);
      expect(alpha).toMatch(/plugin/i);
      expect(multiRows.join("\n")).toMatch(/multi source|plugin/i);
      expect(user).toMatch(/user/i);
      expect(project).toMatch(/project/i);
      expect(missing).toMatch(/project|unavailable|missing/i);
      expect(unboundAlpha).toMatch(/alpha source/i);
      expect(unboundBeta).toMatch(/beta source/i);

      const keyOnlySearchCorpus = searchCorpusForOption(options, selectCall?.[2], keyOnly).toLowerCase();
      expect(keyOnlySearchCorpus).toContain("session browser");
      expect(keyOnlySearchCorpus).not.toMatch(/(^|[^a-z])q([^a-z]|$)/);
    } finally {
      for (const handle of handles.reverse()) handle.dispose();
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(cwd, { recursive: true, force: true });
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it("/keysmith-actions executes available selections and warns without crashing for missing or unavailable selections", async () => {
    const availableHandler = vi.fn();
    const unavailableHandler = vi.fn();
    const handles: sdk.Disposable[] = [];

    try {
      handles.push(
        registerBrowserAction({ id: "vs.select.available", name: "Available", description: "Can run", sourceType: "plugin", sourceDisplayName: "Selection Plugin", handler: availableHandler }),
        registerBrowserAction({
          id: "vs.select.unavailable",
          name: "Unavailable",
          description: "Cannot run",
          sourceType: "plugin",
          sourceDisplayName: "Selection Plugin",
          available: false,
          availabilityReason: "disabled by the current model",
          handler: unavailableHandler,
        }),
        sdk.registerDefaultKeymaps({
          source: "plugin:selection-plugin",
          spec: {
            x: { action: "vs.select.available", desc: "Can run" },
            m: { action: "vs.select.missing", desc: "Missing action" },
            n: { action: "vs.select.unavailable", desc: "Cannot run" },
          },
        }),
      );

      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext();
      let actionToSelect = "vs.select.available";
      vi.mocked(ctx.ui.select).mockImplementation(async (_title: string, options: string[]) => browserOption(options, actionToSelect));

      await pi.commands.get("keysmith-actions")?.handler("", ctx);
      expect(availableHandler).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/tmp/project" }));

      actionToSelect = "vs.select.missing";
      await expect(pi.commands.get("keysmith-actions")?.handler("", ctx)).resolves.toBeUndefined();
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/vs\.select\.missing[\s\S]*unavailable|missing/i), "warning");

      vi.mocked(ctx.ui.notify).mockClear();
      actionToSelect = "vs.select.unavailable";
      await expect(pi.commands.get("keysmith-actions")?.handler("", ctx)).resolves.toBeUndefined();
      expect(unavailableHandler).not.toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/vs\.select\.unavailable[\s\S]*disabled by the current model|unavailable/i), "warning");
    } finally {
      for (const handle of handles.reverse()) handle.dispose();
    }
  });

  it("/keysmith-actions invokes built-in thinking and tool actions with the live Pi/UI context", async () => {
    const pi = new FakePi();
    keysmithExtension(pi as unknown as ExtensionAPI);
    const ctx = commandContext();

    vi.mocked(ctx.ui.select).mockImplementationOnce(async (_title, options) => browserOption(options, "pi-core.thinking.next"));
    await pi.commands.get("keysmith-actions")?.handler("", ctx);
    expect(pi.thinkingLevel).toBe("high");

    vi.mocked(ctx.ui.select).mockImplementationOnce(async (_title, options) => browserOption(options, "pi-keysmith.tools.expand.toggle"));
    await pi.commands.get("keysmith-actions")?.handler("", ctx);
    expect(ctx.ui.setToolsExpanded).toHaveBeenCalledWith(true);
  });

  it("/keysmith-doctor reports real config layers and inactive wrapper state", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-doctor-cwd-"));
    try {
      await mkdir(join(cwd, ".pi"), { recursive: true });
      await writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify({ piKeysmith: { leader: "<space>" } }));
      await writeFile(join(cwd, ".pi", "keybindings.json"), JSON.stringify({ piKeysmith: { spec: { m: { action: "missing.action" } } } }));

      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext({ cwd });

      await pi.commands.get("keysmith-doctor")?.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining(join(cwd, ".pi", "settings.json")), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining(join(cwd, ".pi", "keybindings.json")), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("missing.action"), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("wrapper: inactive"), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("pi-keysmith.log"), "info");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("/keysmith-actions keeps Pi core shim actions available when default keymaps are disabled", async () => {
    const cases = [
      {
        name: "global defaultKeymapsEnabled:false",
        compat: { defaultKeymapsEnabled: false },
      },
      {
        name: "per-shim defaultKeymapEnabled:false",
        compat: { shims: { [CORE_SHIM_ID]: { defaultKeymapEnabled: false } } },
      },
    ];

    for (const testCase of cases) {
      const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-actions-compat-cwd-"));
      try {
        await mkdir(join(cwd, ".pi"), { recursive: true });
        const configFile = join(cwd, ".pi", "keybindings.json");
        await writeFile(configFile, JSON.stringify({ piKeysmith: { compat: testCase.compat } }));

        const pi = new FakePi();
        keysmithExtension(pi as unknown as ExtensionAPI);
        const ctx = commandContext({ cwd });
        vi.mocked(ctx.ui.select).mockResolvedValue(undefined);

        const effective = await buildEffectiveConfig({ rawJsonFiles: [configFile] });
        await pi.commands.get("keysmith-actions")?.handler("", ctx);

        expect(actionCountInSpec(effective.config.spec, CORE_SETTINGS_ACTION_ID), testCase.name).toBe(0);
        expect(effective.config.spec, testCase.name).not.toHaveProperty(CORE_SETTINGS_KEY);
        const options = selectedOptions(vi.mocked(ctx.ui.select));
        const coreSettings = browserOption(options, CORE_SETTINGS_ACTION_ID);
        expect(coreSettings, testCase.name).toMatch(/unbound/i);
        expect(coreSettings, testCase.name).toMatch(/core/i);
        expect(coreSettings, testCase.name).toMatch(/available/i);
        expect(coreSettings, testCase.name).not.toMatch(/missing|unavailable/i);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  });

  it("/keysmith-actions keeps Session Search actions visible but unbound when its default keymap is disabled", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-actions-session-search-cwd-"));
    try {
      await mkdir(join(cwd, ".pi"), { recursive: true });
      await writeFile(
        join(cwd, ".pi", "settings.json"),
        JSON.stringify({
          packages: [SESSION_SEARCH_PACKAGE],
          piKeysmith: { compat: { shims: { [SESSION_SEARCH_SHIM_ID]: { defaultKeymapEnabled: false } } } },
        }),
      );

      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext({ cwd });
      vi.mocked(ctx.ui.select).mockResolvedValue(undefined);

      await pi.commands.get("keysmith-actions")?.handler("", ctx);

      const options = selectedOptions(vi.mocked(ctx.ui.select));
      for (const actionId of Object.values(SESSION_SEARCH_ACTION_IDS)) {
        const option = browserOption(options, actionId);
        expect(option).toMatch(/unbound/i);
        expect(option).toMatch(/Session Search/i);
        expect(option).toMatch(/compat|Compatibility/i);
      }
      expect(optionDisplaysLeaderRelativeSequence(browserOption(options, SESSION_SEARCH_ACTION_IDS.list), "sl")).toBe(false);
      expect(optionDisplaysLeaderRelativeSequence(browserOption(options, SESSION_SEARCH_ACTION_IDS.search), "s/")).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("/keysmith-actions omits Session Search actions when the package is absent or the shim is disabled", async () => {
    const cases = [
      { name: "package absent", settings: { packages: ["some-other-package"], piKeysmith: {} } },
      {
        name: "shim disabled",
        settings: {
          packages: [SESSION_SEARCH_PACKAGE],
          piKeysmith: { compat: { shims: { [SESSION_SEARCH_SHIM_ID]: { enabled: false } } } },
        },
      },
    ];

    for (const testCase of cases) {
      const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-actions-session-search-disabled-cwd-"));
      try {
        await mkdir(join(cwd, ".pi"), { recursive: true });
        await writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify(testCase.settings));

        const pi = new FakePi();
        keysmithExtension(pi as unknown as ExtensionAPI);
        const ctx = commandContext({ cwd });
        vi.mocked(ctx.ui.select).mockResolvedValue(undefined);

        await pi.commands.get("keysmith-actions")?.handler("", ctx);

        const options = selectedOptions(vi.mocked(ctx.ui.select));
        for (const actionId of Object.values(SESSION_SEARCH_ACTION_IDS)) expectNoBrowserOption(options, actionId);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  });

  it("/keysmith-doctor surfaces compat shim diagnostics such as unknown shim IDs", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-doctor-compat-cwd-"));
    try {
      await mkdir(join(cwd, ".pi"), { recursive: true });
      await writeFile(
        join(cwd, ".pi", "keybindings.json"),
        JSON.stringify({ piKeysmith: { compat: { shims: { "compat:typo-core": { enabled: false } } } } }),
      );

      const pi = new FakePi();
      keysmithExtension(pi as unknown as ExtensionAPI);
      const ctx = commandContext({ cwd });

      await pi.commands.get("keysmith-doctor")?.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/unknown shim[\s\S]*compat:typo-core/i), "info");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("/keysmith-actions and /keysmith-doctor degrade gracefully without UI", async () => {
    const pi = new FakePi();
    keysmithExtension(pi as unknown as ExtensionAPI);
    const ctx = commandContext({ hasUI: false, ui: undefined as never });
    const actionsCommand = pi.commands.get("keysmith-actions");
    const doctorCommand = pi.commands.get("keysmith-doctor");

    expect(actionsCommand).toBeDefined();
    expect(doctorCommand).toBeDefined();
    await expect(actionsCommand?.handler("", ctx)).resolves.toBeUndefined();
    await expect(doctorCommand?.handler("", ctx)).resolves.toBeUndefined();
  });
});
