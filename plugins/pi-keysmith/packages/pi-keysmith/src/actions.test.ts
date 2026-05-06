import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getSupportedThinkingLevels } from "@mariozechner/pi-ai";
import * as sdk from "pi-keysmith-sdk";
import {
  KEYSMITH_ACTIONS_OPEN_ACTION_ID,
  KEYSMITH_DOCTOR_OPEN_ACTION_ID,
  THINKING_NEXT_ACTION_ID,
  THINKING_PREVIOUS_ACTION_ID,
  TOOLS_EXPAND_TOGGLE_ACTION_ID,
  cycleThinkingLevel,
  registerBuiltInActions,
} from "./actions.js";

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

function expectLastSelectWithoutFiniteTimeout(select: ReturnType<typeof vi.fn>): void {
  const options = select.mock.calls.at(-1)?.[2] as { timeout?: unknown } | undefined;
  expect(Number.isFinite(options?.timeout)).toBe(false);
}

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
  settings: "pi-core.settings.open",
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
const PI_CORE_APP_ACTION_BRIDGE_MAPPINGS = {
  [PI_CORE_NAVIGATION_ACTION_IDS.externalEditor]: "app.editor.external",
  [PI_CORE_NAVIGATION_ACTION_IDS.modelPick]: "app.model.select",
  [PI_CORE_NAVIGATION_ACTION_IDS.modelNext]: "app.model.cycleForward",
  [PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious]: "app.model.cycleBackward",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionResume]: "app.session.resume",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionTree]: "app.session.tree",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionFork]: "app.session.fork",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionNew]: "app.session.new",
} as const;
const PI_CORE_APP_ACTION_BRIDGE_IDS = Object.keys(PI_CORE_APP_ACTION_BRIDGE_MAPPINGS);
const PI_CORE_UNBRIDGEABLE_ACTION_IDS = Object.values(PI_CORE_NAVIGATION_ACTION_IDS).filter(
  (actionId) => actionId !== PI_CORE_NAVIGATION_ACTION_IDS.sessionCompact && !PI_CORE_APP_ACTION_BRIDGE_IDS.includes(actionId),
);
const SESSION_SEARCH_PACKAGE = "@kaiserlich-dev/pi-session-search";
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
const FORBIDDEN_PROMPT_LIKE_PI_CORE_ACTION_IDS = [
  "pi-core.run",
  "pi-core.parallel",
  "pi-core.chain",
  "pi-core.websearch",
  "pi-core.prompt",
] as const;
const FORBIDDEN_PROMPT_LIKE_PI_CORE_ACTION_ID_PATTERN = /^pi-core\.(?:run|parallel|chain|web[-_]?search|prompt)(?:$|[.:_-])/i;
const OBSERVABILITY_SLASH_COMMANDS = {
  [OBSERVABILITY_ACTION_IDS.dashboard]: "obs",
  [OBSERVABILITY_ACTION_IDS.toggleFooter]: "obs-toggle",
  [OBSERVABILITY_ACTION_IDS.togglePath]: "obs-toggle-path",
  [OBSERVABILITY_ACTION_IDS.settings]: "obs-settings",
} as const;
const REMAINING_SAFE_ZERO_ARG_SLASH_COMMANDS: Record<string, string> = {
  [MARKDOWN_PREVIEW_ACTION_IDS.previewCurrent]: "preview",
  [MARKDOWN_PREVIEW_ACTION_IDS.previewBrowser]: "preview-browser",
  [MARKDOWN_PREVIEW_ACTION_IDS.clearCache]: "preview-clear-cache",
  [MODEL_CYCLER_ACTION_IDS.pick]: "model-picker",
  [SUBAGENTS_ACTION_IDS.doctor]: "subagents-doctor",
  [WEB_ACCESS_ACTION_IDS.curator]: "curator",
  [WEB_ACCESS_ACTION_IDS.googleAccount]: "google-account",
  [SCHEDULE_PROMPT_ACTION_IDS.settings]: "schedule-prompt",
};
const REMAINING_UNAVAILABLE_COMPAT_ACTION_IDS = [
  INTERCOM_ACTION_IDS.reply,
  MODEL_CYCLER_ACTION_IDS.nextFavorite,
  MODEL_CYCLER_ACTION_IDS.previousFavorite,
  SCHEDULE_PROMPT_ACTION_IDS.toggleWidget,
  WEB_ACCESS_ACTION_IDS.status,
] as const;
const TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS = [
  { actionId: INTERCOM_ACTION_IDS.listSessions, prefix: "Intercom", toolName: "intercom", params: { action: "list" } },
  { actionId: INTERCOM_ACTION_IDS.pendingAsks, prefix: "Intercom", toolName: "intercom", params: { action: "pending" } },
  { actionId: INTERCOM_ACTION_IDS.status, prefix: "Intercom", toolName: "intercom", params: { action: "status" } },
  { actionId: SUBAGENTS_ACTION_IDS.listAgents, prefix: "Subagents", toolName: "subagent", params: { action: "list" } },
  { actionId: SUBAGENTS_ACTION_IDS.listChains, prefix: "Subagents", toolName: "subagent", params: { action: "chains" } },
  { actionId: SUBAGENTS_ACTION_IDS.runStatus, prefix: "Subagents", toolName: "subagent", params: { action: "status" } },
  { actionId: SUBAGENTS_ACTION_IDS.interrupt, prefix: "Subagents", toolName: "subagent", params: { action: "interrupt" }, confirm: true },
  { actionId: MEMORY_ACTION_IDS.dailyLog, prefix: "Memory", toolName: "memory_read", params: { target: "daily" } },
  { actionId: MEMORY_ACTION_IDS.longTerm, prefix: "Memory", toolName: "memory_read", params: { target: "long_term" } },
  { actionId: MEMORY_ACTION_IDS.scratchpad, prefix: "Memory", toolName: "memory_read", params: { target: "scratchpad" } },
  { actionId: SCHEDULE_PROMPT_ACTION_IDS.listJobs, prefix: "Schedule Prompt", toolName: "schedule_prompt", params: { action: "list" } },
  { actionId: SCHEDULE_PROMPT_ACTION_IDS.cleanupJobs, prefix: "Schedule Prompt", toolName: "schedule_prompt", params: { action: "cleanup" }, confirm: true },
] as const;
const SEARCH_COMMAND_CONFLICT_ACTION_IDS = [] as const;
const STATIC_ZERO_ARGUMENT_SLASH_COMMAND_NAME = /^[a-z][a-z0-9-]*$/i;
const UNSAFE_OR_ARGUMENT_BEARING_SLASH_COMMAND_EXAMPLES = [
  "/obs",
  "obs now",
  "obs --json",
  "obs/path",
  "obs\n/settings",
  "websearch cats",
  "prompt:rewrite",
] as const;
const PROMPT_LIKE_OR_ARGUMENT_COMMAND_PATTERN = /\b(?:run|parallel|chain|web[-_]?search|prompt)\b|\$ARGUMENTS|\$@|<args?>|\s--?\w/i;

function findRegisteredAction(actionId: string) {
  return sdk.getKeysmithRegistry().snapshot().actions.find((candidate) => candidate.id === actionId);
}

function requireRegisteredAction(actionId: string) {
  const action = findRegisteredAction(actionId);
  if (!action) throw new Error(`expected registered action ${actionId}`);
  return action;
}

function requireRegisteredActionMatching(pattern: RegExp) {
  const action = sdk.getKeysmithRegistry().snapshot().actions.find((candidate) => pattern.test(candidate.id));
  if (!action) throw new Error(`expected registered action matching ${pattern}`);
  return action;
}

function actionMetadata(action: unknown): Record<string, unknown> {
  if (!action || typeof action !== "object") throw new Error("expected action metadata object");
  return action as Record<string, unknown>;
}

function slashCommandNameFor(action: unknown): string {
  const command = actionMetadata(action).slashCommand;
  if (typeof command !== "string") throw new Error(`expected static slashCommand metadata on ${JSON.stringify(action)}`);
  return command;
}

function slashCommandNameForOrUndefined(action: unknown): string | undefined {
  const command = actionMetadata(action).slashCommand;
  return typeof command === "string" ? command : undefined;
}

function expectNoUnavailableNotification(notify: ReturnType<typeof vi.fn>, actionId: string): void {
  expect(
    notify.mock.calls.some(([message]) => /unavailable|unsupported|not available|no stable public/i.test(String(message))),
    `expected ${actionId} not to report unavailable`,
  ).toBe(false);
}

function optionMatching(options: readonly string[], pattern: RegExp): string | undefined {
  return options.find((option) => pattern.test(option));
}

function browserOption(options: readonly string[], actionId: string): string {
  const option = options.find((candidate) => candidate.includes(actionId));
  expect(option, `expected browser option for ${actionId}`).toBeDefined();
  return option ?? "";
}

function hasUnavailableSignal(action: unknown, result: unknown, notify: ReturnType<typeof vi.fn>): boolean {
  const notifiedUnavailable = notify.mock.calls.some(([message]) => /unavailable|unsupported|not available/i.test(String(message)));
  const metadata = JSON.stringify({ action, result }).toLowerCase();
  return notifiedUnavailable || /unavailable|unsupported|not available/.test(metadata);
}

function expectUnavailableNotification(notify: ReturnType<typeof vi.fn>, actionId: string): void {
  expect(
    notify.mock.calls.some(
      ([message]) => String(message).includes("Pi Core") && /unavailable|unsupported|not available/i.test(String(message)),
    ),
    `expected unavailable notification for ${actionId}`,
  ).toBe(true);
}

function expectSessionSearchUnavailableNotification(notify: ReturnType<typeof vi.fn>, actionId: string): void {
  expect(
    notify.mock.calls.some(
      ([message]) => String(message).includes("Session Search") && /unavailable|unsupported|not available|ambiguous/i.test(String(message)),
    ),
    `expected unavailable notification for ${actionId}`,
  ).toBe(true);
}

function hasConfirmationOrSafetyMetadata(action: unknown): boolean {
  if (!action || typeof action !== "object") return false;
  const metadata = action as Record<string, unknown>;
  return (
    metadata.requiresConfirmation === true ||
    metadata.confirm === true ||
    Boolean(metadata.confirmation) ||
    (typeof metadata.sideEffect === "string" && metadata.sideEffect !== "none")
  );
}

function hasUnavailableMetadata(action: unknown): boolean {
  if (!action || typeof action !== "object") return false;
  const metadata = action as Record<string, unknown>;
  return metadata.available === false && /unavailable|unsupported|not available|ambiguous/i.test(String(metadata.availabilityReason ?? ""));
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
    readonly baseDir?: string;
  };
};

function slashCommandFixture(packageName: string, invocationName: string | undefined): SlashCommandInfoFixture {
  return {
    name: "search",
    ...(invocationName ? { invocationName } : {}),
    source: "extension",
    sourceInfo: {
      path: `/Users/example/.pi/extensions/${packageName}/dist/index.js`,
      source: packageName,
      scope: "user",
      origin: "package",
      baseDir: `/Users/example/.pi/extensions/${packageName}`,
    },
  };
}

function duplicateSearchProviderCommands(): SlashCommandInfoFixture[] {
  return [slashCommandFixture(WEB_ACCESS_PACKAGE, "search:1"), slashCommandFixture(SESSION_SEARCH_PACKAGE, "search:2")];
}

function notificationText(notify: ReturnType<typeof vi.fn>): string {
  return notify.mock.calls.map(([message]) => String(message)).join("\n");
}

function capturedToolContext(invokeCapturedTool: ReturnType<typeof vi.fn>, ui: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hasUI: true,
    ui: {
      notify: vi.fn(),
      confirm: vi.fn(async () => true),
      input: vi.fn(async () => "query from user"),
      ...ui,
    },
    invokeCapturedTool,
    keysmithCapturedTools: { invoke: invokeCapturedTool },
    capturedToolBridge: { invoke: invokeCapturedTool },
  };
}

function expectCapturedToolInvocation(
  invokeCapturedTool: ReturnType<typeof vi.fn>,
  expected: { readonly actionId: string; readonly toolName: string; readonly params: Record<string, unknown> },
): void {
  expect(invokeCapturedTool, `${expected.actionId} must invoke the captured ${expected.toolName} tool`).toHaveBeenCalledTimes(1);
  const call = invokeCapturedTool.mock.calls[0] ?? [];
  const [first, second] = call;
  if (typeof first === "string") {
    expect(first).toBe(expected.toolName);
    expect(second).toEqual(expected.params);
    return;
  }
  expect(first).toEqual(
    expect.objectContaining({
      actionId: expected.actionId,
      toolName: expected.toolName,
      params: expected.params,
    }),
  );
}

function textToolResult(text: string): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return { content: [{ type: "text", text }], details: { ignored: true } };
}

describe("built-in actions", () => {
  it("cycles thinking levels using getSupportedThinkingLevels semantics for non-reasoning/null/xhigh models", () => {
    const nonReasoning = model({ reasoning: false });
    expect(getSupportedThinkingLevels(nonReasoning)).toEqual(["off"]);
    expect(cycleThinkingLevel({ model: nonReasoning, current: "off", direction: "next" })).toBe("off");

    const withoutMediumOrXhigh = model({ reasoning: true, thinkingLevelMap: { medium: null } });
    expect(getSupportedThinkingLevels(withoutMediumOrXhigh)).toEqual(["off", "minimal", "low", "high"]);
    expect(cycleThinkingLevel({ model: withoutMediumOrXhigh, current: "low", direction: "next" })).toBe("high");
    expect(cycleThinkingLevel({ model: withoutMediumOrXhigh, current: "off", direction: "previous" })).toBe("high");

    const withXhigh = model({ reasoning: true, thinkingLevelMap: { xhigh: "xhigh" } });
    expect(getSupportedThinkingLevels(withXhigh)).toContain("xhigh");
    expect(cycleThinkingLevel({ model: withXhigh, current: "high", direction: "next" })).toBe("xhigh");
  });

  it("registers built-in actions through the SDK registry", () => {
    const handles = registerBuiltInActions();

    try {
      const ids = sdk.getKeysmithRegistry().snapshot().actions.map((action) => action.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          THINKING_NEXT_ACTION_ID,
          THINKING_PREVIOUS_ACTION_ID,
          TOOLS_EXPAND_TOGGLE_ACTION_ID,
          KEYSMITH_ACTIONS_OPEN_ACTION_ID,
          KEYSMITH_DOCTOR_OPEN_ACTION_ID,
        ]),
      );
    } finally {
      handles.dispose();
    }
  });

  it("registers Pi core thinking actions with normalized Pi Core descriptions", () => {
    const handles = registerBuiltInActions();

    try {
      const actions = sdk.getKeysmithRegistry().snapshot().actions;
      const ids = actions.map((action) => action.id);
      expect(ids).toEqual(expect.arrayContaining(Object.values(PI_CORE_THINKING_ACTION_IDS)));
      expect(ids.some((id) => PI_CORE_THINKING_MAX_ACTION_ID.test(id))).toBe(true);
      for (const actionId of Object.values(PI_CORE_THINKING_ACTION_IDS)) {
        expect(actions.find((action) => action.id === actionId)?.description).toMatch(/^Pi Core:/);
      }
      expect(requireRegisteredActionMatching(PI_CORE_THINKING_MAX_ACTION_ID).description).toMatch(/^Pi Core:/);
    } finally {
      handles.dispose();
    }
  });

  it("does not register prompt-like or argument-bearing Pi core actions", () => {
    const handles = registerBuiltInActions();

    try {
      const ids = sdk.getKeysmithRegistry().snapshot().actions.map((action) => action.id);
      for (const actionId of FORBIDDEN_PROMPT_LIKE_PI_CORE_ACTION_IDS) expect(ids).not.toContain(actionId);
      expect(ids.filter((id) => FORBIDDEN_PROMPT_LIKE_PI_CORE_ACTION_ID_PATTERN.test(id))).toEqual([]);
    } finally {
      handles.dispose();
    }
  });

  it("registers Pi core root, model, and session actions exactly once with normalized descriptions", () => {
    const firstRegistration = registerBuiltInActions();
    const secondRegistration = registerBuiltInActions();

    try {
      const actions = sdk.getKeysmithRegistry().snapshot().actions;
      for (const actionId of Object.values(PI_CORE_NAVIGATION_ACTION_IDS)) {
        const registrations = actions.filter((action) => action.id === actionId);
        expect(registrations, `registrations for ${actionId}`).toHaveLength(1);
        expect(registrations[0]?.description, `description for ${actionId}`).toMatch(/^Pi Core:/);
      }
    } finally {
      secondRegistration.dispose();
      firstRegistration.dispose();
    }
  });

  it("Pi core app-action bridge actions expose stable app keybinding metadata instead of unavailable placeholders", () => {
    const handles = registerBuiltInActions();

    try {
      for (const [actionId, appKeybinding] of Object.entries(PI_CORE_APP_ACTION_BRIDGE_MAPPINGS)) {
        const action = requireRegisteredAction(actionId);
        expect(action.description, `description for ${actionId}`).toMatch(/^Pi Core:/);
        expect(action.available, `${actionId} must be available when the Pi app keybinding bridge can resolve an active handler`).not.toBe(false);
        expect(String(action.availabilityReason ?? ""), `${actionId} must not retain stale unavailable copy`).not.toMatch(
          /unavailable|unsupported|not available|no stable public/i,
        );
        expect(action.implementationStability, `${actionId} must advertise the app action bridge implementation`).toBe("appAction");
        expect(actionMetadata(action).appKeybinding, `${actionId} must map to the Pi app keybinding handler`).toBe(appKeybinding);
        expect(slashCommandNameForOrUndefined(action), `${actionId} must not fall back through slash command execution`).toBeUndefined();
      }
    } finally {
      handles.dispose();
    }
  });

  it("Pi core compact invokes the direct ctx.compact bridge", async () => {
    const handles = registerBuiltInActions();
    const ctx = {
      compact: vi.fn(async () => ({ compacted: true })),
      hasUI: true,
      ui: { notify: vi.fn() },
    };

    try {
      await requireRegisteredAction(PI_CORE_NAVIGATION_ACTION_IDS.sessionCompact).handler(ctx as never);

      expect(ctx.compact).toHaveBeenCalledTimes(1);
      expect(ctx.ui.notify.mock.calls.map(([message]) => String(message)).join("\n")).not.toMatch(/unavailable|unsupported|not available/i);
    } finally {
      handles.dispose();
    }
  });

  it("Pi core actions without stable direct bridges report unavailable and stay safe without UI", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of PI_CORE_UNBRIDGEABLE_ACTION_IDS) {
        const action = requireRegisteredAction(actionId);
        const ctx = { hasUI: true, ui: { notify: vi.fn() } };

        await action.handler(ctx as never);

        expectUnavailableNotification(ctx.ui.notify, actionId);
        await expect(
          (async () => {
            await action.handler({ hasUI: false } as never);
          })(),
        ).resolves.toBeUndefined();
      }

      await expect(
        (async () => {
          await requireRegisteredAction(PI_CORE_NAVIGATION_ACTION_IDS.sessionCompact).handler({ hasUI: false } as never);
        })(),
      ).resolves.toBeUndefined();
    } finally {
      handles.dispose();
    }
  });

  it("registers Session Search actions with normalized descriptions and safe handlers", async () => {
    const handles = registerBuiltInActions();

    try {
      const actions = sdk.getKeysmithRegistry().snapshot().actions;
      for (const actionId of Object.values(SESSION_SEARCH_ACTION_IDS)) {
        const registrations = actions.filter((action) => action.id === actionId);
        expect(registrations, `registrations for ${actionId}`).toHaveLength(1);
        expect(registrations[0]?.description, `description for ${actionId}`).toMatch(/^Session Search:/);
        await expect(registrations[0]?.handler({ hasUI: false } as never)).resolves.toBeUndefined();
      }
    } finally {
      handles.dispose();
    }
  });

  it("resolves duplicate /search providers by invocationName/sourceInfo and submits static literal args", async () => {
    const handles = registerBuiltInActions();

    try {
      const cases = [
        { actionId: SESSION_SEARCH_ACTION_IDS.list, expectedSubmission: "/search:2" },
        { actionId: SESSION_SEARCH_ACTION_IDS.search, expectedSubmission: "/search:2" },
        { actionId: SESSION_SEARCH_ACTION_IDS.stats, expectedSubmission: "/search:2 stats" },
        { actionId: WEB_ACCESS_ACTION_IDS.storedResults, expectedSubmission: "/search:1" },
      ];

      for (const { actionId, expectedSubmission } of cases) {
        const action = requireRegisteredAction(actionId);
        const ctx = {
          getCommands: vi.fn(() => duplicateSearchProviderCommands()),
          executeCommand: vi.fn(async () => undefined),
          submitEditorText: vi.fn(async () => undefined),
          hasUI: true,
          ui: { notify: vi.fn(), confirm: vi.fn(async () => true) },
        };

        await action.handler(ctx as never);

        expect(ctx.getCommands, `${actionId} must inspect the Pi slash command registry`).toHaveBeenCalledTimes(1);
        expect(ctx.submitEditorText, `${actionId} must submit the provider-resolved slash invocation`).toHaveBeenCalledTimes(1);
        expect(ctx.submitEditorText.mock.calls[0]).toEqual([expectedSubmission]);
        expect(ctx.executeCommand, `${actionId} must not use executeCommand for provider-qualified or argument-bearing slash fallbacks`).not.toHaveBeenCalled();
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }

      const reindex = requireRegisteredAction(SESSION_SEARCH_ACTION_IDS.reindex);
      const reindexCtx = {
        getCommands: vi.fn(() => duplicateSearchProviderCommands()),
        executeCommand: vi.fn(async () => undefined),
        submitEditorText: vi.fn(async () => undefined),
        hasUI: true,
        ui: { notify: vi.fn(), confirm: vi.fn(async () => true) },
      };

      await reindex.handler(reindexCtx as never);

      expect(reindexCtx.ui.confirm, "reindex must require confirmation before submitting").toHaveBeenCalledTimes(1);
      expect(reindexCtx.submitEditorText).toHaveBeenCalledWith("/search:2 reindex");
      expect(reindexCtx.executeCommand).not.toHaveBeenCalled();
      expectNoUnavailableNotification(reindexCtx.ui.notify, SESSION_SEARCH_ACTION_IDS.reindex);
    } finally {
      handles.dispose();
    }
  });

  it("does not submit /search actions when the provider is unavailable or cannot be source-qualified", async () => {
    const handles = registerBuiltInActions();

    try {
      const contexts = [
        { label: "missing getCommands", getCommands: undefined },
        { label: "no search command", getCommands: vi.fn(() => []) },
        {
          label: "duplicate search commands without invocationName",
          getCommands: vi.fn(() => [slashCommandFixture(WEB_ACCESS_PACKAGE, undefined), slashCommandFixture(SESSION_SEARCH_PACKAGE, undefined)]),
        },
      ];

      for (const { label, getCommands } of contexts) {
        for (const actionId of [SESSION_SEARCH_ACTION_IDS.search, SESSION_SEARCH_ACTION_IDS.stats, WEB_ACCESS_ACTION_IDS.storedResults]) {
          const action = requireRegisteredAction(actionId);
          const ctx = {
            ...(getCommands ? { getCommands } : {}),
            executeCommand: vi.fn(async () => undefined),
            submitEditorText: vi.fn(async () => undefined),
            hasUI: true,
            ui: { notify: vi.fn(), confirm: vi.fn(async () => true) },
          };

          await action.handler(ctx as never);

          expect(ctx.submitEditorText, `${label}: ${actionId} must not guess a bare /search provider`).not.toHaveBeenCalled();
          expect(ctx.executeCommand, `${label}: ${actionId} must not fall back to executeCommand for ambiguous /search`).not.toHaveBeenCalled();
          expect(notificationText(ctx.ui.notify), `${label}: ${actionId} must explain provider-specific unavailability`).toMatch(
            /\/search|search command|provider|ambiguous|source-qualified|no matching/i,
          );
          expect(notificationText(ctx.ui.notify), `${label}: ${actionId} must not report the stale generic placeholder reason`).not.toMatch(
            /no stable public/i,
          );
        }
      }
    } finally {
      handles.dispose();
    }
  });

  it("does not submit Session Search reindex when confirmation is declined", async () => {
    const handles = registerBuiltInActions();
    const action = requireRegisteredAction(SESSION_SEARCH_ACTION_IDS.reindex);
    const ctx = {
      getCommands: vi.fn(() => duplicateSearchProviderCommands()),
      submitEditorText: vi.fn(async () => undefined),
      executeCommand: vi.fn(async () => undefined),
      hasUI: true,
      ui: { notify: vi.fn(), confirm: vi.fn(async () => false) },
    };

    try {
      await action.handler(ctx as never);

      expect(ctx.ui.confirm).toHaveBeenCalledTimes(1);
      expect(ctx.submitEditorText).not.toHaveBeenCalled();
      expect(ctx.executeCommand).not.toHaveBeenCalled();
      expect(notificationText(ctx.ui.notify)).not.toMatch(/unavailable|unsupported|not available|no stable public/i);
    } finally {
      handles.dispose();
    }
  });

  it("rejects unsafe static slash args before invoking bridges", async () => {
    const unsafeArgs = ["/stats", "stats now", "${query}", "$ARGUMENTS", "<args>", "`uname`", "--json"];

    for (const unsafeArg of unsafeArgs) {
      const handles = registerBuiltInActions();
      const action = requireRegisteredAction(SESSION_SEARCH_ACTION_IDS.stats);
      actionMetadata(action).slashCommand = { name: "search", args: [unsafeArg] };
      const ctx = {
        getCommands: vi.fn(() => duplicateSearchProviderCommands()),
        submitEditorText: vi.fn(async () => undefined),
        executeCommand: vi.fn(async () => undefined),
        hasUI: true,
        ui: { notify: vi.fn() },
      };

      try {
        await action.handler(ctx as never);

        expect(ctx.submitEditorText, `${unsafeArg} must not be submitted`).not.toHaveBeenCalled();
        expect(ctx.executeCommand, `${unsafeArg} must not reach executeCommand`).not.toHaveBeenCalled();
        expect(notificationText(ctx.ui.notify), `${unsafeArg} must be rejected as unsafe static slash metadata`).toMatch(
          /invalid|unsafe|argument|allowlist|static slash/i,
        );
      } finally {
        handles.dispose();
      }
    }
  });

  it("registers Intercom and Subagents status/navigation actions with normalized descriptions and safe fallbacks", async () => {
    const handles = registerBuiltInActions();

    try {
      const expectations = [
        ...Object.values(INTERCOM_ACTION_IDS).map((actionId) => ({ actionId, prefix: /^Intercom:/ })),
        ...Object.values(SUBAGENTS_ACTION_IDS).map((actionId) => ({ actionId, prefix: /^Subagents:/ })),
      ];
      for (const { actionId, prefix } of expectations) {
        const registrations = sdk.getKeysmithRegistry().snapshot().actions.filter((action) => action.id === actionId);
        expect(registrations, `registrations for ${actionId}`).toHaveLength(1);
        expect(registrations[0]?.description, `description for ${actionId}`).toMatch(prefix);
        await expect(registrations[0]?.handler({ hasUI: false } as never)).resolves.toBeUndefined();
      }

      const interrupt = requireRegisteredAction(SUBAGENTS_ACTION_IDS.interrupt);
      if (!hasConfirmationOrSafetyMetadata(interrupt) && !hasUnavailableMetadata(interrupt)) {
        const ctx = { hasUI: true, ui: { notify: vi.fn() } };
        await interrupt.handler(ctx as never);
        expect(hasUnavailableSignal(interrupt, undefined, ctx.ui.notify)).toBe(true);
      }
    } finally {
      handles.dispose();
    }
  });

  it("shows Intercom and Subagents actions in the browser only when mounted, including default-keymap-off visibility", async () => {
    const handles = registerBuiltInActions();
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-compat-browser-cwd-"));
    await mkdir(join(cwd, ".pi"), { recursive: true });

    try {
      const settingsPath = join(cwd, ".pi", "settings.json");
      await writeFile(
        settingsPath,
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
      const ctx = {
        cwd,
        hasUI: true,
        ui: { select: vi.fn(async (_title: string, _options: string[]) => undefined), notify: vi.fn() },
      };
      await requireRegisteredAction(KEYSMITH_ACTIONS_OPEN_ACTION_ID).handler(ctx as never);
      const mountedOptions = (ctx.ui.select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Intercom: List sessions/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Intercom: Pending asks/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Subagents: List agents/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Subagents: Interrupt/)]));

      await writeFile(
        settingsPath,
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
      ctx.ui.select.mockClear();
      await requireRegisteredAction(KEYSMITH_ACTIONS_OPEN_ACTION_ID).handler(ctx as never);
      const disabledOptions = (ctx.ui.select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
      expect(disabledOptions.join("\n")).not.toMatch(/Intercom:/);
      expect(disabledOptions.join("\n")).not.toMatch(/Subagents:/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      handles.dispose();
    }
  });

  it("registers Observability actions as static zero-argument slash fallbacks", () => {
    const handles = registerBuiltInActions();

    try {
      for (const unsafe of UNSAFE_OR_ARGUMENT_BEARING_SLASH_COMMAND_EXAMPLES) {
        expect(unsafe, `${unsafe} must not match the static zero-argument slash command grammar`).not.toMatch(
          STATIC_ZERO_ARGUMENT_SLASH_COMMAND_NAME,
        );
      }

      for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) {
        const action = requireRegisteredAction(actionId);
        expect(action.description, `description for ${actionId}`).toMatch(/^Observability:/);
        expect(action.available, `${actionId} must no longer be an unavailable placeholder`).not.toBe(false);
        expect(String(action.availabilityReason ?? ""), `${actionId} must not retain stale unavailable copy`).not.toMatch(
          /unavailable|unsupported|not available|no stable public/i,
        );
        expect(action.implementationStability).toBe("slashFallback");

        const command = slashCommandNameFor(action);
        expect(command).toBe(OBSERVABILITY_SLASH_COMMANDS[actionId]);
        expect(command, `${actionId} command must be a command name without leading slash, args, or path segments`).toMatch(
          STATIC_ZERO_ARGUMENT_SLASH_COMMAND_NAME,
        );
        expect(command).not.toContain("/");
        expect(command).not.toMatch(/\s/);
        expect(JSON.stringify(action), `${actionId} must not encode prompt-like or argument-bearing slash command metadata`).not.toMatch(
          PROMPT_LIKE_OR_ARGUMENT_COMMAND_PATTERN,
        );
      }
    } finally {
      handles.dispose();
    }
  });

  it("Observability slash fallbacks call feature-detected executeCommand with the command name and no args", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) {
        const action = requireRegisteredAction(actionId);
        const command = OBSERVABILITY_SLASH_COMMANDS[actionId];
        const ctx = {
          executeCommand: vi.fn(async () => undefined),
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => "draft text"),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.executeCommand, `${actionId} must invoke the public command API when present`).toHaveBeenCalledTimes(1);
        expect(ctx.executeCommand.mock.calls[0], `${actionId} must pass exactly the command name and no arguments`).toEqual([command]);
        expect(ctx.ui.setEditorText, `${actionId} must not rewrite editor text when executeCommand is available`).not.toHaveBeenCalled();
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("Observability slash fallbacks submit through the safe current-editor bridge when executeCommand is unavailable", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) {
        const action = requireRegisteredAction(actionId);
        const command = OBSERVABILITY_SLASH_COMMANDS[actionId];
        const ctx = {
          submitEditorText: vi.fn(async () => undefined),
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => "existing draft"),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.submitEditorText, `${actionId} must submit/run the slash command when the editor bridge is available`).toHaveBeenCalledTimes(1);
        expect(ctx.submitEditorText.mock.calls[0], `${actionId} must submit exactly the zero-arg slash command`).toEqual([`/${command}`]);
        expect(ctx.ui.setEditorText, `${actionId} must not prefill or clobber the existing editor draft before submit`).not.toHaveBeenCalled();
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("Observability slash fallbacks do not prefill an empty editor when no execute/submit bridge is available", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) {
        const action = requireRegisteredAction(actionId);
        const command = OBSERVABILITY_SLASH_COMMANDS[actionId];
        const ctx = {
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => ""),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.ui.setEditorText, `${actionId} must not prefill; Observability commands should run, not sit in the draft`).not.toHaveBeenCalled();
        expect(
          ctx.ui.notify.mock.calls.some(([message]) => String(message).includes(`/${command}`) && /run|manually|bridge|unavailable/i.test(String(message))),
          `${actionId} must explain how to run ${command} when no safe submit bridge is available`,
        ).toBe(true);
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("Observability slash fallbacks preserve existing editor text and notify instead of silently combining or discarding it", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of Object.values(OBSERVABILITY_ACTION_IDS)) {
        const action = requireRegisteredAction(actionId);
        const command = OBSERVABILITY_SLASH_COMMANDS[actionId];
        const ctx = {
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => "existing draft"),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.ui.getEditorText, `${actionId} must inspect current editor text before deciding fallback behavior`).toHaveBeenCalledTimes(1);
        expect(ctx.ui.setEditorText, `${actionId} must leave the existing draft unchanged`).not.toHaveBeenCalled();
        expect(
          ctx.ui.notify.mock.calls.some(
            ([message]) => String(message).includes(`/${command}`) && /draft|editor|existing|not overwrite|unchanged|copy/i.test(String(message)),
          ),
          `${actionId} must explicitly tell the user the existing draft was preserved and how to run ${command}`,
        ).toBe(true);
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("Observability slash fallbacks reject unsafe slash command metadata before invoking bridges or editing text", async () => {
    const handles = registerBuiltInActions();

    try {
      const action = requireRegisteredAction(OBSERVABILITY_ACTION_IDS.dashboard);
      actionMetadata(action).slashCommand = "obs --json";
      const ctx = {
        executeCommand: vi.fn(async () => undefined),
        hasUI: true,
        ui: {
          getEditorText: vi.fn(() => ""),
          setEditorText: vi.fn(),
          notify: vi.fn(),
        },
      };

      await action.handler(ctx as never);

      expect(ctx.executeCommand, "unsafe command metadata must not reach executeCommand").not.toHaveBeenCalled();
      expect(ctx.ui.setEditorText, "unsafe command metadata must not be prefixed into the editor").not.toHaveBeenCalled();
      expect(
        ctx.ui.notify.mock.calls.some(([message]) => /invalid|unsafe|unsupported|slash command/i.test(String(message))),
        "unsafe command metadata must be rejected with an explicit notification",
      ).toBe(true);
    } finally {
      handles.dispose();
    }
  });

  it("registers remaining safe zero-argument compat actions as slash fallbacks, not unavailable placeholders", () => {
    const handles = registerBuiltInActions();

    try {
      for (const [actionId, command] of Object.entries(REMAINING_SAFE_ZERO_ARG_SLASH_COMMANDS)) {
        const action = requireRegisteredAction(actionId);
        expect(action.description, `description for ${actionId}`).toMatch(
          /^(Markdown Preview|Model Cycler|Subagents|Web Access|Schedule Prompt):/,
        );
        expect(action.available, `${actionId} must no longer be an unavailable placeholder`).not.toBe(false);
        expect(String(action.availabilityReason ?? ""), `${actionId} must not retain stale unavailable copy`).not.toMatch(
          /unavailable|unsupported|not available|no stable public/i,
        );
        expect(action.implementationStability).toBe("slashFallback");

        const slashCommand = slashCommandNameFor(action);
        expect(slashCommand).toBe(command);
        expect(slashCommand, `${actionId} command must be a command name without leading slash, args, or path segments`).toMatch(
          STATIC_ZERO_ARGUMENT_SLASH_COMMAND_NAME,
        );
        expect(slashCommand).not.toContain("/");
        expect(slashCommand).not.toMatch(/\s/);
        expect(JSON.stringify(action), `${actionId} must not encode prompt-like or argument-bearing slash command metadata`).not.toMatch(
          PROMPT_LIKE_OR_ARGUMENT_COMMAND_PATTERN,
        );
      }
    } finally {
      handles.dispose();
    }
  });

  it("remaining safe zero-argument compat slash fallbacks call executeCommand first with no args", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const [actionId, command] of Object.entries(REMAINING_SAFE_ZERO_ARG_SLASH_COMMANDS)) {
        const action = requireRegisteredAction(actionId);
        const ctx = {
          executeCommand: vi.fn(async () => undefined),
          submitEditorText: vi.fn(async () => undefined),
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => "draft text"),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.executeCommand, `${actionId} must invoke the public command API when present`).toHaveBeenCalledTimes(1);
        expect(ctx.executeCommand.mock.calls[0], `${actionId} must pass exactly the command name and no arguments`).toEqual([command]);
        expect(ctx.submitEditorText, `${actionId} must prefer executeCommand over editor submission`).not.toHaveBeenCalled();
        expect(ctx.ui.setEditorText, `${actionId} must not rewrite editor text when executeCommand is available`).not.toHaveBeenCalled();
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("remaining safe zero-argument compat slash fallbacks submit through the safe current-editor bridge", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const [actionId, command] of Object.entries(REMAINING_SAFE_ZERO_ARG_SLASH_COMMANDS)) {
        const action = requireRegisteredAction(actionId);
        const ctx = {
          submitEditorText: vi.fn(async () => undefined),
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => "existing draft"),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.submitEditorText, `${actionId} must submit/run the slash command when the editor bridge is available`).toHaveBeenCalledTimes(1);
        expect(ctx.submitEditorText.mock.calls[0], `${actionId} must submit exactly the zero-arg slash command`).toEqual([`/${command}`]);
        expect(ctx.ui.setEditorText, `${actionId} must not prefill or clobber the existing editor draft before submit`).not.toHaveBeenCalled();
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("remaining safe zero-argument compat slash fallbacks do not prefill an empty editor when no bridge is available", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const [actionId, command] of Object.entries(REMAINING_SAFE_ZERO_ARG_SLASH_COMMANDS)) {
        const action = requireRegisteredAction(actionId);
        const ctx = {
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => ""),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.ui.setEditorText, `${actionId} must not prefill; safe compat commands should run, not sit in the draft`).not.toHaveBeenCalled();
        expect(
          ctx.ui.notify.mock.calls.some(([message]) => String(message).includes(`/${command}`) && /run|manually|bridge|unavailable/i.test(String(message))),
          `${actionId} must explain how to run ${command} when no safe submit bridge is available`,
        ).toBe(true);
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("remaining safe zero-argument compat slash fallbacks preserve drafts instead of prefill when no bridge is available", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const [actionId, command] of Object.entries(REMAINING_SAFE_ZERO_ARG_SLASH_COMMANDS)) {
        const action = requireRegisteredAction(actionId);
        const ctx = {
          hasUI: true,
          ui: {
            getEditorText: vi.fn(() => "existing draft"),
            setEditorText: vi.fn(),
            notify: vi.fn(),
          },
        };

        await action.handler(ctx as never);

        expect(ctx.ui.getEditorText, `${actionId} must inspect current editor text before deciding fallback behavior`).toHaveBeenCalledTimes(1);
        expect(ctx.ui.setEditorText, `${actionId} must leave the existing draft unchanged`).not.toHaveBeenCalled();
        expect(
          ctx.ui.notify.mock.calls.some(
            ([message]) => String(message).includes(`/${command}`) && /draft|editor|existing|not overwrite|unchanged|copy/i.test(String(message)),
          ),
          `${actionId} must explicitly tell the user the existing draft was preserved and how to run ${command}`,
        ).toBe(true);
        expectNoUnavailableNotification(ctx.ui.notify, actionId);
      }
    } finally {
      handles.dispose();
    }
  });

  it("registers allowlisted captured-tool compat actions with static descriptors instead of unavailable placeholders", () => {
    const handles = registerBuiltInActions();

    try {
      for (const expectation of TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS) {
        const action = requireRegisteredAction(expectation.actionId);
        expect(action.description, `description for ${expectation.actionId}`).toMatch(new RegExp(`^${expectation.prefix}:`));
        expect(action.available, `${expectation.actionId} must be available when the captured tool bridge has the tool`).not.toBe(false);
        expect(String(action.availabilityReason ?? ""), `${expectation.actionId} must not retain stale unavailable copy`).not.toMatch(
          /unavailable|unsupported|not available|no stable public/i,
        );
        expect(action.implementationStability, `${expectation.actionId} must advertise the captured tool bridge`).toBe("capturedTool");
        const toolInvocation = actionMetadata(action).toolInvocation;
        expect(toolInvocation, `${expectation.actionId} must expose a static allowlisted tool descriptor`).toEqual({
          toolName: expectation.toolName,
          params: expectation.params,
        });
        expect(String((toolInvocation as { toolName?: unknown }).toolName), `${expectation.actionId} must not encode an arbitrary dynamic tool name`).not.toMatch(
          /^(?:bash|write|edit|web_search)$/i,
        );
        expect(JSON.stringify((toolInvocation as { params?: unknown }).params), `${expectation.actionId} must not encode prompt-like params or placeholders`).not.toMatch(
          /(?:prompt|freeform|\$ARGUMENTS|\$@|<args?>|\{\{|\$\{)/i,
        );
      }

      expect(requireRegisteredAction(INTERCOM_ACTION_IDS.reply).available, "Intercom reply requires user-authored text and must remain unavailable").toBe(
        false,
      );
    } finally {
      handles.dispose();
    }
  });

  it("invokes only allowlisted captured tools with static params and notifies safely truncated text results", async () => {
    const handles = registerBuiltInActions();
    const longResult = `${"intercom session row\n".repeat(120)}END-OF-RESULT`;
    const invokeCapturedTool = vi.fn(async () => textToolResult(longResult));

    try {
      const expectation = TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS.find(({ actionId }) => actionId === INTERCOM_ACTION_IDS.listSessions);
      expect(expectation).toBeDefined();
      const action = requireRegisteredAction(INTERCOM_ACTION_IDS.listSessions);
      const ctx = capturedToolContext(invokeCapturedTool);

      await action.handler(ctx as never);

      expectCapturedToolInvocation(invokeCapturedTool, expectation ?? TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS[0]);
      const notified = notificationText((ctx.ui as { notify: ReturnType<typeof vi.fn> }).notify);
      expect(notified).toContain("intercom session row");
      expect(notified.length, "captured tool result notifications must be bounded").toBeLessThanOrEqual(1200);
      expect(notified, "truncated notifications must make truncation visible").toMatch(/truncated|…|\.\.\./i);
    } finally {
      handles.dispose();
    }
  });

  it("reports captured-tool unavailability with load-order/public invokeTool guidance instead of guessing", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of [INTERCOM_ACTION_IDS.status, SUBAGENTS_ACTION_IDS.runStatus, MEMORY_ACTION_IDS.dailyLog, SCHEDULE_PROMPT_ACTION_IDS.listJobs]) {
        const action = requireRegisteredAction(actionId);
        const notify = vi.fn();

        await action.handler({ hasUI: true, ui: { notify } } as never);

        const notified = notificationText(notify);
        expect(notified, `${actionId} must report unavailable when its tool was not captured`).toMatch(/unavailable|not available/i);
        expect(notified, `${actionId} must mention load order/registerTool capture or Pi's missing public invokeTool API`).toMatch(
          /load[- ]order|registerTool|captured|public\s+invokeTool|no public tool invocation/i,
        );
      }
    } finally {
      handles.dispose();
    }
  });

  it("sanitizes captured-tool failures without leaking raw params, results, or thrown secret text", async () => {
    const handles = registerBuiltInActions();
    const invokeCapturedTool = vi.fn(async () => {
      throw new Error("boom SECRET_PARAM_TOKEN SECRET_RESULT_TEXT");
    });

    try {
      const action = requireRegisteredAction(INTERCOM_ACTION_IDS.pendingAsks);
      const notify = vi.fn();
      const ctx = capturedToolContext(invokeCapturedTool, { notify });

      await action.handler(ctx as never);

      expectCapturedToolInvocation(invokeCapturedTool, TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS[1]);
      const notified = notificationText(notify);
      expect(notified).toMatch(/Intercom: Pending asks|pi-intercom\.asks\.pending|intercom/i);
      expect(notified).toMatch(/error|failed|could not run/i);
      expect(notified).not.toContain("SECRET_PARAM_TOKEN");
      expect(notified).not.toContain("SECRET_RESULT_TEXT");
      expect(notified).not.toContain(JSON.stringify(TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS[1].params));
    } finally {
      handles.dispose();
    }
  });

  it("requires confirmation before destructive captured-tool actions", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const expectation of TOOL_BACKED_COMPAT_ACTION_EXPECTATIONS) {
        if (!("confirm" in expectation && expectation.confirm)) continue;
        const action = requireRegisteredAction(expectation.actionId);
        const declinedInvoke = vi.fn(async () => textToolResult("declined must not run"));
        const declined = capturedToolContext(declinedInvoke, { confirm: vi.fn(async () => false) });

        await action.handler(declined as never);

        expect((declined.ui as { confirm: ReturnType<typeof vi.fn> }).confirm, `${expectation.actionId} must ask for confirmation`).toHaveBeenCalledTimes(1);
        expect(declinedInvoke, `${expectation.actionId} must not invoke when confirmation is declined`).not.toHaveBeenCalled();

        const acceptedInvoke = vi.fn(async () => textToolResult("confirmed run"));
        const accepted = capturedToolContext(acceptedInvoke, { confirm: vi.fn(async () => true) });

        await action.handler(accepted as never);

        expect((accepted.ui as { confirm: ReturnType<typeof vi.fn> }).confirm, `${expectation.actionId} must ask for confirmation`).toHaveBeenCalledTimes(1);
        expectCapturedToolInvocation(acceptedInvoke, expectation);
      }
    } finally {
      handles.dispose();
    }
  });

  it("prompts for Memory search queries through ui.input and reports unavailable when input is missing", async () => {
    const handles = registerBuiltInActions();

    try {
      const action = requireRegisteredAction(MEMORY_ACTION_IDS.search);
      const invokeCapturedTool = vi.fn(async () => textToolResult("memory search result"));
      const withInput = capturedToolContext(invokeCapturedTool, { input: vi.fn(async () => "release notes") });

      await action.handler(withInput as never);

      expect((withInput.ui as { input: ReturnType<typeof vi.fn> }).input, "Memory search must ask the user for a query").toHaveBeenCalledTimes(1);
      expectCapturedToolInvocation(invokeCapturedTool, {
        actionId: MEMORY_ACTION_IDS.search,
        toolName: "memory_search",
        params: { query: "release notes" },
      });

      const unavailableInvoke = vi.fn(async () => textToolResult("must not run"));
      const notify = vi.fn();
      await action.handler({ hasUI: true, ui: { notify }, invokeCapturedTool: unavailableInvoke } as never);

      expect(unavailableInvoke, "Memory search must not call memory_search without a user-provided query").not.toHaveBeenCalled();
      expect(notificationText(notify)).toMatch(/Memory: Search memory|memory search/i);
      expect(notificationText(notify)).toMatch(/unavailable|input|query/i);
    } finally {
      handles.dispose();
    }
  });

  it("enforces the captured-tool allowlist even if action metadata is mutated to an arbitrary tool name", async () => {
    const handles = registerBuiltInActions();

    try {
      const action = requireRegisteredAction(INTERCOM_ACTION_IDS.status);
      actionMetadata(action).toolInvocation = { toolName: "bash", params: { command: "cat ~/.ssh/id_rsa" } };
      const invokeCapturedTool = vi.fn(async () => textToolResult("PRIVATE KEY"));
      const ctx = capturedToolContext(invokeCapturedTool);

      await action.handler(ctx as never);

      const serializedCalls = JSON.stringify(invokeCapturedTool.mock.calls);
      expect(serializedCalls, "mutated metadata must not be able to invoke arbitrary tools").not.toMatch(/bash|id_rsa|PRIVATE KEY/);
      expect(notificationText((ctx.ui as { notify: ReturnType<typeof vi.fn> }).notify)).not.toMatch(/id_rsa|PRIVATE KEY/);
    } finally {
      handles.dispose();
    }
  });

  it("keeps unsafe, conflicting, non-zero-argument, and tool-only compat actions unavailable instead of slash fallbacks", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of REMAINING_UNAVAILABLE_COMPAT_ACTION_IDS) {
        const action = requireRegisteredAction(actionId);
        expect(action.available, `${actionId} must remain unavailable`).toBe(false);
        expect(action.implementationStability, `${actionId} must not be wired as a direct slash fallback`).not.toBe("slashFallback");
        expect(String(action.availabilityReason ?? ""), `${actionId} must explain why it remains unavailable`).toMatch(
          /unavailable|unsupported|not available|no stable public|ambiguous|conflict|requires|argument|tool|shortcut|no direct|zero-arg/i,
        );

        const notify = vi.fn();
        const result = await action.handler({ hasUI: true, ui: { notify } } as never);
        expect(hasUnavailableSignal(action, result, notify), `${actionId} must still signal unavailable at dispatch`).toBe(true);
        await expect(action.handler({ hasUI: false } as never)).resolves.toBeUndefined();
      }

      for (const actionId of SEARCH_COMMAND_CONFLICT_ACTION_IDS) {
        const action = requireRegisteredAction(actionId);
        expect(action.available, `${actionId} must not silently claim the ambiguous /search command`).toBe(false);
        expect(action.implementationStability, `${actionId} must not be a /search slashFallback while Web Access and Session Search conflict`).not.toBe(
          "slashFallback",
        );
        expect(slashCommandNameForOrUndefined(action), `${actionId} must not expose ambiguous /search metadata`).not.toBe("search");
      }
    } finally {
      handles.dispose();
    }
  });

  it("registers Markdown Preview UI actions with normalized descriptions and unavailable-safe metadata/signals", async () => {
    const handles = registerBuiltInActions();

    try {
      for (const actionId of Object.values(MARKDOWN_PREVIEW_ACTION_IDS)) {
        const registrations = sdk.getKeysmithRegistry().snapshot().actions.filter((action) => action.id === actionId);
        expect(registrations, `registrations for ${actionId}`).toHaveLength(1);
        const action = registrations[0];
        expect(action?.description, `description for ${actionId}`).toMatch(/^Markdown Preview:/);
        await expect(action?.handler({ hasUI: false } as never)).resolves.toBeUndefined();

        if (action?.implementationStability === "slashFallback") {
          expect(action.available, `${actionId} slash fallback must not be marked unavailable`).not.toBe(false);
          continue;
        }

        const notify = vi.fn();
        const result = await action?.handler({ hasUI: true, ui: { notify } } as never);
        expect(
          hasConfirmationOrSafetyMetadata(action) || hasUnavailableMetadata(action) || hasUnavailableSignal(action, result, notify),
          `${actionId} must require confirmation/side-effect metadata or be explicitly unavailable/unavailable-safe`,
        ).toBe(true);
      }
    } finally {
      handles.dispose();
    }
  });

  it("shows Observability and Markdown Preview actions in the browser only when mounted, including default-keymap-off visibility", async () => {
    const handles = registerBuiltInActions();
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-ui-shims-browser-cwd-"));
    await mkdir(join(cwd, ".pi"), { recursive: true });

    try {
      const settingsPath = join(cwd, ".pi", "settings.json");
      await writeFile(
        settingsPath,
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
      const ctx = {
        cwd,
        hasUI: true,
        ui: { select: vi.fn(async (_title: string, _options: string[]) => undefined), notify: vi.fn() },
      };
      await requireRegisteredAction(KEYSMITH_ACTIONS_OPEN_ACTION_ID).handler(ctx as never);
      const mountedOptions = (ctx.ui.select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Observability: Dashboard/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Observability: Toggle footer/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Observability: Toggle path/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Observability: Settings/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Markdown Preview: Preview current/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Markdown Preview: Browser preview/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Markdown Preview: Clear cache/)]));

      await writeFile(
        settingsPath,
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
      ctx.ui.select.mockClear();
      await requireRegisteredAction(KEYSMITH_ACTIONS_OPEN_ACTION_ID).handler(ctx as never);
      const disabledOptions = (ctx.ui.select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
      expect(disabledOptions.join("\n")).not.toMatch(/Observability:/);
      expect(disabledOptions.join("\n")).not.toMatch(/Markdown Preview:/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      handles.dispose();
    }
  });

  it("registers Schedule Prompt, Web Access, Memory, and Model Cycler actions with normalized descriptions and safety metadata", async () => {
    const handles = registerBuiltInActions();

    try {
      const expectations = [
        ...Object.values(SCHEDULE_PROMPT_ACTION_IDS).map((actionId) => ({ actionId, prefix: /^Schedule Prompt:/ })),
        ...Object.values(WEB_ACCESS_ACTION_IDS).map((actionId) => ({ actionId, prefix: /^Web Access:/ })),
        ...Object.values(MEMORY_ACTION_IDS).map((actionId) => ({ actionId, prefix: /^Memory:/ })),
        ...Object.values(MODEL_CYCLER_ACTION_IDS).map((actionId) => ({ actionId, prefix: /^Model Cycler:/ })),
      ];
      for (const { actionId, prefix } of expectations) {
        const registrations = sdk.getKeysmithRegistry().snapshot().actions.filter((action) => action.id === actionId);
        expect(registrations, `registrations for ${actionId}`).toHaveLength(1);
        const action = registrations[0];
        expect(action?.description, `description for ${actionId}`).toMatch(prefix);
        await expect(action?.handler({ hasUI: false } as never)).resolves.toBeUndefined();
      }

      for (const actionId of [SCHEDULE_PROMPT_ACTION_IDS.cleanupJobs]) {
        const action = requireRegisteredAction(actionId);
        const notify = vi.fn();
        const result = await action.handler({ hasUI: true, ui: { notify } } as never);
        expect(
          hasConfirmationOrSafetyMetadata(action) || hasUnavailableMetadata(action) || hasUnavailableSignal(action, result, notify),
          `${actionId} must require confirmation/side-effect metadata or be explicitly unavailable/unavailable-safe`,
        ).toBe(true);
      }

      for (const actionId of Object.values(WEB_ACCESS_ACTION_IDS)) {
        const action = requireRegisteredAction(actionId);
        const serialized = JSON.stringify(action);
        expect(serialized).not.toMatch(/\/websearch\b|websearch/i);
      }

      expect(requireRegisteredAction(MODEL_CYCLER_ACTION_IDS.pick).aliases).toContain(PI_CORE_NAVIGATION_ACTION_IDS.modelPick);
      expect(requireRegisteredAction(MODEL_CYCLER_ACTION_IDS.nextFavorite).aliases).toContain(PI_CORE_NAVIGATION_ACTION_IDS.modelNext);
      expect(requireRegisteredAction(MODEL_CYCLER_ACTION_IDS.previousFavorite).aliases).toContain(PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious);

      const registered = sdk.getKeysmithRegistry().snapshot().actions.map((action) => `${action.id}\n${action.description ?? ""}`);
      expect(registered.join("\n")).not.toMatch(/websearch|web search query|schedule-prompt\.(?:prompt|jobs\.(?:add|create|update))/i);
    } finally {
      handles.dispose();
    }
  });

  it("shows VS-20 shim actions in the browser only when mounted, including default-keymap-off visibility", async () => {
    const handles = registerBuiltInActions();
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-vs20-shims-browser-cwd-"));
    await mkdir(join(cwd, ".pi"), { recursive: true });

    try {
      const settingsPath = join(cwd, ".pi", "settings.json");
      const packages = [SCHEDULE_PROMPT_PACKAGE, WEB_ACCESS_PACKAGE, MEMORY_PACKAGE, MODEL_CYCLER_PACKAGE];
      const shims = [SCHEDULE_PROMPT_SHIM_ID, WEB_ACCESS_SHIM_ID, MEMORY_SHIM_ID, MODEL_CYCLER_SHIM_ID];
      await writeFile(
        settingsPath,
        JSON.stringify({
          packages,
          piKeysmith: {
            compat: { shims: Object.fromEntries(shims.map((shimId) => [shimId, { defaultKeymapEnabled: false }])) },
          },
        }),
      );
      const ctx = {
        cwd,
        hasUI: true,
        ui: { select: vi.fn(async (_title: string, _options: string[]) => undefined), notify: vi.fn() },
      };
      await requireRegisteredAction(KEYSMITH_ACTIONS_OPEN_ACTION_ID).handler(ctx as never);
      const mountedOptions = (ctx.ui.select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Schedule Prompt: List jobs/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Web Access: Curator/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Memory: Search memory/)]));
      expect(mountedOptions).toEqual(expect.arrayContaining([expect.stringMatching(/\[unbound\][\s\S]*Model Cycler: Pick model/)]));

      await writeFile(
        settingsPath,
        JSON.stringify({
          packages,
          piKeysmith: {
            compat: { shims: Object.fromEntries(shims.map((shimId) => [shimId, { enabled: false }])) },
          },
        }),
      );
      ctx.ui.select.mockClear();
      await requireRegisteredAction(KEYSMITH_ACTIONS_OPEN_ACTION_ID).handler(ctx as never);
      const disabledOptions = (ctx.ui.select.mock.calls.at(-1)?.[1] as string[] | undefined) ?? [];
      const disabledText = disabledOptions.join("\n");
      expect(disabledText).not.toMatch(/Schedule Prompt:/);
      expect(disabledText).not.toMatch(/Web Access:/);
      expect(disabledText).not.toMatch(/Memory:/);
      expect(disabledText).not.toMatch(/Model Cycler:/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      handles.dispose();
    }
  });

  it("Pi core thinking off, direct levels, and next/previous aliases set supported levels", async () => {
    const handles = registerBuiltInActions();
    const ctx = {
      model: model({ reasoning: true, thinkingLevelMap: { medium: null, xhigh: "xhigh" } }),
      getThinkingLevel: vi.fn(() => "low"),
      setThinkingLevel: vi.fn(),
      hasUI: true,
      ui: { notify: vi.fn() },
    };

    try {
      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.off).handler(ctx as never);
      expect(ctx.setThinkingLevel).toHaveBeenLastCalledWith("off");

      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.next).handler(ctx as never);
      expect(ctx.setThinkingLevel).toHaveBeenLastCalledWith("high");

      ctx.getThinkingLevel.mockReturnValue("off");
      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.previous).handler(ctx as never);
      expect(ctx.setThinkingLevel).toHaveBeenLastCalledWith("xhigh");

      const fullSupportCtx = {
        model: model({ reasoning: true, thinkingLevelMap: { xhigh: "xhigh" } }),
        setThinkingLevel: vi.fn(),
        hasUI: true,
        ui: { notify: vi.fn() },
      };
      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.low).handler(fullSupportCtx as never);
      expect(fullSupportCtx.setThinkingLevel).toHaveBeenLastCalledWith("low");
      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.medium).handler(fullSupportCtx as never);
      expect(fullSupportCtx.setThinkingLevel).toHaveBeenLastCalledWith("medium");
      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.high).handler(fullSupportCtx as never);
      expect(fullSupportCtx.setThinkingLevel).toHaveBeenLastCalledWith("high");

      ctx.setThinkingLevel.mockClear();
      ctx.ui.notify.mockClear();
      const unsupportedMediumAction = findRegisteredAction(PI_CORE_THINKING_ACTION_IDS.medium);
      if (unsupportedMediumAction) {
        const result = await (unsupportedMediumAction.handler as (context: never) => unknown | Promise<unknown>)(ctx as never);
        expect(ctx.setThinkingLevel).not.toHaveBeenCalledWith("medium");
        expect(hasUnavailableSignal(unsupportedMediumAction, result, ctx.ui.notify)).toBe(true);
      }
    } finally {
      handles.dispose();
    }
  });

  it("Pi core thinking picker offers available levels and omits unsupported levels", async () => {
    const handles = registerBuiltInActions();
    const ctx = {
      model: model({ reasoning: true, thinkingLevelMap: { medium: null, xhigh: "xhigh" } }),
      setThinkingLevel: vi.fn(),
      hasUI: true,
      ui: {
        select: vi.fn(async (_title: string, options: string[]) => optionMatching(options, /high/i)),
      },
    };

    try {
      await requireRegisteredAction(PI_CORE_THINKING_ACTION_IDS.pick).handler(ctx as never);

      expect(ctx.ui.select).toHaveBeenCalled();
      const [title, options] = ctx.ui.select.mock.calls.at(-1) ?? [];
      expect(title).toMatch(/thinking/i);
      expect(options).toEqual(expect.arrayContaining([expect.stringMatching(/off/i), expect.stringMatching(/low/i), expect.stringMatching(/high/i)]));
      expect(optionMatching(options ?? [], /medium/i)).toBeUndefined();
      expect(ctx.setThinkingLevel).toHaveBeenCalledWith("high");
    } finally {
      handles.dispose();
    }
  });

  it("built-in thinking actions set the next and previous supported levels", async () => {
    const handles = registerBuiltInActions();
    const ctx = {
      model: model({ reasoning: true, thinkingLevelMap: { medium: null, xhigh: "xhigh" } }),
      getThinkingLevel: vi.fn(() => "low"),
      setThinkingLevel: vi.fn(),
    };

    try {
      const next = sdk.getKeysmithRegistry().snapshot().actions.find((action) => action.id === THINKING_NEXT_ACTION_ID);
      await next?.handler(ctx as never);
      expect(ctx.setThinkingLevel).toHaveBeenCalledWith("high");

      ctx.getThinkingLevel.mockReturnValue("off");
      const previous = sdk.getKeysmithRegistry().snapshot().actions.find((action) => action.id === THINKING_PREVIOUS_ACTION_ID);
      await previous?.handler(ctx as never);
      expect(ctx.setThinkingLevel).toHaveBeenLastCalledWith("xhigh");
    } finally {
      handles.dispose();
    }
  });

  it("built-in actions and doctor actions mirror the slash-command behavior", async () => {
    const handles = registerBuiltInActions();
    const selectedHandler = vi.fn();
    const selectedAction = sdk.registerAction({ id: "example.selected", description: "Selected action", handler: selectedHandler });
    const missingKeymap = sdk.registerDefaultKeymaps({
      source: "missing-source",
      spec: { m: { action: "example.missing", desc: "Missing action" } },
    });
    const cwd = await mkdtemp(join(tmpdir(), "pi-keysmith-actions-cwd-"));
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(join(cwd, ".pi", "keybindings.json"), JSON.stringify({ piKeysmith: { spec: { u: { action: "user.missing" } } } }));
    const ctx = {
      cwd,
      hasUI: true,
      ui: {
        select: vi.fn(async (_title: string, options: string[]) => browserOption(options, "example.selected")),
        notify: vi.fn(),
        getEditorComponent: vi.fn(() => undefined),
      },
    };

    try {
      const actionsOpen = sdk.getKeysmithRegistry().snapshot().actions.find((action) => action.id === KEYSMITH_ACTIONS_OPEN_ACTION_ID);
      await actionsOpen?.handler(ctx as never);
      expect(ctx.ui.select).toHaveBeenCalled();
      const selectCall = ctx.ui.select.mock.calls.at(-1);
      expect(selectCall?.[0]).toBe("Keysmith actions");
      const options = (selectCall?.[1] as string[] | undefined) ?? [];
      const selected = browserOption(options, "example.selected");
      const missing = browserOption(options, "example.missing");
      expect(options).toEqual(expect.arrayContaining([expect.stringContaining(KEYSMITH_DOCTOR_OPEN_ACTION_ID)]));
      expect(selected).toMatch(/\[unbound\][\s\S]*selected action[\s\S]*plugin/i);
      expect(missing).toMatch(/\[m\][\s\S]*missing action[\s\S]*missing-source[\s\S]*(missing|unavailable)/i);
      expectLastSelectWithoutFiniteTimeout(ctx.ui.select);
      expect(selectedHandler).toHaveBeenCalledWith(expect.objectContaining({ cwd }));

      const doctorOpen = sdk.getKeysmithRegistry().snapshot().actions.find((action) => action.id === KEYSMITH_DOCTOR_OPEN_ACTION_ID);
      await doctorOpen?.handler(ctx as never);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("# pi-keysmith doctor"), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("example.missing"), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("user.missing"), "info");
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("wrapper: inactive"), "info");
    } finally {
      await rm(cwd, { recursive: true, force: true });
      missingKeymap.dispose();
      selectedAction.dispose();
      handles.dispose();
    }
  });
});
