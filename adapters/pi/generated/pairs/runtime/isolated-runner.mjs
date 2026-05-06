import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { ArtifactStore } from "./artifact-store.mjs";
import {
  buildAdvisorContext,
  buildPairCompactResult,
  createDriverTurnEvent,
  detectResearchTriggers,
  renderPairReport,
  renderSteeringMessage,
  researchAdvisorResponder,
  validateAdvisorDecision,
} from "./research-harness.mjs";
import {
  buildImplementationAdvisorContext,
  createImplementationEvent,
  detectImplementationTriggers,
  implementationAdvisorResponder,
} from "./implementation-harness.mjs";

async function loadPiSdk() {
  try {
    return await import("@mariozechner/pi-coding-agent");
  } catch {
    return import("/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js");
  }
}

const { createAgentSession, createReadOnlyTools, SessionManager } = await loadPiSdk();

const PAIR_TRANSPORT_VERSION = "1";
const TRANSPORT_CAPABILITIES = {
  turnBoundaryEvents: true,
  messageInjection: true,
  agentIdentity: true,
  artifactRefs: true,
};

export function buildIsolatedTransportMetadata() {
  return {
    transport_version: PAIR_TRANSPORT_VERSION,
    runtime: "pi-extension-tool",
    advisorTransport: "sdk-in-memory",
    driverEventSource: "isolated-sdk-session.prompt",
    steeringInjection: "isolated-sdk-session.prompt",
    filesystemPolling: false,
    capabilities: TRANSPORT_CAPABILITIES,
    fallbackPolicy: {
      deterministicFallbackEnabled: true,
      localSocketUsed: false,
      intercomUsed: false,
    },
  };
}

function globalAgentsOsPath(...parts) {
  return path.join(os.homedir(), ".agents-os", ...parts);
}

export function pairDefinitionPath(mode) {
  const generated = globalAgentsOsPath("adapters", "pi", "generated", "pairs", "definitions", `${mode}.yml`);
  if (existsSync(generated)) return generated;
  return globalAgentsOsPath("src", "pairs", "definitions", `${mode}.yml`);
}

export function loadPairDefinition(mode) {
  const file = pairDefinitionPath(mode);
  return { file, text: readFileSync(file, "utf8") };
}

function extractJsonObject(text) {
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

function classifyDriverHandling(text) {
  if (/\baccepted\b|\bi accept\b|feedback is correct/i.test(text)) return { handling: "accepted", rationale: text.slice(0, 500) };
  if (/\brejected\b|\bi reject\b|do not accept/i.test(text)) return { handling: "rejected", rationale: text.slice(0, 500) };
  return { handling: "none", rationale: "No explicit accept/reject detected." };
}

async function promptSession(session, prompt, options = {}) {
  let text = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      text += event.assistantMessageEvent.delta;
    }
  });
  try {
    await session.prompt(prompt, options);
    return text.trim();
  } finally {
    unsubscribe?.();
  }
}

async function callAdvisorAgent({ cwd, context, fallback, instructions, createSession = createAgentSession, signal }) {
  let session;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const result = await createSession({
      cwd,
      sessionManager: SessionManager.inMemory(),
      tools: createReadOnlyTools(cwd),
    });
    session = result.session;
    const advisorSessionId = session.sessionId;
    const advisorModel = session.model ? `${session.model.provider ?? ""}/${session.model.id ?? ""}`.replace(/^\//, "") : undefined;
    const text = await promptSession(session, `You are the advisor responder in a Paired Agent Unit. Return ONLY one JSON object matching this schema: {"decision":"noop|note|steer|block|escalate","rule_id":"string","severity":"info|advise|gate|critical","title":"string","message":"string","evidence":{"event_id":"string","transcript_refs":["string"]},"required_driver_response":"none|acknowledge|accept-or-reject|resolve-before-continuing|human-review"}.\n\n${instructions}\n\nRuntime-derived advisor context:\n${JSON.stringify(context, null, 2)}`, { source: "extension" });
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

function driverInstruction(mode) {
  return mode === "research"
    ? "You are the isolated research driver in a Paired Agent Unit. Research and answer the task. Prefer official/primary sources. If Pair Advisor feedback appears later, explicitly accept or reject it with rationale before finalizing affected claims."
    : "You are the isolated implementation driver in a Paired Agent Unit. Work on the assigned implementation task. Preserve scope, summarize changed files, and provide concrete validation evidence. If Pair Advisor feedback appears later, explicitly accept or reject it with rationale before finalizing affected claims.";
}

function advisorInstructions(mode) {
  return mode === "research"
    ? "Use steer for unsupported current model/pricing/context/auth claims without official citations. Use noop if the driver text is adequately sourced."
    : "Use steer for completion claims without validation evidence, scope drift, unrelated file changes, changed-file summary gaps, or shortcut-taking. Use noop if the implementation turn is aligned and evidence-backed.";
}

function advisorImpact({ decisions, handling, degraded }) {
  if (degraded) {
    return `Advisor verification degraded and deterministic fallback was used for at least one check. Treat the driver result as usable only with the listed risks and inspect messages.jsonl before relying on sensitive claims.`;
  }
  if (!decisions.length) {
    return "Advisor was not invoked because the runtime detector found no high-value triggers in the isolated driver output. No advisor concerns were recorded.";
  }
  const interventions = decisions.filter((d) => ["steer", "block", "escalate"].includes(d.decision));
  if (!interventions.length) {
    return `Advisor completed ${decisions.length} check(s) and did not materially intervene. The advisor either returned noop/note feedback or found the output adequately aligned; no blocking concerns remain.`;
  }
  const themes = [...new Set(interventions.map((d) => d.title || d.rule_id))].slice(0, 4).join("; ");
  const accepted = handling.filter((h) => h.handling === "accepted").length;
  const rejected = handling.filter((h) => h.handling === "rejected").length;
  const unresolved = handling.filter((h) => h.handling === "none").length;
  return `Advisor materially intervened on ${interventions.length} check(s), mainly: ${themes}. Driver handling summary: ${accepted} accepted, ${rejected} rejected, ${unresolved} unresolved/implicit. Inspect messages.jsonl for the raw advisor decisions if the parent workflow needs audit detail.`;
}

function withToolHandoff({ compact, run, decisions, handling, degraded }) {
  return {
    run_id: run.runId,
    pair: run.pair,
    ...compact,
    advisor_impact: advisorImpact({ decisions, handling, degraded }),
    artifacts: {
      ...compact.artifacts,
      driver_transcript: `${run.relativeRunDir}/driver-transcript.md`,
      advisor_transcript: `${run.relativeRunDir}/advisor-transcript.md`,
      transport: `${run.relativeRunDir}/transport.json`,
    },
    transport: {
      mode: "sdk-in-memory",
      runtime: "pi-extension-tool",
      advisor_visible_session: false,
      artifact: `${run.relativeRunDir}/transport.json`,
    },
  };
}

export async function runPairedAgent({ cwd = process.cwd(), mode = "research", task, outputMode = "compact", createSession = createAgentSession, signal } = {}) {
  if (!["research", "implementation"].includes(mode)) throw new Error(`Unsupported paired agent mode: ${mode}`);
  if (!String(task ?? "").trim()) throw new Error("run_paired_agent requires a non-empty task");

  const definition = loadPairDefinition(mode);
  const store = new ArtifactStore({ cwd });
  const run = store.createRun({ pair: mode, mode });
  const decisions = [];
  const handling = [];
  let degraded = false;
  let status = "success";
  let driverSession;

  store.writePairMetadata(run, {
    authority: "advise",
    pair_definition: definition.file,
    live_runtime: "pi-extension-tool",
    advisor_responder: "separate-pi-agent-session",
    driver_responder: "separate-pi-agent-session",
    transport_version: PAIR_TRANSPORT_VERSION,
    transport_mode: "sdk-in-memory",
    transport_capabilities: TRANSPORT_CAPABILITIES,
    intercom: { used: false, reason: "SDK driver/advisor run inside the Pi extension tool runtime" },
    local_socket: { used: false, reason: "Not needed for in-process SDK sessions" },
    parent_session_driver: false,
    task,
  });
  store.writeTransport(run, buildIsolatedTransportMetadata());
  store.appendEvent(run, { type: "pair.started", task, pair_definition: definition.file, invocation: "run_paired_agent" });

  try {
    const driverCreated = await createSession({
      cwd,
      sessionManager: SessionManager.inMemory(),
    });
    driverSession = driverCreated.session;
    store.appendEvent(run, { type: "driver.session_started", session_id: driverSession.sessionId, isolated: true });
    const firstText = await promptSession(driverSession, `${driverInstruction(mode)}\n\nTask: ${task}`, { source: "extension" });
    store.appendDriverTranscript(run, `## turn-1\n\n${firstText}\n`);

    const driverEvent = mode === "research"
      ? createDriverTurnEvent({ turnId: "turn-1", text: firstText })
      : createImplementationEvent({ turnId: "turn-1", text: firstText, taskScope: task });
    const triggers = mode === "research" ? detectResearchTriggers(driverEvent) : detectImplementationTriggers(driverEvent);
    store.appendEvent(run, { type: "driver.turn", event: driverEvent, triggers });

    let finalText = firstText;
    if (triggers.length) {
      const advisorContext = mode === "research"
        ? buildAdvisorContext({ event: driverEvent, transcript: [firstText] })
        : buildImplementationAdvisorContext({ event: driverEvent, transcript: [firstText] });
      const fallback = mode === "research" ? researchAdvisorResponder(advisorContext) : implementationAdvisorResponder(advisorContext);
      const advisorResult = await callAdvisorAgent({ cwd, context: advisorContext, fallback, instructions: advisorInstructions(mode), createSession, signal });
      const decision = advisorResult.decision;
      if (advisorResult.source === "deterministic-fallback") degraded = true;
      decisions.push(decision);
      store.appendAdvisorTranscript(run, `## ${driverEvent.event_id} (${advisorResult.source})\n\n${advisorResult.transcript || JSON.stringify(decision, null, 2)}\n`);
      store.appendMessage(run, { type: "advisor.decision", source: advisorResult.source, error: advisorResult.error, advisor: { transport: advisorResult.advisorTransport, session_id: advisorResult.advisorSessionId, model: advisorResult.advisorModel, tools_profile: advisorResult.toolsProfile, started_at: advisorResult.startedAt, ended_at: advisorResult.endedAt, duration_ms: advisorResult.duration_ms, parse_status: advisorResult.parseStatus }, decision });

      if (["steer", "block", "escalate"].includes(decision.decision)) {
        const steering = renderSteeringMessage({ pair: mode, mode, authority: "advise", decision });
        store.appendMessage(run, { type: "steering.injected", delivery: { api: "isolated-sdk-session.prompt", rule_id: decision.rule_id, event_id: decision.evidence?.event_id }, text: steering });
        const handledText = await promptSession(driverSession, `${steering}\n\nRevise or defend your answer. You must explicitly say whether you accept or reject the advisor feedback, with rationale, then provide the final result.`, { source: "extension" });
        finalText = handledText;
        store.appendDriverTranscript(run, `## turn-2 advisor-handling\n\n${handledText}\n`);
        const h = { ...classifyDriverHandling(handledText), turn_id: "turn-2" };
        handling.push(h);
        store.appendMessage(run, { type: "driver.advisor_handling", ...h });
        if (h.handling === "none") status = "blocked";
      }
    }

    if (degraded && status === "success") status = "partial";
    const compactBase = buildPairCompactResult({ run, pair: mode, status, finalText, decisions, handling });
    const compact = withToolHandoff({ compact: compactBase, run, decisions, handling, degraded });
    store.writeReport(run, renderPairReport({ title: `${mode} Pair Run`, task, compact, handling }));
    store.writeCompactResult(run, compact);
    store.appendIndex(run, { status: compact.status, summary: compact.summary });
    store.appendEvent(run, { type: "pair.completed", status: compact.status, advisorCount: decisions.length });
    return outputMode === "artifact-ref"
      ? { status: compact.status, summary: compact.summary, artifacts: compact.artifacts, transport: compact.transport }
      : compact;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const compact = withToolHandoff({
      compact: buildPairCompactResult({ run, pair: mode, status: "failed", finalText: message, decisions, handling }),
      run,
      decisions,
      handling,
      degraded: true,
    });
    compact.summary = `${mode} pair failed: ${message}`;
    compact.open_risks = [`Runtime failure: ${message}`];
    store.writeReport(run, renderPairReport({ title: `${mode} Pair Run`, task, compact, handling }));
    store.writeCompactResult(run, compact);
    store.appendIndex(run, { status: "failed", summary: compact.summary });
    store.appendEvent(run, { type: "pair.failed", error: message });
    return compact;
  } finally {
    driverSession?.dispose?.();
  }
}
