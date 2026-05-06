import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { getKeysmithRegistry } from "pi-keysmith-sdk";
import { openActionKeymapBrowser, createInvocationContextFromCommand } from "./action-browser.js";
import { loadPiKeysmithConfig } from "./config.js";
import { formatDoctorReport, invalidConfigEntriesFromDiagnostics, type DoctorSnapshot } from "./doctor.js";

const REGISTERED = Symbol.for("pi-keysmith.commands.registered");

type MarkedApi = ExtensionAPI & { [REGISTERED]?: boolean };

export function registerKeysmithCommands(pi: ExtensionAPI): void {
  if (typeof pi.registerCommand !== "function") return;
  const marked = pi as MarkedApi;
  if (marked[REGISTERED]) return;
  marked[REGISTERED] = true;

  pi.registerCommand("keysmith-actions", {
    description: "List and run pi-keysmith actions",
    handler: async (_args, ctx) => openActionKeymapBrowser(createInvocationContextFromCommand(ctx, pi)),
  });
  pi.registerCommand("keysmith-doctor", {
    description: "Show pi-keysmith doctor report",
    handler: async (_args, ctx) => runDoctorCommand(ctx),
  });
}

async function runDoctorCommand(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;
  const report = formatDoctorReport(await createBasicDoctorSnapshot(ctx));
  ctx.ui.notify(report, "info");
}

async function createBasicDoctorSnapshot(ctx: ExtensionCommandContext): Promise<DoctorSnapshot> {
  const effective = await loadPiKeysmithConfig({ cwd: ctx.cwd });
  const registry = getKeysmithRegistry().snapshot();
  const availableActions = new Map(registry.actions.map((action) => [action.id, action]));
  const missingActions = collectMissingActions(effective.config.spec, availableActions);
  for (const keymap of registry.defaultKeymaps) missingActions.push(...collectMissingActions(keymap.spec, availableActions));
  const invalidEntries = invalidConfigEntriesFromDiagnostics(effective.diagnostics);

  return {
    configLayers: [
      { source: "builtin:pi-keysmith", status: "loaded" },
      ...effective.sources.map((source) => ({ source: source.source, status: "loaded" })),
      ...invalidEntries.map((diagnostic) => ({ source: diagnostic.source, status: "invalid", message: diagnostic.message })),
    ],
    contexts: effective.config.enabledWhen.map((id) => ({
      id,
      active: id === "editor" ? Boolean(ctx.hasUI) : false,
      ...(id === "editor" ? {} : { message: "not observable from command context" }),
    })),
    conflicts: effective.diagnostics
      .filter((diagnostic) => /conflict|overrides default|duplicate|ambiguity/i.test(diagnostic.message))
      .map((diagnostic) => ({ sequence: "config", sources: [diagnostic.source], resolution: diagnostic.message })),
    missingActions,
    disabledDefaults: effective.disabledDefaults.map((disabled) => ({
      sequence: disabled.sequence,
      actionId: disabled.actionId,
      reason: `${disabled.reason} from ${disabled.source}`,
    })),
    invalidEntries,
    diagnostics: effective.diagnostics,
    wrapper: wrapperState(ctx),
    logPath: join(getAgentDir(), "pi-keysmith.log"),
  };
}

function wrapperState(ctx: ExtensionCommandContext): { active: boolean; message?: string } {
  if (!ctx.hasUI || !ctx.ui) return { active: false, message: "UI unavailable" };
  const factory = typeof ctx.ui.getEditorComponent === "function" ? ctx.ui.getEditorComponent() : undefined;
  if (!factory) return { active: false, message: "Keysmith wrapper not active" };
  const marker = (factory as unknown as Record<PropertyKey, unknown>)[Symbol.for("pi-keysmith.editorFactory")];
  return marker === true
    ? { active: true }
    : { active: false, message: "Keysmith wrapper inactive or overwritten" };
}

function collectMissingActions(
  spec: Record<string, unknown>,
  actions: Map<string, unknown>,
  prefix = "",
): Array<{ actionId: string; sequence?: string }> {
  const missing: Array<{ actionId: string; sequence?: string }> = [];
  for (const [key, entry] of Object.entries(spec)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const sequence = `${prefix}${key}`;
    if (typeof record.action === "string" && !actions.has(record.action)) missing.push({ actionId: record.action, sequence });
    for (const [childKey, value] of Object.entries(record)) {
      if (["action", "desc", "name", "source"].includes(childKey)) continue;
      if (value && typeof value === "object") missing.push(...collectMissingActions({ [childKey]: value }, actions, sequence));
    }
  }
  return missing;
}
