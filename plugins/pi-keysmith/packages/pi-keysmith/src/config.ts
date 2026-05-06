import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, SettingsManager } from "@mariozechner/pi-coding-agent";
import { getKeysmithRegistry, type KeysmithShimDescriptor } from "pi-keysmith-sdk";
import { parseKeySequence } from "./parser.js";
import type { BindingSpec } from "./trie.js";
import { buildBindingTrie } from "./trie.js";
import { TOOLS_TOGGLE_ACTION_ID } from "./leader.js";

export interface KeysmithCompatShimConfig {
  enabled?: boolean;
  defaultKeymapEnabled?: boolean;
}

export interface KeysmithCompatConfig {
  autoDetect: boolean;
  defaultKeymapsEnabled: boolean;
  shims: Record<string, KeysmithCompatShimConfig>;
}

export interface KeysmithConfig {
  leader: string;
  enabledWhen: string[];
  whichKeyDelayMs: number;
  whichKeyKeyColor: string;
  sequenceTimeoutMs: number;
  spec: BindingSpec;
  compat: KeysmithCompatConfig;
}

export interface ConfigDiagnostic {
  source: string;
  severity: "error" | "warning" | "log";
  message: string;
  code?: string;
  category?: string;
  surface?: string;
  sourceIds?: readonly string[];
  startupWarning?: boolean;
  surfaced?: boolean;
}

export interface EffectiveConfig {
  config: KeysmithConfig;
  diagnostics: ConfigDiagnostic[];
  sources: readonly ExtractedPiKeysmithConfig[];
  disabledDefaults: readonly { sequence: string; actionId: string; reason: string; source: string }[];
}

export const PI_CORE_COMPAT_SHIM_ID = "compat:pi-core";
export const SESSION_SEARCH_PACKAGE = "@kaiserlich-dev/pi-session-search";
export const SESSION_SEARCH_COMPAT_SHIM_ID = `compat:${SESSION_SEARCH_PACKAGE}`;
export const PI_CORE_SETTINGS_ACTION_ID = "pi-core.settings.open";
export const PI_CORE_SETTINGS_DEFAULT_KEY = ",";
export const PI_CORE_THINKING_ACTION_IDS = {
  off: "pi-core.thinking.off",
  pick: "pi-core.thinking.pick",
  next: "pi-core.thinking.next",
  previous: "pi-core.thinking.previous",
  low: "pi-core.thinking.low",
  medium: "pi-core.thinking.medium",
  high: "pi-core.thinking.high",
  xhigh: "pi-core.thinking.xhigh",
} as const;

export const PI_CORE_NAVIGATION_ACTION_IDS = {
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
export const SESSION_SEARCH_ACTION_IDS = {
  list: "pi-session-search.sessions.list",
  search: "pi-session-search.sessions.search",
  stats: "pi-session-search.sessions.stats",
  reindex: "pi-session-search.sessions.reindex",
} as const;
export const INTERCOM_PACKAGE = "pi-intercom";
export const INTERCOM_COMPAT_SHIM_ID = `compat:${INTERCOM_PACKAGE}`;
export const INTERCOM_ACTION_IDS = {
  listSessions: "pi-intercom.sessions.list",
  pendingAsks: "pi-intercom.asks.pending",
  status: "pi-intercom.status",
  reply: "pi-intercom.reply",
} as const;
export const SUBAGENTS_PACKAGE = "pi-subagents";
export const SUBAGENTS_COMPAT_SHIM_ID = `compat:${SUBAGENTS_PACKAGE}`;
export const SUBAGENTS_ACTION_IDS = {
  listAgents: "pi-subagents.agents.list",
  listChains: "pi-subagents.chains.list",
  runStatus: "pi-subagents.run.status",
  interrupt: "pi-subagents.interrupt",
  doctor: "pi-subagents.doctor",
} as const;
export const OBSERVABILITY_PACKAGE = "pi-observability";
export const OBSERVABILITY_COMPAT_SHIM_ID = `compat:${OBSERVABILITY_PACKAGE}`;
export const OBSERVABILITY_ACTION_IDS = {
  dashboard: "pi-observability.dashboard.open",
  toggleFooter: "pi-observability.footer.toggle",
  togglePath: "pi-observability.path.toggle",
  settings: "pi-observability.settings.open",
} as const;
export const MARKDOWN_PREVIEW_PACKAGE = "pi-markdown-preview";
export const MARKDOWN_PREVIEW_COMPAT_SHIM_ID = `compat:${MARKDOWN_PREVIEW_PACKAGE}`;
export const MARKDOWN_PREVIEW_ACTION_IDS = {
  previewCurrent: "pi-markdown-preview.preview.current",
  previewBrowser: "pi-markdown-preview.preview.browser",
  clearCache: "pi-markdown-preview.cache.clear",
} as const;
export const SCHEDULE_PROMPT_PACKAGE = "pi-schedule-prompt";
export const SCHEDULE_PROMPT_COMPAT_SHIM_ID = `compat:${SCHEDULE_PROMPT_PACKAGE}`;
export const SCHEDULE_PROMPT_ACTION_IDS = {
  listJobs: "pi-schedule-prompt.jobs.list",
  toggleWidget: "pi-schedule-prompt.widget.toggle",
  settings: "pi-schedule-prompt.settings.open",
  cleanupJobs: "pi-schedule-prompt.jobs.cleanup",
} as const;
export const WEB_ACCESS_PACKAGE = "pi-web-access";
export const WEB_ACCESS_COMPAT_SHIM_ID = `compat:${WEB_ACCESS_PACKAGE}`;
export const WEB_ACCESS_ACTION_IDS = {
  curator: "pi-web-access.curator.toggle",
  storedResults: "pi-web-access.results.stored",
  googleAccount: "pi-web-access.google.account",
  status: "pi-web-access.status",
} as const;
export const MEMORY_PACKAGE = "pi-memory";
export const MEMORY_COMPAT_SHIM_ID = `compat:${MEMORY_PACKAGE}`;
export const MEMORY_ACTION_IDS = {
  search: "pi-memory.search",
  dailyLog: "pi-memory.daily.open",
  longTerm: "pi-memory.long-term.open",
  scratchpad: "pi-memory.scratchpad.open",
} as const;
export const MODEL_CYCLER_PACKAGE = "pi-model-cycler";
export const MODEL_CYCLER_COMPAT_SHIM_ID = `compat:${MODEL_CYCLER_PACKAGE}`;
export const MODEL_CYCLER_ACTION_IDS = {
  pick: "pi-model-cycler.model.pick",
  nextFavorite: "pi-model-cycler.model.next-favorite",
  previousFavorite: "pi-model-cycler.model.previous-favorite",
} as const;

const SESSION_SEARCH_DEFAULT_SPEC: BindingSpec = {
  s: {
    name: "sessions",
    source: SESSION_SEARCH_COMPAT_SHIM_ID,
    l: { action: SESSION_SEARCH_ACTION_IDS.list, desc: "Session Search: List sessions", source: SESSION_SEARCH_COMPAT_SHIM_ID },
    "/": { action: SESSION_SEARCH_ACTION_IDS.search, desc: "Session Search: Search sessions", source: SESSION_SEARCH_COMPAT_SHIM_ID },
    S: { action: SESSION_SEARCH_ACTION_IDS.stats, desc: "Session Search: Session search stats", source: SESSION_SEARCH_COMPAT_SHIM_ID },
    R: { action: SESSION_SEARCH_ACTION_IDS.reindex, desc: "Session Search: Reindex sessions", source: SESSION_SEARCH_COMPAT_SHIM_ID },
  },
};

const INTERCOM_DEFAULT_SPEC: BindingSpec = {
  i: {
    name: "intercom",
    source: INTERCOM_COMPAT_SHIM_ID,
    l: { action: INTERCOM_ACTION_IDS.listSessions, desc: "Intercom: List sessions", source: INTERCOM_COMPAT_SHIM_ID },
    p: { action: INTERCOM_ACTION_IDS.pendingAsks, desc: "Intercom: Pending asks", source: INTERCOM_COMPAT_SHIM_ID },
    s: { action: INTERCOM_ACTION_IDS.status, desc: "Intercom: Status", source: INTERCOM_COMPAT_SHIM_ID },
    r: { action: INTERCOM_ACTION_IDS.reply, desc: "Intercom: Reply", source: INTERCOM_COMPAT_SHIM_ID },
  },
};

const SUBAGENTS_DEFAULT_SPEC: BindingSpec = {
  a: {
    name: "subagents",
    source: SUBAGENTS_COMPAT_SHIM_ID,
    l: { action: SUBAGENTS_ACTION_IDS.listAgents, desc: "Subagents: List agents", source: SUBAGENTS_COMPAT_SHIM_ID },
    c: { action: SUBAGENTS_ACTION_IDS.listChains, desc: "Subagents: List chains", source: SUBAGENTS_COMPAT_SHIM_ID },
    s: { action: SUBAGENTS_ACTION_IDS.runStatus, desc: "Subagents: Run status", source: SUBAGENTS_COMPAT_SHIM_ID },
    i: { action: SUBAGENTS_ACTION_IDS.interrupt, desc: "Subagents: Interrupt", source: SUBAGENTS_COMPAT_SHIM_ID },
    d: { action: SUBAGENTS_ACTION_IDS.doctor, desc: "Subagents: Doctor", source: SUBAGENTS_COMPAT_SHIM_ID },
  },
};

const OBSERVABILITY_DEFAULT_SPEC: BindingSpec = {
  u: {
    name: "ui",
    source: OBSERVABILITY_COMPAT_SHIM_ID,
    o: { action: OBSERVABILITY_ACTION_IDS.dashboard, desc: "Observability: Dashboard", source: OBSERVABILITY_COMPAT_SHIM_ID },
    t: { action: OBSERVABILITY_ACTION_IDS.toggleFooter, desc: "Observability: Toggle footer", source: OBSERVABILITY_COMPAT_SHIM_ID },
    p: { action: OBSERVABILITY_ACTION_IDS.togglePath, desc: "Observability: Toggle path", source: OBSERVABILITY_COMPAT_SHIM_ID },
    s: { action: OBSERVABILITY_ACTION_IDS.settings, desc: "Observability: Settings", source: OBSERVABILITY_COMPAT_SHIM_ID },
  },
};

const MARKDOWN_PREVIEW_DEFAULT_SPEC: BindingSpec = {
  u: {
    name: "ui",
    source: MARKDOWN_PREVIEW_COMPAT_SHIM_ID,
    v: { action: MARKDOWN_PREVIEW_ACTION_IDS.previewCurrent, desc: "Markdown Preview: Preview current", source: MARKDOWN_PREVIEW_COMPAT_SHIM_ID },
    b: { action: MARKDOWN_PREVIEW_ACTION_IDS.previewBrowser, desc: "Markdown Preview: Browser preview", source: MARKDOWN_PREVIEW_COMPAT_SHIM_ID },
    c: { action: MARKDOWN_PREVIEW_ACTION_IDS.clearCache, desc: "Markdown Preview: Clear cache", source: MARKDOWN_PREVIEW_COMPAT_SHIM_ID },
  },
};

const SCHEDULE_PROMPT_DEFAULT_SPEC: BindingSpec = {
  j: {
    name: "jobs",
    source: SCHEDULE_PROMPT_COMPAT_SHIM_ID,
    l: { action: SCHEDULE_PROMPT_ACTION_IDS.listJobs, desc: "Schedule Prompt: List jobs", source: SCHEDULE_PROMPT_COMPAT_SHIM_ID },
    t: { action: SCHEDULE_PROMPT_ACTION_IDS.toggleWidget, desc: "Schedule Prompt: Toggle widget", source: SCHEDULE_PROMPT_COMPAT_SHIM_ID },
    s: { action: SCHEDULE_PROMPT_ACTION_IDS.settings, desc: "Schedule Prompt: Settings", source: SCHEDULE_PROMPT_COMPAT_SHIM_ID },
    c: { action: SCHEDULE_PROMPT_ACTION_IDS.cleanupJobs, desc: "Schedule Prompt: Cleanup jobs", source: SCHEDULE_PROMPT_COMPAT_SHIM_ID },
  },
};

const WEB_ACCESS_DEFAULT_SPEC: BindingSpec = {
  w: {
    name: "web access",
    source: WEB_ACCESS_COMPAT_SHIM_ID,
    c: { action: WEB_ACCESS_ACTION_IDS.curator, desc: "Web Access: Curator", source: WEB_ACCESS_COMPAT_SHIM_ID },
    r: { action: WEB_ACCESS_ACTION_IDS.storedResults, desc: "Web Access: Stored results", source: WEB_ACCESS_COMPAT_SHIM_ID },
    g: { action: WEB_ACCESS_ACTION_IDS.googleAccount, desc: "Web Access: Google account", source: WEB_ACCESS_COMPAT_SHIM_ID },
    s: { action: WEB_ACCESS_ACTION_IDS.status, desc: "Web Access: Status", source: WEB_ACCESS_COMPAT_SHIM_ID },
  },
};

const MEMORY_DEFAULT_SPEC: BindingSpec = {
  M: {
    name: "memory",
    source: MEMORY_COMPAT_SHIM_ID,
    s: { action: MEMORY_ACTION_IDS.search, desc: "Memory: Search memory", source: MEMORY_COMPAT_SHIM_ID },
    d: { action: MEMORY_ACTION_IDS.dailyLog, desc: "Memory: Daily log", source: MEMORY_COMPAT_SHIM_ID },
    m: { action: MEMORY_ACTION_IDS.longTerm, desc: "Memory: Long-term memory", source: MEMORY_COMPAT_SHIM_ID },
    p: { action: MEMORY_ACTION_IDS.scratchpad, desc: "Memory: Scratchpad", source: MEMORY_COMPAT_SHIM_ID },
  },
};

const MODEL_CYCLER_DEFAULT_SPEC: BindingSpec = {
  m: {
    name: "models",
    source: MODEL_CYCLER_COMPAT_SHIM_ID,
    m: { action: MODEL_CYCLER_ACTION_IDS.pick, desc: "Model Cycler: Pick model", source: MODEL_CYCLER_COMPAT_SHIM_ID },
    n: { action: MODEL_CYCLER_ACTION_IDS.nextFavorite, desc: "Model Cycler: Next favorite model", source: MODEL_CYCLER_COMPAT_SHIM_ID },
    p: { action: MODEL_CYCLER_ACTION_IDS.previousFavorite, desc: "Model Cycler: Previous favorite model", source: MODEL_CYCLER_COMPAT_SHIM_ID },
  },
};

const KNOWN_COMPAT_SHIM_IDS = new Set([
  PI_CORE_COMPAT_SHIM_ID,
  SESSION_SEARCH_COMPAT_SHIM_ID,
  INTERCOM_COMPAT_SHIM_ID,
  SUBAGENTS_COMPAT_SHIM_ID,
  OBSERVABILITY_COMPAT_SHIM_ID,
  MARKDOWN_PREVIEW_COMPAT_SHIM_ID,
  SCHEDULE_PROMPT_COMPAT_SHIM_ID,
  WEB_ACCESS_COMPAT_SHIM_ID,
  MEMORY_COMPAT_SHIM_ID,
  MODEL_CYCLER_COMPAT_SHIM_ID,
]);

export const DEFAULT_KEYSMITH_CONFIG: KeysmithConfig = {
  leader: "<ctrl+x>",
  enabledWhen: ["editor"],
  whichKeyDelayMs: 300,
  whichKeyKeyColor: "yellow",
  sequenceTimeoutMs: 1000,
  spec: {
    t: {
      name: "thinking",
      source: PI_CORE_COMPAT_SHIM_ID,
      o: { action: PI_CORE_THINKING_ACTION_IDS.off, desc: "Pi Core: Thinking off", source: PI_CORE_COMPAT_SHIM_ID },
      t: { action: PI_CORE_THINKING_ACTION_IDS.pick, desc: "Pi Core: Pick thinking level", source: PI_CORE_COMPAT_SHIM_ID },
      n: { action: PI_CORE_THINKING_ACTION_IDS.next, desc: "Pi Core: Next thinking level", source: PI_CORE_COMPAT_SHIM_ID },
      p: { action: PI_CORE_THINKING_ACTION_IDS.previous, desc: "Pi Core: Previous thinking level", source: PI_CORE_COMPAT_SHIM_ID },
      l: { action: PI_CORE_THINKING_ACTION_IDS.low, desc: "Pi Core: Low thinking", source: PI_CORE_COMPAT_SHIM_ID },
      m: { action: PI_CORE_THINKING_ACTION_IDS.medium, desc: "Pi Core: Medium thinking", source: PI_CORE_COMPAT_SHIM_ID },
      h: { action: PI_CORE_THINKING_ACTION_IDS.high, desc: "Pi Core: High thinking", source: PI_CORE_COMPAT_SHIM_ID },
      x: { action: PI_CORE_THINKING_ACTION_IDS.xhigh, desc: "Pi Core: Max thinking", source: PI_CORE_COMPAT_SHIM_ID },
      e: { action: TOOLS_TOGGLE_ACTION_ID, desc: "Pi Core: Toggle tools expansion", source: PI_CORE_COMPAT_SHIM_ID },
    },
    [PI_CORE_SETTINGS_DEFAULT_KEY]: { action: PI_CORE_SETTINGS_ACTION_ID, desc: "Pi Core: Settings", source: PI_CORE_COMPAT_SHIM_ID },
    r: { action: PI_CORE_NAVIGATION_ACTION_IDS.reload, desc: "Pi Core: Reload", source: PI_CORE_COMPAT_SHIM_ID },
    e: { action: PI_CORE_NAVIGATION_ACTION_IDS.externalEditor, desc: "Pi Core: External editor", source: PI_CORE_COMPAT_SHIM_ID },
    m: {
      name: "models",
      source: PI_CORE_COMPAT_SHIM_ID,
      m: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelPick, desc: "Pi Core: Pick model", source: PI_CORE_COMPAT_SHIM_ID },
      n: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelNext, desc: "Pi Core: Next model", source: PI_CORE_COMPAT_SHIM_ID },
      p: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious, desc: "Pi Core: Previous model", source: PI_CORE_COMPAT_SHIM_ID },
      s: { action: PI_CORE_NAVIGATION_ACTION_IDS.modelScoped, desc: "Pi Core: Scoped model", source: PI_CORE_COMPAT_SHIM_ID },
    },
    s: {
      name: "sessions",
      source: PI_CORE_COMPAT_SHIM_ID,
      r: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionResume, desc: "Pi Core: Resume session", source: PI_CORE_COMPAT_SHIM_ID },
      t: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionTree, desc: "Pi Core: Session tree", source: PI_CORE_COMPAT_SHIM_ID },
      i: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionInfo, desc: "Pi Core: Session info", source: PI_CORE_COMPAT_SHIM_ID },
      f: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionFork, desc: "Pi Core: Fork session", source: PI_CORE_COMPAT_SHIM_ID },
      c: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionClone, desc: "Pi Core: Clone session", source: PI_CORE_COMPAT_SHIM_ID },
      n: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionNew, desc: "Pi Core: New session", source: PI_CORE_COMPAT_SHIM_ID },
      x: { action: PI_CORE_NAVIGATION_ACTION_IDS.sessionCompact, desc: "Pi Core: Compact session", source: PI_CORE_COMPAT_SHIM_ID },
    },
    "?": { action: "pi-keysmith.actions.open", desc: "Open Keysmith action/keymap browser", source: "builtin:pi-keysmith" },
  },
  compat: {
    autoDetect: true,
    defaultKeymapsEnabled: true,
    shims: {
      [PI_CORE_COMPAT_SHIM_ID]: {},
    },
  },
};

type KeysmithConfigOverride = Partial<Omit<KeysmithConfig, "compat">> & { compat?: Partial<KeysmithCompatConfig> };

export interface ExtractedPiKeysmithConfig {
  source: string;
  value: KeysmithConfigOverride & { projectOverrides?: boolean };
  packages?: unknown;
  project?: boolean;
}

export async function extractPiKeysmithFromJsonFile(
  file: string,
  diagnostics?: ConfigDiagnostic[],
): Promise<ExtractedPiKeysmithConfig | undefined> {
  const parsed = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  return extractPiKeysmithFromRecord(parsed, file, diagnostics);
}

export interface BuildEffectiveConfigOptions {
  cwd?: string;
  agentDir?: string;
  rawJsonFiles?: string[];
  settingsPath?: string;
}

export async function buildEffectiveConfig(options: BuildEffectiveConfigOptions = {}): Promise<EffectiveConfig> {
  const diagnostics: ConfigDiagnostic[] = [];
  const sources = await loadSettingsSources(options, diagnostics);

  for (const file of await rawJsonFiles(options)) {
    try {
      const extracted = await extractPiKeysmithFromJsonFile(file, diagnostics);
      if (extracted) {
        extracted.project = isProjectSource(file);
        sources.push(extracted);
      }
    } catch (error) {
      diagnostics.push({ source: file, severity: "error", message: `JSON config error: ${messageOf(error)}` });
    }
  }

  const disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }> = [];
  let config = mergeConfig(DEFAULT_KEYSMITH_CONFIG, {});
  if (shouldMountSessionSearchCompat(sources)) {
    config = applyConfigSource(config, sessionSearchDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountIntercomCompat(sources)) {
    config = applyConfigSource(config, intercomDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountSubagentsCompat(sources)) {
    config = applyConfigSource(config, subagentsDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountObservabilityCompat(sources)) {
    config = applyConfigSource(config, observabilityDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountMarkdownPreviewCompat(sources)) {
    config = applyConfigSource(config, markdownPreviewDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountSchedulePromptCompat(sources)) {
    config = applyConfigSource(config, schedulePromptDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountWebAccessCompat(sources)) {
    config = applyConfigSource(config, webAccessDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountMemoryCompat(sources)) {
    config = applyConfigSource(config, memoryDefaultSource(), diagnostics, true, disabledDefaults);
  }
  if (shouldMountModelCyclerCompat(sources)) {
    config = applyConfigSource(config, modelCyclerDefaultSource(), diagnostics, true, disabledDefaults);
  }
  config = applyRegisteredShimReplacements(config, diagnostics, disabledDefaults);

  const projectOverrides = sources.some((source) => !source.project && source.value.projectOverrides === true);
  for (const source of sources) {
    config = applyConfigSource(config, source, diagnostics, !source.project || projectOverrides, disabledDefaults);
  }
  config = applyCompatDefaultPolicy(config);

  return { config, diagnostics, sources, disabledDefaults };
}

export function loadPiKeysmithConfig(options: BuildEffectiveConfigOptions = {}): Promise<EffectiveConfig> {
  return buildEffectiveConfig(options);
}

export function leaderInput(config: Pick<KeysmithConfig, "leader">): string {
  return parseKeySequence(config.leader)[0]?.input ?? config.leader;
}

function applyConfigSource(
  config: KeysmithConfig,
  source: ExtractedPiKeysmithConfig,
  diagnostics: ConfigDiagnostic[],
  allowSpecOverride = true,
  disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }> = [],
): KeysmithConfig {
  return mergeConfig(config, validateConfigSource(source, diagnostics), source, diagnostics, allowSpecOverride, disabledDefaults);
}

function validateConfigSource(source: ExtractedPiKeysmithConfig, diagnostics: ConfigDiagnostic[]): KeysmithConfigOverride {
  const validated: KeysmithConfigOverride = {};
  const value = source.value as Record<string, unknown>;

  if ("leader" in value) {
    if (typeof value.leader === "string") {
      try {
        const tokens = parseKeySequence(value.leader);
        if (tokens.length === 1) validated.leader = value.leader;
        else diagnostics.push(invalid(source.source, "leader must parse to exactly one key"));
      } catch (error) {
        diagnostics.push(invalid(source.source, `leader ${messageOf(error)}`));
      }
    } else {
      diagnostics.push(invalid(source.source, "leader must be a string"));
    }
  }

  if ("enabledWhen" in value) {
    if (Array.isArray(value.enabledWhen) && value.enabledWhen.every((entry) => typeof entry === "string")) {
      validated.enabledWhen = value.enabledWhen;
    } else {
      diagnostics.push(invalid(source.source, "enabledWhen must be an array of strings"));
    }
  }

  if ("whichKeyDelayMs" in value) {
    if (isNonNegativeNumber(value.whichKeyDelayMs)) validated.whichKeyDelayMs = value.whichKeyDelayMs;
    else diagnostics.push(invalid(source.source, "whichKeyDelayMs must be a non-negative number"));
  }

  if ("sequenceTimeoutMs" in value) {
    if (isPositiveNumber(value.sequenceTimeoutMs)) validated.sequenceTimeoutMs = value.sequenceTimeoutMs;
    else diagnostics.push(invalid(source.source, "sequenceTimeoutMs must be a positive number"));
  }

  if ("whichKeyKeyColor" in value) {
    if (typeof value.whichKeyKeyColor === "string") validated.whichKeyKeyColor = value.whichKeyKeyColor;
    else diagnostics.push(invalid(source.source, "whichKeyKeyColor must be a string"));
  }

  if ("spec" in value) {
    if (isRecord(value.spec)) {
      try {
        buildBindingTrie(value.spec as BindingSpec);
        validated.spec = value.spec as BindingSpec;
      } catch (error) {
        if (isDuplicateActionError(error)) validated.spec = value.spec as BindingSpec;
        else diagnostics.push(invalid(source.source, `spec ${messageOf(error)}`));
      }
    } else {
      diagnostics.push(invalid(source.source, "spec must be an object"));
    }
  }

  if ("compat" in value) {
    if (isRecord(value.compat)) validated.compat = validateCompatConfig(value.compat, source.source, diagnostics);
    else diagnostics.push(invalid(source.source, "compat must be an object"));
  }

  return validated;
}

function validateCompatConfig(
  value: Record<string, unknown>,
  source: string,
  diagnostics: ConfigDiagnostic[],
): Partial<KeysmithCompatConfig> {
  const compat: Partial<KeysmithCompatConfig> = {};

  if ("autoDetect" in value) {
    if (typeof value.autoDetect === "boolean") compat.autoDetect = value.autoDetect;
    else diagnostics.push(invalid(source, "compat.autoDetect must be a boolean"));
  }

  if ("defaultKeymapsEnabled" in value) {
    if (typeof value.defaultKeymapsEnabled === "boolean") compat.defaultKeymapsEnabled = value.defaultKeymapsEnabled;
    else diagnostics.push(invalid(source, "compat.defaultKeymapsEnabled must be a boolean"));
  }

  if ("shims" in value) {
    if (isRecord(value.shims)) {
      const shims: Record<string, KeysmithCompatShimConfig> = {};
      for (const [shimId, shimValue] of Object.entries(value.shims)) {
        if (!KNOWN_COMPAT_SHIM_IDS.has(shimId)) {
          diagnostics.push(invalid(source, `unknown shim ${shimId}`));
          continue;
        }
        if (!isRecord(shimValue)) {
          diagnostics.push(invalid(source, `compat.shims.${shimId} must be an object`));
          continue;
        }
        const shim: KeysmithCompatShimConfig = {};
        if ("enabled" in shimValue) {
          if (typeof shimValue.enabled === "boolean") shim.enabled = shimValue.enabled;
          else diagnostics.push(invalid(source, `compat.shims.${shimId}.enabled must be a boolean`));
        }
        if ("defaultKeymapEnabled" in shimValue) {
          if (typeof shimValue.defaultKeymapEnabled === "boolean") shim.defaultKeymapEnabled = shimValue.defaultKeymapEnabled;
          else diagnostics.push(invalid(source, `compat.shims.${shimId}.defaultKeymapEnabled must be a boolean`));
        }
        shims[shimId] = shim;
      }
      compat.shims = shims;
    } else {
      diagnostics.push(invalid(source, "compat.shims must be an object"));
    }
  }

  return compat;
}

async function loadSettingsSources(
  options: BuildEffectiveConfigOptions,
  diagnostics: ConfigDiagnostic[],
): Promise<ExtractedPiKeysmithConfig[]> {
  if (options.settingsPath) {
    try {
      const extracted = await extractPiKeysmithFromJsonFile(options.settingsPath, diagnostics);
      return extracted ? [extracted] : [];
    } catch (error) {
      diagnostics.push({ source: options.settingsPath, severity: "error", message: `JSON config error: ${messageOf(error)}` });
      return [];
    }
  }

  if (!options.cwd && !options.agentDir) return [];

  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);
  for (const error of settingsManager.drainErrors()) {
    diagnostics.push({
      source: error.scope === "global" ? join(agentDir, "settings.json") : join(cwd, ".pi", "settings.json"),
      severity: "error",
      message: `Settings config error: ${messageOf(error.error)}`,
    });
  }

  const sources: ExtractedPiKeysmithConfig[] = [];
  const globalSource = join(agentDir, "settings.json");
  const globalExtracted = extractPiKeysmithFromRecord(settingsManager.getGlobalSettings() as Record<string, unknown>, globalSource, diagnostics);
  if (globalExtracted) sources.push(globalExtracted);

  const projectSource = join(cwd, ".pi", "settings.json");
  const projectExtracted = extractPiKeysmithFromRecord(settingsManager.getProjectSettings() as Record<string, unknown>, projectSource, diagnostics);
  if (projectExtracted) {
    projectExtracted.project = true;
    sources.push(projectExtracted);
  }

  return sources;
}

async function rawJsonFiles(options: BuildEffectiveConfigOptions): Promise<string[]> {
  if (options.rawJsonFiles) return options.rawJsonFiles;
  if (!options.cwd && !options.agentDir) return [];

  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const candidates = [join(agentDir, "keybindings.json"), join(cwd, ".pi", "keybindings.json")];
  const existing = await Promise.all(candidates.map(async (file) => ((await exists(file)) ? file : undefined)));
  return existing.filter((file): file is string => Boolean(file));
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function mergeConfig(
  base: KeysmithConfig,
  override: KeysmithConfigOverride,
  source?: ExtractedPiKeysmithConfig,
  diagnostics?: ConfigDiagnostic[],
  allowSpecOverride = true,
  disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }> = [],
): KeysmithConfig {
  return {
    leader: override.leader ?? base.leader,
    enabledWhen: override.enabledWhen ?? base.enabledWhen,
    whichKeyDelayMs: override.whichKeyDelayMs ?? base.whichKeyDelayMs,
    whichKeyKeyColor: override.whichKeyKeyColor ?? base.whichKeyKeyColor,
    sequenceTimeoutMs: override.sequenceTimeoutMs ?? base.sequenceTimeoutMs,
    spec: override.spec ? mergeSpec(base.spec, override.spec, source, diagnostics, allowSpecOverride, disabledDefaults) : cloneBindingSpec(base.spec),
    compat: override.compat ? mergeCompat(base.compat, override.compat) : cloneCompat(base.compat),
  };
}

function cloneBindingSpec(spec: BindingSpec): BindingSpec {
  const cloned: BindingSpec = {};
  for (const [key, entry] of Object.entries(spec)) cloned[key] = cloneBindingEntry(entry);
  return cloned;
}

function cloneBindingEntry(entry: BindingSpec[string]): BindingSpec[string] {
  if (!entry || typeof entry !== "object") return entry;
  const cloned: NonNullable<BindingSpec[string]> = { ...entry };
  for (const [key, value] of Object.entries(entry)) {
    if (key === "action" || key === "desc" || key === "name" || key === "source") continue;
    cloned[key] = cloneBindingEntry(value as BindingSpec[string]) as never;
  }
  return cloned;
}

function cloneCompat(compat: KeysmithCompatConfig): KeysmithCompatConfig {
  return {
    autoDetect: compat.autoDetect,
    defaultKeymapsEnabled: compat.defaultKeymapsEnabled,
    shims: Object.fromEntries(Object.entries(compat.shims).map(([shimId, shim]) => [shimId, { ...shim }])),
  };
}

function mergeCompat(base: KeysmithCompatConfig, override: Partial<KeysmithCompatConfig>): KeysmithCompatConfig {
  const shims: Record<string, KeysmithCompatShimConfig> = { ...base.shims };
  for (const [shimId, shimConfig] of Object.entries(override.shims ?? {})) {
    shims[shimId] = { ...(shims[shimId] ?? DEFAULT_KEYSMITH_CONFIG.compat.shims[shimId]), ...shimConfig };
  }
  return {
    autoDetect: override.autoDetect ?? base.autoDetect,
    defaultKeymapsEnabled: override.defaultKeymapsEnabled ?? base.defaultKeymapsEnabled,
    shims,
  };
}

function applyCompatDefaultPolicy(config: KeysmithConfig): KeysmithConfig {
  let spec = config.spec;
  for (const [shimId, shim] of Object.entries(config.compat.shims)) {
    const defaultEnabled = (shim.enabled ?? true) && (shim.defaultKeymapEnabled ?? config.compat.defaultKeymapsEnabled);
    if (!defaultEnabled) spec = removeDefaultEntriesFromSource(spec, shimId);
  }
  return spec === config.spec ? config : { ...config, spec };
}

function removeDefaultEntriesFromSource(spec: BindingSpec, source: string): BindingSpec {
  const next: BindingSpec = {};
  for (const [key, entry] of Object.entries(spec)) {
    const pruned = removeDefaultEntryFromSource(entry, source);
    if (pruned) next[key] = pruned;
  }
  return next;
}

function removeDefaultEntryFromSource(entry: BindingSpec[string], source: string): BindingSpec[string] {
  if (!entry || typeof entry !== "object") return entry;
  const next: NonNullable<BindingSpec[string]> = { ...entry };
  for (const [key, value] of Object.entries(entry)) {
    if (key === "action" || key === "desc" || key === "name" || key === "source") continue;
    const pruned = removeDefaultEntryFromSource(value as BindingSpec[string], source);
    if (pruned) next[key] = pruned as never;
    else delete next[key];
  }
  const childKeys = Object.keys(next).filter((key) => !["action", "desc", "name", "source"].includes(key));
  if (next.source === source) {
    delete next.action;
    delete next.desc;
    delete next.source;
    if (childKeys.length === 0) return null;
  }
  return next;
}

function mergeSpec(
  base: BindingSpec,
  override: BindingSpec,
  source?: ExtractedPiKeysmithConfig,
  diagnostics?: ConfigDiagnostic[],
  allowOverride = true,
  disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }> = [],
): BindingSpec {
  const merged: BindingSpec = { ...base };
  for (const [key, entry] of Object.entries(override)) {
    const separatedPath = separatedSpecKeyPath(key);
    if (separatedPath.length > 1) {
      mergeSeparatedSpecEntry(merged, separatedPath, entry, source, diagnostics, allowOverride, disabledDefaults);
      continue;
    }

    const equivalentKeys = findEquivalentSpecKeys(merged, key);
    if (entry === null) {
      let recordedDefaultDisable = false;
      for (const equivalentKey of equivalentKeys) {
        const disabled = merged[equivalentKey];
        if (disabled?.action && isDefaultSpecEntry(equivalentKey, disabled)) {
          disabledDefaults.push({ sequence: equivalentKey, actionId: disabled.action, reason: "explicit null", source: source?.source ?? "unknown" });
          recordedDefaultDisable = true;
        }
        delete merged[equivalentKey];
      }
      const defaultEntry = findDefaultSpecEntry(key);
      if (!recordedDefaultDisable && defaultEntry?.action) {
        disabledDefaults.push({ sequence: key, actionId: defaultEntry.action, reason: "explicit null", source: source?.source ?? "unknown" });
      }
      delete merged[key];
      continue;
    }
    const priorKey = equivalentKeys[0] ?? key;
    const prior = merged[priorKey];
    const incoming = sourceSpecEntry(entry, source?.source);
    const priorIsDefault = isDefaultSpecEntry(priorKey, prior);
    const incomingIsDefault = isDefaultSpecEntry(key, incoming);

    if (prior && priorIsDefault && incomingIsDefault) {
      const resolution = mergeDefaultConflictOrGroup(priorKey, prior, incoming, diagnostics, disabledDefaults);
      if (resolution === "disabled") {
        for (const equivalentKey of equivalentKeys) delete merged[equivalentKey];
        continue;
      }
      if (resolution) {
        for (const equivalentKey of equivalentKeys) delete merged[equivalentKey];
        merged[priorKey] = resolution;
        continue;
      }
    }

    if (prior && priorIsDefault && isGroupOnlyEntry(prior) && isGroupOnlyEntry(incoming)) {
      for (const equivalentKey of equivalentKeys) delete merged[equivalentKey];
      merged[priorKey] = mergeGroupEntries(prior, incoming, { preferIncomingName: true });
      continue;
    }

    if (prior && !allowOverride && !priorIsDefault) continue;
    if (prior && source && diagnostics && priorIsDefault) {
      const priorSource = displayDefaultSource(prior.source);
      diagnostics.push({
        source: source.source,
        severity: "error",
        message: `User binding ${key} from ${source.source} overrides default binding from ${priorSource}`,
      });
    }
    if (prior && (allowOverride || priorIsDefault)) {
      for (const equivalentKey of equivalentKeys) delete merged[equivalentKey];
    }
    if (typeof entry.action === "string") removeDefaultEntriesWithAction(merged, entry.action);
    merged[key] = incoming;
  }
  return merged;
}

type MergeDefaultResolution = NonNullable<BindingSpec[string]> | "disabled" | undefined;

const SPEC_METADATA_KEYS = new Set(["action", "desc", "name", "source"]);

function mergeDefaultConflictOrGroup(
  sequence: string,
  prior: BindingSpec[string],
  incoming: NonNullable<BindingSpec[string]>,
  diagnostics: ConfigDiagnostic[] | undefined,
  disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }>,
): MergeDefaultResolution {
  if (!prior || typeof prior !== "object") return undefined;
  if (hasDispatchConflict(prior, incoming)) {
    if (isPiCoreCompatSource(prior.source) && !isPiCoreCompatSource(incoming.source)) return incoming;
    if (isPiCoreCompatSource(incoming.source) && !isPiCoreCompatSource(prior.source)) return prior;
    const sourceIds = sortedSourceIds([prior.source, incoming.source]);
    const actionIds = sortedActionIds([prior, incoming]);
    const reason = hasLeafGroupConflict(prior, incoming) ? "default leaf/group subtree conflict" : "default/default conflict";
    disabledDefaults.push({
      sequence,
      actionId: actionIds.join(", ") || "group",
      reason,
      source: sourceIds.join(", "),
    });
    diagnostics?.push({
      source: sourceIds.join(", "),
      severity: "error",
      code: "default.conflict.unresolved",
      category: "config",
      surface: "doctor",
      sourceIds,
      message: `Unresolved default conflict at ${sequence}: ${actionIds.join(" and ") || "default group/leaf bindings"}`,
    });
    return "disabled";
  }
  if (!isGroupOnlyEntry(prior) || !isGroupOnlyEntry(incoming)) return undefined;
  const sourceIds = sortedSourceIds([prior.source, incoming.source]);
  const merged = mergeGroupEntries(prior, incoming, { combineDefaultNames: true, defaultPolicy: { sequence, diagnostics, disabledDefaults } });
  if (prior.name && incoming.name && prior.name !== incoming.name) {
    diagnostics?.push({
      source: sourceIds.join(", "),
      severity: "log",
      code: "default.groupName.collision",
      category: "log-only",
      surface: "log",
      sourceIds,
      startupWarning: false,
      surfaced: false,
      message: `Default group-name collision at ${sequence} resolved as ${merged.name ?? "merged group"}`,
    });
  }
  return merged;
}

function mergeGroupEntries(
  prior: NonNullable<BindingSpec[string]>,
  incoming: NonNullable<BindingSpec[string]>,
  options: {
    combineDefaultNames?: boolean;
    preferIncomingName?: boolean;
    defaultPolicy?: {
      sequence: string;
      diagnostics: ConfigDiagnostic[] | undefined;
      disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }>;
    };
  } = {},
): NonNullable<BindingSpec[string]> {
  const merged: NonNullable<BindingSpec[string]> = { ...prior };
  const priorName = typeof prior.name === "string" ? prior.name : undefined;
  const incomingName = typeof incoming.name === "string" ? incoming.name : undefined;
  if (options.combineDefaultNames && priorName && incomingName && priorName !== incomingName) {
    merged.name = [...new Set([priorName, incomingName])].sort((a, b) => a.localeCompare(b)).join(" | ");
  } else if (options.preferIncomingName && incomingName) {
    merged.name = incomingName;
  } else if (incomingName && !priorName) {
    merged.name = incomingName;
  }
  if (!merged.source && incoming.source) merged.source = incoming.source;

  for (const [childKey, childEntry] of Object.entries(incoming)) {
    if (SPEC_METADATA_KEYS.has(childKey)) continue;
    if (!childEntry || typeof childEntry !== "object") continue;
    const priorChild = merged[childKey] as BindingSpec[string];
    if (priorChild && typeof priorChild === "object" && options.defaultPolicy && isDefaultSpecEntry(childKey, priorChild) && isDefaultSpecEntry(childKey, childEntry)) {
      const childSequence = `${options.defaultPolicy.sequence}${childKey}`;
      const resolution = mergeDefaultConflictOrGroup(
        childSequence,
        priorChild,
        childEntry as NonNullable<BindingSpec[string]>,
        options.defaultPolicy.diagnostics,
        options.defaultPolicy.disabledDefaults,
      );
      if (resolution === "disabled") delete merged[childKey];
      else if (resolution) merged[childKey] = resolution as never;
      continue;
    }
    if (priorChild && typeof priorChild === "object" && isGroupOnlyEntry(priorChild) && isGroupOnlyEntry(childEntry)) {
      merged[childKey] = mergeGroupEntries(priorChild, childEntry as NonNullable<BindingSpec[string]>, options) as never;
    } else {
      merged[childKey] = childEntry as never;
    }
  }
  return merged;
}

function hasDispatchConflict(a: NonNullable<BindingSpec[string]>, b: NonNullable<BindingSpec[string]>): boolean {
  if (typeof a.action === "string" && typeof b.action === "string") return a.action !== b.action;
  return hasLeafGroupConflict(a, b);
}

function hasLeafGroupConflict(a: NonNullable<BindingSpec[string]>, b: NonNullable<BindingSpec[string]>): boolean {
  return (typeof a.action === "string" && hasChildBindings(b)) || (typeof b.action === "string" && hasChildBindings(a));
}

function hasChildBindings(entry: NonNullable<BindingSpec[string]>): boolean {
  return Object.entries(entry).some(([key, value]) => !SPEC_METADATA_KEYS.has(key) && value && typeof value === "object");
}

function isGroupOnlyEntry(entry: BindingSpec[string] | undefined): entry is NonNullable<BindingSpec[string]> {
  return Boolean(entry && typeof entry === "object" && typeof entry.action !== "string" && (typeof entry.name === "string" || hasChildBindings(entry)));
}

function sortedSourceIds(sources: Array<string | undefined>): string[] {
  return [...new Set(sources.map(sourceIdFromSource).filter((sourceId): sourceId is string => Boolean(sourceId)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function sortedActionIds(entries: Array<NonNullable<BindingSpec[string]>>): string[] {
  return [...new Set(entries.flatMap((entry) => collectActionIds(entry)))].sort((a, b) => a.localeCompare(b));
}

function collectActionIds(entry: NonNullable<BindingSpec[string]>): string[] {
  const actionIds: string[] = [];
  if (typeof entry.action === "string") actionIds.push(entry.action);
  for (const [key, value] of Object.entries(entry)) {
    if (SPEC_METADATA_KEYS.has(key) || !value || typeof value !== "object") continue;
    actionIds.push(...collectActionIds(value as NonNullable<BindingSpec[string]>));
  }
  return actionIds;
}

function sourceIdFromSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const match = source.match(/(?:^|[/\\])((?:builtin|compat|sdk):[^/\\]+)/);
  return match?.[1] ?? source;
}

function removeDefaultEntriesWithAction(spec: BindingSpec, actionId: string): void {
  for (const [key, entry] of Object.entries(spec)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.action === actionId && isDefaultSource(entry.source)) {
      delete spec[key];
      continue;
    }
    for (const [childKey, childEntry] of Object.entries(entry)) {
      if (childKey === "action" || childKey === "desc" || childKey === "name" || childKey === "source") continue;
      if (!childEntry || typeof childEntry !== "object") continue;
      if (childEntry.action === actionId && isDefaultSource(childEntry.source)) {
        delete entry[childKey];
        continue;
      }
      removeDefaultEntriesWithAction(childEntry as BindingSpec, actionId);
    }
  }
}

function mergeSeparatedSpecEntry(
  spec: BindingSpec,
  path: string[],
  entry: BindingSpec[string],
  source?: ExtractedPiKeysmithConfig,
  diagnostics?: ConfigDiagnostic[],
  allowOverride = true,
  disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }> = [],
): void {
  const parent = ensureSpecPath(spec, path.slice(0, -1));
  const leafKey = path[path.length - 1];
  if (!leafKey) return;

  if (entry === null) {
    const prior = parent[leafKey];
    if (prior?.action && isDefaultSpecEntryAtPath(path, prior)) {
      disabledDefaults.push({ sequence: path.join(""), actionId: prior.action, reason: "explicit null", source: source?.source ?? "unknown" });
    } else {
      const defaultEntry = findDefaultSpecEntryAtPath(path);
      if (defaultEntry?.action) {
        disabledDefaults.push({ sequence: path.join(""), actionId: defaultEntry.action, reason: "explicit null", source: source?.source ?? "unknown" });
      }
    }
    delete parent[leafKey];
    return;
  }

  if (!entry || typeof entry !== "object") return;
  if (typeof entry.action === "string") removeDefaultEntriesWithAction(spec, entry.action);
  const prior = parent[leafKey];
  const priorIsDefault = isDefaultSpecEntryAtPath(path, prior);
  if (prior && !allowOverride && !priorIsDefault) return;
  if (prior && source && diagnostics && priorIsDefault) {
    const priorSource = displayDefaultSource(prior.source);
    diagnostics.push({
      source: source.source,
      severity: "error",
      message: `User binding ${path.join("")} from ${source.source} overrides default binding from ${priorSource}`,
    });
  }
  parent[leafKey] = sourceSpecEntry(entry, source?.source);
}

function ensureSpecPath(spec: BindingSpec, path: string[]): BindingSpec {
  let current = spec;
  for (const key of path) {
    const existing = current[key];
    if (!existing || typeof existing !== "object") current[key] = { name: key };
    current = current[key] as BindingSpec;
  }
  return current;
}

function separatedSpecKeyPath(key: string): string[] {
  if (!/\s/.test(key)) return [];
  try {
    return parseKeySequence(key, { allowLeaderPrefix: true })
      .map((token) => token.input)
      .filter((input) => !/\s/.test(input));
  } catch {
    return [];
  }
}

function findEquivalentSpecKeys(spec: BindingSpec, key: string): string[] {
  const target = normalizedSpecKey(key);
  if (!target) return key in spec ? [key] : [];
  return Object.keys(spec).filter((candidate) => normalizedSpecKey(candidate) === target);
}

function isDefaultEquivalentKey(key: string): boolean {
  return findEquivalentSpecKeys(DEFAULT_KEYSMITH_CONFIG.spec, key).length > 0;
}

function findDefaultSpecEntry(key: string): BindingSpec[string] | undefined {
  const defaultKey = findEquivalentSpecKeys(DEFAULT_KEYSMITH_CONFIG.spec, key)[0];
  return defaultKey ? DEFAULT_KEYSMITH_CONFIG.spec[defaultKey] : undefined;
}

function findDefaultSpecEntryAtPath(path: string[]): BindingSpec[string] | undefined {
  let current: BindingSpec[string] | undefined = { ...DEFAULT_KEYSMITH_CONFIG.spec } as NonNullable<BindingSpec[string]>;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment] as BindingSpec[string] | undefined;
  }
  return current;
}

function isDefaultSpecEntry(_key: string, entry: BindingSpec[string] | undefined): boolean {
  return Boolean(entry && typeof entry === "object" && isDefaultSource(entry.source));
}

function isDefaultSpecEntryAtPath(path: string[], entry: BindingSpec[string] | undefined): boolean {
  return Boolean(findDefaultSpecEntryAtPath(path)) && isDefaultSource(entry?.source);
}

function isDefaultSource(source: string | undefined): boolean {
  const sourceId = sourceIdFromSource(source);
  return (
    sourceId === undefined ||
    sourceId.startsWith("builtin:") ||
    sourceId.startsWith("compat:") ||
    sourceId.startsWith("plugin:") ||
    sourceId.startsWith("user:") ||
    sourceId.startsWith("sdk:")
  );
}

function isPiCoreCompatSource(source: string | undefined): boolean {
  return sourceIdFromSource(source) === PI_CORE_COMPAT_SHIM_ID;
}

function displayDefaultSource(source: string | undefined): string {
  if (source?.startsWith("compat:")) return `${source} (builtin:pi-keysmith)`;
  return source ?? "builtin default";
}

function normalizedSpecKey(key: string): string | undefined {
  try {
    return parseKeySequence(key, { allowLeaderPrefix: true }).map((token) => token.input).join("\0");
  } catch {
    return undefined;
  }
}

function sourceSpecEntry(entry: NonNullable<BindingSpec[string]>, source?: string): NonNullable<BindingSpec[string]> {
  const next: NonNullable<BindingSpec[string]> = { ...entry };
  const entrySource = source ?? entry.source;
  if (entrySource) next.source = entrySource;
  for (const [key, value] of Object.entries(entry)) {
    if (key === "action" || key === "desc" || key === "name" || key === "source") continue;
    if (value && typeof value === "object") next[key] = sourceSpecEntry(value as NonNullable<BindingSpec[string]>, source) as never;
  }
  return next;
}

function isProjectSource(source: string): boolean {
  return source.includes(`${join(".pi")}${"/"}`) || source.includes("/.pi/");
}

function extractPiKeysmithFromRecord(
  record: Record<string, unknown>,
  source: string,
  diagnostics?: ConfigDiagnostic[],
): ExtractedPiKeysmithConfig | undefined {
  const packages = record.packages;
  if (!("piKeysmith" in record)) return packages === undefined ? undefined : { source, value: {}, packages };
  const piKeysmith = record.piKeysmith;
  if (!isRecord(piKeysmith)) {
    diagnostics?.push(invalid(source, "piKeysmith must be an object"));
    return packages === undefined ? undefined : { source, value: {}, packages };
  }
  return { source, value: piKeysmith as KeysmithConfigOverride, packages };
}

function shouldMountSessionSearchCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, SESSION_SEARCH_PACKAGE));
}

function shouldMountIntercomCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, INTERCOM_PACKAGE));
}

function shouldMountSubagentsCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, SUBAGENTS_PACKAGE));
}

function shouldMountObservabilityCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, OBSERVABILITY_PACKAGE));
}

function shouldMountMarkdownPreviewCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, MARKDOWN_PREVIEW_PACKAGE));
}

function shouldMountSchedulePromptCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, SCHEDULE_PROMPT_PACKAGE));
}

function shouldMountWebAccessCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, WEB_ACCESS_PACKAGE));
}

function shouldMountMemoryCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, MEMORY_PACKAGE));
}

function shouldMountModelCyclerCompat(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  if (!compatAutoDetectEnabled(sources)) return false;
  return sources.some((source) => packageConfigIncludesPackage(source.packages, MODEL_CYCLER_PACKAGE));
}

function compatAutoDetectEnabled(sources: readonly ExtractedPiKeysmithConfig[]): boolean {
  let autoDetect = DEFAULT_KEYSMITH_CONFIG.compat.autoDetect;
  for (const source of sources) {
    const compat = (source.value as Record<string, unknown>).compat;
    if (isRecord(compat) && typeof compat.autoDetect === "boolean") autoDetect = compat.autoDetect;
  }
  return autoDetect;
}

function packageConfigIncludesPackage(packages: unknown, packageName: string): boolean {
  if (!Array.isArray(packages)) return false;
  return packages.some((entry) => {
    if (typeof entry === "string") return packageSourceMatchesPackage(entry, packageName);
    if (!isRecord(entry) || typeof entry.source !== "string") return false;
    return packageSourceMatchesPackage(entry.source, packageName);
  });
}

function packageSourceMatchesPackage(source: string, packageName: string): boolean {
  return source === packageName || source === `npm:${packageName}` || source.startsWith(`${packageName}:`);
}

function sessionSearchDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(SESSION_SEARCH_COMPAT_SHIM_ID, SESSION_SEARCH_DEFAULT_SPEC);
}

function intercomDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(INTERCOM_COMPAT_SHIM_ID, INTERCOM_DEFAULT_SPEC);
}

function subagentsDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(SUBAGENTS_COMPAT_SHIM_ID, SUBAGENTS_DEFAULT_SPEC);
}

function observabilityDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(OBSERVABILITY_COMPAT_SHIM_ID, OBSERVABILITY_DEFAULT_SPEC);
}

function markdownPreviewDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(MARKDOWN_PREVIEW_COMPAT_SHIM_ID, MARKDOWN_PREVIEW_DEFAULT_SPEC);
}

function schedulePromptDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(SCHEDULE_PROMPT_COMPAT_SHIM_ID, SCHEDULE_PROMPT_DEFAULT_SPEC);
}

function webAccessDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(WEB_ACCESS_COMPAT_SHIM_ID, WEB_ACCESS_DEFAULT_SPEC);
}

function memoryDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(MEMORY_COMPAT_SHIM_ID, MEMORY_DEFAULT_SPEC);
}

function modelCyclerDefaultSource(): ExtractedPiKeysmithConfig {
  return shimDefaultConfigSource(MODEL_CYCLER_COMPAT_SHIM_ID, MODEL_CYCLER_DEFAULT_SPEC);
}

function shimDefaultConfigSource(shimId: string, spec: BindingSpec): ExtractedPiKeysmithConfig {
  return {
    source: shimId,
    value: {
      compat: { shims: { [shimId]: {} } },
      spec,
    },
  };
}

function applyRegisteredShimReplacements(
  config: KeysmithConfig,
  diagnostics: ConfigDiagnostic[],
  disabledDefaults: Array<{ sequence: string; actionId: string; reason: string; source: string }>,
): KeysmithConfig {
  const replacements = replacementShimsForMountedCompat(config);
  let next = config;
  for (const replacedId of new Set(replacements.flatMap((replacement) => replacement.replaces ?? []))) {
    next = { ...next, spec: removeDefaultEntriesFromSource(next.spec, replacedId) };
  }
  for (const replacement of replacements) {
    next = applyConfigSource(next, shimDefaultSource(replacement), diagnostics, true, disabledDefaults);
    diagnostics.push({
      source: replacement.id,
      severity: "log",
      code: "shim.replacement",
      category: "config",
      surface: "doctor",
      sourceIds: [...(replacement.replaces ?? []), replacement.id].sort((a, b) => a.localeCompare(b)),
      message: `Shim ${replacement.id} replaces ${(replacement.replaces ?? []).join(", ")}`,
    });
  }
  return next;
}

function replacementShimsForMountedCompat(config: KeysmithConfig): KeysmithShimDescriptor[] {
  const shims = getKeysmithRegistry().snapshot().shims;
  return shims
    .filter((shim) => shim.defaultSpec && (shim.replaces ?? []).some((replacedId) => replacedId in config.compat.shims))
    .sort(compareShimReplacementPrecedence);
}

function compareShimReplacementPrecedence(left: KeysmithShimDescriptor, right: KeysmithShimDescriptor): number {
  return shimPrecedence(left) - shimPrecedence(right) || left.id.localeCompare(right.id);
}

function shimPrecedence(shim: KeysmithShimDescriptor): number {
  switch (shim.sourceType) {
    case "compat":
      return 0;
    case "plugin":
      return 1;
    case "user":
      return 2;
  }
}

function shimDefaultSource(shim: KeysmithShimDescriptor): ExtractedPiKeysmithConfig {
  return {
    source: shim.id,
    value: { spec: shim.defaultSpec as BindingSpec },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isNonNegativeNumber(value) && value > 0;
}

function isDuplicateActionError(error: unknown): boolean {
  return /duplicate action/i.test(messageOf(error));
}

function invalid(source: string, message: string): ConfigDiagnostic {
  return { source, severity: "error", message: `Invalid piKeysmith config: ${message}` };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
