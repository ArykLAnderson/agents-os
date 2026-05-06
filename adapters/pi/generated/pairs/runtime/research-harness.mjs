import { ArtifactStore } from "./artifact-store.mjs";

export function createDriverTurnEvent({ turnId, text, role = "assistant", artifacts = [] }) {
  return {
    event_id: `evt-${turnId}`,
    turn_id: turnId,
    role,
    text,
    artifact_refs: artifacts,
    runtime_derived: true,
    detected_at: new Date().toISOString(),
  };
}

const factualPatterns = [/\b(is|are|was|were|has|have|supports?|costs?|priced|limit|context window|tokens?)\b/i, /\b\d+[kKmM]?\b/];
const citationPattern = /(https?:\/\/|\[[^\]]+\]\(|source:|according to)/i;
const finalPattern = /\b(final answer|in summary|therefore|answer:)\b/i;
const uncertaintyPattern = /\b(unclear|unknown|conflict|contradict|not sure|cannot verify|might|appears)\b/i;
const lowValuePattern = /^(thanks|ok|okay|i will check|sounds good|working on it)[.!\s]*$/i;

export function detectResearchTriggers(event) {
  const text = event.text ?? "";
  if (!text.trim() || lowValuePattern.test(text.trim())) return [];
  const triggers = [];
  if (factualPatterns.some((pattern) => pattern.test(text))) triggers.push("factual_claim");
  if ((/\b(gpt|model|pricing|context|oauth|api|tokens?)\b/i.test(text) || /\b\d+[kKmM]?\b/.test(text)) && !citationPattern.test(text)) {
    triggers.push("citation_sensitive_claim");
  }
  if (finalPattern.test(text)) triggers.push("draft_or_final_answer");
  if (uncertaintyPattern.test(text)) triggers.push("uncertainty_or_conflict");
  return [...new Set(triggers)];
}

export function shouldInvokeResearchAdvisor(event) {
  return detectResearchTriggers(event).length > 0;
}

export function buildAdvisorContext({ event, transcript = [] }) {
  return {
    pair: "research",
    mode: "research",
    event,
    triggers: detectResearchTriggers(event),
    transcript_slice: transcript.slice(-6),
  };
}

export function validateAdvisorDecision(decision) {
  const allowed = new Set(["noop", "note", "steer", "block", "escalate"]);
  if (!decision || typeof decision !== "object") throw new Error("advisor decision must be an object");
  if (!allowed.has(decision.decision)) throw new Error(`invalid advisor decision: ${decision.decision}`);
  if (typeof decision.rule_id !== "string" || !decision.rule_id) throw new Error("advisor decision requires rule_id");
  if (typeof decision.message !== "string") throw new Error("advisor decision requires message");
  return decision;
}

export function researchAdvisorResponder(context) {
  const text = context.event.text ?? "";
  const triggers = context.triggers ?? [];
  const hasCitation = citationPattern.test(text);

  if (triggers.includes("citation_sensitive_claim") && !hasCitation) {
    return validateAdvisorDecision({
      decision: "steer",
      rule_id: "missing-official-citation",
      severity: "advise",
      title: "Official citation needed",
      message: "Verify the current model/context/pricing claim against an official source and cite it before finalizing.",
      evidence: { event_id: context.event.event_id, transcript_refs: [context.event.turn_id] },
      required_driver_response: "accept-or-reject",
    });
  }

  if (/oauth/i.test(text) && /same|different|higher|lower|unlimited/i.test(text) && !hasCitation) {
    return validateAdvisorDecision({
      decision: "steer",
      rule_id: "oauth-api-caveat",
      severity: "advise",
      title: "OAuth/API distinction needs qualification",
      message: "Qualify OAuth or product-level limit claims unless an official source directly supports the distinction.",
      evidence: { event_id: context.event.event_id, transcript_refs: [context.event.turn_id] },
      required_driver_response: "accept-or-reject",
    });
  }

  if (triggers.includes("uncertainty_or_conflict")) {
    return validateAdvisorDecision({
      decision: "note",
      rule_id: "preserve-uncertainty",
      severity: "info",
      title: "Preserve uncertainty",
      message: "Keep the uncertainty visible unless subsequent official sources resolve it.",
      evidence: { event_id: context.event.event_id, transcript_refs: [context.event.turn_id] },
      required_driver_response: "acknowledge",
    });
  }

  return validateAdvisorDecision({
    decision: "noop",
    rule_id: "sourced-or-low-risk",
    severity: "info",
    title: "No advisor action",
    message: "No intervention needed for this event.",
    evidence: { event_id: context.event.event_id, transcript_refs: [context.event.turn_id] },
    required_driver_response: "none",
  });
}

export function renderSteeringMessage({ pair = "research", mode = "research", authority = "advise", decision }) {
  return `[Pair Advisor: ${pair} | mode: ${mode} | authority: ${authority} | decision: ${decision.decision} | rule: ${decision.rule_id} | event: ${decision.evidence?.event_id ?? "unknown"}]\n\n${decision.message}\n\nDriver response required: ${decision.required_driver_response}.`;
}

function summarizeText(text, max = 280) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No final driver text captured.";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function buildPairCompactResult({ run, pair = "research", status = "success", finalText, decisions = [], handling = [] }) {
  const interventions = decisions.filter((decision) => ["steer", "block", "escalate"].includes(decision.decision));
  const noopCount = decisions.filter((decision) => decision.decision === "noop").length;
  const openRisks = decisions
    .filter((decision) => decision.decision === "note" || decision.decision === "escalate")
    .map((decision) => `${decision.title}: ${decision.message}`);
  return {
    status,
    summary: interventions.length > 0
      ? `${pair} pair completed after ${interventions.length} advisor intervention(s); final handling: ${handling.at(-1)?.handling ?? "unknown"}.`
      : `${pair} pair completed with ${noopCount} advisor check(s) and no steering required.`,
    driver_result: summarizeText(finalText),
    advisor_result: decisions.length === 0
      ? "Advisor was not invoked; detector found no high-value triggers."
      : decisions.map((decision) => `${decision.decision}:${decision.rule_id} — ${decision.title}`).join("; "),
    open_risks: openRisks,
    artifacts: {
      run_dir: run.relativeRunDir,
      report: `${run.relativeRunDir}/report.md`,
      events: `${run.relativeRunDir}/events.jsonl`,
      messages: `${run.relativeRunDir}/messages.jsonl`,
      compact_result: `${run.relativeRunDir}/compact-result.json`,
    },
  };
}

export function renderPairReport({ title = "Research Pair Run", task = "", compact, handling = [] }) {
  const handlingText = handling.length
    ? handling.map((item) => `- ${item.handling}: ${item.rationale}`).join("\n")
    : "None recorded.";
  return `# ${title}\n\nTask: ${task}\n\nStatus: ${compact.status}\n\n## Driver result\n\n${compact.driver_result}\n\n## Advisor result\n\n${compact.advisor_result}\n\n## Driver handling\n\n${handlingText}\n\n## Open risks\n\n${compact.open_risks.length ? compact.open_risks.map((risk) => `- ${risk}`).join("\n") : "None recorded."}\n`;
}

export function runOfflineResearchHarness({ cwd = process.cwd(), transcript, runId = "offline-research", pair = "research" }) {
  const store = new ArtifactStore({ cwd });
  const run = store.createRun({ pair, mode: "research", runId });
  store.writePairMetadata(run, { authority: "observe", offline: true });
  const decisions = [];
  let finalText = "";
  for (const [index, text] of transcript.entries()) {
    finalText = text;
    store.appendDriverTranscript(run, `## turn-${index + 1}\n\n${text}\n`);
    const event = createDriverTurnEvent({ turnId: `turn-${index + 1}`, text });
    const triggers = detectResearchTriggers(event);
    store.appendEvent(run, { type: "driver.turn", event, triggers });
    if (!triggers.length) continue;
    const context = buildAdvisorContext({ event, transcript: transcript.slice(0, index + 1) });
    const decision = researchAdvisorResponder(context);
    decisions.push(decision);
    store.appendAdvisorTranscript(run, `## ${event.event_id}\n\n${JSON.stringify(decision, null, 2)}\n`);
    store.appendMessage(run, { type: "advisor.decision", decision });
    if (decision.decision === "steer" || decision.decision === "block" || decision.decision === "escalate") {
      store.appendMessage(run, { type: "steering.rendered", text: renderSteeringMessage({ decision }) });
    }
  }
  const status = decisions.some((d) => d.decision === "block" || d.decision === "escalate") ? "blocked" : "success";
  const compact = buildPairCompactResult({ run, pair, status, finalText, decisions });
  store.writeReport(run, renderPairReport({ title: "Offline Research Pair Harness", task: "offline fixture", compact }));
  store.writeCompactResult(run, compact);
  store.appendIndex(run, { status, summary: compact.summary });
  return { run, compact, decisions };
}
