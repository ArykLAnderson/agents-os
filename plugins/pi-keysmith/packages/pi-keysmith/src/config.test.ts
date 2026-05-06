import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as sdk from "pi-keysmith-sdk";
import {
  buildEffectiveConfig,
  DEFAULT_KEYSMITH_CONFIG,
  extractPiKeysmithFromJsonFile,
  loadPiKeysmithConfig,
} from "./config.js";

const CORE_SHIM_ID = "compat:pi-core";
const CORE_SETTINGS_ACTION_ID = "pi-core.settings.open";
const CORE_SETTINGS_KEY = ",";
const PI_CORE_THINKING_ACTION_IDS = {
  off: "pi-core.thinking.off",
  pick: "pi-core.thinking.pick",
  next: "pi-core.thinking.next",
  previous: "pi-core.thinking.previous",
  low: "pi-core.thinking.low",
  medium: "pi-core.thinking.medium",
  high: "pi-core.thinking.high",
} as const;
const PI_CORE_THINKING_MAX_ACTION_ID = /^pi-core\.thinking\.(max|xhigh)$/;
const PI_CORE_NAVIGATION_ACTION_IDS = {
  reload: "pi-core.reload",
  externalEditor: "pi-core.editor.external",
  modelPick: "pi-core.model.pick",
  modelNext: "pi-core.model.next",
  modelPrevious: "pi-core.model.previous",
  modelScoped: "pi-core.model.scoped",
  sessionResume: "pi-core.session.resume",
  sessionTree: "pi-core.session.tree",
  sessionInfo: "pi-core.session.info",
  sessionFork: "pi-core.session.fork",
  sessionClone: "pi-core.session.clone",
  sessionNew: "pi-core.session.new",
  sessionCompact: "pi-core.session.compact",
} as const;
const SESSION_SEARCH_PACKAGE = "@kaiserlich-dev/pi-session-search";
const SESSION_SEARCH_SHIM_ID = "compat:@kaiserlich-dev/pi-session-search";
const SESSION_SEARCH_ACTION_IDS = {
  list: "pi-session-search.sessions.list",
  search: "pi-session-search.sessions.search",
  stats: "pi-session-search.sessions.stats",
  reindex: "pi-session-search.sessions.reindex",
} as const;
const INTERCOM_PACKAGE = "pi-intercom";
const INTERCOM_SHIM_ID = "compat:pi-intercom";
const INTERCOM_ACTION_IDS = {
  listSessions: "pi-intercom.sessions.list",
  pendingAsks: "pi-intercom.asks.pending",
  status: "pi-intercom.status",
  reply: "pi-intercom.reply",
} as const;
const SUBAGENTS_PACKAGE = "pi-subagents";
const SUBAGENTS_SHIM_ID = "compat:pi-subagents";
const SUBAGENTS_ACTION_IDS = {
  listAgents: "pi-subagents.agents.list",
  listChains: "pi-subagents.chains.list",
  runStatus: "pi-subagents.run.status",
  interrupt: "pi-subagents.interrupt",
  doctor: "pi-subagents.doctor",
} as const;
const OBSERVABILITY_PACKAGE = "pi-observability";
const OBSERVABILITY_SHIM_ID = "compat:pi-observability";
const OBSERVABILITY_ACTION_IDS = {
  dashboard: "pi-observability.dashboard.open",
  toggleFooter: "pi-observability.footer.toggle",
  togglePath: "pi-observability.path.toggle",
  settings: "pi-observability.settings.open",
} as const;
const MARKDOWN_PREVIEW_PACKAGE = "pi-markdown-preview";
const MARKDOWN_PREVIEW_SHIM_ID = "compat:pi-markdown-preview";
const MARKDOWN_PREVIEW_ACTION_IDS = {
  previewCurrent: "pi-markdown-preview.preview.current",
  previewBrowser: "pi-markdown-preview.preview.browser",
  clearCache: "pi-markdown-preview.cache.clear",
} as const;
const SCHEDULE_PROMPT_PACKAGE = "pi-schedule-prompt";
const SCHEDULE_PROMPT_SHIM_ID = "compat:pi-schedule-prompt";
const SCHEDULE_PROMPT_ACTION_IDS = {
  listJobs: "pi-schedule-prompt.jobs.list",
  toggleWidget: "pi-schedule-prompt.widget.toggle",
  settings: "pi-schedule-prompt.settings.open",
  cleanupJobs: "pi-schedule-prompt.jobs.cleanup",
} as const;
const WEB_ACCESS_PACKAGE = "pi-web-access";
const WEB_ACCESS_SHIM_ID = "compat:pi-web-access";
const WEB_ACCESS_ACTION_IDS = {
  curator: "pi-web-access.curator.toggle",
  storedResults: "pi-web-access.results.stored",
  googleAccount: "pi-web-access.google.account",
  status: "pi-web-access.status",
} as const;
const MEMORY_PACKAGE = "pi-memory";
const MEMORY_SHIM_ID = "compat:pi-memory";
const MEMORY_ACTION_IDS = {
  search: "pi-memory.search",
  dailyLog: "pi-memory.daily.open",
  longTerm: "pi-memory.long-term.open",
  scratchpad: "pi-memory.scratchpad.open",
} as const;
const MODEL_CYCLER_PACKAGE = "pi-model-cycler";
const MODEL_CYCLER_SHIM_ID = "compat:pi-model-cycler";
const MODEL_CYCLER_ACTION_IDS = {
  pick: "pi-model-cycler.model.pick",
  nextFavorite: "pi-model-cycler.model.next-favorite",
  previousFavorite: "pi-model-cycler.model.previous-favorite",
} as const;

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

function sessionSearchReplacementShim(overrides: Partial<ShimDescriptorForTests> = {}): ShimDescriptorForTests {
  return {
    id: "plugin:@kaiserlich-dev/pi-session-search",
    sourceType: "plugin",
    displayName: "Official Session Search",
    targetPackages: ["npm:@kaiserlich-dev/pi-session-search"],
    replaces: [SESSION_SEARCH_SHIM_ID],
    actions: [
      {
        id: "pi-session-search.native.search",
        aliases: [SESSION_SEARCH_ACTION_IDS.search],
        name: "Session Search: Search sessions",
        description: "Session Search: Search sessions",
        sourceType: "plugin",
        sourceDisplayName: "Official Session Search",
        sideEffect: "none",
        implementationStability: "native",
        handler: vi.fn(),
      },
    ],
    defaultSpec: {
      s: {
        name: "sessions",
        "/": { action: "pi-session-search.native.search", desc: "Session Search: Search sessions" },
      },
    },
    ...overrides,
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

function diagnosticsAsRecords(effective: Awaited<ReturnType<typeof buildEffectiveConfig>>): Array<Record<string, unknown>> {
  return effective.diagnostics as unknown as Array<Record<string, unknown>>;
}

function expectNoUnknownShimDiagnostics(effective: Awaited<ReturnType<typeof buildEffectiveConfig>>): void {
  expect(diagnosticsAsRecords(effective)).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/unknown shim/i) })]),
  );
}

function specEntryAt(spec: unknown, sequence: string): Record<string, unknown> | undefined {
  let current = spec;
  for (const key of sequence) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  if (!current || typeof current !== "object") return undefined;
  return current as Record<string, unknown>;
}

function actionAtSequence(spec: unknown, sequence: string): string | undefined {
  const action = specEntryAt(spec, sequence)?.action;
  return typeof action === "string" ? action : undefined;
}

function countSessionSearchDefaults(spec: unknown): number {
  return Object.values(SESSION_SEARCH_ACTION_IDS).reduce((count, actionId) => count + actionCountInSpec(spec, actionId), 0);
}

describe("piKeysmith minimal config", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
    tempDirs.length = 0;
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pi-keysmith-config-"));
    tempDirs.push(dir);
    return dir;
  }

  async function syntheticDefaultSource(sourceId: string, value: Record<string, unknown>): Promise<string> {
    const root = sourceId;
    const file = join(root, "keybindings.json");
    await mkdir(root, { recursive: true });
    await writeFile(file, JSON.stringify({ piKeysmith: value }));
    tempDirs.push(root);
    return file;
  }

  it("exposes a default config with the Pi core thinking group", () => {
    expect(DEFAULT_KEYSMITH_CONFIG).toMatchObject({
      leader: "<ctrl+x>",
      enabledWhen: ["editor"],
      whichKeyDelayMs: expect.any(Number),
      sequenceTimeoutMs: expect.any(Number),
      spec: {
        t: {
          name: expect.stringMatching(/thinking/i),
          source: CORE_SHIM_ID,
          o: { action: PI_CORE_THINKING_ACTION_IDS.off, desc: expect.stringMatching(/^Pi Core:/) },
          t: { action: PI_CORE_THINKING_ACTION_IDS.pick, desc: expect.stringMatching(/^Pi Core:/) },
          n: { action: PI_CORE_THINKING_ACTION_IDS.next, desc: expect.stringMatching(/^Pi Core:/) },
          p: { action: PI_CORE_THINKING_ACTION_IDS.previous, desc: expect.stringMatching(/^Pi Core:/) },
          l: { action: PI_CORE_THINKING_ACTION_IDS.low, desc: expect.stringMatching(/^Pi Core:/) },
          m: { action: PI_CORE_THINKING_ACTION_IDS.medium, desc: expect.stringMatching(/^Pi Core:/) },
          h: { action: PI_CORE_THINKING_ACTION_IDS.high, desc: expect.stringMatching(/^Pi Core:/) },
          x: { action: expect.stringMatching(PI_CORE_THINKING_MAX_ACTION_ID), desc: expect.stringMatching(/^Pi Core:/) },
          e: { action: "pi-keysmith.tools.expand.toggle" },
        },
      },
    });
  });

  it("extracts only the top-level piKeysmith block from raw JSON config files", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(
      file,
      JSON.stringify({
        keybindings: [{ key: "x", command: "ignored" }],
        piKeysmith: { leader: "<space>", sequenceTimeoutMs: 750, spec: { g: { name: "go" } } },
      }),
    );

    await expect(extractPiKeysmithFromJsonFile(file)).resolves.toEqual({
      source: file,
      value: { leader: "<space>", sequenceTimeoutMs: 750, spec: { g: { name: "go" } } },
    });
  });

  it("reports source-aware diagnostics for malformed raw JSON and keeps defaults", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, "{ not json");

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config.leader).toBe(DEFAULT_KEYSMITH_CONFIG.leader);
    expect(effective.diagnostics).toEqual([
      expect.objectContaining({ source: file, severity: "error", message: expect.stringContaining("JSON") }),
    ]);
  });

  it("loads piKeysmith from settings-style JSON without requiring keybinding fields", async () => {
    const agentDir = await tempDir();
    const settingsPath = join(agentDir, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ piKeysmith: { leader: "<tab>", spec: { x: { action: "custom.x" } } } }));

    const loaded = await loadPiKeysmithConfig({ settingsPath });

    expect(loaded.config.leader).toBe("<tab>");
    expect(loaded.config.spec).toMatchObject({ x: { action: "custom.x" } });
    await expect(readFile(settingsPath, "utf8")).resolves.toContain("piKeysmith");
  });

  it("accepts a configurable whichKeyKeyColor and defaults it to yellow", async () => {
    expect(DEFAULT_KEYSMITH_CONFIG).toMatchObject({ whichKeyKeyColor: "yellow" });

    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: { whichKeyKeyColor: "cyan" } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config).toMatchObject({ whichKeyKeyColor: "cyan" });
    expect(effective.diagnostics).toEqual([]);
  });

  it("loads piKeysmith through SettingsManager from the user agent settings file", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ piKeysmith: { leader: "<space>", spec: { x: { action: "pi-keysmith.tools.expand.toggle" } } } }),
    );

    const loaded = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(loaded.config.leader).toBe("<space>");
    expect(loaded.config.spec).toMatchObject({ x: { action: "pi-keysmith.tools.expand.toggle" } });
    expect(loaded.diagnostics).toEqual([]);
  });

  it("loads top-level piKeysmith from global and project keybindings files", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "keybindings.json"), JSON.stringify({ piKeysmith: { leader: "<tab>" } }));
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(
      join(cwd, ".pi", "keybindings.json"),
      JSON.stringify({ piKeysmith: { spec: { g: { action: "project.go" } } } }),
    );

    const loaded = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(loaded.config.leader).toBe("<tab>");
    expect(loaded.config.spec).toMatchObject({ g: { action: "project.go" } });
  });

  it("reports source-aware invalid config diagnostics and keeps a dispatchable default", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: { leader: "<hyper>", spec: { "<bad>": { action: "broken" } } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config.leader).toBe(DEFAULT_KEYSMITH_CONFIG.leader);
    expect(effective.config.spec).toEqual(DEFAULT_KEYSMITH_CONFIG.spec);
    expect(effective.diagnostics).toEqual([
      expect.objectContaining({ source: file, severity: "error", message: expect.stringContaining("leader") }),
      expect.objectContaining({ source: file, severity: "error", message: expect.stringContaining("spec") }),
    ]);
  });

  it("reports invalid top-level piKeysmith type with a source-aware diagnostic", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: "bad" }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config).toEqual(DEFAULT_KEYSMITH_CONFIG);
    expect(effective.diagnostics).toEqual([
      expect.objectContaining({
        source: file,
        severity: "error",
        message: expect.stringContaining("piKeysmith must be an object"),
      }),
    ]);
  });

  it("validates the piKeysmith.compat shape and preserves valid per-shim settings", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(
      file,
      JSON.stringify({
        piKeysmith: {
          compat: {
            autoDetect: false,
            defaultKeymapsEnabled: false,
            shims: {
              [CORE_SHIM_ID]: { enabled: true, defaultKeymapEnabled: true },
            },
          },
        },
      }),
    );

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config).toMatchObject({
      compat: {
        autoDetect: false,
        defaultKeymapsEnabled: false,
        shims: {
          [CORE_SHIM_ID]: { enabled: true, defaultKeymapEnabled: true },
        },
      },
    });
    expect(effective.diagnostics).toEqual([]);
  });

  it("reports source-aware diagnostics for invalid piKeysmith.compat fields", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(
      file,
      JSON.stringify({
        piKeysmith: {
          compat: {
            autoDetect: "yes",
            defaultKeymapsEnabled: 1,
            shims: {
              [CORE_SHIM_ID]: { enabled: "true", defaultKeymapEnabled: "false" },
            },
          },
        },
      }),
    );

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: file, message: expect.stringMatching(/compat\.autoDetect.*boolean/i) }),
        expect.objectContaining({ source: file, message: expect.stringMatching(/compat\.defaultKeymapsEnabled.*boolean/i) }),
        expect.objectContaining({ source: file, message: expect.stringMatching(/enabled.*boolean/i) }),
        expect.objectContaining({ source: file, message: expect.stringMatching(/defaultKeymapEnabled.*boolean/i) }),
      ]),
    );
  });

  it("diagnoses unknown compat shim IDs without rejecting the rest of the config", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(
      file,
      JSON.stringify({
        piKeysmith: {
          leader: "<space>",
          compat: { shims: { "compat:typo-core": { enabled: false } } },
        },
      }),
    );

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config.leader).toBe("<space>");
    expect(effective.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: file, message: expect.stringMatching(/unknown shim.*compat:typo-core/i) }),
      ]),
    );
  });

  it("injects the harmless Pi core shim default below user specs", async () => {
    const defaults = await buildEffectiveConfig({ rawJsonFiles: [] });

    expect(defaults.config.spec).toMatchObject({
      [CORE_SETTINGS_KEY]: {
        action: CORE_SETTINGS_ACTION_ID,
        desc: "Pi Core: Settings",
        source: CORE_SHIM_ID,
      },
    });
  });

  it("injects Pi core thinking defaults as a t group with prefixed descriptions", async () => {
    const defaults = await buildEffectiveConfig({ rawJsonFiles: [] });

    expect(defaults.config.spec.t).toMatchObject({
      name: expect.stringMatching(/thinking/i),
      source: CORE_SHIM_ID,
      o: { action: PI_CORE_THINKING_ACTION_IDS.off, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      t: { action: PI_CORE_THINKING_ACTION_IDS.pick, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      n: { action: PI_CORE_THINKING_ACTION_IDS.next, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      p: { action: PI_CORE_THINKING_ACTION_IDS.previous, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      l: { action: PI_CORE_THINKING_ACTION_IDS.low, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      m: { action: PI_CORE_THINKING_ACTION_IDS.medium, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      h: { action: PI_CORE_THINKING_ACTION_IDS.high, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      x: { action: expect.stringMatching(PI_CORE_THINKING_MAX_ACTION_ID), desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      e: { action: "pi-keysmith.tools.expand.toggle" },
    });
    expect(defaults.config.spec.t?.action).toBeUndefined();
  });

  it("injects Pi core root, model, and session navigation defaults with Pi Core descriptions", async () => {
    const defaults = await buildEffectiveConfig({ rawJsonFiles: [] });

    expect(defaults.config.spec).toMatchObject({
      [CORE_SETTINGS_KEY]: { action: CORE_SETTINGS_ACTION_ID, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      r: { action: PI_CORE_NAVIGATION_ACTION_IDS.reload, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      e: { action: PI_CORE_NAVIGATION_ACTION_IDS.externalEditor, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      m: {
        name: expect.stringMatching(/models/i),
        source: CORE_SHIM_ID,
        m: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelPick, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        n: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelNext, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        p: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        s: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelScoped, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      },
      s: {
        name: expect.stringMatching(/sessions/i),
        source: CORE_SHIM_ID,
        r: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionResume, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        t: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionTree, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        i: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionInfo, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        f: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionFork, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        c: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionClone, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        n: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionNew, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
        x: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionCompact, desc: expect.stringMatching(/^Pi Core:/), source: CORE_SHIM_ID },
      },
    });
    expect(defaults.config.spec.m?.action).toBeUndefined();
    expect(defaults.config.spec.s?.action).toBeUndefined();
  });

  it("does not mount the Session Search compat shim when its package is absent from effective Pi package config", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["some-other-package"], piKeysmith: {} }));

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.config.compat.shims).not.toHaveProperty(SESSION_SEARCH_SHIM_ID);
    expect(countSessionSearchDefaults(effective.config.spec)).toBe(0);
  });

  it("mounts the Session Search shim from string and object package config entries with default s bindings", async () => {
    for (const packages of [[SESSION_SEARCH_PACKAGE], [{ source: SESSION_SEARCH_PACKAGE, extensions: ["session-search"] }]]) {
      const cwd = await tempDir();
      const agentDir = await tempDir();
      await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages, piKeysmith: {} }));

      const effective = await loadPiKeysmithConfig({ cwd, agentDir });

      expect(effective.diagnostics).toEqual([]);
      expect(effective.config.compat.shims).toHaveProperty(SESSION_SEARCH_SHIM_ID);
      expect(effective.config.spec.s).toMatchObject({ name: expect.stringMatching(/sessions/i) });
      expect(specEntryAt(effective.config.spec, "sl")).toMatchObject({
        action: SESSION_SEARCH_ACTION_IDS.list,
        desc: expect.stringMatching(/^Session Search:/),
        source: SESSION_SEARCH_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "s/")).toMatchObject({
        action: SESSION_SEARCH_ACTION_IDS.search,
        desc: expect.stringMatching(/^Session Search:/),
        source: SESSION_SEARCH_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "sS")).toMatchObject({
        action: SESSION_SEARCH_ACTION_IDS.stats,
        desc: expect.stringMatching(/^Session Search:/),
        source: SESSION_SEARCH_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "sR")).toMatchObject({
        action: SESSION_SEARCH_ACTION_IDS.reindex,
        desc: expect.stringMatching(/^Session Search:/),
        source: SESSION_SEARCH_SHIM_ID,
      });
    }
  });

  it("mounts the Session Search shim from npm-prefixed global package source strings", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:@kaiserlich-dev/pi-session-search"], piKeysmith: {} }));

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expectNoUnknownShimDiagnostics(effective);
    expect(effective.config.compat.shims).toHaveProperty(SESSION_SEARCH_SHIM_ID);
    expect(specEntryAt(effective.config.spec, "s/")).toMatchObject({
      action: SESSION_SEARCH_ACTION_IDS.search,
      desc: expect.stringMatching(/^Session Search:/),
      source: SESSION_SEARCH_SHIM_ID,
    });
  });

  it("lets a same-package plugin-owned shim replace the built-in Session Search compat default spec", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: [SESSION_SEARCH_PACKAGE], piKeysmith: {} }));
    const disposable = registerShimForTest(sessionSearchReplacementShim());

    try {
      const effective = await loadPiKeysmithConfig({ cwd, agentDir });

      expect(effective.config.compat.shims).toHaveProperty(SESSION_SEARCH_SHIM_ID);
      expect(specEntryAt(effective.config.spec, "s/")).toMatchObject({
        action: "pi-session-search.native.search",
        desc: expect.stringMatching(/^Session Search:/),
        source: "plugin:@kaiserlich-dev/pi-session-search",
      });
      expect(actionCountInSpec(effective.config.spec, SESSION_SEARCH_ACTION_IDS.search)).toBe(0);
      expect(actionCountInSpec(effective.config.spec, "pi-session-search.native.search")).toBe(1);
      expect(diagnosticsAsRecords(effective)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: expect.stringMatching(/shim\.replacement/i),
            sourceIds: expect.arrayContaining([SESSION_SEARCH_SHIM_ID, "plugin:@kaiserlich-dev/pi-session-search"]),
          }),
        ]),
      );
    } finally {
      disposable.dispose();
    }
  });

  it("lets user-owned shims replace lower-precedence compat shims even across target package identities", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: [SESSION_SEARCH_PACKAGE], piKeysmith: {} }));
    const disposable = registerShimForTest(
      sessionSearchReplacementShim({
        id: "user:session-search-local-override",
        sourceType: "user",
        displayName: "User Session Search Override",
        targetPackages: ["npm:local-user-shim"],
        actions: [
          {
            id: "user.sessionSearch.search",
            aliases: [SESSION_SEARCH_ACTION_IDS.search],
            description: "Session Search: User search",
            sourceType: "user",
            sourceDisplayName: "User Session Search Override",
            sideEffect: "none",
            implementationStability: "native",
            handler: vi.fn(),
          },
        ],
        defaultSpec: { s: { "/": { action: "user.sessionSearch.search", desc: "Session Search: User search" } } },
      }),
    );

    try {
      const effective = await loadPiKeysmithConfig({ cwd, agentDir });

      expect(diagnosticsAsRecords(effective).filter((diagnostic) => /reject|unauthorized|cross-package/i.test(String(diagnostic.message)))).toEqual([]);
      expect(specEntryAt(effective.config.spec, "s/")).toMatchObject({
        action: "user.sessionSearch.search",
        source: "user:session-search-local-override",
      });
      expect(actionCountInSpec(effective.config.spec, SESSION_SEARCH_ACTION_IDS.search)).toBe(0);
    } finally {
      disposable.dispose();
    }
  });

  it("keeps Session Search actions configured but unbound when its default keymap is disabled", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [SESSION_SEARCH_PACKAGE],
        piKeysmith: { compat: { shims: { [SESSION_SEARCH_SHIM_ID]: { defaultKeymapEnabled: false } } } },
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.diagnostics).toEqual([]);
    expect(effective.config.compat.shims).toMatchObject({ [SESSION_SEARCH_SHIM_ID]: { defaultKeymapEnabled: false } });
    expect(countSessionSearchDefaults(effective.config.spec)).toBe(0);
    expect(actionAtSequence(effective.config.spec, "sl")).not.toBe(SESSION_SEARCH_ACTION_IDS.list);
    expect(actionAtSequence(effective.config.spec, "s/")).not.toBe(SESSION_SEARCH_ACTION_IDS.search);
  });

  it("removes Session Search actions and default bindings when the shim is disabled", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [SESSION_SEARCH_PACKAGE],
        piKeysmith: { compat: { shims: { [SESSION_SEARCH_SHIM_ID]: { enabled: false } } } },
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.diagnostics).toEqual([]);
    expect(effective.config.compat.shims).toMatchObject({ [SESSION_SEARCH_SHIM_ID]: { enabled: false } });
    expect(countSessionSearchDefaults(effective.config.spec)).toBe(0);
  });

  it("does not mount Intercom or Subagents compat shims when their packages are absent", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["some-other-package"], piKeysmith: {} }));

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.config.compat.shims).not.toHaveProperty(INTERCOM_SHIM_ID);
    expect(effective.config.compat.shims).not.toHaveProperty(SUBAGENTS_SHIM_ID);
    for (const actionId of Object.values(INTERCOM_ACTION_IDS)) expect(actionCountInSpec(effective.config.spec, actionId)).toBe(0);
    for (const actionId of Object.values(SUBAGENTS_ACTION_IDS)) expect(actionCountInSpec(effective.config.spec, actionId)).toBe(0);
  });

  it("mounts Intercom and Subagents shims from string and object package config entries with status/navigation bindings", async () => {
    for (const packages of [
      [INTERCOM_PACKAGE, SUBAGENTS_PACKAGE],
      [{ source: INTERCOM_PACKAGE, extensions: ["intercom"] }, { source: SUBAGENTS_PACKAGE, extensions: ["subagents"] }],
    ]) {
      const cwd = await tempDir();
      const agentDir = await tempDir();
      await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages, piKeysmith: {} }));

      const effective = await loadPiKeysmithConfig({ cwd, agentDir });

      expect(effective.diagnostics).toEqual([]);
      expect(effective.config.compat.shims).toHaveProperty(INTERCOM_SHIM_ID);
      expect(effective.config.compat.shims).toHaveProperty(SUBAGENTS_SHIM_ID);
      expect(effective.config.spec.i).toMatchObject({ name: expect.stringMatching(/intercom/i), source: INTERCOM_SHIM_ID });
      expect(specEntryAt(effective.config.spec, "il")).toMatchObject({
        action: INTERCOM_ACTION_IDS.listSessions,
        desc: expect.stringMatching(/^Intercom:/),
        source: INTERCOM_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "ip")).toMatchObject({
        action: INTERCOM_ACTION_IDS.pendingAsks,
        desc: expect.stringMatching(/^Intercom:/),
        source: INTERCOM_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "is")).toMatchObject({
        action: INTERCOM_ACTION_IDS.status,
        desc: expect.stringMatching(/^Intercom:/),
        source: INTERCOM_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "ir")).toMatchObject({
        action: INTERCOM_ACTION_IDS.reply,
        desc: expect.stringMatching(/^Intercom:/),
        source: INTERCOM_SHIM_ID,
      });

      expect(effective.config.spec.a).toMatchObject({ name: expect.stringMatching(/subagents/i), source: SUBAGENTS_SHIM_ID });
      expect(specEntryAt(effective.config.spec, "al")).toMatchObject({
        action: SUBAGENTS_ACTION_IDS.listAgents,
        desc: expect.stringMatching(/^Subagents:/),
        source: SUBAGENTS_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "ac")).toMatchObject({
        action: SUBAGENTS_ACTION_IDS.listChains,
        desc: expect.stringMatching(/^Subagents:/),
        source: SUBAGENTS_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "as")).toMatchObject({
        action: SUBAGENTS_ACTION_IDS.runStatus,
        desc: expect.stringMatching(/^Subagents:/),
        source: SUBAGENTS_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "ai")).toMatchObject({
        action: SUBAGENTS_ACTION_IDS.interrupt,
        desc: expect.stringMatching(/^Subagents:/),
        source: SUBAGENTS_SHIM_ID,
      });
      expect(specEntryAt(effective.config.spec, "ad")).toMatchObject({
        action: SUBAGENTS_ACTION_IDS.doctor,
        desc: expect.stringMatching(/^Subagents:/),
        source: SUBAGENTS_SHIM_ID,
      });
      const serializedSpec = JSON.stringify(effective.config.spec);
      expect(serializedSpec).not.toMatch(/\/(run|parallel|chain)\b/i);
      expect(serializedSpec).not.toMatch(/pi-subagents\.(parallel|chain)(?:$|[.:_-])/i);
      expect(serializedSpec).not.toMatch(/pi-subagents\.run(?:$|[._-](?!status\b))/i);
    }
  });

  it("mounts the Subagents shim from npm-prefixed global package source strings", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-subagents"], piKeysmith: {} }));

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expectNoUnknownShimDiagnostics(effective);
    expect(effective.config.compat.shims).toHaveProperty(SUBAGENTS_SHIM_ID);
    expect(specEntryAt(effective.config.spec, "al")).toMatchObject({
      action: SUBAGENTS_ACTION_IDS.listAgents,
      desc: expect.stringMatching(/^Subagents:/),
      source: SUBAGENTS_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "as")).toMatchObject({
      action: SUBAGENTS_ACTION_IDS.runStatus,
      desc: expect.stringMatching(/^Subagents:/),
      source: SUBAGENTS_SHIM_ID,
    });
  });

  it("keeps Intercom and Subagents shims configured but unbound when their default keymaps are disabled", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [INTERCOM_PACKAGE, SUBAGENTS_PACKAGE],
        piKeysmith: {
          compat: {
            shims: {
              [INTERCOM_SHIM_ID]: { defaultKeymapEnabled: false },
              [SUBAGENTS_SHIM_ID]: { defaultKeymapEnabled: false },
            },
          },
        },
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.diagnostics).toEqual([]);
    expect(effective.config.compat.shims).toMatchObject({
      [INTERCOM_SHIM_ID]: { defaultKeymapEnabled: false },
      [SUBAGENTS_SHIM_ID]: { defaultKeymapEnabled: false },
    });
    for (const actionId of Object.values(INTERCOM_ACTION_IDS)) expect(actionCountInSpec(effective.config.spec, actionId)).toBe(0);
    for (const actionId of Object.values(SUBAGENTS_ACTION_IDS)) expect(actionCountInSpec(effective.config.spec, actionId)).toBe(0);
    expect(actionAtSequence(effective.config.spec, "il")).not.toBe(INTERCOM_ACTION_IDS.listSessions);
    expect(actionAtSequence(effective.config.spec, "al")).not.toBe(SUBAGENTS_ACTION_IDS.listAgents);
  });

  it("removes Intercom and Subagents default bindings when their shims are disabled", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [INTERCOM_PACKAGE, SUBAGENTS_PACKAGE],
        piKeysmith: {
          compat: {
            shims: {
              [INTERCOM_SHIM_ID]: { enabled: false },
              [SUBAGENTS_SHIM_ID]: { enabled: false },
            },
          },
        },
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.diagnostics).toEqual([]);
    expect(effective.config.compat.shims).toMatchObject({
      [INTERCOM_SHIM_ID]: { enabled: false },
      [SUBAGENTS_SHIM_ID]: { enabled: false },
    });
    for (const actionId of Object.values(INTERCOM_ACTION_IDS)) expect(actionCountInSpec(effective.config.spec, actionId)).toBe(0);
    for (const actionId of Object.values(SUBAGENTS_ACTION_IDS)) expect(actionCountInSpec(effective.config.spec, actionId)).toBe(0);
  });

  it("mounts Observability and Markdown Preview UI shims only when configured and merges their shared u group", async () => {
    const absentCwd = await tempDir();
    const absentAgentDir = await tempDir();
    await writeFile(join(absentAgentDir, "settings.json"), JSON.stringify({ packages: ["some-other-package"], piKeysmith: {} }));

    const absent = await loadPiKeysmithConfig({ cwd: absentCwd, agentDir: absentAgentDir });

    expect(absent.config.compat.shims).not.toHaveProperty(OBSERVABILITY_SHIM_ID);
    expect(absent.config.compat.shims).not.toHaveProperty(MARKDOWN_PREVIEW_SHIM_ID);
    for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) expect(actionCountInSpec(absent.config.spec, actionId)).toBe(0);
    for (const actionId of Object.values(MARKDOWN_PREVIEW_ACTION_IDS)) expect(actionCountInSpec(absent.config.spec, actionId)).toBe(0);

    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [
          OBSERVABILITY_PACKAGE,
          { source: MARKDOWN_PREVIEW_PACKAGE, extensions: ["markdown-preview"] },
        ],
        piKeysmith: {},
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.config.compat.shims).toHaveProperty(OBSERVABILITY_SHIM_ID);
    expect(effective.config.compat.shims).toHaveProperty(MARKDOWN_PREVIEW_SHIM_ID);
    expect(effective.config.spec.u).toMatchObject({ name: expect.any(String) });
    expect(specEntryAt(effective.config.spec, "uo")).toMatchObject({
      action: OBSERVABILITY_ACTION_IDS.dashboard,
      desc: expect.stringMatching(/^Observability:/),
      source: OBSERVABILITY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "ut")).toMatchObject({
      action: OBSERVABILITY_ACTION_IDS.toggleFooter,
      desc: expect.stringMatching(/^Observability:/),
      source: OBSERVABILITY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "up")).toMatchObject({
      action: OBSERVABILITY_ACTION_IDS.togglePath,
      desc: expect.stringMatching(/^Observability:/),
      source: OBSERVABILITY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "us")).toMatchObject({
      action: OBSERVABILITY_ACTION_IDS.settings,
      desc: expect.stringMatching(/^Observability:/),
      source: OBSERVABILITY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "uv")).toMatchObject({
      action: MARKDOWN_PREVIEW_ACTION_IDS.previewCurrent,
      desc: expect.stringMatching(/^Markdown Preview:/),
      source: MARKDOWN_PREVIEW_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "ub")).toMatchObject({
      action: MARKDOWN_PREVIEW_ACTION_IDS.previewBrowser,
      desc: expect.stringMatching(/^Markdown Preview:/),
      source: MARKDOWN_PREVIEW_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "uc")).toMatchObject({
      action: MARKDOWN_PREVIEW_ACTION_IDS.clearCache,
      desc: expect.stringMatching(/^Markdown Preview:/),
      source: MARKDOWN_PREVIEW_SHIM_ID,
    });
    expect(diagnosticsAsRecords(effective)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "default.conflict.unresolved", message: expect.stringMatching(/\bu\b|u/) })]),
    );
  });

  it("mounts Observability and Markdown Preview UI shims from npm-prefixed global package entries", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [
          { source: "npm:pi-observability", extensions: ["observability"] },
          "npm:pi-markdown-preview",
        ],
        piKeysmith: {},
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expectNoUnknownShimDiagnostics(effective);
    expect(effective.config.compat.shims).toHaveProperty(OBSERVABILITY_SHIM_ID);
    expect(effective.config.compat.shims).toHaveProperty(MARKDOWN_PREVIEW_SHIM_ID);
    expect(effective.config.spec.u).toMatchObject({ name: expect.any(String) });
    expect(specEntryAt(effective.config.spec, "uo")).toMatchObject({
      action: OBSERVABILITY_ACTION_IDS.dashboard,
      desc: expect.stringMatching(/^Observability:/),
      source: OBSERVABILITY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "uv")).toMatchObject({
      action: MARKDOWN_PREVIEW_ACTION_IDS.previewCurrent,
      desc: expect.stringMatching(/^Markdown Preview:/),
      source: MARKDOWN_PREVIEW_SHIM_ID,
    });
  });

  it("mounts Observability from extension-style Pi package source strings", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["pi-observability:observability.ts"], piKeysmith: {} }));

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expectNoUnknownShimDiagnostics(effective);
    expect(effective.config.compat.shims).toHaveProperty(OBSERVABILITY_SHIM_ID);
    expect(specEntryAt(effective.config.spec, "uo")).toMatchObject({
      action: OBSERVABILITY_ACTION_IDS.dashboard,
      desc: expect.stringMatching(/^Observability:/),
      source: OBSERVABILITY_SHIM_ID,
    });
  });

  it("logs UI group-name mismatches when shim descriptors disagree", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: [OBSERVABILITY_PACKAGE, MARKDOWN_PREVIEW_PACKAGE], piKeysmith: {} }));
    const observabilityReplacement = registerShimForTest({
      id: "user:observability-renamed-group",
      sourceType: "user",
      displayName: "User Observability Group",
      targetPackages: ["local:observability"],
      replaces: [OBSERVABILITY_SHIM_ID],
      actions: [
        {
          id: "user.observability.dashboard",
          description: "Observability: Dashboard",
          handler: vi.fn(),
        },
      ],
      defaultSpec: {
        u: {
          name: "Observability Tools",
          o: { action: "user.observability.dashboard", desc: "Observability: Dashboard" },
        },
      },
    });
    const markdownReplacement = registerShimForTest({
      id: "user:markdown-preview-renamed-group",
      sourceType: "user",
      displayName: "User Markdown Preview Group",
      targetPackages: ["local:markdown-preview"],
      replaces: [MARKDOWN_PREVIEW_SHIM_ID],
      actions: [
        {
          id: "user.markdownPreview.previewCurrent",
          description: "Markdown Preview: Preview current",
          handler: vi.fn(),
        },
      ],
      defaultSpec: {
        u: {
          name: "Preview Tools",
          v: { action: "user.markdownPreview.previewCurrent", desc: "Markdown Preview: Preview current" },
        },
      },
    });

    try {
      const effective = await loadPiKeysmithConfig({ cwd, agentDir });

      expect(effective.config.spec.u).toMatchObject({
        o: { action: "user.observability.dashboard" },
        v: { action: "user.markdownPreview.previewCurrent" },
      });
      const collisionDiagnostic = diagnosticsAsRecords(effective).find((diagnostic) => diagnostic.code === "default.groupName.collision");
      expect(collisionDiagnostic).toMatchObject({
        category: "log-only",
        startupWarning: false,
        sourceIds: expect.arrayContaining(["user:observability-renamed-group", "user:markdown-preview-renamed-group"]),
      });
      const serializedCollisionDiagnostic = JSON.stringify(collisionDiagnostic);
      expect(serializedCollisionDiagnostic).toContain("Observability Tools");
      expect(serializedCollisionDiagnostic).toContain("Preview Tools");
    } finally {
      markdownReplacement.dispose();
      observabilityReplacement.dispose();
    }
  });

  it("applies UI shim default-keymap and enabled policies without removing mounted action metadata", async () => {
    const keymapsOffCwd = await tempDir();
    const keymapsOffAgentDir = await tempDir();
    await writeFile(
      join(keymapsOffAgentDir, "settings.json"),
      JSON.stringify({
        packages: [OBSERVABILITY_PACKAGE, MARKDOWN_PREVIEW_PACKAGE],
        piKeysmith: {
          compat: {
            shims: {
              [OBSERVABILITY_SHIM_ID]: { defaultKeymapEnabled: false },
              [MARKDOWN_PREVIEW_SHIM_ID]: { defaultKeymapEnabled: false },
            },
          },
        },
      }),
    );

    const keymapsOff = await loadPiKeysmithConfig({ cwd: keymapsOffCwd, agentDir: keymapsOffAgentDir });

    expect(keymapsOff.diagnostics).toEqual([]);
    expect(keymapsOff.config.compat.shims).toMatchObject({
      [OBSERVABILITY_SHIM_ID]: { defaultKeymapEnabled: false },
      [MARKDOWN_PREVIEW_SHIM_ID]: { defaultKeymapEnabled: false },
    });
    for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) expect(actionCountInSpec(keymapsOff.config.spec, actionId)).toBe(0);
    for (const actionId of Object.values(MARKDOWN_PREVIEW_ACTION_IDS)) expect(actionCountInSpec(keymapsOff.config.spec, actionId)).toBe(0);
    expect(actionAtSequence(keymapsOff.config.spec, "uo")).not.toBe(OBSERVABILITY_ACTION_IDS.dashboard);
    expect(actionAtSequence(keymapsOff.config.spec, "uv")).not.toBe(MARKDOWN_PREVIEW_ACTION_IDS.previewCurrent);

    const disabledCwd = await tempDir();
    const disabledAgentDir = await tempDir();
    await writeFile(
      join(disabledAgentDir, "settings.json"),
      JSON.stringify({
        packages: [OBSERVABILITY_PACKAGE, MARKDOWN_PREVIEW_PACKAGE],
        piKeysmith: {
          compat: {
            shims: {
              [OBSERVABILITY_SHIM_ID]: { enabled: false },
              [MARKDOWN_PREVIEW_SHIM_ID]: { enabled: false },
            },
          },
        },
      }),
    );

    const disabled = await loadPiKeysmithConfig({ cwd: disabledCwd, agentDir: disabledAgentDir });

    expect(disabled.diagnostics).toEqual([]);
    expect(disabled.config.compat.shims).toMatchObject({
      [OBSERVABILITY_SHIM_ID]: { enabled: false },
      [MARKDOWN_PREVIEW_SHIM_ID]: { enabled: false },
    });
    for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) expect(actionCountInSpec(disabled.config.spec, actionId)).toBe(0);
    for (const actionId of Object.values(MARKDOWN_PREVIEW_ACTION_IDS)) expect(actionCountInSpec(disabled.config.spec, actionId)).toBe(0);
  });

  it("mounts Schedule Prompt, Web Access, Memory, and Model Cycler shims only when configured with their default bindings", async () => {
    const absentCwd = await tempDir();
    const absentAgentDir = await tempDir();
    await writeFile(join(absentAgentDir, "settings.json"), JSON.stringify({ packages: ["some-other-package"], piKeysmith: {} }));

    const absent = await loadPiKeysmithConfig({ cwd: absentCwd, agentDir: absentAgentDir });

    for (const shimId of [SCHEDULE_PROMPT_SHIM_ID, WEB_ACCESS_SHIM_ID, MEMORY_SHIM_ID, MODEL_CYCLER_SHIM_ID]) {
      expect(absent.config.compat.shims).not.toHaveProperty(shimId);
    }
    for (const actionId of [
      ...Object.values(SCHEDULE_PROMPT_ACTION_IDS),
      ...Object.values(WEB_ACCESS_ACTION_IDS),
      ...Object.values(MEMORY_ACTION_IDS),
      ...Object.values(MODEL_CYCLER_ACTION_IDS),
    ]) {
      expect(actionCountInSpec(absent.config.spec, actionId), actionId).toBe(0);
    }

    const cwd = await tempDir();
    const agentDir = await tempDir();
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [
          SCHEDULE_PROMPT_PACKAGE,
          { source: WEB_ACCESS_PACKAGE, extensions: ["web-access"] },
          MEMORY_PACKAGE,
          { source: MODEL_CYCLER_PACKAGE, extensions: ["model-cycler"] },
        ],
        piKeysmith: {},
      }),
    );

    const effective = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(effective.diagnostics).toEqual([]);
    for (const shimId of [SCHEDULE_PROMPT_SHIM_ID, WEB_ACCESS_SHIM_ID, MEMORY_SHIM_ID, MODEL_CYCLER_SHIM_ID]) {
      expect(effective.config.compat.shims).toHaveProperty(shimId);
    }
    expect(effective.config.spec.j).toMatchObject({ name: expect.stringMatching(/schedule|jobs/i), source: SCHEDULE_PROMPT_SHIM_ID });
    expect(specEntryAt(effective.config.spec, "jl")).toMatchObject({
      action: SCHEDULE_PROMPT_ACTION_IDS.listJobs,
      desc: expect.stringMatching(/^Schedule Prompt:/),
      source: SCHEDULE_PROMPT_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "jt")).toMatchObject({
      action: SCHEDULE_PROMPT_ACTION_IDS.toggleWidget,
      desc: expect.stringMatching(/^Schedule Prompt:/),
      source: SCHEDULE_PROMPT_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "js")).toMatchObject({
      action: SCHEDULE_PROMPT_ACTION_IDS.settings,
      desc: expect.stringMatching(/^Schedule Prompt:/),
      source: SCHEDULE_PROMPT_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "jc")).toMatchObject({
      action: SCHEDULE_PROMPT_ACTION_IDS.cleanupJobs,
      desc: expect.stringMatching(/^Schedule Prompt:/),
      source: SCHEDULE_PROMPT_SHIM_ID,
    });

    expect(effective.config.spec.w).toMatchObject({ name: expect.stringMatching(/web/i), source: WEB_ACCESS_SHIM_ID });
    expect(specEntryAt(effective.config.spec, "wc")).toMatchObject({
      action: WEB_ACCESS_ACTION_IDS.curator,
      desc: expect.stringMatching(/^Web Access:/),
      source: WEB_ACCESS_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "wr")).toMatchObject({
      action: WEB_ACCESS_ACTION_IDS.storedResults,
      desc: expect.stringMatching(/^Web Access:/),
      source: WEB_ACCESS_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "wg")).toMatchObject({
      action: WEB_ACCESS_ACTION_IDS.googleAccount,
      desc: expect.stringMatching(/^Web Access:/),
      source: WEB_ACCESS_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "ws")).toMatchObject({
      action: WEB_ACCESS_ACTION_IDS.status,
      desc: expect.stringMatching(/^Web Access:/),
      source: WEB_ACCESS_SHIM_ID,
    });

    expect(effective.config.spec.M).toMatchObject({ name: expect.stringMatching(/memory/i), source: MEMORY_SHIM_ID });
    expect(specEntryAt(effective.config.spec, "Ms")).toMatchObject({
      action: MEMORY_ACTION_IDS.search,
      desc: expect.stringMatching(/^Memory:/),
      source: MEMORY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "Md")).toMatchObject({
      action: MEMORY_ACTION_IDS.dailyLog,
      desc: expect.stringMatching(/^Memory:/),
      source: MEMORY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "Mm")).toMatchObject({
      action: MEMORY_ACTION_IDS.longTerm,
      desc: expect.stringMatching(/^Memory:/),
      source: MEMORY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "Mp")).toMatchObject({
      action: MEMORY_ACTION_IDS.scratchpad,
      desc: expect.stringMatching(/^Memory:/),
      source: MEMORY_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "ms")?.action).not.toBe(MEMORY_ACTION_IDS.search);

    expect(specEntryAt(effective.config.spec, "mm")).toMatchObject({
      action: MODEL_CYCLER_ACTION_IDS.pick,
      desc: expect.stringMatching(/^Model Cycler:/),
      source: MODEL_CYCLER_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "mn")).toMatchObject({
      action: MODEL_CYCLER_ACTION_IDS.nextFavorite,
      desc: expect.stringMatching(/^Model Cycler:/),
      source: MODEL_CYCLER_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "mp")).toMatchObject({
      action: MODEL_CYCLER_ACTION_IDS.previousFavorite,
      desc: expect.stringMatching(/^Model Cycler:/),
      source: MODEL_CYCLER_SHIM_ID,
    });
    expect(specEntryAt(effective.config.spec, "ms")).toMatchObject({ action: PI_CORE_NAVIGATION_ACTION_IDS.modelScoped });

    const serializedSpec = JSON.stringify(effective.config.spec);
    expect(serializedSpec).not.toMatch(/\/websearch|websearch/i);
    expect(serializedSpec).not.toMatch(/\/search\b|pi-web-access\.search(?:$|[._-])/i);
    expect(serializedSpec).not.toMatch(/schedule-prompt\.(?:prompt|jobs\.(?:add|create|update))/i);
  });

  it("applies default-keymap and enabled policies to the remaining VS-20 shims", async () => {
    const packages = [SCHEDULE_PROMPT_PACKAGE, WEB_ACCESS_PACKAGE, MEMORY_PACKAGE, MODEL_CYCLER_PACKAGE];
    const shimIds = [SCHEDULE_PROMPT_SHIM_ID, WEB_ACCESS_SHIM_ID, MEMORY_SHIM_ID, MODEL_CYCLER_SHIM_ID];
    const actionIds = [
      ...Object.values(SCHEDULE_PROMPT_ACTION_IDS),
      ...Object.values(WEB_ACCESS_ACTION_IDS),
      ...Object.values(MEMORY_ACTION_IDS),
      ...Object.values(MODEL_CYCLER_ACTION_IDS),
    ];

    const keymapsOffCwd = await tempDir();
    const keymapsOffAgentDir = await tempDir();
    await writeFile(
      join(keymapsOffAgentDir, "settings.json"),
      JSON.stringify({
        packages,
        piKeysmith: { compat: { shims: Object.fromEntries(shimIds.map((shimId) => [shimId, { defaultKeymapEnabled: false }])) } },
      }),
    );

    const keymapsOff = await loadPiKeysmithConfig({ cwd: keymapsOffCwd, agentDir: keymapsOffAgentDir });

    expect(keymapsOff.diagnostics).toEqual([]);
    for (const shimId of shimIds) expect(keymapsOff.config.compat.shims).toMatchObject({ [shimId]: { defaultKeymapEnabled: false } });
    for (const actionId of actionIds) expect(actionCountInSpec(keymapsOff.config.spec, actionId), actionId).toBe(0);
    expect(actionAtSequence(keymapsOff.config.spec, "jl")).not.toBe(SCHEDULE_PROMPT_ACTION_IDS.listJobs);
    expect(actionAtSequence(keymapsOff.config.spec, "wc")).not.toBe(WEB_ACCESS_ACTION_IDS.curator);
    expect(actionAtSequence(keymapsOff.config.spec, "Ms")).not.toBe(MEMORY_ACTION_IDS.search);
    expect(actionAtSequence(keymapsOff.config.spec, "mm")).not.toBe(MODEL_CYCLER_ACTION_IDS.pick);

    const disabledCwd = await tempDir();
    const disabledAgentDir = await tempDir();
    await writeFile(
      join(disabledAgentDir, "settings.json"),
      JSON.stringify({
        packages,
        piKeysmith: { compat: { shims: Object.fromEntries(shimIds.map((shimId) => [shimId, { enabled: false }])) } },
      }),
    );

    const disabled = await loadPiKeysmithConfig({ cwd: disabledCwd, agentDir: disabledAgentDir });

    expect(disabled.diagnostics).toEqual([]);
    for (const shimId of shimIds) expect(disabled.config.compat.shims).toMatchObject({ [shimId]: { enabled: false } });
    for (const actionId of actionIds) expect(actionCountInSpec(disabled.config.spec, actionId), actionId).toBe(0);
  });

  it("does not default-bind prompt-like or argument-bearing commands", async () => {
    const defaults = await buildEffectiveConfig({ rawJsonFiles: [] });
    const serializedSpec = JSON.stringify(defaults.config.spec);

    expect(serializedSpec).not.toMatch(/\/(run|parallel|chain|websearch)\b/i);
    expect(serializedSpec).not.toMatch(/pi-core\.(run|parallel|chain|websearch|prompt)\b/i);
  });

  it("lets user spec remap and unbind Pi core thinking defaults with existing spec entries", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(
      file,
      JSON.stringify({
        piKeysmith: {
          spec: {
            "<leader>t o": null,
            "<leader>t h": { action: "user.thinking.high", desc: "User high thinking" },
          },
        },
      }),
    );

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config.spec.t).toMatchObject({
      name: expect.stringMatching(/thinking/i),
      source: CORE_SHIM_ID,
      h: { action: "user.thinking.high", desc: "User high thinking", source: file },
      n: { action: PI_CORE_THINKING_ACTION_IDS.next, source: CORE_SHIM_ID },
    });
    expect(effective.config.spec.t).not.toHaveProperty("o");
    expect(effective.config.spec.t).not.toHaveProperty("action");
    expect(effective.disabledDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: PI_CORE_THINKING_ACTION_IDS.off, reason: "explicit null" }),
      ]),
    );
  });

  it("lets global compat.defaultKeymapsEnabled disable only the Pi core default keymap", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: { compat: { defaultKeymapsEnabled: false } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config).toMatchObject({ compat: { defaultKeymapsEnabled: false } });
    expect(effective.config.spec).not.toHaveProperty(CORE_SETTINGS_KEY);
    expect(actionCountInSpec(effective.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);
  });

  it("lets per-shim compat defaultKeymapEnabled override global default-keymap policy", async () => {
    const shimOffDir = await tempDir();
    const shimOffFile = join(shimOffDir, "keybindings.json");
    await writeFile(
      shimOffFile,
      JSON.stringify({ piKeysmith: { compat: { shims: { [CORE_SHIM_ID]: { defaultKeymapEnabled: false } } } } }),
    );

    const shimOff = await buildEffectiveConfig({ rawJsonFiles: [shimOffFile] });

    expect(shimOff.config).toMatchObject({ compat: { shims: { [CORE_SHIM_ID]: { defaultKeymapEnabled: false } } } });
    expect(shimOff.config.spec).not.toHaveProperty(CORE_SETTINGS_KEY);
    expect(actionCountInSpec(shimOff.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);

    const shimOnDir = await tempDir();
    const shimOnFile = join(shimOnDir, "keybindings.json");
    await writeFile(
      shimOnFile,
      JSON.stringify({
        piKeysmith: {
          compat: {
            defaultKeymapsEnabled: false,
            shims: { [CORE_SHIM_ID]: { defaultKeymapEnabled: true } },
          },
        },
      }),
    );

    const shimOn = await buildEffectiveConfig({ rawJsonFiles: [shimOnFile] });

    expect(shimOn.config).toMatchObject({
      compat: { defaultKeymapsEnabled: false, shims: { [CORE_SHIM_ID]: { defaultKeymapEnabled: true } } },
    });
    expect(shimOn.config.spec).toMatchObject({ [CORE_SETTINGS_KEY]: { action: CORE_SETTINGS_ACTION_ID } });
    expect(actionCountInSpec(shimOn.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(1);
  });

  it("removes a disabled shim's default keymap", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: { compat: { shims: { [CORE_SHIM_ID]: { enabled: false } } } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config).toMatchObject({ compat: { shims: { [CORE_SHIM_ID]: { enabled: false } } } });
    expect(actionCountInSpec(effective.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);
  });

  it("lets user spec override and unbind shim defaults using the existing spec shape", async () => {
    const overrideDir = await tempDir();
    const overrideFile = join(overrideDir, "keybindings.json");
    await writeFile(
      overrideFile,
      JSON.stringify({ piKeysmith: { spec: { [CORE_SETTINGS_KEY]: { action: "user.settings", desc: "User settings" } } } }),
    );

    const override = await buildEffectiveConfig({ rawJsonFiles: [overrideFile] });

    expect(override.config.spec).toMatchObject({ [CORE_SETTINGS_KEY]: { action: "user.settings" } });
    expect(actionCountInSpec(override.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);

    const unbindDir = await tempDir();
    const unbindFile = join(unbindDir, "keybindings.json");
    await writeFile(unbindFile, JSON.stringify({ piKeysmith: { spec: { [CORE_SETTINGS_KEY]: null } } }));

    const unbound = await buildEffectiveConfig({ rawJsonFiles: [unbindFile] });

    expect(unbound.config.spec).not.toHaveProperty(CORE_SETTINGS_KEY);
    expect(actionCountInSpec(unbound.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);
    expect(unbound.disabledDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: CORE_SETTINGS_KEY, actionId: CORE_SETTINGS_ACTION_ID, reason: "explicit null" }),
      ]),
    );
  });

  it("keeps projectOverrides semantics intact while shim defaults remain lowest priority", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ piKeysmith: { spec: { [CORE_SETTINGS_KEY]: { action: "user.settings" }, x: { action: "user.settings" } } } }),
    );
    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({ piKeysmith: { spec: { [CORE_SETTINGS_KEY]: { action: "project.settings" }, x: { action: "project.settings" } } } }),
    );

    const additive = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(additive.config.spec).toMatchObject({
      [CORE_SETTINGS_KEY]: { action: "user.settings" },
      x: { action: "user.settings" },
    });
    expect(actionCountInSpec(additive.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);

    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ piKeysmith: { projectOverrides: true, spec: { [CORE_SETTINGS_KEY]: { action: "user.settings" }, x: { action: "user.settings" } } } }),
    );

    const override = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(override.config.spec).toMatchObject({
      [CORE_SETTINGS_KEY]: { action: "project.settings" },
      x: { action: "project.settings" },
    });
    expect(actionCountInSpec(override.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(0);

    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({ piKeysmith: { spec: { [CORE_SETTINGS_KEY]: null, x: { action: "project.settings" } } } }),
    );

    const projectUnbind = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(projectUnbind.config.spec).not.toHaveProperty(CORE_SETTINGS_KEY);
    expect(projectUnbind.config.spec).toMatchObject({ x: { action: "project.settings" } });
    expect(projectUnbind.disabledDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: CORE_SETTINGS_KEY, actionId: CORE_SETTINGS_ACTION_ID, reason: "explicit null" }),
      ]),
    );
  });

  it("builds compat shim specs deterministically without duplicating shim defaults across snapshots", async () => {
    const first = await buildEffectiveConfig({ rawJsonFiles: [] });
    const second = await buildEffectiveConfig({ rawJsonFiles: [] });

    expect(actionCountInSpec(first.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(1);
    expect(actionCountInSpec(second.config.spec, CORE_SETTINGS_ACTION_ID)).toBe(1);
    expect(second.config.spec).toEqual(first.config.spec);
  });

  it("disables only the conflicting path for default/default same-path action conflicts and records source IDs", async () => {
    const alpha = await syntheticDefaultSource("compat:alpha-navigation", {
      spec: {
        v: { action: "alpha.open", desc: "Alpha open" },
        a: { action: "alpha.keep", desc: "Alpha keep" },
      },
    });
    const beta = await syntheticDefaultSource("compat:beta-navigation", {
      spec: {
        v: { action: "beta.open", desc: "Beta open" },
        b: { action: "beta.keep", desc: "Beta keep" },
      },
    });

    const effective = await buildEffectiveConfig({ rawJsonFiles: [alpha, beta] });

    expect(effective.config.spec).not.toHaveProperty("v");
    expect(actionCountInSpec(effective.config.spec, "alpha.open")).toBe(0);
    expect(actionCountInSpec(effective.config.spec, "beta.open")).toBe(0);
    expect(actionCountInSpec(effective.config.spec, "alpha.keep")).toBe(1);
    expect(actionCountInSpec(effective.config.spec, "beta.keep")).toBe(1);
    expect(effective.disabledDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sequence: "v",
          reason: expect.stringMatching(/default.*conflict|conflict.*default/i),
          source: expect.stringMatching(/compat:alpha-navigation[\s\S]*compat:beta-navigation|compat:beta-navigation[\s\S]*compat:alpha-navigation/),
        }),
      ]),
    );
    expect(diagnosticsAsRecords(effective)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "default.conflict.unresolved",
          message: expect.stringMatching(/v[\s\S]*alpha\.open[\s\S]*beta\.open|v[\s\S]*beta\.open[\s\S]*alpha\.open/i),
          sourceIds: expect.arrayContaining([expect.stringContaining("compat:alpha-navigation"), expect.stringContaining("compat:beta-navigation")]),
        }),
      ]),
    );
  });

  it("disables only the conflicting subtree for default leaf/group conflicts", async () => {
    const leafSource = await syntheticDefaultSource("compat:leaf-source", {
      spec: {
        g: { action: "leaf-source.goto", desc: "Go" },
        l: { action: "leaf-source.keep", desc: "Keep leaf sibling" },
      },
    });
    const groupSource = await syntheticDefaultSource("compat:group-source", {
      spec: {
        g: { name: "Go", x: { action: "group-source.goto-x", desc: "Go X" } },
        r: { action: "group-source.keep", desc: "Keep group sibling" },
      },
    });

    const effective = await buildEffectiveConfig({ rawJsonFiles: [leafSource, groupSource] });

    expect(effective.config.spec).not.toHaveProperty("g");
    expect(actionCountInSpec(effective.config.spec, "leaf-source.goto")).toBe(0);
    expect(actionCountInSpec(effective.config.spec, "group-source.goto-x")).toBe(0);
    expect(actionCountInSpec(effective.config.spec, "leaf-source.keep")).toBe(1);
    expect(actionCountInSpec(effective.config.spec, "group-source.keep")).toBe(1);
    expect(effective.disabledDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sequence: "g",
          reason: expect.stringMatching(/leaf.*group|group.*leaf|subtree/i),
          source: expect.stringMatching(/compat:leaf-source[\s\S]*compat:group-source|compat:group-source[\s\S]*compat:leaf-source/),
        }),
      ]),
    );
  });

  it("merges default/default group-name collisions deterministically and categorizes them as log-only", async () => {
    const zeta = await syntheticDefaultSource("compat:zeta-tools", {
      spec: { n: { name: "Zeta Tools", z: { action: "zeta.tools", desc: "Zeta tools" } } },
    });
    const alpha = await syntheticDefaultSource("compat:alpha-tools", {
      spec: { n: { name: "Alpha Tools", a: { action: "alpha.tools", desc: "Alpha tools" } } },
    });

    const effective = await buildEffectiveConfig({ rawJsonFiles: [zeta, alpha] });

    expect(effective.config.spec.n).toMatchObject({
      name: "Alpha Tools | Zeta Tools",
      a: { action: "alpha.tools" },
      z: { action: "zeta.tools" },
    });
    expect(diagnosticsAsRecords(effective)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "default.groupName.collision",
          category: "log-only",
          startupWarning: false,
          sourceIds: expect.arrayContaining([expect.stringContaining("compat:alpha-tools"), expect.stringContaining("compat:zeta-tools")]),
        }),
      ]),
    );
  });

  it("lets user/project group names resolve default group-name collisions without surfaced warnings", async () => {
    const alpha = await syntheticDefaultSource("compat:session-alpha", {
      spec: { s: { name: "Sessions", l: { action: "session-alpha.list", desc: "List sessions" } } },
    });
    const beta = await syntheticDefaultSource("compat:session-beta", {
      spec: { s: { name: "Session Search", f: { action: "session-beta.find", desc: "Find sessions" } } },
    });
    const cwd = await tempDir();
    await mkdir(join(cwd, ".pi"), { recursive: true });
    const projectKeybindings = join(cwd, ".pi", "keybindings.json");
    await writeFile(projectKeybindings, JSON.stringify({ piKeysmith: { spec: { s: { name: "My Sessions" } } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [alpha, beta, projectKeybindings] });

    expect(effective.config.spec.s).toMatchObject({
      name: "My Sessions",
      l: { action: "session-alpha.list" },
      f: { action: "session-beta.find" },
    });
    expect(diagnosticsAsRecords(effective)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "default.groupName.collision", surfaced: true }),
        expect.objectContaining({ message: expect.stringMatching(/group.*name.*collision/i), surfaced: true }),
      ]),
    );
  });

  it("diagnoses escape bindings as invalid and keeps the prior effective spec", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: { spec: { "<esc>": { action: "manual.cancel" } } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config.spec).toEqual(DEFAULT_KEYSMITH_CONFIG.spec);
    expect(effective.diagnostics).toEqual([
      expect.objectContaining({
        source: file,
        severity: "error",
        message: expect.stringMatching(/esc.*reserved|reserved.*esc|cancel/i),
      }),
    ]);
  });

  it("layers built-in defaults, user settings, additive project settings, user keybindings, and additive project keybindings", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    const userKeybindings = join(agentDir, "keybindings.json");
    const projectSettingsDir = join(cwd, ".pi");
    const projectKeybindings = join(projectSettingsDir, "keybindings.json");
    await mkdir(projectSettingsDir, { recursive: true });
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ piKeysmith: { leader: "<space>", spec: { us: { action: "user.settings" } } } }),
    );
    await writeFile(
      join(projectSettingsDir, "settings.json"),
      JSON.stringify({ piKeysmith: { spec: { ps: { action: "project.settings" } } } }),
    );
    await writeFile(userKeybindings, JSON.stringify({ piKeysmith: { spec: { uk: { action: "user.keybindings" } } } }));
    await writeFile(projectKeybindings, JSON.stringify({ piKeysmith: { spec: { pk: { action: "project.keybindings" } } } }));

    const loaded = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(loaded.config.leader).toBe("<space>");
    expect(loaded.config.spec).toMatchObject({
      t: DEFAULT_KEYSMITH_CONFIG.spec.t,
      us: { action: "user.settings" },
      ps: { action: "project.settings" },
      uk: { action: "user.keybindings" },
      pk: { action: "project.keybindings" },
    });
    expect(loaded.diagnostics).toEqual([]);
  });

  it("keeps project settings and keybindings additive unless the user opts into project overrides", async () => {
    const cwd = await tempDir();
    const agentDir = await tempDir();
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ piKeysmith: { spec: { x: { action: "user.settings" } } } }),
    );
    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({ piKeysmith: { spec: { x: { action: "project.settings" } } } }),
    );
    await writeFile(
      join(agentDir, "keybindings.json"),
      JSON.stringify({ piKeysmith: { projectOverrides: false, spec: { y: { action: "user.keybindings" } } } }),
    );
    await writeFile(
      join(cwd, ".pi", "keybindings.json"),
      JSON.stringify({ piKeysmith: { spec: { y: { action: "project.keybindings" } } } }),
    );

    const additive = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(additive.config.spec).toMatchObject({
      x: { action: "user.settings" },
      y: { action: "user.keybindings" },
    });

    await writeFile(
      join(agentDir, "keybindings.json"),
      JSON.stringify({ piKeysmith: { projectOverrides: true, spec: { y: { action: "user.keybindings" } } } }),
    );

    const override = await loadPiKeysmithConfig({ cwd, agentDir });

    expect(override.config.spec).toMatchObject({
      x: { action: "project.settings" },
      y: { action: "project.keybindings" },
    });
  });

  it("treats explicit null as an unbind that suppresses a default binding without emitting a conflict warning", async () => {
    const dir = await tempDir();
    const file = join(dir, "keybindings.json");
    await writeFile(file, JSON.stringify({ piKeysmith: { spec: { "<leader>t": null } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [file] });

    expect(effective.config.spec).not.toHaveProperty("t");
    expect(effective.config.spec).not.toHaveProperty("<leader>t");
    expect(effective.diagnostics).toEqual([]);
  });

  it("lets a user explicit binding win over a built-in default and reports both source paths", async () => {
    const dir = await tempDir();
    const userKeybindings = join(dir, "keybindings.json");
    await writeFile(userKeybindings, JSON.stringify({ piKeysmith: { spec: { "<leader>t": { action: "user.tools" } } } }));

    const effective = await buildEffectiveConfig({ rawJsonFiles: [userKeybindings] });

    expect(effective.config.spec).not.toHaveProperty("t");
    expect(effective.config.spec).toMatchObject({ "<leader>t": { action: "user.tools" } });
    expect(effective.diagnostics).toEqual([
      expect.objectContaining({
        source: expect.stringContaining(userKeybindings),
        message: expect.stringMatching(new RegExp(`${userKeybindings}.*builtin:pi-keysmith`)),
      }),
    ]);
  });
});
