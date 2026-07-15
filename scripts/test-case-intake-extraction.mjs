#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const caseIntakeRoot = path.join(root, "src/skills/case-intake");
const fixtureDir = path.join(caseIntakeRoot, "resources/fixtures/extraction/mixed-intake");
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

function entriesById(entries) {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function assertEntry(entries, id, expected) {
  const entry = entries.get(id);
  assert(entry, `${id} must exist`);
  for (const [field, value] of Object.entries(expected)) assert(entry?.fields.get(field) === value, `${id} ${field} must be ${value}`);
}

const [skill, extractionContract, approvalContract, ledger, authorReview] = await Promise.all([
  readFile(path.join(caseIntakeRoot, "SKILL.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/entry-extraction.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/author-approval.md"), "utf8"),
  readFile(path.join(fixtureDir, "expected-case.md"), "utf8"),
  readFile(path.join(fixtureDir, "expected-author-review.md"), "utf8"),
]);

assert(skill.includes("resources/entry-extraction.md"), "case-intake must load the extraction contract after source registration");
assert(skill.includes("resources/author-approval.md"), "case-intake must load the approval contract after extraction");
assert(!skill.includes("Create `SNAP-001`"), "case-intake must not create SNAP-001 in extraction behavior");

for (const type of ["OBS", "INT", "DEC", "REQ", "CON", "ALT", "RISK", "ASM", "GAP", "ACT", "VIS"]) assert(extractionContract.includes(`\`${type}\``), `extraction contract must govern ${type}`);
for (const provenance of ["source-direct", "source-quoted", "agent-inferred", "agent-synthesized", "author-stated", "author-approved"]) assert(extractionContract.includes(`\`${provenance}\``), `extraction contract must govern ${provenance}`);

const entries = entriesById(parseBlocks(ledger, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS|POL)-\d{3}): (.+)$/gm));
assert(entries.size >= 15, "fixture must exercise a broad extraction ledger");
for (const entry of entries.values()) {
  for (const field of ["Statement", "Status", "Provenance", "Sources"]) assert(entry.fields.has(field), `${entry.id} must include canonical ${field}`);
  assert(/^SRC-\d{3}(?: \/ .+)?(?:; SRC-\d{3}(?: \/ .+)?)*$|^none: .+$/.test(entry.fields.get("Sources") || ""), `${entry.id} must retain source locator or author-origin reason`);
  assert(!/[.;]\s+(?:The |This |It )/.test(entry.fields.get("Statement") || ""), `${entry.id} statement must remain atomic rather than compound prose`);
}

assertEntry(entries, "OBS-001", { Status: "current", Provenance: "source-direct", Sources: "SRC-001 / author conversation notes" });
assertEntry(entries, "OBS-002", { Status: "current", Provenance: "source-quoted", Sources: "SRC-002 / 00:03:12-00:04:05" });
assertEntry(entries, "OBS-003", { Status: "current", Provenance: "agent-inferred", Sources: "SRC-002 / 00:18:12-00:18:44" });
assertEntry(entries, "OBS-004", { Status: "current", Provenance: "agent-synthesized", Sources: "SRC-002 / 00:03:12-00:04:05; SRC-007 / research summary" });
assertEntry(entries, "INT-001", { Status: "accepted", Provenance: "author-stated", Sources: "SRC-001 / author conversation notes" });
assertEntry(entries, "REQ-001", { Status: "proposed", Provenance: "source-direct", Sources: "SRC-004 / description" });
assertEntry(entries, "OBS-005", { Status: "historical", Provenance: "source-direct", Sources: "SRC-003 / proposal section" });
assertEntry(entries, "OBS-006", { Status: "current", Provenance: "source-direct", Sources: "SRC-005 / parseCaseModel" });
assertEntry(entries, "OBS-007", { Status: "current", Provenance: "source-direct", Sources: "SRC-006 / cycle-time panel" });
assertEntry(entries, "INT-002", { Status: "proposed", Provenance: "source-direct", Sources: "SRC-003 / claimed benefit" });
assertEntry(entries, "ASM-001", { Status: "active", Provenance: "agent-inferred", Sources: "SRC-003 / claimed benefit" });
assertEntry(entries, "GAP-001", { Status: "open", Provenance: "agent-inferred", Sources: "SRC-003 / proposal section; SRC-004 / description" });
assertEntry(entries, "GAP-002", { Status: "open", Provenance: "agent-inferred", Sources: "SRC-008 / unavailable metadata" });
assertEntry(entries, "GAP-003", { Status: "open", Provenance: "agent-inferred", Sources: "SRC-002 / 00:18:12-00:18:44" });
assertEntry(entries, "POL-001", { Status: "proposed", Provenance: "source-direct", Sources: "SRC-004 / description" });

assert(entries.get("OBS-003")?.fields.get("Confidence") === "low", "weak transcript attribution must retain low confidence");
assert(entries.get("OBS-005")?.fields.get("Relations")?.includes("contradicts GAP-001"), "contradictory historical guidance must link to its gap");
assert(entries.get("REQ-001")?.fields.get("Relations")?.includes("contradicts GAP-001"), "conflicting ticket guidance must link to its gap");
assert(entries.get("INT-002")?.fields.get("Statement")?.includes("aims to"), "unsupported benefit must normalize to intended outcome");
assert(!entries.get("INT-002")?.fields.get("Statement")?.match(/reduces|improves|decreases/), "unsupported benefit must not appear as a measured observation");
assert(entries.get("ASM-001")?.fields.get("Statement")?.includes("has not been measured"), "unsupported benefit assumption must preserve missing evidence");

const extensions = parseBlocks(ledger, /^### (EXT-\d{3}): `([A-Z]+)` (.+)$/gm);
assert(extensions.length === 1, "fixture must govern its custom top-level type through one extension");
for (const field of ["Status", "Scope", "Semantics", "Why core types are insufficient", "Owner", "Introduced", "Example", "Promotion evidence"]) assert(extensions[0]?.fields.has(field), `custom type extension must include ${field}`);
assert(extensions[0]?.fields.get("Example")?.includes("POL-001"), "custom type extension must govern the fixture custom entry");

assert(authorReview.includes("What I extracted as current intent:"), "author review must present extracted intent");
assert(authorReview.includes("What I would treat as accepted decisions:"), "author review must present proposed binding content");
const questions = [...authorReview.matchAll(/^\d+\. /gm)];
assert(questions.length >= 3 && questions.length <= 7, "author review must contain only three to seven material questions");
assert(authorReview.includes("recommend"), "author review questions must include evidence-backed recommendations");
assert(!authorReview.includes("SNAP-001"), "author review must not imply that a snapshot already exists");
assert(!entries.has("DEC-001"), "pre-approval extraction must not create an accepted decision");
assert(![...entries.values()].some((entry) => entry.fields.get("Provenance") === "author-approved"), "pre-approval extraction must not claim author approval");

for (const target of generatedTargets) {
  const generatedRoot = path.join(root, "adapters", target, "generated/skills/case-intake");
  for (const relative of ["SKILL.md", "resources/entry-extraction.md", "resources/author-approval.md", "resources/fixtures/extraction/mixed-intake/expected-case.md", "resources/fixtures/extraction/mixed-intake/expected-author-review.md"]) {
    try {
      const [source, generated] = await Promise.all([readFile(path.join(caseIntakeRoot, relative), "utf8"), readFile(path.join(generatedRoot, relative), "utf8")]);
      if (relative !== "SKILL.md") assert(generated === source, `${target} generated ${relative} must match canonical source`);
      else assert(generated.includes("<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->"), `${target} generated skill must include its generated header`);
    } catch (error) {
      fail(`${target} generated ${relative} must exist and match canonical source: ${error.message}`);
    }
  }
}

if (errors.length !== 0) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log("case-intake extraction fixture: ok");
