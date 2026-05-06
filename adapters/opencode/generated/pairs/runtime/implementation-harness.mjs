import { ArtifactStore } from "./artifact-store.mjs";
import { validateAdvisorDecision, renderSteeringMessage } from "./research-harness.mjs";

export function createImplementationEvent({ turnId, text, changedFiles = [], commandsRun = [], taskScope = "" }) {
  return {
    event_id: `impl-${turnId}`,
    turn_id: turnId,
    mode: "implementation",
    text,
    changed_files: changedFiles,
    commands_run: commandsRun,
    task_scope: taskScope,
    runtime_derived: true,
    detected_at: new Date().toISOString(),
  };
}

export function detectImplementationTriggers(event) {
  const text = event.text ?? "";
  const triggers = [];
  if (/\b(done|complete|completed|finished|implemented|fixed)\b/i.test(text)) triggers.push("completion_claim");
  if (/\b(test|tests|typecheck|build|lint|verified|validation|passes|pass)\b/i.test(text)) triggers.push("verification_claim");
  if ((event.changed_files ?? []).length > 0 || /changed files|files changed|modified/i.test(text)) triggers.push("changed_files_summary");
  if (/\b(along the way|also|while i was there|refactor(ed)?|cleanup|drive-by)\b/i.test(text)) triggers.push("scope_drift_signal");
  if (/\b(should pass|probably|did not run|skip(ped)? tests|trust me|assume)\b/i.test(text)) triggers.push("shortcut_taking_signal");
  if (event.task_scope && (event.changed_files ?? []).some((file) => !String(file).toLowerCase().includes(String(event.task_scope).toLowerCase().split(/\s+/)[0] ?? ""))) {
    triggers.push("unrelated_change_signal");
  }
  return [...new Set(triggers)];
}

export function buildImplementationAdvisorContext({ event, transcript = [] }) {
  return {
    pair: "implementation",
    mode: "implementation",
    event,
    triggers: detectImplementationTriggers(event),
    transcript_slice: transcript.slice(-6),
  };
}

export function implementationAdvisorResponder(context) {
  const { event, triggers = [] } = context;
  const text = event.text ?? "";
  const commands = event.commands_run ?? [];

  if (triggers.includes("verification_claim") && commands.length === 0 && /\b(complete|done|pass|passes|verified|should pass)\b/i.test(text)) {
    return validateAdvisorDecision({
      decision: "steer",
      rule_id: "completion-without-verification",
      severity: "advise",
      title: "Completion claim needs validation evidence",
      message: "Provide the exact validation command output before finalizing the implementation claim, or state that validation was not run.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
      required_driver_response: "accept-or-reject",
    });
  }

  if (triggers.includes("unrelated_change_signal") || /unrelated|also reformatted|while i was there/i.test(text)) {
    return validateAdvisorDecision({
      decision: "steer",
      rule_id: "unrelated-file-change",
      severity: "advise",
      title: "Unrelated changed files need justification",
      message: "Explain why the extra changed files are required for the assigned task, or revert/avoid the unrelated changes.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id], changed_files: event.changed_files },
      required_driver_response: "accept-or-reject",
    });
  }

  if (triggers.includes("scope_drift_signal")) {
    return validateAdvisorDecision({
      decision: "steer",
      rule_id: "scope-drift",
      severity: "advise",
      title: "Possible scope drift",
      message: "Confirm the work remains within the assigned vertical slice and remove or justify broader cleanup/refactor work.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
      required_driver_response: "accept-or-reject",
    });
  }

  if (triggers.includes("shortcut_taking_signal")) {
    return validateAdvisorDecision({
      decision: "steer",
      rule_id: "shortcut-taking",
      severity: "advise",
      title: "Shortcut or unsupported claim detected",
      message: "Replace assumptions with concrete evidence, or explicitly record the validation gap before completion.",
      evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
      required_driver_response: "accept-or-reject",
    });
  }

  return validateAdvisorDecision({
    decision: "noop",
    rule_id: "implementation-aligned",
    severity: "info",
    title: "Implementation event looks aligned",
    message: "No implementation advisor intervention needed for this event.",
    evidence: { event_id: event.event_id, transcript_refs: [event.turn_id] },
    required_driver_response: "none",
  });
}

export function runOfflineImplementationHarness({ cwd = process.cwd(), transcript, runId = "offline-implementation", pair = "implementation" }) {
  const store = new ArtifactStore({ cwd });
  const run = store.createRun({ pair, mode: "implementation", runId });
  store.writePairMetadata(run, { authority: "advise", offline: true });
  const decisions = [];
  for (const [index, item] of transcript.entries()) {
    const input = typeof item === "string" ? { text: item } : item;
    const event = createImplementationEvent({ turnId: `turn-${index + 1}`, ...input });
    const triggers = detectImplementationTriggers(event);
    store.appendEvent(run, { type: "driver.turn", event, triggers });
    if (!triggers.length) continue;
    const decision = implementationAdvisorResponder(buildImplementationAdvisorContext({ event, transcript: transcript.slice(0, index + 1) }));
    decisions.push(decision);
    store.appendMessage(run, { type: "advisor.decision", decision });
    if (["steer", "block", "escalate"].includes(decision.decision)) {
      store.appendMessage(run, { type: "steering.rendered", text: renderSteeringMessage({ pair, mode: "implementation", decision }) });
    }
  }
  const compact = {
    status: decisions.some((d) => d.decision === "block" || d.decision === "escalate") ? "blocked" : "success",
    summary: `Offline implementation harness processed ${transcript.length} turns with ${decisions.length} advisor decision(s).`,
    driver_result: "offline implementation fixture",
    advisor_result: decisions.map((d) => `${d.decision}:${d.rule_id}`).join("; ") || "advisor not invoked",
    open_risks: decisions.filter((d) => d.decision !== "noop").map((d) => d.title),
    artifacts: {
      run_dir: run.relativeRunDir,
      report: `${run.relativeRunDir}/report.md`,
      events: `${run.relativeRunDir}/events.jsonl`,
      messages: `${run.relativeRunDir}/messages.jsonl`,
      compact_result: `${run.relativeRunDir}/compact-result.json`,
    },
  };
  store.writeReport(run, `# Offline Implementation Pair Harness\n\n${compact.summary}\n\nAdvisor result: ${compact.advisor_result}\n`);
  store.writeCompactResult(run, compact);
  store.appendIndex(run, { status: compact.status, summary: compact.summary });
  return { run, compact, decisions };
}
