#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const reconcileRoot = path.join(root, "src/skills/case-reconcile");
const fixtureRoot = path.join(reconcileRoot, "resources/fixtures/reconciliation");
const targets = JSON.parse(await readFile(path.join(root, "config/targets.json"), "utf8")).targets;
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function blocks(markdown, expression) {
  const headings = [...markdown.matchAll(expression)];
  return headings.map((heading, index) => {
    const end = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const fields = new Map();
    for (const field of markdown.slice(heading.index + heading[0].length, end).matchAll(/^- \*\*(.+?):\*\* (.+)$/gm)) fields.set(field[1], field[2]);
    return { id: heading[1], label: heading[2], fields };
  });
}

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(file));
    else files.push(file);
  }
  return files;
}

const [skill, contract, fixture, manifestOne, manifestTwo, mechanical, material, accepted, supersession, staleness, trace, blocking, duplicates] = await Promise.all([
  readFile(path.join(reconcileRoot, "SKILL.md"), "utf8"),
  readFile(path.join(reconcileRoot, "resources/reconciliation.md"), "utf8"),
  readFile(path.join(fixtureRoot, "CASE.md"), "utf8"),
  readFile(path.join(fixtureRoot, "snapshots/SNAP-001.entries.md"), "utf8"),
  readFile(path.join(fixtureRoot, "snapshots/SNAP-002.entries.md"), "utf8"),
  readFile(path.join(fixtureRoot, "mechanical-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "material-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "accepted-semantic-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "supersession-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "staleness-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "artifacts/review-brief/artifact.trace.md"), "utf8"),
  readFile(path.join(fixtureRoot, "blocking-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "duplicate-findings.md"), "utf8"),
]);

assert(skill.includes("resources/reconciliation.md"), "case-reconcile must load its reconciliation contract");
for (const phrase of ["semantic update ownership", "blocking", "phase-batched", "low-risk mechanical", "agent consensus", "delegation declaration locator", "later immutable Case snapshot"]) {
  assert(contract.includes(phrase), `reconciliation contract must govern ${phrase}`);
}
for (const phrase of ["snapshot creation alone does not make an artifact stale", "without overwriting", "Historical entries remain inspectable", "Staleness Notice", "review-after"]) {
  assert(contract.includes(phrase), `reconciliation contract must define ${phrase}`);
}
for (const trigger of ["captured source changes", "outdated, revoked, deprecated", "new evidence contradicts", "pinned trace support changes"]) {
  assert(contract.includes(trigger), `reconciliation contract must define the ${trigger} staleness trigger`);
}

const entries = blocks(fixture, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
const snapshots = blocks(fixture, /^### (SNAP-\d{3}): (.+)$/gm);
const snapshotOne = snapshots.find((snapshot) => snapshot.id === "SNAP-001");
assert(entries.some((entry) => entry.id === "OBS-001" && entry.fields.get("Status") === "current"), "fixture must retain the accepted source observation");
assert(entries.some((entry) => entry.id === "REQ-001" && entry.fields.get("Status") === "accepted"), "fixture must retain the accepted requirement");
assert(snapshotOne?.fields.get("Approval") === "APR-001", "starting fixture must bind durable APR-001");
assert(snapshotOne?.fields.get("Entries")?.includes(sha256(manifestOne)), "starting fixture manifest digest must match immutable bytes");
for (const field of ["Authority", "Author", "Recorded", "Locator", "Outcome", "Approved entries", "Final wording"]) assert(fixture.includes(`**${field}:**`), `starting durable approval must include ${field}`);

assert(mechanical.includes("**Materiality:** low"), "mechanical correction must be low materiality");
assert(mechanical.includes("**Outcome:** applied"), "safe mechanical correction must apply without author approval");
assert(mechanical.includes("**Snapshot:** unchanged"), "mechanical correction must not create a snapshot");
assert(!mechanical.includes("APR-"), "mechanical correction must not manufacture author approval");
assert(!mechanical.includes("Supersedes"), "mechanical correction must not manufacture supersession");

assert(material.includes("**Materiality:** high"), "semantic requirement change must be high materiality");
assert(material.includes("**Outcome:** queued for author approval"), "material change must wait for author approval");
assert(material.includes("**Snapshot:** unchanged"), "unapproved material change must not create a snapshot");
assert(material.includes("phase-batched"), "nonblocking material question must join the phase batch");
assert(!material.includes("**Provenance:** author-approved"), "agent proposal must not become author-approved meaning");

const acceptedSnapshots = blocks(accepted, /^### (SNAP-\d{3}): (.+)$/gm);
const snapshotTwo = acceptedSnapshots.find((snapshot) => snapshot.id === "SNAP-002");
const snapshotTwoEntries = blocks(manifestTwo, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
assert(accepted.includes("**Outcome:** applied after author approval"), "accepted semantic change must wait for durable approval");
assert(snapshotTwo?.fields.get("Supersedes") === "SNAP-001", "accepted semantic change must create a later snapshot");
assert(snapshotTwo?.fields.get("Entries")?.includes(sha256(manifestTwo)), "later snapshot manifest digest must match immutable bytes");
for (const id of ["OBS-001", "REQ-001", "REQ-002"]) assert(snapshotTwoEntries.some((entry) => entry.id === id), `later snapshot must retain resulting accepted entry ${id}`);
assert(snapshotTwoEntries.find((entry) => entry.id === "REQ-001")?.fields.get("Status") === "superseded", "later complete-state snapshot must retain superseded historical entries");
assert(!manifestTwo.includes("OBS-002") && !manifestTwo.includes("ALT-001"), "later snapshot must exclude unrelated superseded and rejected entries");
assert(accepted.includes("**Artifacts:** none affected") && accepted.includes("**Staleness:** none"), "semantic snapshots must not require affected or stale artifacts");
for (const field of ["Authority", "Author", "Recorded", "Locator", "Outcome", "Approved entries", "Final wording", "Delegation declaration locator", "Delegation scope"]) assert(accepted.includes(`**${field}:**`), `delegated approval must include ${field}`);

const supersededEntries = blocks(supersession, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
const supersededRequirement = supersededEntries.find((entry) => entry.id === "REQ-001");
const successorRequirement = supersededEntries.find((entry) => entry.id === "REQ-002");
assert(supersededRequirement?.fields.get("Status") === "superseded", "prior accepted requirement must remain inspectable as superseded");
assert(successorRequirement?.fields.get("Status") === "accepted", "successor requirement must become the accepted current meaning");
assert(successorRequirement?.fields.get("Relations") === "supersedes REQ-001", "successor requirement must link to the historical requirement");
assert(supersession.includes("**Outcome:** applied after author approval"), "semantic supersession must require durable approval");
assert(supersession.includes("**Snapshot:** SNAP-002"), "approved semantic supersession must create a later snapshot");
assert(supersession.includes("**Overwrite:** none"), "semantic supersession must not overwrite accepted history");
assert(manifestOne.includes("### REQ-001:") && manifestTwo.includes("### REQ-002:"), "each immutable snapshot manifest must preserve its own accepted state");

const notices = blocks(staleness, /^### (STALE-\d{3}): (.+)$/gm);
assert(notices.length === 1, "fixture must consolidate the affected trace support into one staleness notice");
assert(notices[0]?.fields.get("Affected entries") === "REQ-001, REQ-002", "staleness notice must identify changed and successor entries");
assert(notices[0]?.fields.get("Affected artifacts") === "review-brief/artifact.md", "staleness notice must identify the affected artifact");
assert(notices[0]?.fields.get("Affected units") === "AU-001", "staleness notice must identify affected trace units");
assert(notices[0]?.fields.get("Disposition") === "review before reader action", "staleness notice must preserve the required reader-action review");
assert(trace.includes("**Canonical support:** reconciliation-fixture/SNAP-001/REQ-001"), "trace fixture must pin support to the historical snapshot");
assert(trace.includes("**Trace state:** model-changed"), "changed pinned support must mark the trace state stale");

const blockingEntries = blocks(blocking, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
for (const id of ["REQ-003", "GAP-001"]) assert(blockingEntries.some((entry) => entry.id === id), `blocking fixture must preserve ${id}`);
assert(blockingEntries.find((entry) => entry.id === "REQ-003")?.fields.get("Relations") === "contradicts REQ-001", "opposed entries must link directly with contradicts");
assert(blockingEntries.find((entry) => entry.id === "GAP-001")?.fields.get("Relations") === "derived-from REQ-001, REQ-003", "contradiction must create a derived GAP");
for (const finding of ["FIND-003", "FIND-006", "FIND-007", "FIND-008"]) {
  const section = blocking.slice(blocking.indexOf(`### ${finding}:`));
  assert(section.includes("**Materiality:** blocking"), `${finding} must be blocking`);
  assert(section.includes("**Disposition:** immediate interrupt"), `${finding} must interrupt immediately`);
  assert(section.includes("**Downstream work:** halted"), `${finding} must halt downstream work`);
}

const reports = blocks(duplicates, /^### (REV-\d{3}): (.+)$/gm);
const findings = blocks(duplicates, /^### (FIND-\d{3}): (.+)$/gm);
assert(reports.length === 2, "duplicate fixture must start with two independent reports");
assert(findings.length === 1, "duplicate semantic findings must consolidate into one finding");
assert(findings[0]?.fields.get("Reports") === "REV-001, REV-002", "consolidated finding must retain every report locator");
assert(findings[0]?.fields.get("Evidence") === "artifact.md#claim; SRC-004 / unavailable source", "consolidated finding must preserve combined evidence");
assert(findings[0]?.fields.get("Affected entries") === "REQ-001", "consolidated finding must preserve affected entries without multiplication");
assert(findings[0]?.fields.get("Affected artifacts") === "review-brief", "consolidated finding must preserve affected artifacts without multiplication");
assert(findings[0]?.fields.get("Authority") === "none", "reviewer agreement must not claim author authority");
assert(findings[0]?.fields.get("Priority") === "high", "duplicate reports must not multiply priority");

const sourceFiles = await filesUnder(reconcileRoot);
const sourceRelativeFiles = sourceFiles.map((file) => path.relative(reconcileRoot, file)).sort();
for (const target of targets) {
  const generatedRoot = path.join(root, "adapters", target, "generated/skills/case-reconcile");
  const generatedRelativeFiles = (await filesUnder(generatedRoot)).map((file) => path.relative(generatedRoot, file)).sort();
  assert(JSON.stringify(generatedRelativeFiles) === JSON.stringify(sourceRelativeFiles), `${target} generated case-reconcile tree must match canonical files`);
  for (const sourceFile of sourceFiles) {
    const relative = path.relative(reconcileRoot, sourceFile);
    const generatedFile = path.join(generatedRoot, relative);
    try {
      const [source, generated] = await Promise.all([readFile(sourceFile, "utf8"), readFile(generatedFile, "utf8")]);
      if (relative === "SKILL.md") {
        assert(generated.includes("<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->"), `${target} generated SKILL.md must include the generated header`);
        assert(generated.endsWith(skill.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart()), `${target} generated SKILL.md body must match canonical source`);
      } else assert(generated === source, `${target} generated ${relative} must match canonical source`);
    } catch (error) {
      errors.push(`${target} generated ${relative} must exist and match canonical source: ${error.message}`);
    }
  }
}

if (errors.length !== 0) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log("case-reconcile contract fixture: ok");
