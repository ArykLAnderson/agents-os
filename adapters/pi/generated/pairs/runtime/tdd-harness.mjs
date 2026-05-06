import { ArtifactStore } from "./artifact-store.mjs";
import { validateAdvisorDecision, renderSteeringMessage } from "./research-harness.mjs";

export function createTddEvent({ turnId, text, changedFiles = [], testCommands = [], testFailure = "", phase = "unknown" }) {
  return {
    event_id: `tdd-${turnId}`,
    turn_id: turnId,
    mode: "tdd",
    text,
    changed_files: changedFiles,
    test_commands: testCommands,
    test_failure: testFailure,
    phase,
    runtime_derived: true,
    detected_at: new Date().toISOString(),
  };
}

export function detectTddTriggers(event) {
  const text = event.text ?? "";
  const triggers = ["every_driver_turn"];
  if (/\bred\b|failing test|test fails/i.test(text)) triggers.push("red_phase_claim");
  if (/\bgreen\b|tests pass|passing/i.test(text)) triggers.push("green_phase_claim");
  if (/\brefactor\b|cleanup/i.test(text)) triggers.push("refactor_phase_claim");
  if (event.test_failure || /syntaxerror|setup failed|cannot find module|import error/i.test(text)) triggers.push("test_failure_summary");
  if ((event.changed_files ?? []).some((file) => !String(file).includes("test") && !String(file).includes("spec"))) triggers.push("production_code_change");
  if (/delete(d)? test|weaken(ed)? test|changed the test to pass/i.test(text)) triggers.push("test_intent_change");
  return [...new Set(triggers)];
}

export function buildTddAdvisorContext({ event, transcript = [] }) {
  return {
    pair: "tdd",
    mode: "tdd",
    event,
    triggers: detectTddTriggers(event),
    transcript_slice: transcript.slice(-6),
  };
}

export function tddAdvisorResponder(context) {
  const event = context.event;
  const text = event.text ?? "";
  const triggers = context.triggers ?? [];

  if (triggers.includes("production_code_change") && !triggers.includes("red_phase_claim") && (event.test_commands ?? []).length === 0) {
    return validateAdvisorDecision({
      decision: "block",
      rule_id: "implementation-before-red",
      severity: "gate",
      title: "Production code changed before red test evidence",
      message: "Show a failing test written before the production change, or hold/revert production code until valid red exists.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id], changed_files: event.changed_files },
      required_driver_response: "resolve-before-continuing",
    });
  }

  if (triggers.includes("test_failure_summary") && /syntaxerror|setup|cannot find module|import/i.test(`${text}\n${event.test_failure}`)) {
    return validateAdvisorDecision({
      decision: "block",
      rule_id: "failing-test-wrong-reason",
      severity: "gate",
      title: "Red test fails for the wrong reason",
      message: "Fix the test or environment until the failure proves the intended missing behavior rather than setup/syntax/import failure.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
      required_driver_response: "resolve-before-continuing",
    });
  }

  if (triggers.includes("green_phase_claim") && /big refactor|rewrote|broad/i.test(text)) {
    return validateAdvisorDecision({
      decision: "block",
      rule_id: "non-minimal-green",
      severity: "gate",
      title: "Green change appears non-minimal",
      message: "Reduce the green change to the minimum needed to pass the red test, or justify why the broader change is required.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
      required_driver_response: "resolve-before-continuing",
    });
  }

  if (triggers.includes("test_intent_change")) {
    return validateAdvisorDecision({
      decision: "block",
      rule_id: "refactor-breaks-intent",
      severity: "gate",
      title: "Test intent may have been weakened",
      message: "Restore test intent and re-run the relevant tests before proceeding.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
      required_driver_response: "resolve-before-continuing",
    });
  }

  return validateAdvisorDecision({
    decision: "noop",
    rule_id: "tdd-discipline-ok",
    severity: "info",
    title: "TDD phase evidence looks coherent",
    message: "No TDD gate intervention needed for this event.",
    evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
    required_driver_response: "none",
  });
}

export function runOfflineTddHarness({ cwd = process.cwd(), transcript, runId = "offline-tdd", pair = "tdd" }) {
  const store = new ArtifactStore({ cwd });
  const run = store.createRun({ pair, mode: "tdd", runId });
  store.writePairMetadata(run, { authority: "gate", offline: true });
  const decisions = [];
  for (const [index, item] of transcript.entries()) {
    const input = typeof item === "string" ? { text: item } : item;
    const event = createTddEvent({ turnId: `turn-${index + 1}`, ...input });
    const triggers = detectTddTriggers(event);
    store.appendEvent(run, { type: "driver.turn", event, triggers });
    const decision = tddAdvisorResponder(buildTddAdvisorContext({ event, transcript: transcript.slice(0, index + 1) }));
    decisions.push(decision);
    store.appendMessage(run, { type: "advisor.decision", decision });
    if (["steer", "block", "escalate"].includes(decision.decision)) {
      store.appendMessage(run, { type: "steering.rendered", text: renderSteeringMessage({ pair, mode: "tdd", authority: "gate", decision }) });
    }
  }
  const compact = {
    status: decisions.some((d) => d.decision === "block" || d.decision === "escalate") ? "blocked" : "success",
    summary: `Offline TDD harness processed ${transcript.length} turns with ${decisions.length} advisor decision(s).`,
    driver_result: "offline TDD fixture",
    advisor_result: decisions.map((d) => `${d.decision}:${d.rule_id}`).join("; "),
    open_risks: decisions.filter((d) => d.decision !== "noop").map((d) => d.title),
    artifacts: {
      run_dir: run.relativeRunDir,
      report: `${run.relativeRunDir}/report.md`,
      events: `${run.relativeRunDir}/events.jsonl`,
      messages: `${run.relativeRunDir}/messages.jsonl`,
      compact_result: `${run.relativeRunDir}/compact-result.json`,
    },
  };
  store.writeReport(run, `# Offline TDD Pair Harness\n\n${compact.summary}\n\nAdvisor result: ${compact.advisor_result}\n`);
  store.writeCompactResult(run, compact);
  store.appendIndex(run, { status: compact.status, summary: compact.summary });
  return { run, compact, decisions };
}
