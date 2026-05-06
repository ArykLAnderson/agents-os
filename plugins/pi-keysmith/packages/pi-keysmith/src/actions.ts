import { getSupportedThinkingLevels, type Api, type Model, type ModelThinkingLevel } from "@mariozechner/pi-ai";
import { getAgentDir, type AppKeybinding, type SlashCommandInfo } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { createNoopDisposable, getKeysmithRegistry, registerAction, type Disposable } from "pi-keysmith-sdk";
import {
  INTERCOM_ACTION_IDS,
  INTERCOM_COMPAT_SHIM_ID,
  INTERCOM_PACKAGE,
  loadPiKeysmithConfig,
  MARKDOWN_PREVIEW_ACTION_IDS,
  MARKDOWN_PREVIEW_COMPAT_SHIM_ID,
  MARKDOWN_PREVIEW_PACKAGE,
  MEMORY_ACTION_IDS,
  MEMORY_COMPAT_SHIM_ID,
  MEMORY_PACKAGE,
  MODEL_CYCLER_ACTION_IDS,
  MODEL_CYCLER_COMPAT_SHIM_ID,
  MODEL_CYCLER_PACKAGE,
  OBSERVABILITY_ACTION_IDS,
  OBSERVABILITY_COMPAT_SHIM_ID,
  OBSERVABILITY_PACKAGE,
  PI_CORE_NAVIGATION_ACTION_IDS,
  PI_CORE_SETTINGS_ACTION_ID,
  PI_CORE_THINKING_ACTION_IDS,
  SCHEDULE_PROMPT_ACTION_IDS,
  SCHEDULE_PROMPT_COMPAT_SHIM_ID,
  SCHEDULE_PROMPT_PACKAGE,
  SESSION_SEARCH_ACTION_IDS,
  SESSION_SEARCH_COMPAT_SHIM_ID,
  SESSION_SEARCH_PACKAGE,
  SUBAGENTS_ACTION_IDS,
  SUBAGENTS_COMPAT_SHIM_ID,
  SUBAGENTS_PACKAGE,
  WEB_ACCESS_ACTION_IDS,
  WEB_ACCESS_COMPAT_SHIM_ID,
  WEB_ACCESS_PACKAGE,
} from "./config.js";
import { openActionKeymapBrowser } from "./action-browser.js";
import { formatDoctorReport, invalidConfigEntriesFromDiagnostics } from "./doctor.js";
import { CAPTURED_TOOL_ACTIONS, type CapturedToolActionDescriptor } from "./captured-tools.js";
import type { BindingSpec } from "./trie.js";
import { TOOLS_TOGGLE_ACTION_ID } from "./leader.js";

export const THINKING_NEXT_ACTION_ID = "pi-keysmith.thinking.next";
export const THINKING_PREVIOUS_ACTION_ID = "pi-keysmith.thinking.previous";
export const TOOLS_EXPAND_TOGGLE_ACTION_ID = TOOLS_TOGGLE_ACTION_ID;
export const KEYSMITH_ACTIONS_OPEN_ACTION_ID = "pi-keysmith.actions.open";
export const KEYSMITH_DOCTOR_OPEN_ACTION_ID = "pi-keysmith.doctor.open";

type ThinkingDirection = "next" | "previous";

export interface ThinkingCycleOptions {
  readonly model: Model<Api>;
  readonly current: ModelThinkingLevel;
  readonly direction: ThinkingDirection;
}

export function cycleThinkingLevel(options: ThinkingCycleOptions): ModelThinkingLevel {
  const levels = getSupportedThinkingLevels(options.model);
  if (levels.length === 0) return "off";
  const currentIndex = levels.indexOf(options.current);
  const start = currentIndex >= 0 ? currentIndex : 0;
  const offset = options.direction === "next" ? 1 : -1;
  return levels[(start + offset + levels.length) % levels.length];
}

interface BuiltInInvocationContext {
  readonly model?: Model<Api>;
  readonly hasUI?: boolean;
  readonly ui?: {
    getToolsExpanded?: () => boolean;
    setToolsExpanded?: (expanded: boolean) => void;
    notify?: (message: string, type?: "info" | "warning" | "error") => void;
    select?: (title: string, options: string[], opts?: unknown) => Promise<string | undefined>;
    confirm?: (title: string, message: string, opts?: unknown) => Promise<boolean>;
    input?: (title: string, placeholder?: string, opts?: unknown) => Promise<string | undefined>;
    getEditorComponent?: () => unknown;
    getEditorText?: () => string;
    setEditorText?: (text: string) => void;
  };
  executeCommand?: (command: string) => unknown | Promise<unknown>;
  submitEditorText?: (text: string) => unknown | Promise<unknown>;
  getCommands?: () => readonly SlashCommandInfoWithInvocation[];
  getThinkingLevel?: () => ModelThinkingLevel;
  setThinkingLevel?: (level: ModelThinkingLevel) => void | Promise<void>;
  compact?: () => unknown | Promise<unknown>;
  invokeAppAction?: (appKeybinding: AppKeybinding) => boolean;
  invokeCapturedTool?: CapturedToolInvoker;
  keysmithCapturedTools?: CapturedToolBridge;
  capturedToolBridge?: CapturedToolBridge;
}

type CapturedToolInvoker = (toolName: string, params: Record<string, unknown>) => unknown | Promise<unknown>;
interface CapturedToolBridge {
  invoke?: CapturedToolInvoker;
}

type StaticSlashCommandMetadata =
  | string
  | {
      readonly name: string;
      readonly args?: readonly string[];
      readonly sourcePackage?: string;
    };

type SlashCommandInfoWithInvocation = SlashCommandInfo & { readonly invocationName?: string };

type BuiltInActionRegistration = Parameters<typeof registerAction>[0] & {
  readonly name?: string;
  readonly sourceType?: "compat";
  readonly sourceDisplayName?: string;
  readonly compatShimId?: string;
  readonly available?: boolean;
  readonly availabilityReason?: string;
  slashCommand?: StaticSlashCommandMetadata;
  readonly appKeybinding?: AppKeybinding;
};

type ActionRegistration = Parameters<typeof registerAction>[0];

const BUILT_IN_CAPTURED_TOOL_ACTIONS = new WeakSet<ActionRegistration>();

export function isBuiltInCapturedToolActionRegistration(action: ActionRegistration): boolean {
  return BUILT_IN_CAPTURED_TOOL_ACTIONS.has(action);
}

const PI_CORE_APP_ACTION_BRIDGE_MAPPINGS = {
  [PI_CORE_NAVIGATION_ACTION_IDS.externalEditor]: "app.editor.external",
  [PI_CORE_NAVIGATION_ACTION_IDS.modelPick]: "app.model.select",
  [PI_CORE_NAVIGATION_ACTION_IDS.modelNext]: "app.model.cycleForward",
  [PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious]: "app.model.cycleBackward",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionResume]: "app.session.resume",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionTree]: "app.session.tree",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionFork]: "app.session.fork",
  [PI_CORE_NAVIGATION_ACTION_IDS.sessionNew]: "app.session.new",
} as const satisfies Record<string, AppKeybinding>;

export function registerBuiltInActions(): Disposable {
  const handles: Disposable[] = [];
  const registeredIds = new Set(getRegisteredActionIds());
  const safeRegister = (registration: BuiltInActionRegistration) => {
    if (registeredIds.has(registration.id)) return;
    try {
      handles.push(registerAction(registration));
      registeredIds.add(registration.id);
    } catch {
      // Built-ins may already be present if an extension factory is evaluated more than once.
    }
  };

  safeRegister({
    id: THINKING_NEXT_ACTION_ID,
    description: "Cycle to next thinking level",
    handler: (ctx) => setCycledThinkingLevel(ctx as BuiltInInvocationContext, "next"),
  });
  safeRegister({
    id: THINKING_PREVIOUS_ACTION_ID,
    description: "Cycle to previous thinking level",
    handler: (ctx) => setCycledThinkingLevel(ctx as BuiltInInvocationContext, "previous"),
  });
  safeRegister({
    id: TOOLS_EXPAND_TOGGLE_ACTION_ID,
    description: "Toggle tools expansion",
    handler: (ctx) => toggleToolsExpansion(ctx as BuiltInInvocationContext),
  });
  safeRegister({ id: KEYSMITH_ACTIONS_OPEN_ACTION_ID, description: "Open Keysmith actions", handler: (ctx) => openActionsFallback(ctx as BuiltInInvocationContext) });
  safeRegister({ id: KEYSMITH_DOCTOR_OPEN_ACTION_ID, description: "Open Keysmith doctor", handler: (ctx) => openDoctorFallback(ctx as BuiltInInvocationContext) });
  safeRegister({ id: PI_CORE_SETTINGS_ACTION_ID, description: "Pi Core: Settings", handler: (ctx) => notifyPiCoreUnavailable(ctx as BuiltInInvocationContext, "Settings") });
  safeRegister({ id: PI_CORE_NAVIGATION_ACTION_IDS.reload, description: "Pi Core: Reload", handler: (ctx) => notifyPiCoreUnavailable(ctx as BuiltInInvocationContext, "Reload") });
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.externalEditor, "External editor", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.externalEditor]));
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.modelPick, "Pick model", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.modelPick]));
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.modelNext, "Next model", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.modelNext]));
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious, "Previous model", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious]));
  safeRegister({ id: PI_CORE_NAVIGATION_ACTION_IDS.modelScoped, description: "Pi Core: Scoped model", handler: (ctx) => notifyPiCoreUnavailable(ctx as BuiltInInvocationContext, "Scoped model") });
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.sessionResume, "Resume session", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.sessionResume]));
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.sessionTree, "Session tree", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.sessionTree]));
  safeRegister({ id: PI_CORE_NAVIGATION_ACTION_IDS.sessionInfo, description: "Pi Core: Session info", handler: (ctx) => notifyPiCoreUnavailable(ctx as BuiltInInvocationContext, "Session info") });
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.sessionFork, "Fork session", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.sessionFork]));
  safeRegister({ id: PI_CORE_NAVIGATION_ACTION_IDS.sessionClone, description: "Pi Core: Clone session", handler: (ctx) => notifyPiCoreUnavailable(ctx as BuiltInInvocationContext, "Clone session") });
  safeRegister(piCoreAppActionBridgeAction(PI_CORE_NAVIGATION_ACTION_IDS.sessionNew, "New session", PI_CORE_APP_ACTION_BRIDGE_MAPPINGS[PI_CORE_NAVIGATION_ACTION_IDS.sessionNew]));
  safeRegister({ id: PI_CORE_NAVIGATION_ACTION_IDS.sessionCompact, description: "Pi Core: Compact session", handler: (ctx) => compactSession(ctx as BuiltInInvocationContext) });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.off, description: "Pi Core: Thinking off", handler: (ctx) => setDirectThinkingLevel(ctx as BuiltInInvocationContext, "off") });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.pick, description: "Pi Core: Pick thinking level", handler: (ctx) => pickThinkingLevel(ctx as BuiltInInvocationContext) });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.next, description: "Pi Core: Next thinking level", handler: (ctx) => setCycledThinkingLevel(ctx as BuiltInInvocationContext, "next") });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.previous, description: "Pi Core: Previous thinking level", handler: (ctx) => setCycledThinkingLevel(ctx as BuiltInInvocationContext, "previous") });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.low, description: "Pi Core: Low thinking", handler: (ctx) => setDirectThinkingLevel(ctx as BuiltInInvocationContext, "low") });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.medium, description: "Pi Core: Medium thinking", handler: (ctx) => setDirectThinkingLevel(ctx as BuiltInInvocationContext, "medium") });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.high, description: "Pi Core: High thinking", handler: (ctx) => setDirectThinkingLevel(ctx as BuiltInInvocationContext, "high") });
  safeRegister({ id: PI_CORE_THINKING_ACTION_IDS.xhigh, description: "Pi Core: Max thinking", handler: (ctx) => setDirectThinkingLevel(ctx as BuiltInInvocationContext, "xhigh") });
  for (const registration of sessionSearchActions()) safeRegister(registration);
  for (const registration of capturedToolActions()) safeRegister(registration);
  for (const registration of intercomActions()) safeRegister(registration);
  for (const registration of subagentsActions()) safeRegister(registration);
  for (const registration of observabilityActions()) safeRegister(registration);
  for (const registration of markdownPreviewActions()) safeRegister(registration);
  for (const registration of schedulePromptActions()) safeRegister(registration);
  for (const registration of webAccessActions()) safeRegister(registration);
  for (const registration of memoryActions()) safeRegister(registration);
  for (const registration of modelCyclerActions()) safeRegister(registration);

  if (handles.length === 0) return createNoopDisposable();
  return {
    dispose() {
      for (const handle of handles.splice(0).reverse()) handle.dispose();
    },
  };
}

async function setCycledThinkingLevel(ctx: BuiltInInvocationContext, direction: ThinkingDirection): Promise<void> {
  if (!ctx.model || !ctx.getThinkingLevel || !ctx.setThinkingLevel) return;
  await ctx.setThinkingLevel(cycleThinkingLevel({ model: ctx.model, current: ctx.getThinkingLevel(), direction }));
}

async function setDirectThinkingLevel(ctx: BuiltInInvocationContext, level: ModelThinkingLevel): Promise<void> {
  if (!ctx.model || !ctx.setThinkingLevel) {
    unavailableThinkingLevel(ctx, level);
    return;
  }
  if (!getSupportedThinkingLevels(ctx.model).includes(level)) {
    unavailableThinkingLevel(ctx, level);
    return;
  }
  await ctx.setThinkingLevel(level);
}

async function pickThinkingLevel(ctx: BuiltInInvocationContext): Promise<void> {
  if (!ctx.model || !ctx.setThinkingLevel || !ctx.hasUI || !ctx.ui?.select) return;
  const labels = new Map(getSupportedThinkingLevels(ctx.model).map((level) => [thinkingLevelLabel(level), level]));
  const selected = await ctx.ui.select("Pi Core: Thinking level", [...labels.keys()]);
  const level = selected ? labels.get(selected) : undefined;
  if (level) await ctx.setThinkingLevel(level);
}

function thinkingLevelLabel(level: ModelThinkingLevel): string {
  if (level === "xhigh") return "Max";
  return `${level.slice(0, 1).toUpperCase()}${level.slice(1)}`;
}

function unavailableThinkingLevel(ctx: BuiltInInvocationContext, level: ModelThinkingLevel): void {
  ctx.ui?.notify?.(`Pi Core thinking level ${thinkingLevelLabel(level)} is unavailable for the current model`, "warning");
}

function toggleToolsExpansion(ctx: BuiltInInvocationContext): void {
  if (!ctx.hasUI || !ctx.ui?.getToolsExpanded || !ctx.ui.setToolsExpanded) return;
  ctx.ui.setToolsExpanded(!ctx.ui.getToolsExpanded());
}

function notifyPiCoreUnavailable(ctx: BuiltInInvocationContext, label: string): void {
  ctx.ui?.notify?.(`Pi Core: ${label} is unavailable in this Keysmith version`, "info");
}

function piCoreAppActionBridgeAction(id: string, label: string, appKeybinding: AppKeybinding): BuiltInActionRegistration {
  return {
    id,
    description: `Pi Core: ${label}`,
    available: true,
    implementationStability: "appAction",
    appKeybinding,
    handler: (ctx) => invokePiCoreAppAction(ctx as BuiltInInvocationContext, id, appKeybinding),
  };
}

function invokePiCoreAppAction(ctx: BuiltInInvocationContext, actionId: string, appKeybinding: AppKeybinding): void {
  if (ctx.invokeAppAction?.(appKeybinding)) return;
  ctx.ui?.notify?.(`Keysmith action ${actionId} could not run Pi app keybinding ${appKeybinding}: app-action handler is missing or unavailable`, "warning");
}

function sessionSearchActions(): BuiltInActionRegistration[] {
  return [
    sessionSearchAction(SESSION_SEARCH_ACTION_IDS.list, "List sessions"),
    sessionSearchAction(SESSION_SEARCH_ACTION_IDS.search, "Search sessions"),
    sessionSearchAction(SESSION_SEARCH_ACTION_IDS.stats, "Session search stats"),
    sessionSearchAction(SESSION_SEARCH_ACTION_IDS.reindex, "Reindex sessions"),
  ];
}

function sessionSearchAction(id: string, label: string): BuiltInActionRegistration {
  const slashCommandArgs = id === SESSION_SEARCH_ACTION_IDS.stats ? ["stats"] : id === SESSION_SEARCH_ACTION_IDS.reindex ? ["reindex"] : [];
  return staticSlashFallbackAction({
    id,
    label,
    prefix: "Session Search",
    packageName: SESSION_SEARCH_PACKAGE,
    compatShimId: SESSION_SEARCH_COMPAT_SHIM_ID,
    slashCommand: { name: "search", args: slashCommandArgs, sourcePackage: SESSION_SEARCH_PACKAGE },
    sideEffect: id === SESSION_SEARCH_ACTION_IDS.reindex ? "local-state" : "none",
    confirm: id === SESSION_SEARCH_ACTION_IDS.reindex
      ? {
          title: "Session Search: Reindex sessions",
          message: "Reindex the Session Search database now?",
        }
      : undefined,
  });
}

function capturedToolActions(): BuiltInActionRegistration[] {
  return CAPTURED_TOOL_ACTIONS.map(capturedToolAction);
}

function capturedToolAction(descriptor: CapturedToolActionDescriptor): BuiltInActionRegistration {
  const description = `${descriptor.prefix}: ${descriptor.label}`;
  const registration: BuiltInActionRegistration = {
    id: descriptor.actionId,
    name: description,
    description,
    sourceType: "compat",
    sourceDisplayName: descriptor.packageName,
    compatShimId: descriptor.compatShimId,
    available: true,
    sideEffect: descriptor.sideEffect ?? "none",
    implementationStability: "capturedTool",
    toolInvocation: descriptor.toolInvocation,
    requiresConfirmation: descriptor.confirm ? true : undefined,
    handler: async (ctx) => invokeCapturedToolAction(ctx as BuiltInInvocationContext, registration, descriptor),
  } as BuiltInActionRegistration;
  Object.defineProperty(registration, "toJSON", {
    value: () => ({
      available: registration.available,
      sideEffect: registration.sideEffect,
      implementationStability: registration.implementationStability,
    }),
  });
  BUILT_IN_CAPTURED_TOOL_ACTIONS.add(registration);
  return registration;
}

async function invokeCapturedToolAction(
  ctx: BuiltInInvocationContext,
  registration: BuiltInActionRegistration,
  descriptor: CapturedToolActionDescriptor,
): Promise<void> {
  const description = descriptorActionDescription(descriptor);
  if (!staticToolInvocationIsIntact(registration, descriptor)) {
    ctx.ui?.notify?.(`${description} is unavailable: captured-tool descriptor failed the static allowlist check`, "warning");
    return;
  }

  if (descriptor.confirm) {
    const confirmed = await ctx.ui?.confirm?.(descriptor.confirm.title, descriptor.confirm.message);
    if (!confirmed) return;
  }

  const params = { ...descriptor.toolInvocation.params };
  if (descriptor.input) {
    if (typeof ctx.ui?.input !== "function") {
      ctx.ui?.notify?.(`${description} is unavailable: input is required for the memory search query`, "warning");
      return;
    }
    const value = (await ctx.ui.input(descriptor.input.title, descriptor.input.placeholder))?.trim();
    if (!value) {
      ctx.ui?.notify?.(`${description} is unavailable: a non-empty query is required`, "warning");
      return;
    }
    params[descriptor.input.paramName] = value;
  }

  const invoke = capturedToolInvoker(ctx);
  if (!invoke) {
    notifyCapturedToolUnavailable(ctx, descriptor);
    return;
  }

  try {
    const result = await invoke(descriptor.toolInvocation.toolName, params);
    notifyCapturedToolResult(ctx, description, result);
  } catch (error) {
    if (isCapturedToolUnavailableError(error)) {
      notifyCapturedToolUnavailable(ctx, descriptor);
      return;
    }
    ctx.ui?.notify?.(`${description} failed while running captured tool ${descriptor.toolInvocation.toolName}`, "error");
  }
}

function capturedToolInvoker(ctx: BuiltInInvocationContext): CapturedToolInvoker | undefined {
  if (typeof ctx.invokeCapturedTool === "function") return ctx.invokeCapturedTool;
  if (typeof ctx.keysmithCapturedTools?.invoke === "function") return ctx.keysmithCapturedTools.invoke;
  if (typeof ctx.capturedToolBridge?.invoke === "function") return ctx.capturedToolBridge.invoke;
  return undefined;
}

function staticToolInvocationIsIntact(registration: BuiltInActionRegistration, descriptor: CapturedToolActionDescriptor): boolean {
  const current = (registration as BuiltInActionRegistration & { toolInvocation?: unknown }).toolInvocation;
  return JSON.stringify(current) === JSON.stringify(descriptor.toolInvocation);
}

function isCapturedToolUnavailableError(error: unknown): boolean {
  return error instanceof Error && (error.name === "CapturedToolUnavailableError" || error.message === "captured tool unavailable");
}

function notifyCapturedToolUnavailable(ctx: BuiltInInvocationContext, descriptor: CapturedToolActionDescriptor): void {
  ctx.ui?.notify?.(
    `${descriptorActionDescription(descriptor)} is unavailable: Keysmith has not captured the ${descriptor.toolInvocation.toolName} tool via pi.registerTool. Check extension load order; Pi currently exposes no public invokeTool API.`,
    "warning",
  );
}

function notifyCapturedToolResult(ctx: BuiltInInvocationContext, description: string, result: unknown): void {
  const text = capturedToolResultText(result);
  if (!text) {
    ctx.ui?.notify?.(`${description} completed`, "info");
    return;
  }
  ctx.ui?.notify?.(`${description}:\n${truncateNotificationText(text, 900)}`, "info");
}

function capturedToolResultText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: string; text: string } => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function truncateNotificationText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 16)).trimEnd()}… [truncated]`;
}

function descriptorActionDescription(descriptor: CapturedToolActionDescriptor): string {
  return `${descriptor.prefix}: ${descriptor.label}`;
}

function intercomActions(): BuiltInActionRegistration[] {
  return [
    intercomAction(INTERCOM_ACTION_IDS.listSessions, "List sessions"),
    intercomAction(INTERCOM_ACTION_IDS.pendingAsks, "Pending asks"),
    intercomAction(INTERCOM_ACTION_IDS.status, "Status"),
    intercomAction(INTERCOM_ACTION_IDS.reply, "Reply"),
  ];
}

function intercomAction(id: string, label: string): BuiltInActionRegistration {
  return unavailableCompatAction({
    id,
    label,
    prefix: "Intercom",
    packageName: INTERCOM_PACKAGE,
    compatShimId: INTERCOM_COMPAT_SHIM_ID,
    reason: "No stable public Intercom action API is available yet",
  });
}

function subagentsActions(): BuiltInActionRegistration[] {
  return [
    subagentsAction(SUBAGENTS_ACTION_IDS.listAgents, "List agents", "none"),
    subagentsAction(SUBAGENTS_ACTION_IDS.listChains, "List chains", "none"),
    subagentsAction(SUBAGENTS_ACTION_IDS.runStatus, "Run status", "none"),
    subagentsAction(SUBAGENTS_ACTION_IDS.interrupt, "Interrupt", "destructive"),
    safeZeroArgumentSlashFallbackAction({
      id: SUBAGENTS_ACTION_IDS.doctor,
      label: "Doctor",
      prefix: "Subagents",
      packageName: SUBAGENTS_PACKAGE,
      compatShimId: SUBAGENTS_COMPAT_SHIM_ID,
      slashCommand: "subagents-doctor",
    }),
  ];
}

function subagentsAction(id: string, label: string, sideEffect: "none" | "destructive"): BuiltInActionRegistration {
  return unavailableCompatAction({
    id,
    label,
    prefix: "Subagents",
    packageName: SUBAGENTS_PACKAGE,
    compatShimId: SUBAGENTS_COMPAT_SHIM_ID,
    reason: "No stable public Subagents action API is available yet",
    sideEffect,
  });
}

function observabilityActions(): BuiltInActionRegistration[] {
  return [
    observabilityAction(OBSERVABILITY_ACTION_IDS.dashboard, "Dashboard", "obs"),
    observabilityAction(OBSERVABILITY_ACTION_IDS.toggleFooter, "Toggle footer", "obs-toggle"),
    observabilityAction(OBSERVABILITY_ACTION_IDS.togglePath, "Toggle path", "obs-toggle-path"),
    observabilityAction(OBSERVABILITY_ACTION_IDS.settings, "Settings", "obs-settings"),
  ];
}

function observabilityAction(id: string, label: string, slashCommand: string): BuiltInActionRegistration {
  return safeZeroArgumentSlashFallbackAction({
    id,
    label,
    prefix: "Observability",
    packageName: OBSERVABILITY_PACKAGE,
    compatShimId: OBSERVABILITY_COMPAT_SHIM_ID,
    slashCommand,
  });
}

const STATIC_ZERO_ARGUMENT_SLASH_COMMAND_NAME = /^[a-z][a-z0-9-]*$/i;
const STATIC_SLASH_LITERAL_ARG = /^[a-z][a-z0-9._-]*$/i;

async function staticSlashFallback(
  ctx: BuiltInInvocationContext,
  action: BuiltInActionRegistration,
  prefix: string,
  options: { readonly confirm?: StaticSlashConfirmation } = {},
): Promise<void> {
  const resolved = resolveStaticSlashInvocation(ctx, action, prefix);
  if (!resolved) return;

  if (options.confirm) {
    const confirmed = await ctx.ui?.confirm?.(options.confirm.title, options.confirm.message);
    if (!confirmed) return;
  }

  if (!resolved.requiresEditorSubmission && typeof ctx.executeCommand === "function") {
    await ctx.executeCommand(resolved.commandName);
    return;
  }

  if (typeof ctx.submitEditorText === "function") {
    await ctx.submitEditorText(resolved.submissionText);
    return;
  }

  const draft = typeof ctx.ui?.getEditorText === "function" ? ctx.ui.getEditorText() : undefined;
  if (draft && draft.length > 0) {
    ctx.ui?.notify?.(`Existing editor draft left unchanged. Run ${resolved.submissionText} manually when ready.`, "info");
    return;
  }

  ctx.ui?.notify?.(`Run ${resolved.submissionText} manually to open ${action.name ?? action.id}`, "info");
}

interface StaticSlashInvocation {
  readonly commandName: string;
  readonly args: readonly string[];
  readonly submissionText: string;
  readonly requiresEditorSubmission: boolean;
}

interface StaticSlashConfirmation {
  readonly title: string;
  readonly message: string;
}

function resolveStaticSlashInvocation(ctx: BuiltInInvocationContext, action: BuiltInActionRegistration, prefix: string): StaticSlashInvocation | undefined {
  const metadata = normalizeStaticSlashCommand(action.slashCommand);
  if (!metadata) {
    ctx.ui?.notify?.(`${prefix} static slash command metadata is invalid or unsafe for ${action.id}`, "warning");
    return undefined;
  }
  if (!metadata.args.every(isStaticSlashLiteralArg)) {
    ctx.ui?.notify?.(`${prefix} static slash argument metadata is invalid or unsafe for ${action.id}`, "warning");
    return undefined;
  }

  if (!metadata.sourcePackage) {
    return {
      commandName: metadata.name,
      args: metadata.args,
      submissionText: `/${[metadata.name, ...metadata.args].join(" ")}`,
      requiresEditorSubmission: metadata.args.length > 0,
    };
  }

  const commandName = resolveProviderQualifiedSlashCommand(ctx, metadata.name, metadata.sourcePackage, prefix);
  if (!commandName) return undefined;
  return {
    commandName,
    args: metadata.args,
    submissionText: `/${[commandName, ...metadata.args].join(" ")}`,
    requiresEditorSubmission: true,
  };
}

function normalizeStaticSlashCommand(command: unknown): { readonly name: string; readonly args: readonly string[]; readonly sourcePackage?: string } | undefined {
  if (typeof command === "string") {
    if (!isStaticZeroArgumentSlashCommand(command)) return undefined;
    return { name: command, args: [] };
  }
  if (!command || typeof command !== "object") return undefined;
  const record = command as { name?: unknown; args?: unknown; sourcePackage?: unknown };
  if (!isStaticZeroArgumentSlashCommand(record.name)) return undefined;
  if (record.args !== undefined && (!Array.isArray(record.args) || !record.args.every((arg) => typeof arg === "string"))) return undefined;
  return {
    name: record.name,
    args: (record.args ?? []) as readonly string[],
    ...(typeof record.sourcePackage === "string" && record.sourcePackage.length > 0 ? { sourcePackage: record.sourcePackage } : {}),
  };
}

function resolveProviderQualifiedSlashCommand(
  ctx: BuiltInInvocationContext,
  commandName: string,
  sourcePackage: string,
  prefix: string,
): string | undefined {
  if (typeof ctx.getCommands !== "function") {
    ctx.ui?.notify?.(`${prefix} /${commandName} provider cannot be resolved because the Pi search command registry is unavailable`, "warning");
    return undefined;
  }

  const commands = ctx.getCommands().filter((command) => command.name === commandName);
  const matching = commands.filter((command) => slashCommandSourceMatches(command, sourcePackage));
  if (matching.length !== 1) {
    ctx.ui?.notify?.(`${prefix} /${commandName} provider is unavailable: no matching source-qualified search command for ${sourcePackage}`, "warning");
    return undefined;
  }

  const match = matching[0];
  const invocationName = typeof match.invocationName === "string" && match.invocationName.length > 0 ? match.invocationName : undefined;
  if (commands.length > 1 && !invocationName) {
    ctx.ui?.notify?.(`${prefix} /${commandName} provider is ambiguous: matching command is not source-qualified with an invocationName`, "warning");
    return undefined;
  }
  return invocationName ?? match.name;
}

function slashCommandSourceMatches(command: SlashCommandInfo, sourcePackage: string): boolean {
  const sourceInfo = command.sourceInfo as { source?: unknown; path?: unknown; baseDir?: unknown };
  const candidates = [sourceInfo.source, sourceInfo.path, sourceInfo.baseDir].filter((value): value is string => typeof value === "string");
  return candidates.some((candidate) => packageIdentityMatches(candidate, sourcePackage));
}

function packageIdentityMatches(value: string, sourcePackage: string): boolean {
  if (value === sourcePackage) return true;
  return value.includes(`/extensions/${sourcePackage}/`) || value.endsWith(`/extensions/${sourcePackage}`) || value.includes(`/node_modules/${sourcePackage}/`);
}

function isStaticZeroArgumentSlashCommand(command: unknown): command is string {
  return typeof command === "string" && STATIC_ZERO_ARGUMENT_SLASH_COMMAND_NAME.test(command);
}

function isStaticSlashLiteralArg(arg: string): boolean {
  return STATIC_SLASH_LITERAL_ARG.test(arg) && !arg.startsWith("-");
}

function markdownPreviewActions(): BuiltInActionRegistration[] {
  return [
    markdownPreviewAction(MARKDOWN_PREVIEW_ACTION_IDS.previewCurrent, "Preview current", "preview"),
    markdownPreviewAction(MARKDOWN_PREVIEW_ACTION_IDS.previewBrowser, "Browser preview", "preview-browser"),
    markdownPreviewAction(MARKDOWN_PREVIEW_ACTION_IDS.clearCache, "Clear cache", "preview-clear-cache", "local-state"),
  ];
}

function markdownPreviewAction(id: string, label: string, slashCommand: string, sideEffect: "none" | "local-state" = "none"): BuiltInActionRegistration {
  return safeZeroArgumentSlashFallbackAction({
    id,
    label,
    prefix: "Markdown Preview",
    packageName: MARKDOWN_PREVIEW_PACKAGE,
    compatShimId: MARKDOWN_PREVIEW_COMPAT_SHIM_ID,
    slashCommand,
    sideEffect,
  });
}

function schedulePromptActions(): BuiltInActionRegistration[] {
  return [
    safeZeroArgumentSlashFallbackAction({
      id: SCHEDULE_PROMPT_ACTION_IDS.listJobs,
      label: "List jobs",
      prefix: "Schedule Prompt",
      packageName: SCHEDULE_PROMPT_PACKAGE,
      compatShimId: SCHEDULE_PROMPT_COMPAT_SHIM_ID,
      slashCommand: "schedule-prompt",
    }),
    schedulePromptAction(SCHEDULE_PROMPT_ACTION_IDS.toggleWidget, "Toggle widget"),
    safeZeroArgumentSlashFallbackAction({
      id: SCHEDULE_PROMPT_ACTION_IDS.settings,
      label: "Settings",
      prefix: "Schedule Prompt",
      packageName: SCHEDULE_PROMPT_PACKAGE,
      compatShimId: SCHEDULE_PROMPT_COMPAT_SHIM_ID,
      slashCommand: "schedule-prompt",
    }),
    schedulePromptAction(SCHEDULE_PROMPT_ACTION_IDS.cleanupJobs, "Cleanup jobs", "local-state"),
  ];
}

function schedulePromptAction(id: string, label: string, sideEffect: "none" | "local-state" = "none"): BuiltInActionRegistration {
  return unavailableCompatAction({
    id,
    label,
    prefix: "Schedule Prompt",
    packageName: SCHEDULE_PROMPT_PACKAGE,
    compatShimId: SCHEDULE_PROMPT_COMPAT_SHIM_ID,
    reason: "No stable public Schedule Prompt action API is available yet",
    sideEffect,
  });
}

function webAccessActions(): BuiltInActionRegistration[] {
  return [
    safeZeroArgumentSlashFallbackAction({
      id: WEB_ACCESS_ACTION_IDS.curator,
      label: "Curator",
      prefix: "Web Access",
      packageName: WEB_ACCESS_PACKAGE,
      compatShimId: WEB_ACCESS_COMPAT_SHIM_ID,
      slashCommand: "curator",
    }),
    staticSlashFallbackAction({
      id: WEB_ACCESS_ACTION_IDS.storedResults,
      label: "Stored results",
      prefix: "Web Access",
      packageName: WEB_ACCESS_PACKAGE,
      compatShimId: WEB_ACCESS_COMPAT_SHIM_ID,
      slashCommand: { name: "search", sourcePackage: WEB_ACCESS_PACKAGE },
    }),
    safeZeroArgumentSlashFallbackAction({
      id: WEB_ACCESS_ACTION_IDS.googleAccount,
      label: "Google account",
      prefix: "Web Access",
      packageName: WEB_ACCESS_PACKAGE,
      compatShimId: WEB_ACCESS_COMPAT_SHIM_ID,
      slashCommand: "google-account",
    }),
    webAccessAction(WEB_ACCESS_ACTION_IDS.status, "Status"),
  ];
}

function webAccessAction(id: string, label: string): BuiltInActionRegistration {
  return unavailableCompatAction({
    id,
    label,
    prefix: "Web Access",
    packageName: WEB_ACCESS_PACKAGE,
    compatShimId: WEB_ACCESS_COMPAT_SHIM_ID,
    reason: "No stable public Web Access action API is available yet",
  });
}

function memoryActions(): BuiltInActionRegistration[] {
  return [
    memoryAction(MEMORY_ACTION_IDS.search, "Search memory"),
    memoryAction(MEMORY_ACTION_IDS.dailyLog, "Daily log"),
    memoryAction(MEMORY_ACTION_IDS.longTerm, "Long-term memory"),
    memoryAction(MEMORY_ACTION_IDS.scratchpad, "Scratchpad"),
  ];
}

function memoryAction(id: string, label: string): BuiltInActionRegistration {
  return unavailableCompatAction({
    id,
    label,
    prefix: "Memory",
    packageName: MEMORY_PACKAGE,
    compatShimId: MEMORY_COMPAT_SHIM_ID,
    reason: "No stable public Memory action API is available yet",
  });
}

function modelCyclerActions(): BuiltInActionRegistration[] {
  return [
    safeZeroArgumentSlashFallbackAction({
      id: MODEL_CYCLER_ACTION_IDS.pick,
      label: "Pick model",
      prefix: "Model Cycler",
      packageName: MODEL_CYCLER_PACKAGE,
      compatShimId: MODEL_CYCLER_COMPAT_SHIM_ID,
      slashCommand: "model-picker",
      aliases: [PI_CORE_NAVIGATION_ACTION_IDS.modelPick],
    }),
    modelCyclerAction(MODEL_CYCLER_ACTION_IDS.nextFavorite, "Next favorite model", [PI_CORE_NAVIGATION_ACTION_IDS.modelNext]),
    modelCyclerAction(MODEL_CYCLER_ACTION_IDS.previousFavorite, "Previous favorite model", [PI_CORE_NAVIGATION_ACTION_IDS.modelPrevious]),
  ];
}

function modelCyclerAction(id: string, label: string, aliases: readonly string[]): BuiltInActionRegistration {
  return unavailableCompatAction({
    id,
    label,
    prefix: "Model Cycler",
    packageName: MODEL_CYCLER_PACKAGE,
    compatShimId: MODEL_CYCLER_COMPAT_SHIM_ID,
    reason: "No stable public Model Cycler action API is available yet",
    aliases,
  });
}

function safeZeroArgumentSlashFallbackAction(options: {
  id: string;
  label: string;
  prefix: string;
  packageName: string;
  compatShimId: string;
  slashCommand: string;
  sideEffect?: "none" | "local-state" | "destructive";
  aliases?: readonly string[];
}): BuiltInActionRegistration {
  return staticSlashFallbackAction(options);
}

function staticSlashFallbackAction(options: {
  id: string;
  label: string;
  prefix: string;
  packageName: string;
  compatShimId: string;
  slashCommand: StaticSlashCommandMetadata;
  sideEffect?: "none" | "local-state" | "destructive";
  aliases?: readonly string[];
  confirm?: StaticSlashConfirmation;
}): BuiltInActionRegistration {
  const description = `${options.prefix}: ${options.label}`;
  const registration: BuiltInActionRegistration = {
    id: options.id,
    name: description,
    description,
    sourceType: "compat",
    sourceDisplayName: options.packageName,
    compatShimId: options.compatShimId,
    available: true,
    sideEffect: options.sideEffect ?? "none",
    aliases: options.aliases,
    implementationStability: "slashFallback",
    slashCommand: options.slashCommand,
    handler: async (ctx) => staticSlashFallback(ctx as BuiltInInvocationContext, registration, options.prefix, { confirm: options.confirm }),
  };
  Object.defineProperty(registration, "toJSON", {
    value: () => ({
      available: registration.available,
      sideEffect: registration.sideEffect,
      implementationStability: registration.implementationStability,
    }),
  });
  return registration;
}

function unavailableCompatAction(options: {
  id: string;
  label: string;
  prefix: string;
  packageName: string;
  compatShimId: string;
  reason: string;
  sideEffect?: "none" | "local-state" | "destructive";
  aliases?: readonly string[];
}): BuiltInActionRegistration {
  const description = `${options.prefix}: ${options.label}`;
  return {
    id: options.id,
    name: description,
    description,
    sourceType: "compat",
    sourceDisplayName: options.packageName,
    compatShimId: options.compatShimId,
    available: false,
    availabilityReason: options.reason,
    sideEffect: options.sideEffect ?? "none",
    aliases: options.aliases,
    handler: async (ctx) => notifyCompatUnavailable(ctx as BuiltInInvocationContext, options.prefix, options.label, options.reason),
  };
}

function notifyCompatUnavailable(ctx: BuiltInInvocationContext, prefix: string, label: string, reason: string): void {
  ctx.ui?.notify?.(`${prefix}: ${label} is unavailable: ${reason}`, "info");
}

async function compactSession(ctx: BuiltInInvocationContext): Promise<void> {
  if (typeof ctx.compact !== "function") {
    notifyPiCoreUnavailable(ctx, "Compact session");
    return;
  }
  await ctx.compact();
}

async function openActionsFallback(ctx: BuiltInInvocationContext & { cwd?: string }): Promise<void> {
  await openActionKeymapBrowser(ctx);
}

async function openDoctorFallback(ctx: BuiltInInvocationContext & { cwd?: string }): Promise<void> {
  if (!ctx.hasUI || !ctx.ui?.notify) return;
  const effective = await loadPiKeysmithConfig({ cwd: ctx.cwd });
  const registry = getKeysmithRegistry().snapshot();
  const invalidEntries = invalidConfigEntriesFromDiagnostics(effective.diagnostics);
  const report = formatDoctorReport({
    configLayers: [
      { source: "builtin:pi-keysmith", status: "loaded" },
      ...effective.sources.map((source) => ({ source: source.source, status: "loaded" })),
      ...invalidEntries.map((diagnostic) => ({ source: diagnostic.source, status: "invalid", message: diagnostic.message })),
    ],
    contexts: effective.config.enabledWhen.map((id) => ({ id, active: id === "editor" ? Boolean(ctx.hasUI) : false })),
    conflicts: effective.diagnostics
      .filter((diagnostic) => /conflict|overrides default|duplicate|ambiguity/i.test(diagnostic.message))
      .map((diagnostic) => ({ sequence: "config", sources: [diagnostic.source], resolution: diagnostic.message })),
    missingActions: [
      ...collectMissingActions(effective.config.spec, new Map(registry.actions.map((action) => [action.id, action]))),
      ...registry.defaultKeymaps.flatMap((keymap) => collectMissingActions(keymap.spec as BindingSpec, new Map(registry.actions.map((action) => [action.id, action])))),
    ],
    disabledDefaults: effective.disabledDefaults.map((disabled) => ({
      sequence: disabled.sequence,
      actionId: disabled.actionId,
      reason: `${disabled.reason} from ${disabled.source}`,
    })),
    invalidEntries,
    diagnostics: effective.diagnostics,
    wrapper: actionWrapperState(ctx),
    logPath: join(getAgentDir(), "pi-keysmith.log"),
  });
  void registry;
  ctx.ui.notify(report, "info");
}

function collectMissingActions(spec: BindingSpec, actions: Map<string, unknown>, prefix = ""): Array<{ actionId: string; sequence?: string }> {
  const missing: Array<{ actionId: string; sequence?: string }> = [];
  for (const [key, entry] of Object.entries(spec)) {
    if (!entry || typeof entry !== "object") continue;
    const sequence = `${prefix}${key}`;
    if (typeof entry.action === "string" && !actions.has(entry.action)) missing.push({ actionId: entry.action, sequence });
    for (const [childKey, value] of Object.entries(entry)) {
      if (["action", "desc", "name", "source"].includes(childKey)) continue;
      if (value && typeof value === "object") missing.push(...collectMissingActions({ [childKey]: value } as BindingSpec, actions, sequence));
    }
  }
  return missing;
}

function actionWrapperState(ctx: BuiltInInvocationContext): { active: boolean; message?: string } {
  if (!ctx.hasUI || !ctx.ui) return { active: false, message: "UI unavailable" };
  const factory = typeof ctx.ui.getEditorComponent === "function" ? ctx.ui.getEditorComponent() : undefined;
  if (!factory) return { active: false, message: "Keysmith wrapper not active" };
  const marker = (factory as unknown as Record<PropertyKey, unknown>)[Symbol.for("pi-keysmith.editorFactory")];
  return marker === true ? { active: true } : { active: false, message: "Keysmith wrapper inactive or overwritten" };
}

function getRegisteredActionIds(): string[] {
  try {
    return getKeysmithRegistry().snapshot().actions.map((action) => action.id);
  } catch {
    return [];
  }
}
