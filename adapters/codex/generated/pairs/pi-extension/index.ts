import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createAgentSession, createReadOnlyTools, SessionManager } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ArtifactStore } from "../runtime/artifact-store.mjs";
import {
  buildAdvisorContext,
  createDriverTurnEvent,
  detectResearchTriggers,
  renderSteeringMessage,
  renderPairReport,
  researchAdvisorResponder,
  validateAdvisorDecision,
  buildPairCompactResult,
} from "../runtime/research-harness.mjs";
import {
  buildImplementationAdvisorContext,
  createImplementationEvent,
  detectImplementationTriggers,
  implementationAdvisorResponder,
} from "../runtime/implementation-harness.mjs";
import { runPairedAgent } from "../runtime/isolated-runner.mjs";

type ActivePairRun = {
  run: any;
  store: ArtifactStore;
  pairDefinitionPath: string;
  task: string;
  mode: "research" | "implementation";
  handledAdvisorMessages: Set<string>;
  pendingSteering: boolean;
  completed: boolean;
  turnSequence: number;
  decisions: Array<{ source: string; decision: any; error?: string }>;
  handling: Array<{ handling: string; rationale: string; turn_id: string }>;
  lastDriverText?: string;
};

const PAIR_TRANSPORT_VERSION = "1";
const TRANSPORT_CAPABILITIES = {
  turnBoundaryEvents: true,
  messageInjection: true,
  agentIdentity: true,
  artifactRefs: true,
};

function buildTransportMetadata() {
  return {
    transport_version: PAIR_TRANSPORT_VERSION,
    runtime: "pi-extension",
    advisorTransport: "sdk-in-memory",
    driverEventSource: "pi.turn_end",
    steeringInjection: "pi.sendMessage:steer",
    filesystemPolling: false,
    capabilities: TRANSPORT_CAPABILITIES,
    fallbackPolicy: {
      deterministicFallbackEnabled: true,
      localSocketUsed: false,
      intercomUsed: false,
    },
  };
}

function globalAgentsOsPath(...parts: string[]) {
  return path.join(os.homedir(), ".agents-os", ...parts);
}

function pairDefinitionPath(mode: "research" | "implementation") {
  const generated = globalAgentsOsPath("adapters", "pi", "generated", "pairs", "definitions", `${mode}.yml`);
  if (existsSync(generated)) return generated;
  return globalAgentsOsPath("src", "pairs", "definitions", `${mode}.yml`);
}

function loadPairDefinition(mode: "research" | "implementation") {
  const file = pairDefinitionPath(mode);
  return { file, text: readFileSync(file, "utf8") };
}

function assistantTextFromTurnEnd(event: any): string {
  const message = event?.message;
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("\n")
      .trim();
  }
  return typeof message.text === "string" ? message.text : "";
}

function extractJsonObject(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callAdvisorAgent({ cwd, context, fallback, instructions, signal }: { cwd: string; context: any; fallback: any; instructions: string; signal?: AbortSignal }) {
  let session: any | undefined;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const result = await createAgentSession({
      cwd,
      sessionManager: SessionManager.inMemory(),
      tools: createReadOnlyTools(cwd),
    });
    session = result.session;
    const advisorSessionId = session.sessionId;
    const advisorModel = session.model ? `${session.model.provider ?? ""}/${session.model.id ?? ""}`.replace(/^\//, "") : undefined;
    let text = "";
    const unsubscribe = session.subscribe((event: any) => {
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        text += event.assistantMessageEvent.delta;
      }
    });
    await session.prompt(`You are the advisor responder in a Paired Agent Unit. Return ONLY one JSON object matching this schema: {"decision":"noop|note|steer|block|escalate","rule_id":"string","severity":"info|advise|gate|critical","title":"string","message":"string","evidence":{"event_id":"string","transcript_refs":["string"]},"required_driver_response":"none|acknowledge|accept-or-reject|resolve-before-continuing|human-review"}.\n\n${instructions}\n\nRuntime-derived advisor context:\n${JSON.stringify(context, null, 2)}`, { source: "extension" as any });
    unsubscribe();
    const parsed = extractJsonObject(text);
    const base = { advisorTransport: "sdk-in-memory", advisorSessionId, advisorModel, toolsProfile: "read-only", startedAt, endedAt: new Date().toISOString(), duration_ms: Date.now() - startedMs };
    if (!parsed) return { decision: fallback, source: "deterministic-fallback", error: "advisor returned no JSON", transcript: text, parseStatus: "json-missing", ...base };
    return { decision: validateAdvisorDecision(parsed), source: "agent-session", transcript: text, parseStatus: "json-valid", ...base };
  } catch (error) {
    return { decision: fallback, source: "deterministic-fallback", error: error instanceof Error ? error.message : String(error), transcript: "", parseStatus: "json-invalid", advisorTransport: "sdk-in-memory", toolsProfile: "read-only", startedAt, endedAt: new Date().toISOString(), duration_ms: Date.now() - startedMs };
  } finally {
    session?.dispose?.();
  }
}

function classifyDriverHandling(text: string): { handling: "accepted" | "rejected" | "none"; rationale: string } {
  if (/\baccepted\b|\bi accept\b|feedback is correct/i.test(text)) return { handling: "accepted", rationale: text.slice(0, 500) };
  if (/\brejected\b|\bi reject\b|do not accept/i.test(text)) return { handling: "rejected", rationale: text.slice(0, 500) };
  return { handling: "none", rationale: "No explicit accept/reject detected." };
}

function summarizeText(text: string | undefined, max = 280): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No final driver text captured.";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function makeCompactResult(active: ActivePairRun, status: "success" | "partial" | "blocked" | "needs-human" | "failed", advisorCount: number) {
  return buildPairCompactResult({
    run: active.run,
    pair: active.mode,
    status,
    finalText: active.lastDriverText,
    decisions: active.decisions.map((entry) => entry.decision),
    handling: active.handling,
  });
}

function latestPairRunDir(cwd: string): string | undefined {
  const runsDir = path.join(cwd, ".pi", "artifacts", "pairs", "runs");
  if (!existsSync(runsDir)) return undefined;
  return readdirSync(runsDir)
    .map((entry) => path.join(runsDir, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function generatedPairManifestPath() {
  return globalAgentsOsPath("adapters", "pi", "generated", "pairs", "manifest.json");
}

function readPairManifest(): any | undefined {
  const file = generatedPairManifestPath();
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return undefined; }
}

function formatPairList(): string {
  const manifest = readPairManifest();
  const pairs = manifest?.pairs ?? [];
  if (!pairs.length) return "No paired agent units found. Run `node scripts/agents-os.mjs sync`.";
  return [
    "Available Paired Agent Units:",
    ...pairs.map((pair: any) => `- ${pair.name} (${pair.live ? "live" : "defined, not live"}, authority: ${pair.authority})${pair.live ? `: /pi-pair ${pair.name} \"<task>\"` : ""}`),
  ].join("\n");
}

function resolveRunDir(cwd: string, selector: string): string | undefined {
  const trimmed = selector.trim();
  if (!trimmed || trimmed === "latest") return latestPairRunDir(cwd);
  if (trimmed.includes("/") || trimmed.startsWith(".")) return path.resolve(cwd, trimmed);
  return path.join(cwd, ".pi", "artifacts", "pairs", "runs", trimmed);
}

function formatRunInspection(runDir: string): string {
  const compactFile = path.join(runDir, "compact-result.json");
  const messagesFile = path.join(runDir, "messages.jsonl");
  const pairFile = path.join(runDir, "pair.json");
  const transportFile = path.join(runDir, "transport.json");
  const compact = existsSync(compactFile) ? JSON.parse(readFileSync(compactFile, "utf8")) : undefined;
  const pair = existsSync(pairFile) ? JSON.parse(readFileSync(pairFile, "utf8")) : undefined;
  const transport = existsSync(transportFile) ? JSON.parse(readFileSync(transportFile, "utf8")) : undefined;
  const messages = existsSync(messagesFile)
    ? readFileSync(messagesFile, "utf8").trim().split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return undefined; } }).filter(Boolean)
    : [];
  const decisions = messages.filter((entry: any) => entry.type === "advisor.decision");
  const handling = messages.filter((entry: any) => entry.type === "driver.advisor_handling");
  return [
    `Pair run: ${path.basename(runDir)}`,
    `Status: ${compact?.status ?? "unknown"}`,
    `Mode: ${pair?.mode ?? compact?.pair ?? "unknown"}`,
    `Summary: ${compact?.summary ?? "No compact result."}`,
    `Driver: ${compact?.driver_result ?? "n/a"}`,
    `Advisor: ${compact?.advisor_result ?? "n/a"}`,
    `Transport: ${transport?.advisorTransport ?? pair?.transport_mode ?? "unknown"}`,
    `Advisor decisions: ${decisions.length}`,
    ...decisions.map((entry: any) => `  - ${entry.decision?.decision}:${entry.decision?.rule_id} (${entry.source ?? entry.advisor?.source ?? "unknown"}) — ${entry.decision?.title ?? ""}`),
    `Driver handling entries: ${handling.length}`,
    ...handling.map((entry: any) => `  - ${entry.handling} (${entry.turn_id})`),
    `Artifacts: ${runDir}`,
  ].join("\n");
}


export default function pairedAgentUnitExtension(pi: ExtensionAPI) {
  let active: ActivePairRun | null = null;
  let advisorCount = 0;

  pi.registerTool({
    name: "run_paired_agent",
    label: "Run Paired Agent",
    description: "Run a Paired Agent Unit as an isolated driver plus isolated advisor worker. This is the canonical agent-facing interface for paired research or implementation work; do not wrap /pi-pair in generic subagents.",
    promptSnippet: "run_paired_agent: run an isolated paired driver/advisor worker and return a compact handoff with advisor impact and artifact refs.",
    promptGuidelines: [
      "Use run_paired_agent when the user asks for a paired agent, paired subagent, paired research worker, or paired implementation worker.",
      "Do not invoke paired units by wrapping /pi-pair inside the generic subagent/pi-subagents tool.",
      "Treat the returned advisor_impact as the handoff summary; inspect artifact refs only when audit detail is needed.",
    ],
    parameters: Type.Object({
      mode: Type.String({ enum: ["research", "implementation"], description: "Paired unit mode to run." }),
      task: Type.String({ description: "Task for the isolated driver session." }),
      outputMode: Type.Optional(Type.String({ enum: ["compact", "artifact-ref"], description: "Return full compact handoff or only artifact refs plus summary." })),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
      const result = await runPairedAgent({
        cwd: ctx.cwd ?? process.cwd(),
        mode: params.mode as "research" | "implementation",
        task: params.task,
        outputMode: (params.outputMode ?? "compact") as "compact" | "artifact-ref",
        signal,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerCommand("pi-pair", {
    description: "Run a Paired Agent Unit. Live modes: /pi-pair research <task>, /pi-pair implementation <task>",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed || trimmed === "help") {
        ctx.ui.notify("Usage: /pi-pair list | inspect latest|<run-id> | research <task> | implementation <task>", "info");
        return;
      }
      if (trimmed === "list") {
        pi.sendMessage({ customType: "paired_agent_unit_list", content: formatPairList(), display: true }, { deliverAs: "followUp" });
        return;
      }
      const inspectMatch = trimmed.match(/^inspect(?:\s+([\s\S]+))?$/);
      if (inspectMatch) {
        const runDir = resolveRunDir(ctx.cwd ?? process.cwd(), inspectMatch[1] ?? "latest");
        if (!runDir || !existsSync(runDir)) {
          ctx.ui.notify("Pair run not found.", "warning");
          return;
        }
        pi.sendMessage({ customType: "paired_agent_unit_inspect", content: formatRunInspection(runDir), display: true, details: { runDir } }, { deliverAs: "followUp" });
        return;
      }
      const match = trimmed.match(/^(research|implementation)\s+([\s\S]+)/);
      if (!match) {
        ctx.ui.notify("Usage: /pi-pair list | inspect latest|<run-id> | <research|implementation> <task>", "warning");
        return;
      }

      const mode = match[1] as "research" | "implementation";
      const task = match[2].trim().replace(/^[\'"]|[\'"]$/g, "");
      ctx.ui.notify(`Running isolated ${mode} pair worker...`, "info");
      const result = await runPairedAgent({ cwd: ctx.cwd ?? process.cwd(), mode, task, signal: ctx.signal });
      pi.sendMessage({
        customType: "paired_agent_unit_result",
        content: `Paired Agent Unit complete (${mode})\n\nStatus: ${result.status}\nSummary: ${result.summary}\nAdvisor impact: ${result.advisor_impact}\nArtifacts: ${result.artifacts?.run_dir}`,
        display: true,
        details: { runId: result.run_id, compact: result },
      }, { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("pi-pair-result", {
    description: "Show compact JSON for a pair run. Usage: /pi-pair-result [run-dir]",
    handler: async (args, ctx) => {
      const runDir = args.trim() || latestPairRunDir(ctx.cwd ?? process.cwd());
      if (!runDir) {
        ctx.ui.notify("No pair run found.", "warning");
        return;
      }
      const compactFile = path.join(runDir, "compact-result.json");
      if (!existsSync(compactFile)) {
        ctx.ui.notify(`No compact result found at ${compactFile}`, "warning");
        return;
      }
      const compact = readFileSync(compactFile, "utf8");
      pi.sendMessage({
        customType: "paired_agent_unit_result",
        content: compact,
        display: true,
        details: { runDir },
      }, { deliverAs: "followUp" });
    },
  });


  pi.on("turn_end", async (event, ctx) => {
    if (!active) return;
    const text = assistantTextFromTurnEnd(event);
    if (!text) return;
    active.lastDriverText = text;
    const turnId = `turn-${++active.turnSequence}`;
    active.store.appendDriverTranscript(active.run, `## ${turnId}\n\n${text}\n`);
    const driverEvent = active.mode === "research"
      ? createDriverTurnEvent({ turnId, text })
      : createImplementationEvent({ turnId, text });
    const triggers = active.mode === "research" ? detectResearchTriggers(driverEvent) : detectImplementationTriggers(driverEvent);
    active.store.appendEvent(active.run, { type: "driver.turn", event: driverEvent, triggers });

    if (active.pendingSteering) {
      const handling = classifyDriverHandling(text);
      active.handling.push({ ...handling, turn_id: turnId });
      active.store.appendMessage(active.run, { type: "driver.advisor_handling", ...handling, turn_id: turnId });
      active.pendingSteering = false;
      return;
    }

    if (triggers.length === 0) return;

    const advisorContext = active.mode === "research"
      ? buildAdvisorContext({ event: driverEvent, transcript: [text] })
      : buildImplementationAdvisorContext({ event: driverEvent, transcript: [text] });
    const fallback = active.mode === "research" ? researchAdvisorResponder(advisorContext) : implementationAdvisorResponder(advisorContext);
    const instructions = active.mode === "research"
      ? "Use steer for unsupported current model/pricing/context/auth claims without official citations. Use noop if the driver text is adequately sourced."
      : "Use steer for completion claims without validation evidence, scope drift, unrelated file changes, changed-file summary gaps, or shortcut-taking. Use noop if the implementation turn is aligned and evidence-backed.";
    const advisorResult = await callAdvisorAgent({ cwd: ctx.cwd ?? process.cwd(), context: advisorContext, fallback, instructions, signal: ctx.signal });
    const decision = advisorResult.decision;
    active.decisions.push({ source: advisorResult.source, error: advisorResult.error, decision });
    active.store.appendAdvisorTranscript(active.run, `## ${driverEvent.event_id} (${advisorResult.source})\n\n${advisorResult.transcript || JSON.stringify(decision, null, 2)}\n`);
    active.store.appendMessage(active.run, { type: "advisor.decision", source: advisorResult.source, error: advisorResult.error, advisor: { transport: advisorResult.advisorTransport, session_id: advisorResult.advisorSessionId, model: advisorResult.advisorModel, tools_profile: advisorResult.toolsProfile, started_at: advisorResult.startedAt, ended_at: advisorResult.endedAt, duration_ms: advisorResult.duration_ms, parse_status: advisorResult.parseStatus }, decision });
    if (decision.decision !== "steer" && decision.decision !== "block" && decision.decision !== "escalate") return;

    advisorCount += 1;
    active.pendingSteering = true;
    const steering = renderSteeringMessage({ decision, authority: "advise" });
    active.store.appendMessage(active.run, { type: "steering.injected", delivery: { api: "pi.sendMessage", deliverAs: "steer", triggerTurn: true, rule_id: decision.rule_id, event_id: decision.evidence?.event_id }, text: steering });
    pi.sendMessage({
      customType: "paired_agent_unit_steering",
      content: steering,
      display: true,
      details: { runId: active.run.runId, decision },
    }, { deliverAs: "steer", triggerTurn: true });
  });

  pi.on("agent_end", async (_event, _ctx) => {
    if (!active || active.completed || active.pendingSteering) return;
    active.completed = true;
    const compact = { ...makeCompactResult(active, "success", advisorCount), transport: { mode: "sdk-in-memory", runtime: "pi-extension", artifact: `${active.run.relativeRunDir}/transport.json` } };
    active.store.writeReport(active.run, renderPairReport({ title: `${active.mode} Pair Run`, task: active.task, compact, handling: active.handling }));
    active.store.writeCompactResult(active.run, compact);
    active.store.appendIndex(active.run, { status: compact.status, summary: compact.summary });
    active.store.appendEvent(active.run, { type: "pair.completed", status: compact.status, advisorCount });
    pi.sendMessage({
      customType: "paired_agent_unit_result",
      content: `Paired Agent Unit complete (${active.mode})\n\nStatus: ${compact.status}\nSummary: ${compact.summary}\nAdvisor: ${compact.advisor_result}\nArtifacts: ${compact.artifacts.run_dir}`,
      display: true,
      details: { runId: active.run.runId, compact },
    }, { deliverAs: "followUp" });
    active = null;
  });
}
