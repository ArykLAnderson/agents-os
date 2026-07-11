import type { Disposable, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { consumePrefillArtifact, createPrefillArtifact, getHopArtifactRoot, readPrefillMarkdown } from "./artifacts.ts";
import { generateHandoffDraft, resolveHandoffGoal } from "./handoff.ts";
import { registerHopKeysmithActions } from "./keysmith.ts";
import { cloneActiveBranch, createFreshDestinationSession } from "./sessions.ts";
import { buildPiSessionCommand, buildTmuxNewWindowArgs, openWindow, shellQuote } from "./tmux.ts";

type HopMode = "picker" | "clone" | "handoff";
type HopOrigin = "user" | "agent";

export interface ParsedHopCommand {
  mode: HopMode;
  origin: HopOrigin;
  dryRun: boolean;
  text: string;
}

interface HopPlan {
  mode: "clone" | "handoff";
  origin: HopOrigin;
  dryRun: boolean;
  cwd: string;
  sourceSessionFile: string | undefined;
  destination: string;
  prefill: "none" | "instruction" | "handoff-draft";
  tmuxCommand: string;
}

const CLONE_LABEL = "Clone thread";
const HANDOFF_LABEL = "Fresh handoff";

function tokenizeArgs(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

export function parseHopCommand(args: string): ParsedHopCommand {
  const tokens = tokenizeArgs(args);
  let mode: HopMode = "picker";
  let origin: HopOrigin = "user";
  let dryRun = false;
  const textTokens: string[] = [];

  for (const token of tokens) {
    if (token === "--agent") {
      origin = "agent";
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (mode === "picker" && (token === "clone" || token === "handoff")) {
      mode = token;
      continue;
    }
    textTokens.push(token);
  }

  return { mode, origin, dryRun, text: textTokens.join(" ") };
}

function requireInteractive(ctx: ExtensionCommandContext): boolean {
  if (!ctx.hasUI) {
    ctx.ui.notify("/hop requires interactive mode", "error");
    return false;
  }
  return true;
}

function requireTmux(ctx: ExtensionCommandContext): boolean {
  if (!process.env.TMUX) {
    ctx.ui.notify("/hop requires tmux. Open Pi inside tmux and try again; Hop will not create a fallback session/window.", "error");
    return false;
  }
  return true;
}

function buildDryRunPlan(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "clone" | "handoff" }): HopPlan {
  const sourceSessionFile = ctx.sessionManager.getSessionFile();
  const destinationSession = parsed.mode === "clone" ? "new cloned Pi session file" : "new fresh Pi session file";
  const prefill: HopPlan["prefill"] = parsed.mode === "handoff" ? "handoff-draft" : parsed.text ? "instruction" : "none";
  const command = buildPiSessionCommand({
    sessionFile: "<destination-session-file>",
    prefillFile: prefill === "none" ? undefined : "<pending-artifact.md>",
  });
  const tmuxArgs = buildTmuxNewWindowArgs({ cwd: ctx.cwd, command });

  return {
    mode: parsed.mode,
    origin: parsed.origin,
    dryRun: parsed.dryRun,
    cwd: ctx.cwd,
    sourceSessionFile,
    destination: destinationSession,
    prefill,
    tmuxCommand: `tmux ${tmuxArgs.map(shellQuote).join(" ")}`,
  };
}

function formatDryRunPlan(plan: HopPlan): string {
  return [
    `Hop dry run: ${plan.mode}`,
    `origin: ${plan.origin}`,
    `cwd: ${plan.cwd}`,
    `source session: ${plan.sourceSessionFile ?? "ephemeral / not persisted"}`,
    `destination: ${plan.destination}`,
    `prefill: ${plan.prefill}`,
    `tmux: ${plan.tmuxCommand}`,
    "No sessions, artifacts, or tmux windows were created.",
  ].join("\n");
}

function notifyDryRun(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "clone" | "handoff" }): void {
  ctx.ui.notify(formatDryRunPlan(buildDryRunPlan(ctx, parsed)), "info");
}

async function confirmAgentHop(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "clone" | "handoff" }): Promise<boolean> {
  if (parsed.origin !== "agent") return true;
  const modeLabel = parsed.mode === "clone" ? "Clone thread" : "Fresh handoff";
  const goal = parsed.text.trim() || (parsed.mode === "handoff" ? "not specified yet" : "none");
  return ctx.ui.confirm(
    `Agent requested: ${modeLabel}`,
    [
      `Goal/instruction: ${goal}`,
      parsed.mode === "handoff"
        ? "Will generate a handoff draft first. If you accept the draft, Hop will open a new tmux window in the current tmux session."
        : "Will create a cloned session and open a new tmux window in the current tmux session.",
      "The current thread will remain unchanged.",
      "Proceed?",
    ].join("\n\n"),
  );
}

export async function openPicker(ctx: ExtensionCommandContext, base: ParsedHopCommand): Promise<void> {
  const choice = await ctx.ui.select("Hop to new Pi window", [CLONE_LABEL, HANDOFF_LABEL]);
  if (choice === undefined) {
    ctx.ui.notify("Hop cancelled", "info");
    return;
  }
  if (choice === CLONE_LABEL) {
    await cloneThread(ctx, { ...base, mode: "clone" });
    return;
  }
  if (choice === HANDOFF_LABEL) {
    await freshHandoff(ctx, { ...base, mode: "handoff" });
  }
}

export async function cloneThread(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "clone" }): Promise<void> {
  if (parsed.dryRun) {
    notifyDryRun(ctx, parsed);
    return;
  }

  if (!(await confirmAgentHop(ctx, parsed))) {
    ctx.ui.notify("Hop clone cancelled", "info");
    return;
  }

  let cloneFile: string;
  let prefillFile: string | undefined;
  try {
    const clone = cloneActiveBranch(ctx);
    cloneFile = clone.path;

    if (parsed.text) {
      const artifact = createPrefillArtifact({
        rootDir: getHopArtifactRoot(ctx.cwd),
        prompt: parsed.text,
        metadata: {
          mode: "clone",
          origin: parsed.origin,
          sourceCwd: ctx.cwd,
          sourceSessionFile: clone.sourceSessionFile,
          destinationSessionFile: cloneFile,
        },
      });
      prefillFile = artifact.markdownPath;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Hop clone failed: ${message}`, "error");
    return;
  }

  const command = buildPiSessionCommand({ sessionFile: cloneFile, prefillFile });
  const result = await openWindow({ cwd: ctx.cwd, command });
  if (!result.ok) {
    ctx.ui.notify(
      `Hop clone created files but tmux launch failed. Run to recover:\n${result.recoveryCommand}\n${result.stderr ?? result.message}`,
      "error",
    );
    return;
  }

  ctx.ui.notify("Hop clone opened in a new tmux window.", "info");
}

export async function freshHandoff(ctx: ExtensionCommandContext, parsed: ParsedHopCommand & { mode: "handoff" }): Promise<void> {
  if (parsed.dryRun) {
    notifyDryRun(ctx, parsed);
    return;
  }

  if (!(await confirmAgentHop(ctx, parsed))) {
    ctx.ui.notify("Hop handoff cancelled", "info");
    return;
  }

  const goal = await resolveHandoffGoal(ctx, parsed.text);
  if (!goal) {
    ctx.ui.notify("Hop handoff cancelled", "info");
    return;
  }

  const draft = await generateHandoffDraft(ctx, goal);
  if (!draft) {
    ctx.ui.notify("Hop handoff cancelled", "info");
    return;
  }

  let destinationFile: string;
  let prefillFile: string;
  try {
    const destination = createFreshDestinationSession(ctx);
    destinationFile = destination.path;
    const artifact = createPrefillArtifact({
      rootDir: getHopArtifactRoot(ctx.cwd),
      prompt: draft,
      metadata: {
        mode: "handoff",
        origin: parsed.origin,
        sourceCwd: ctx.cwd,
        sourceSessionFile: destination.sourceSessionFile,
        destinationSessionFile: destinationFile,
      },
    });
    prefillFile = artifact.markdownPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Hop handoff failed: ${message}`, "error");
    return;
  }

  const command = buildPiSessionCommand({ sessionFile: destinationFile, prefillFile });
  const result = await openWindow({ cwd: ctx.cwd, command });
  if (!result.ok) {
    ctx.ui.notify(
      `Hop handoff created files but tmux launch failed. Run to recover:\n${result.recoveryCommand}\n${result.stderr ?? result.message}`,
      "error",
    );
    return;
  }

  ctx.ui.notify("Hop handoff opened in a new tmux window.", "info");
}

async function bootstrapPrefill(ctx: ExtensionContext): Promise<void> {
  const prefillPath = process.env.PI_HOP_PREFILL;
  if (!prefillPath) return;

  let prompt: string;
  try {
    prompt = readPrefillMarkdown(prefillPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Hop prefill failed: ${message}`, "error");
    return;
  }

  ctx.ui.setEditorText(prompt);

  try {
    consumePrefillArtifact(prefillPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Hop prefill loaded, but artifact cleanup failed: ${message}`, "warning");
    return;
  }

  ctx.ui.notify("Hop prefill loaded. Submit when ready.", "info");
}

async function handleHop(args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (!requireInteractive(ctx) || !requireTmux(ctx)) return;

  const parsed = parseHopCommand(args);
  if (parsed.mode === "picker") {
    if (parsed.dryRun) {
      notifyDryRun(ctx, { ...parsed, mode: "clone" });
      return;
    }
    await openPicker(ctx, parsed);
    return;
  }
  if (parsed.mode === "clone") {
    await cloneThread(ctx, parsed);
    return;
  }
  await freshHandoff(ctx, parsed);
}

export default function (pi: ExtensionAPI) {
  let keysmithDisposable: Disposable | undefined;

  pi.on("session_start", async (_event, ctx) => {
    keysmithDisposable ??= await registerHopKeysmithActions({ openPicker, cloneThread, freshHandoff });
    await bootstrapPrefill(ctx);
  });

  pi.on("session_shutdown", () => {
    keysmithDisposable?.dispose();
    keysmithDisposable = undefined;
  });

  pi.registerCommand("hop", {
    description: "Open a related Pi chat in a new tmux window",
    handler: handleHop,
  });
}
