#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const caseIntakeRoot = path.join(root, "src/skills/case-intake");
const fixtureRoot = path.join(caseIntakeRoot, "resources/fixtures/snapshot/mixed-intake");
const generatedTargets = ["pi", "codex", "opencode"];
const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function parseBlocks(markdown, expression) {
  const headings = [...markdown.matchAll(expression)];
  return headings.map((heading, index) => {
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const fields = new Map();
    for (const field of markdown.slice(bodyStart, bodyEnd).matchAll(/^- \*\*(.+?):\*\* (.+)$/gm)) fields.set(field[1], field[2]);
    return { id: heading[1], label: heading[2], fields };
  });
}

function parseFrontmatter(markdown) {
  return new Map([...markdown.matchAll(/^([a-z_]+): (.+)$/gm)].map((match) => [match[1], match[2]]));
}

function hasApprovedSemanticEntry(entries) {
  return entries.some((entry) => entry.fields.get("Approval")?.startsWith("APR-"));
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function manifestEntryIds(manifest) {
  return [...manifest.matchAll(/^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): /gm)].map((match) => match[1]);
}

const [skill, approval, snapshotContract, ledger, responses, cases, manifests, approvalEvents, invalidCases] = await Promise.all([
  readFile(path.join(caseIntakeRoot, "SKILL.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/author-approval.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/first-snapshot.md"), "utf8"),
  readFile(path.join(fixtureRoot, "pre-approval-case.md"), "utf8"),
  Promise.all(["approve", "correct", "reject", "defer", "research", "no-approval"].map(async (name) => [
    name,
    await readFile(path.join(fixtureRoot, name, "author-response.md"), "utf8"),
  ])),
  Promise.all(["approve", "correct", "reject", "defer", "research", "no-approval"].map(async (name) => [
    name,
    await readFile(path.join(fixtureRoot, name, "CASE.md"), "utf8"),
  ])),
  Promise.all(["approve", "correct"].map(async (name) => [
    name,
    await readFile(path.join(fixtureRoot, name, "snapshots/SNAP-001.entries.md"), "utf8"),
  ])),
  Promise.all(["approve", "correct"].map(async (name) => [
    name,
    await readFile(path.join(fixtureRoot, name, "approvals/APR-001.md"), "utf8"),
  ])),
  Promise.all(["post-snapshot-mutation", "missing-authority"].map(async (name) => [
    name,
    await readFile(path.join(fixtureRoot, "invalid", name, "CASE.md"), "utf8"),
  ])),
]);

assert(skill.includes("resources/first-snapshot.md"), "case-intake must load the first snapshot contract after author review");
assert(approval.includes("Accept, correct, reject, defer, or request bounded research"), "author review must offer all supported author outcomes");
for (const phrase of ["intake-approved", "Author status", "Entries", "Supersedes", "Artifacts", "none"]) {
  assert(snapshotContract.includes(phrase), `first snapshot contract must govern ${phrase}`);
}
assert(snapshotContract.includes("Do not create a pending or provisional semantic snapshot."), "first snapshot contract must prohibit provisional snapshots");
assert(snapshotContract.includes("required material approval is missing"), "first snapshot contract must gate missing material approval");
for (const phrase of ["SHA-256", "durable approval event", "exact final wording", "later correction, supersession", "cannot modify `SNAP-001` content"]) assert(snapshotContract.includes(phrase), `first snapshot contract must govern ${phrase}`);
for (const phrase of ["Authority", "Author", "Recorded", "Locator", "Final wording", "source-derived provenance"]) assert(approval.includes(phrase), `author approval contract must bind ${phrase}`);

const preApprovalEntries = parseBlocks(ledger, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
assert(!hasApprovedSemanticEntry(preApprovalEntries), "pre-approval ledger must not claim author approval");
assert(!ledger.includes("### SNAP-001:"), "pre-approval ledger must not contain a snapshot");

const responseByName = new Map(responses);
const caseByName = new Map(cases);
for (const [name, response] of responseByName) {
  if (name === "no-approval") assert(response.includes("No author response was supplied."), "no-approval fixture must represent an absent response rather than a simulated outcome");
  else assert(/^# Author Response\n\n- \*\*Outcome:\*\* (approve|correct|reject|defer|research)$/m.test(response), `${name} fixture must record an explicit author outcome`);
}

const manifestByName = new Map(manifests);
const approvalEventByName = new Map(approvalEvents);
for (const name of ["approve", "correct"]) {
  const markdown = caseByName.get(name);
  const frontmatter = parseFrontmatter(markdown);
  const entries = parseBlocks(markdown, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
  const snapshots = parseBlocks(markdown, /^### (SNAP-\d{3}): (.+)$/gm);
  const snapshot = snapshots.find((item) => item.id === "SNAP-001");

  assert(frontmatter.get("working_state") === "active", `${name} accepted Case must become active`);
  assert(frontmatter.get("current_snapshot") === "SNAP-001", `${name} accepted Case must point to SNAP-001`);
  assert(snapshot, `${name} accepted Case must create SNAP-001`);
  assert(snapshot?.fields.get("Created") === "2026-07-15", `${name} snapshot must retain the recorded creation date`);
  assert(snapshot?.fields.get("Reason") === "intake-approved", `${name} snapshot reason must be intake-approved`);
  assert(snapshot?.fields.get("Author status") === "accepted", `${name} snapshot must record accepted author status`);
  assert(snapshot?.fields.get("Approval") === "APR-001", `${name} snapshot must bind a durable author approval event`);
  assert(/^manifest: snapshots\/SNAP-001\.entries\.md \(sha256:[a-f0-9]{64}\)$/.test(snapshot?.fields.get("Entries") || ""), `${name} snapshot must bind a digest-addressed immutable entry manifest`);
  assert(snapshot?.fields.get("Supersedes") === "none", `${name} first snapshot must name no prior snapshot`);
  assert(snapshot?.fields.get("Artifacts") === "none", `${name} snapshot must have no artifact references`);
  assert(hasApprovedSemanticEntry(entries), `${name} accepted Case must preserve author-approved provenance`);
  assert(entries.some((entry) => entry.id === "DEC-001" && entry.fields.get("Approval") === "APR-001"), `${name} accepted decision must bind author authority`);
  const manifest = manifestByName.get(name);
  const manifestEntries = manifestEntryIds(manifest);
  assert(manifestEntries.length !== 0, `${name} immutable manifest must list accepted-state entries`);
  assert(manifestEntries.length === new Set(manifestEntries).size, `${name} immutable manifest must not duplicate entry IDs`);
  assert(manifestEntries.every((id) => entries.some((entry) => entry.id === id)), `${name} immutable manifest must reference only Case entries`);
  assert(manifestEntries.every((id) => !entries.some((entry) => entry.id === id && entry.fields.get("Status") === "rejected")), `${name} immutable manifest must exclude rejected entries`);
  assert(manifestEntries.every((id) => manifest.includes(entries.find((entry) => entry.id === id)?.fields.get("Statement") || "")), `${name} immutable manifest must embed each accepted entry representation`);
  const digest = snapshot?.fields.get("Entries")?.match(/sha256:([a-f0-9]{64})/)?.[1];
  assert(digest === sha256(manifest), `${name} snapshot manifest digest must match immutable manifest bytes`);
  const event = approvalEventByName.get(name);
  for (const field of ["Authority", "Author", "Recorded", "Locator", "Outcome", "Approved entries", "Final wording"]) assert(event.includes(`**${field}:**`), `${name} approval event must include ${field}`);
  assert(event.includes("**Authority:** author"), `${name} approval event must identify author authority`);
  assert(event.includes("**Locator:** queue/author-review.md#APR-001"), `${name} approval event must retain a durable locator`);
  assert(event.includes(entries.find((entry) => entry.id === "DEC-001")?.fields.get("Statement") || ""), `${name} approval event must bind the exact final decision wording`);
  assert(entries.find((entry) => entry.id === "DEC-001")?.fields.get("Provenance") === "agent-synthesized", `${name} decision must preserve source-derived provenance`);
}

const approved = caseByName.get("approve");
assert(approved.includes("- **Statement:** Register every supplied artifact before extracting semantic entries."), "approve must retain the explicitly accepted proposal");
const corrected = caseByName.get("correct");
assert(corrected.includes("- **Statement:** Register accessible supplied artifacts before extracting semantic entries."), "correct must apply the author-corrected semantic meaning");
assert(!corrected.includes("- **Statement:** Register every supplied artifact before extracting semantic entries."), "correct must not retain the superseded proposal as accepted meaning");

for (const name of ["reject", "defer", "research", "no-approval"]) {
  const markdown = caseByName.get(name);
  const frontmatter = parseFrontmatter(markdown);
  const entries = parseBlocks(markdown, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
  assert(frontmatter.get("current_snapshot") === "none", `${name} must not create SNAP-001 without accepted material meaning`);
  assert(!markdown.includes("### SNAP-001:"), `${name} must not create a pending or provisional snapshot`);
  assert(!entries.some((entry) => entry.id === "DEC-001" && entry.fields.get("Status") === "accepted"), `${name} must not create an accepted decision`);
  assert(!hasApprovedSemanticEntry(entries), `${name} must not fake author-approved provenance`);
}

const rejectedEntries = parseBlocks(caseByName.get("reject"), /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
assert(rejectedEntries.some((entry) => entry.id === "ALT-001" && entry.fields.get("Status") === "rejected"), "reject must preserve the proposal as a rejected alternative");
const deferredEntries = parseBlocks(caseByName.get("defer"), /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
assert(deferredEntries.some((entry) => entry.id === "GAP-001" && entry.fields.get("Status") === "open"), "defer must preserve the unresolved material gap");
const researchEntries = parseBlocks(caseByName.get("research"), /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
assert(researchEntries.some((entry) => entry.id === "GAP-001" && entry.fields.get("Status") === "open"), "research must preserve the evidence gap");
assert(researchEntries.some((entry) => entry.id === "ACT-001" && entry.fields.get("Status") === "open" && entry.fields.get("Statement")?.includes("only the accessible stakeholder interview notes")), "research must create a bounded research action");

const invalidCaseByName = new Map(invalidCases);
const mutated = invalidCaseByName.get("post-snapshot-mutation");
assert(mutated.includes("sha256:0000000000000000000000000000000000000000000000000000000000000000"), "post-snapshot mutation fixture must expose a stale manifest digest");
assert(sha256(await readFile(path.join(fixtureRoot, "invalid/post-snapshot-mutation/snapshots/SNAP-001.entries.md"), "utf8")) !== "0000000000000000000000000000000000000000000000000000000000000000", "post-snapshot mutation must fail digest validation instead of rewriting SNAP-001");
const missingAuthority = invalidCaseByName.get("missing-authority");
assert(missingAuthority.includes("**Authority:** source-speaker"), "missing-authority fixture must use a non-author authority");
assert(missingAuthority.includes("current_snapshot: none"), "non-author authority must not create a snapshot");

for (const target of generatedTargets) {
  const generatedRoot = path.join(root, "adapters", target, "generated/skills/case-intake");
  for (const relative of ["SKILL.md", "resources/author-approval.md", "resources/first-snapshot.md", "resources/fixtures/snapshot/mixed-intake/pre-approval-case.md", "resources/fixtures/snapshot/mixed-intake/approve/author-response.md", "resources/fixtures/snapshot/mixed-intake/approve/approvals/APR-001.md", "resources/fixtures/snapshot/mixed-intake/approve/CASE.md", "resources/fixtures/snapshot/mixed-intake/approve/snapshots/SNAP-001.entries.md", "resources/fixtures/snapshot/mixed-intake/correct/author-response.md", "resources/fixtures/snapshot/mixed-intake/correct/approvals/APR-001.md", "resources/fixtures/snapshot/mixed-intake/correct/CASE.md", "resources/fixtures/snapshot/mixed-intake/correct/snapshots/SNAP-001.entries.md", "resources/fixtures/snapshot/mixed-intake/reject/author-response.md", "resources/fixtures/snapshot/mixed-intake/reject/CASE.md", "resources/fixtures/snapshot/mixed-intake/defer/author-response.md", "resources/fixtures/snapshot/mixed-intake/defer/CASE.md", "resources/fixtures/snapshot/mixed-intake/research/author-response.md", "resources/fixtures/snapshot/mixed-intake/research/CASE.md", "resources/fixtures/snapshot/mixed-intake/no-approval/author-response.md", "resources/fixtures/snapshot/mixed-intake/no-approval/CASE.md", "resources/fixtures/snapshot/mixed-intake/invalid/post-snapshot-mutation/CASE.md", "resources/fixtures/snapshot/mixed-intake/invalid/missing-authority/CASE.md"]) {
    try {
      const [source, generated] = await Promise.all([readFile(path.join(caseIntakeRoot, relative), "utf8"), readFile(path.join(generatedRoot, relative), "utf8")]);
      if (relative === "SKILL.md") {
        assert(generated.includes("<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->"), `${target} generated SKILL.md must include the generated header`);
        assert(generated.endsWith(skill.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart()), `${target} generated SKILL.md body must match canonical source`);
      } else assert(generated === source, `${target} generated ${relative} must match canonical source`);
    } catch (error) {
      fail(`${target} generated ${relative} must exist and match canonical source: ${error.message}`);
    }
  }
}

if (errors.length !== 0) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log("case-intake first snapshot fixture: ok");
