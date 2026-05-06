import { CustomEditor, getAgentDir, type AppKeybinding, type ExtensionAPI, type ExtensionContext, type ExtensionUIContext, type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { getKeysmithRegistry, type KeysmithDefaultKeymapRegistration, type KeysmithInvocationContext } from "pi-keysmith-sdk";
import { isBuiltInCapturedToolActionRegistration, registerBuiltInActions } from "./actions.js";
import { isAllowedCapturedToolName } from "./captured-tools.js";
import { registerKeysmithCommands } from "./commands.js";
import { createKeysmithLog, reportStartupDiagnostics } from "./doctor.js";
import { KeysmithEditorWrapper } from "./editor-wrapper.js";
import { leaderInput, loadPiKeysmithConfig, DEFAULT_KEYSMITH_CONFIG, type KeysmithConfig } from "./config.js";
import { TOOLS_TOGGLE_ACTION_ID } from "./leader.js";
import { parseKeySequence } from "./parser.js";
import { buildBindingTrie, type BindingSpec, type BindingTrie } from "./trie.js";
import { createTuiWhichKeyOverlay, stylizeBorderWithTheme, stylizeKeyWithTheme, type WhichKeyThemeStyler } from "./which-key.js";

const STATUS_KEY = "pi-keysmith";
const KEYSMITH_FACTORY_MARKER = Symbol.for("pi-keysmith.editorFactory");
const KEYSMITH_PREVIOUS_FACTORY = Symbol.for("pi-keysmith.previousEditorFactory");
const KEYSMITH_CAPTURED_TOOL_BRIDGE = Symbol.for("pi-keysmith.capturedToolBridge");

type EditorFactory = NonNullable<Parameters<ExtensionUIContext["setEditorComponent"]>[0]>;
type CapturedToolExecute = ToolDefinition["execute"];
interface CapturedToolBridge {
  invoke(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}
interface CapturedToolBridgeRecord {
  readonly bridge: CapturedToolBridge;
}
interface ToolRegisteringPi {
  registerTool?: (tool: ToolDefinition) => void;
  [KEYSMITH_CAPTURED_TOOL_BRIDGE]?: CapturedToolBridgeRecord;
}
type MarkedFactoryRecord = Record<PropertyKey, unknown>;

export interface KeysmithRuntime {
  readonly started: boolean;
  start(ctx: ExtensionContext): void;
  shutdown(ctx?: ExtensionContext, options?: { suppressInactiveWarning?: boolean }): void;
}

export interface KeysmithRuntimeOptions {
  config?: Partial<KeysmithConfig>;
  trie?: BindingTrie;
  actionContext?: {
    getCommands?: ExtensionAPI["getCommands"];
    getThinkingLevel?: ExtensionAPI["getThinkingLevel"];
    setThinkingLevel?: ExtensionAPI["setThinkingLevel"];
    capturedToolBridge?: CapturedToolBridge;
  };
}

class DefaultKeysmithRuntime implements KeysmithRuntime {
  private readonly config: KeysmithConfig;
  private readonly trie: BindingTrie;
  private readonly actions = new Map<string, { handler: (ctx: KeysmithInvocationContext) => void | Promise<void>; capturedToolAction: boolean }>();
  private readonly managesTrie: boolean;
  private readonly actionContext: KeysmithRuntimeOptions["actionContext"];

  constructor(options: KeysmithRuntimeOptions = {}) {
    registerBuiltInActions();
    this.config = { ...DEFAULT_KEYSMITH_CONFIG, ...options.config };
    this.managesTrie = options.trie === undefined;
    this.trie = options.trie ?? createDispatchTrie(this.config);
    this.actionContext = options.actionContext;
    this.rebuildSdkState();
  }

  private cleanupCurrentSession: ((options?: { suppressInactiveWarning?: boolean }) => void) | undefined;
  private active = false;

  get started(): boolean {
    return this.active;
  }

  start(ctx: ExtensionContext): void {
    this.shutdown();
    this.active = true;

    if (!ctx.hasUI) return;

    const registrySubscription = getKeysmithRegistry().subscribe(() => this.rebuildSdkState());
    this.rebuildSdkState();

    const previousFactory = unwrapKeysmithFactory(ctx.ui.getEditorComponent());
    const wrappers = new Set<KeysmithEditorWrapper>();
    const contextDiagnosticState = { warnedVimNormalUnavailable: false };
    let wrapperInactiveCheck: ReturnType<typeof setTimeout> | undefined;
    let warnedWrapperInactive = false;
    const warnWrapperInactive = () => {
      if (warnedWrapperInactive) return;
      warnedWrapperInactive = true;
      ctx.ui.notify("Keysmith editor wrapper inactive: another extension overwrote the editor component after Keysmith loaded", "warning");
    };

    const wrappedFactory: EditorFactory = (tui, theme, keybindings) => {
      const inner = previousFactory
        ? previousFactory(tui, theme, keybindings)
        : new CustomEditor(tui, theme, keybindings);
      const whichKeyTheme = ((ctx.ui as { theme?: unknown }).theme ?? theme) as WhichKeyThemeStyler;
      let wrapper: KeysmithEditorWrapper;
      wrapper = new KeysmithEditorWrapper(inner, {
        leader: leaderInput(this.config),
        sequenceTimeoutMs: this.config.sequenceTimeoutMs,
        whichKeyDelayMs: this.config.whichKeyDelayMs,
        whichKeyOverlay: createTuiWhichKeyOverlay(tui, {
          keyColor: this.config.whichKeyKeyColor,
          stylizeKey: stylizeKeyWithTheme(whichKeyTheme),
          stylizeBorder: (text) => stylizeBorderWithTheme({ borderColor: wrapper.borderColor ?? theme?.borderColor })(text),
        }),
        enabledWhen: this.config.enabledWhen,
        contextDiagnosticState,
        diagnostics: { warn: (message) => ctx.ui.notify(message, "warning") },
        trie: this.trie,
        dispatch: (actionId) => this.dispatchAction(ctx, actionId, wrapper),
      });
      wrappers.add(wrapper);
      return wrapper;
    };

    markKeysmithFactory(wrappedFactory, previousFactory);
    ctx.ui.setEditorComponent(wrappedFactory);
    ctx.ui.setStatus(STATUS_KEY, "keysmith ready");
    wrapperInactiveCheck = setTimeout(() => {
      wrapperInactiveCheck = undefined;
      if (ctx.ui.getEditorComponent() !== wrappedFactory) warnWrapperInactive();
    }, 0);

    this.cleanupCurrentSession = (options = {}) => {
      registrySubscription.dispose();
      if (wrapperInactiveCheck) {
        clearTimeout(wrapperInactiveCheck);
        wrapperInactiveCheck = undefined;
      }
      for (const wrapper of wrappers) wrapper.dispose();
      wrappers.clear();

      if (ctx.ui.getEditorComponent() === wrappedFactory) {
        ctx.ui.setEditorComponent(previousFactory);
      } else if (!options.suppressInactiveWarning) {
        warnWrapperInactive();
      }
      ctx.ui.setStatus(STATUS_KEY, undefined);
    };
  }

  shutdown(_ctx?: ExtensionContext, options?: { suppressInactiveWarning?: boolean }): void {
    this.cleanupCurrentSession?.(options);
    this.cleanupCurrentSession = undefined;
    this.active = false;
  }

  private rebuildSdkState(): void {
    const snapshot = getKeysmithRegistry().snapshot();
    this.actions.clear();
    for (const action of snapshot.actions) {
      this.actions.set(action.id, { handler: action.handler, capturedToolAction: isBuiltInCapturedToolActionRegistration(action) });
    }

    if (!this.managesTrie) return;
    const nextTrie = createDispatchTrie(this.config, snapshot.defaultKeymaps);
    this.trie.children.clear();
    for (const [key, node] of nextTrie.children) this.trie.children.set(key, node);
  }

  private dispatchAction(ctx: ExtensionContext, actionId: string, activeWrapper?: KeysmithEditorWrapper): void {
    if (actionId === TOOLS_TOGGLE_ACTION_ID) {
      dispatchHardcodedAction(ctx, actionId);
      return;
    }
    const sdkAction = this.actions.get(actionId);
    if (sdkAction) {
      const capturedToolBridge = sdkAction.capturedToolAction ? this.actionContext?.capturedToolBridge : undefined;
      void sdkAction.handler({
        cwd: ctx.cwd,
        model: ctx.model,
        hasUI: ctx.hasUI,
        ui: ctx.hasUI ? ctx.ui : undefined,
        piContext: ctx,
        getCommands: this.actionContext?.getCommands,
        getThinkingLevel: this.actionContext?.getThinkingLevel,
        setThinkingLevel: this.actionContext?.setThinkingLevel,
        submitEditorText: activeWrapper ? (text: string) => activeWrapper.submitText(text) : undefined,
        invokeAppAction: activeWrapper ? (appKeybinding: AppKeybinding) => activeWrapper.invokeAppAction(appKeybinding) : undefined,
        executeCommand: (ctx as unknown as { executeCommand?: (command: string) => unknown | Promise<unknown> }).executeCommand,
        invokeCapturedTool: capturedToolBridge?.invoke,
        keysmithCapturedTools: capturedToolBridge,
        capturedToolBridge,
      } as KeysmithInvocationContext & {
        submitEditorText?: (text: string) => void;
        getCommands?: ExtensionAPI["getCommands"];
        invokeAppAction?: (appKeybinding: AppKeybinding) => boolean;
        executeCommand?: (command: string) => unknown | Promise<unknown>;
        invokeCapturedTool?: CapturedToolBridge["invoke"];
        keysmithCapturedTools?: CapturedToolBridge;
        capturedToolBridge?: CapturedToolBridge;
      });
      return;
    }
    dispatchHardcodedAction(ctx, actionId);
  }
}

export function createRuntime(options?: KeysmithRuntimeOptions): KeysmithRuntime {
  return new DefaultKeysmithRuntime(options);
}

function decorateRegisterToolForCapturedBridge(pi: ExtensionAPI): CapturedToolBridge | undefined {
  const toolPi = pi as ToolRegisteringPi;
  const existing = toolPi[KEYSMITH_CAPTURED_TOOL_BRIDGE];
  if (existing) return existing.bridge;

  if (typeof toolPi.registerTool !== "function") return undefined;

  const capturedTools = new Map<string, CapturedToolExecute>();
  const originalRegisterTool = toolPi.registerTool.bind(pi);
  const bridge: CapturedToolBridge = {
    async invoke(toolName, params) {
      if (!isAllowedCapturedToolName(toolName)) throw new CapturedToolUnavailableError();
      const execute = capturedTools.get(toolName);
      if (!execute) throw new CapturedToolUnavailableError();
      return execute(`pi-keysmith:${toolName}`, params as never, undefined, undefined, {} as ExtensionContext);
    },
  };

  toolPi.registerTool = (tool: ToolDefinition) => {
    if (isAllowedCapturedToolName(tool?.name) && typeof tool.execute === "function") {
      capturedTools.set(tool.name, tool.execute as CapturedToolExecute);
    }
    originalRegisterTool(tool);
  };
  toolPi[KEYSMITH_CAPTURED_TOOL_BRIDGE] = { bridge };
  return bridge;
}

class CapturedToolUnavailableError extends Error {
  constructor() {
    super("captured tool unavailable");
    this.name = "CapturedToolUnavailableError";
  }
}

export default function keysmithExtension(pi: ExtensionAPI): void {
  const capturedToolBridge = decorateRegisterToolForCapturedBridge(pi);
  registerBuiltInActions();
  registerKeysmithCommands(pi);
  let runtime: KeysmithRuntime | undefined;

  pi.on("session_start", async (_event, ctx) => {
    runtime?.shutdown(ctx, { suppressInactiveWarning: true });
    const effective = await loadPiKeysmithConfig({ cwd: ctx.cwd });
    runtime = createRuntime({
      config: effective.config,
      actionContext: {
        getCommands: () => pi.getCommands(),
        getThinkingLevel: () => pi.getThinkingLevel(),
        setThinkingLevel: (level) => pi.setThinkingLevel(level),
        capturedToolBridge,
      },
    });
    runtime.start(ctx);

    if (effective.diagnostics.length > 0) {
      const log = createKeysmithLog({ agentDir: getAgentDir() });
      await reportStartupDiagnostics({
        notify: (message) => ctx.hasUI && ctx.ui.notify(message, "warning"),
        log: (message) => log.write(message),
      }).report(effective.diagnostics);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    runtime?.shutdown(ctx);
    runtime = undefined;
  });
}

function createDispatchTrie(config: KeysmithConfig, sdkKeymaps: KeysmithDefaultKeymapRegistration[] = []): BindingTrie {
  try {
    return buildBindingTrie(mergeBindingSpecs(config.spec, ...sdkKeymaps.map((keymap) => sourceSdkSpec(keymap))));
  } catch {
    return buildBindingTrie({});
  }
}

function mergeBindingSpecs(...specs: BindingSpec[]): BindingSpec {
  const bindings = specs.flatMap((spec, specIndex) => flattenBindingSpec(spec, "", specIndex));
  const bySequence = new Map<string, typeof bindings>();
  for (const binding of bindings) {
    const existing = bySequence.get(binding.sequence);
    if (existing) existing.push(binding);
    else bySequence.set(binding.sequence, [binding]);
  }

  const merged: BindingSpec = {};
  for (const conflicts of bySequence.values()) {
    const keep = resolveBindingConflict(conflicts);
    if (keep) merged[keep.key] = keep.entry;
  }
  return merged;
}

interface FlatBinding {
  key: string;
  sequence: string;
  entry: NonNullable<BindingSpec[string]>;
  source?: string;
}

function sourceSdkSpec(keymap: KeysmithDefaultKeymapRegistration): BindingSpec {
  const source = `sdk:${keymap.source}`;
  const sourced: BindingSpec = {};
  for (const [key, entry] of Object.entries(keymap.spec as BindingSpec)) {
    sourced[key] = sourceBindingEntry(entry, source);
  }
  return sourced;
}

function sourceBindingEntry(entry: BindingSpec[string], source: string): BindingSpec[string] {
  if (!entry || typeof entry !== "object") return entry;
  const next: NonNullable<BindingSpec[string]> = { ...entry, source: entry.source ?? source };
  for (const [key, value] of Object.entries(entry)) {
    if (key === "action" || key === "desc" || key === "name" || key === "source") continue;
    next[key] = sourceBindingEntry(value as BindingSpec[string], source) as never;
  }
  return next;
}

function flattenBindingSpec(spec: BindingSpec, prefix: string, order: number): FlatBinding[] {
  const bindings: FlatBinding[] = [];
  for (const [key, entry] of Object.entries(spec)) {
    if (!entry || typeof entry !== "object") continue;
    const fullKey = `${prefix}${key}`;
    bindings.push({ key: fullKey, sequence: normalizeBindingSequence(fullKey), entry: metadataOnly(entry), source: entry.source ?? `order:${order}` });

    for (const [childKey, childEntry] of Object.entries(entry)) {
      if (childKey === "action" || childKey === "desc" || childKey === "name" || childKey === "source") continue;
      if (childEntry && typeof childEntry === "object") {
        bindings.push(...flattenBindingSpec({ [childKey]: childEntry as NonNullable<BindingSpec[string]> }, fullKey, order));
      }
    }
  }
  return bindings;
}

function metadataOnly(entry: NonNullable<BindingSpec[string]>): NonNullable<BindingSpec[string]> {
  return {
    ...(typeof entry.action === "string" ? { action: entry.action } : {}),
    ...(typeof entry.desc === "string" ? { desc: entry.desc } : {}),
    ...(typeof entry.name === "string" ? { name: entry.name } : {}),
    ...(typeof entry.source === "string" ? { source: entry.source } : {}),
  };
}

function normalizeBindingSequence(key: string): string {
  return parseKeySequence(key, { allowLeaderPrefix: true })
    .map((token) => token.input)
    .join("");
}

function resolveBindingConflict(bindings: FlatBinding[]): FlatBinding | undefined {
  if (bindings.length === 1) return bindings[0];
  const explicitBindings = bindings.filter((binding) => !isDefaultBindingSource(binding.source));
  if (explicitBindings.length > 0) return explicitBindings.at(-1);
  return undefined;
}

function isDefaultBindingSource(source: string | undefined): boolean {
  return source?.startsWith("builtin:") === true || source?.startsWith("compat:") === true || source?.startsWith("sdk:") === true;
}

function dispatchHardcodedAction(ctx: ExtensionContext, actionId: string): void {
  if (actionId === TOOLS_TOGGLE_ACTION_ID && ctx.hasUI) {
    ctx.ui.setToolsExpanded(!ctx.ui.getToolsExpanded());
    return;
  }
  if (ctx.hasUI) ctx.ui.notify(`Keysmith action ${actionId} is unavailable`, "warning");
}

function markKeysmithFactory(factory: EditorFactory, previousFactory: EditorFactory | undefined): void {
  Object.defineProperty(factory, KEYSMITH_FACTORY_MARKER, { value: true });
  Object.defineProperty(factory, KEYSMITH_PREVIOUS_FACTORY, { value: previousFactory });
}

function unwrapKeysmithFactory(factory: EditorFactory | undefined): EditorFactory | undefined {
  if (!factory) return undefined;
  const record = factory as unknown as MarkedFactoryRecord;
  if (record[KEYSMITH_FACTORY_MARKER] !== true) return factory;
  return record[KEYSMITH_PREVIOUS_FACTORY] as EditorFactory | undefined;
}
