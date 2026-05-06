import type { ExtensionCommandContext, ExtensionUIDialogOptions } from "@mariozechner/pi-coding-agent";
import { getKeysmithRegistry, type KeysmithActionRegistration, type KeysmithInvocationContext, type KeysmithThinkingLevel } from "pi-keysmith-sdk";
import { loadPiKeysmithConfig, type KeysmithCompatShimConfig } from "./config.js";
import { parseKeySequence } from "./parser.js";
import type { BindingSpec } from "./trie.js";

export type ActionBrowserSourceType = "core" | "compat" | "plugin" | "user" | "project";

interface BrowserActionMetadata {
  readonly name?: string;
  readonly sourceType?: ActionBrowserSourceType;
  readonly sourceDisplayName?: string;
  readonly compatShimId?: string;
  readonly available?: boolean;
  readonly availabilityReason?: string;
}

type BrowserAction = KeysmithActionRegistration & BrowserActionMetadata;

type BrowserUI = {
  notify?: (message: string, type?: "info" | "warning" | "error") => void;
  select?: (title: string, options: string[], opts?: ExtensionUIDialogOptions) => Promise<string | undefined>;
  getToolsExpanded?: () => boolean;
  setToolsExpanded?: (expanded: boolean) => void;
};

export interface ActionBrowserContext {
  readonly cwd?: string;
  readonly model?: KeysmithInvocationContext["model"];
  readonly hasUI?: boolean;
  readonly ui?: BrowserUI;
  readonly piContext?: unknown;
  getThinkingLevel?: () => KeysmithThinkingLevel;
  setThinkingLevel?: (level: KeysmithThinkingLevel) => void | Promise<void>;
}

interface BoundAction {
  readonly actionId: string;
  readonly description?: string;
  readonly sequences: string[];
  readonly source?: string;
}

interface BrowserRow {
  readonly actionId: string;
  readonly action?: BrowserAction;
  readonly sequences: string[];
  readonly sourceType: ActionBrowserSourceType;
  readonly sourceDisplayName: string;
  readonly label: string;
  readonly searchText: string;
}

type SelectOptionsWithSearch = ExtensionUIDialogOptions & {
  readonly searchText: (option: string, index: number) => string;
};

export async function openActionKeymapBrowser(ctx: ActionBrowserContext): Promise<void> {
  if (!ctx.hasUI || !ctx.ui?.select) return;

  const snapshot = getKeysmithRegistry().snapshot();
  const effective = await loadPiKeysmithConfig({ cwd: ctx.cwd });
  const actions = new Map(
    snapshot.actions
      .map((action) => action as BrowserAction)
      .filter((action) => actionVisibleInConfig(action, effective.config.compat.shims))
      .map((action) => [action.id, action]),
  );
  const bound = collectBoundActions(effective.config.spec);
  for (const keymap of snapshot.defaultKeymaps) {
    collectBoundActions(keymap.spec as BindingSpec, `sdk:${keymap.source}`).forEach((binding) => addBoundAction(bound, binding));
  }

  const rows = buildRows(actions, bound);
  const labels = rows.map((row) => row.label);
  const rowByLabel = new Map(rows.map((row) => [row.label, row]));
  const searchByLabel = new Map(rows.map((row) => [row.label, row.searchText]));
  const selected = await ctx.ui.select("Keysmith actions", labels, {
    searchText: (option) => searchByLabel.get(option) ?? option,
  } as SelectOptionsWithSearch);
  if (!selected) return;

  const row = rowByLabel.get(selected);
  if (!row) return;
  await dispatchSelectedRow(row, ctx);
}

export function createInvocationContextFromCommand(ctx: ExtensionCommandContext, pi: {
  getThinkingLevel?: () => KeysmithThinkingLevel;
  setThinkingLevel?: (level: KeysmithThinkingLevel) => void | Promise<void>;
}): KeysmithInvocationContext {
  return {
    cwd: ctx.cwd,
    model: ctx.model,
    hasUI: ctx.hasUI,
    ui: ctx.ui,
    piContext: ctx,
    getThinkingLevel: () => pi.getThinkingLevel?.() ?? "off",
    setThinkingLevel: (level) => pi.setThinkingLevel?.(level),
  };
}

function collectBoundActions(spec: BindingSpec, sourceOverride?: string): Map<string, BoundAction> {
  const byAction = new Map<string, BoundAction>();
  collectBindings(spec, [], sourceOverride, byAction);
  return byAction;
}

function collectBindings(spec: BindingSpec, prefix: readonly string[], inheritedSource: string | undefined, byAction: Map<string, BoundAction>): void {
  for (const [key, entry] of Object.entries(spec)) {
    if (!entry || typeof entry !== "object") continue;

    const keys = [...prefix, ...displayableInputsForKey(key)];
    const source = typeof entry.source === "string" ? entry.source : inheritedSource;
    if (typeof entry.action === "string") {
      addBoundAction(byAction, {
        actionId: entry.action,
        description: entry.desc,
        sequences: [keys.join("")],
        source,
      });
    }

    for (const [childKey, value] of Object.entries(entry)) {
      if (["action", "desc", "name", "source"].includes(childKey)) continue;
      if (value && typeof value === "object") collectBindings({ [childKey]: value } as BindingSpec, keys, source, byAction);
    }
  }
}

function addBoundAction(byAction: Map<string, BoundAction>, binding: BoundAction): void {
  const existing = byAction.get(binding.actionId);
  if (!existing) {
    byAction.set(binding.actionId, { ...binding, sequences: uniqueSorted(binding.sequences) });
    return;
  }
  byAction.set(binding.actionId, {
    actionId: binding.actionId,
    description: existing.description ?? binding.description,
    source: existing.source ?? binding.source,
    sequences: uniqueSorted([...existing.sequences, ...binding.sequences]),
  });
}

function actionVisibleInConfig(action: BrowserAction, shims: Record<string, KeysmithCompatShimConfig>): boolean {
  if (!action.compatShimId) return true;
  const shim = shims[action.compatShimId];
  return Boolean(shim) && (shim.enabled ?? true);
}

function buildRows(actions: Map<string, BrowserAction>, bound: Map<string, BoundAction>): BrowserRow[] {
  const boundRows = [...bound.values()]
    .map((binding) => createRow(binding.actionId, actions.get(binding.actionId), binding.sequences, binding.source, binding.description))
    .sort((left, right) => compareSequences(left.sequences[0] ?? "", right.sequences[0] ?? "") || left.actionId.localeCompare(right.actionId));

  const boundActionIds = new Set(boundRows.map((row) => row.actionId));
  const unboundRows = [...actions.values()]
    .filter((action) => !boundActionIds.has(action.id))
    .map((action) => createRow(action.id, action, [], undefined, action.description))
    .sort(compareUnboundRows);

  return [...boundRows, ...unboundRows];
}

function createRow(actionId: string, action: BrowserAction | undefined, sequences: readonly string[], bindingSource: string | undefined, fallbackDescription: string | undefined): BrowserRow {
  const sourceType = action?.sourceType ?? sourceTypeFor(bindingSource, actionId);
  const sourceDisplayName = action?.sourceDisplayName ?? sourceDisplayNameFor(sourceType, bindingSource);
  const name = action?.name ?? action?.description ?? fallbackDescription ?? actionId;
  const description = action?.description ?? fallbackDescription;
  const status = action ? availabilityLabel(action) : "missing/unavailable";
  const sequencePrefix = sequences.length > 0 ? `[${[...sequences].sort(compareSequences).join(", ")}] ` : "[unbound] ";
  const label = `${sequencePrefix}${name} — ${actionId} — ${sourceType}: ${sourceDisplayName}${status ? ` — ${status}` : ""}`;
  const searchText = [name, description, actionId, sourceType, sourceDisplayName, status].filter(Boolean).join(" ");

  return { actionId, action, sequences: [...sequences].sort(compareSequences), sourceType, sourceDisplayName, label, searchText };
}

async function dispatchSelectedRow(row: BrowserRow, ctx: ActionBrowserContext): Promise<void> {
  if (!row.action) {
    ctx.ui?.notify?.(`Keysmith action ${row.actionId} is unavailable or missing`, "warning");
    return;
  }

  if (row.action.available === false) {
    ctx.ui?.notify?.(`Keysmith action ${row.actionId} is unavailable${row.action.availabilityReason ? `: ${row.action.availabilityReason}` : ""}`, "warning");
    return;
  }

  await row.action.handler({
    cwd: ctx.cwd ?? process.cwd(),
    model: ctx.model,
    hasUI: ctx.hasUI,
    ui: ctx.ui as KeysmithInvocationContext["ui"],
    piContext: ctx.piContext,
    getThinkingLevel: ctx.getThinkingLevel,
    setThinkingLevel: ctx.setThinkingLevel,
  });
}

function availabilityLabel(action: BrowserAction): string {
  if (action.available === false) return action.availabilityReason ? `unavailable: ${action.availabilityReason}` : "unavailable";
  return "available";
}

function compareUnboundRows(left: BrowserRow, right: BrowserRow): number {
  return (
    left.sourceDisplayName.localeCompare(right.sourceDisplayName) ||
    rowName(left).localeCompare(rowName(right)) ||
    left.actionId.localeCompare(right.actionId)
  );
}

function rowName(row: BrowserRow): string {
  return row.action?.name ?? row.action?.description ?? row.actionId;
}

function compareSequences(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareSequences);
}

function displayableInputsForKey(key: string): string[] {
  try {
    return parseKeySequence(key, { allowLeaderPrefix: true }).map((token) => displayInput(token.input));
  } catch {
    return [...key].filter((char) => !/\s/.test(char));
  }
}

function displayInput(input: string): string {
  switch (input) {
    case " ":
      return "space";
    case "\t":
      return "tab";
    case "\r":
      return "cr";
    case "\u001b":
      return "esc";
    case "\u0018":
      return "ctrl+x";
    default:
      return input;
  }
}

function sourceTypeFor(source: string | undefined, actionId: string): ActionBrowserSourceType {
  if (actionId.startsWith("pi-core.") || actionId.startsWith("pi-keysmith.")) return "core";
  if (source?.includes("project")) return "project";
  if (source && /keybindings\.json|settings\.json/.test(source)) return source.includes("/.pi/") ? "project" : "user";
  if (source?.startsWith("sdk:compat:") || source?.startsWith("compat:")) return "compat";
  if (source?.startsWith("sdk:plugin:") || source?.startsWith("plugin:")) return "plugin";
  return "plugin";
}

function sourceDisplayNameFor(sourceType: ActionBrowserSourceType, source: string | undefined): string {
  if (!source) return defaultSourceDisplayName(sourceType);
  const display = source.replace(/^sdk:/, "");
  if (sourceType === "user") return "User keybindings";
  if (sourceType === "project") return "Project keybindings";
  if (sourceType === "compat") return display.replace(/^compat:/, "") || "compat";
  if (sourceType === "plugin") return display.replace(/^plugin:/, "") || "plugin";
  return defaultSourceDisplayName(sourceType);
}

function defaultSourceDisplayName(sourceType: ActionBrowserSourceType): string {
  switch (sourceType) {
    case "core":
      return "Pi Keysmith core";
    case "compat":
      return "Compatibility shim";
    case "plugin":
      return "Plugin";
    case "user":
      return "User keybindings";
    case "project":
      return "Project keybindings";
  }
}
