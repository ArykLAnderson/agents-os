#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const caseIntakeRoot = path.join(root, "src/skills/case-intake");
const fixtureDir = path.join(caseIntakeRoot, "resources/fixtures/extraction/mixed-intake");
const generatedTargets = ["pi", "codex", "opencode"];
const errors = [];
const generatedHeader = "<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->";

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

function sourcePathFromLocator(locator) {
  if (!locator.startsWith("SRC-")) return null;
  return locator.split(" / ")[0];
}

function withoutFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

const [skill, extractionContract, approvalContract, ledger, authorReview, conversation, transcript, research] = await Promise.all([
  readFile(path.join(caseIntakeRoot, "SKILL.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/entry-extraction.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/author-approval.md"), "utf8"),
  readFile(path.join(fixtureDir, "expected-case.md"), "utf8"),
  readFile(path.join(fixtureDir, "expected-author-review.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/fixtures/source-bundles/mixed-intake/sources/conversation-notes.md"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/fixtures/source-bundles/mixed-intake/sources/planning-transcript.vtt"), "utf8"),
  readFile(path.join(caseIntakeRoot, "resources/fixtures/source-bundles/mixed-intake/sources/research-summary.md"), "utf8"),
]);

assert(skill.includes("resources/entry-extraction.md"), "case-intake must load the extraction contract after source registration");
assert(skill.includes("resources/author-approval.md"), "case-intake must load the approval contract after extraction");
assert(!skill.includes("Create `SNAP-001`"), "case-intake must not create SNAP-001 in extraction behavior");

for (const type of ["OBS", "INT", "DEC", "REQ", "CON", "ALT", "RISK", "ASM", "GAP", "ACT", "VIS"]) assert(extractionContract.includes(`\`${type}\``), `extraction contract must govern ${type}`);
for (const provenance of ["source-direct", "source-quoted", "agent-inferred", "agent-synthesized", "author-stated", "author-approved"]) assert(extractionContract.includes(`\`${provenance}\``), `extraction contract must govern ${provenance}`);

const entries = entriesById(parseBlocks(ledger, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm));
assert(entries.size >= 10, "fixture must exercise a broad extraction ledger");
for (const entry of entries.values()) {
  for (const field of ["Statement", "Status", "Provenance", "Sources"]) assert(entry.fields.has(field), `${entry.id} must include canonical ${field}`);
  assert(/^SRC-\d{3}(?: \/ .+)?(?:; SRC-\d{3}(?: \/ .+)?)*$|^none: .+$/.test(entry.fields.get("Sources") || ""), `${entry.id} must retain source locator or author-origin reason`);
  assert(!/[.;]\s+(?:The |This |It )/.test(entry.fields.get("Statement") || ""), `${entry.id} statement must remain atomic rather than compound prose`);
}

assertEntry(entries, "OBS-001", { Status: "current", Provenance: "source-direct", Sources: "SRC-001 / author conversation notes" });
assertEntry(entries, "OBS-002", { Status: "current", Provenance: "source-direct", Sources: "SRC-002 / 00:03:12-00:04:05" });
assertEntry(entries, "OBS-003", { Status: "current", Provenance: "agent-inferred", Sources: "SRC-002 / 00:18:12-00:18:44" });
assertEntry(entries, "OBS-004", { Status: "current", Provenance: "agent-synthesized", Sources: "SRC-002 / 00:03:12-00:04:05; SRC-007 / research summary" });
assertEntry(entries, "INT-001", { Status: "accepted", Provenance: "author-stated", Sources: "SRC-001 / author conversation notes" });
assertEntry(entries, "OBS-005", { Status: "historical", Provenance: "source-direct", Sources: "SRC-007 / historical workflow note" });
assertEntry(entries, "INT-002", { Status: "proposed", Provenance: "source-direct", Sources: "SRC-007 / claimed benefit" });
assertEntry(entries, "ASM-001", { Status: "active", Provenance: "agent-inferred", Sources: "SRC-007 / claimed benefit" });
assertEntry(entries, "GAP-001", { Status: "open", Provenance: "agent-inferred", Sources: "SRC-001 / author conversation notes; SRC-007 / historical workflow note" });
assertEntry(entries, "GAP-002", { Status: "open", Provenance: "agent-inferred", Sources: "SRC-008 / unavailable metadata" });
assertEntry(entries, "GAP-003", { Status: "open", Provenance: "agent-inferred", Sources: "SRC-002 / 00:18:12-00:18:44" });

assert(entries.get("OBS-003")?.fields.get("Confidence") === "low", "weak transcript attribution must retain low confidence");
assert(entries.get("OBS-001")?.fields.get("Relations")?.includes("supports INT-001"), "source observation must retain its support edge");
assert(entries.get("OBS-005")?.fields.get("Relations")?.includes("contradicts OBS-001"), "supported opposing claims must link directly as contradictions");
assert(entries.get("OBS-005")?.fields.get("Relations")?.includes("contradicts OBS-002"), "supported opposing claims must link directly as contradictions");
assert(entries.get("GAP-001")?.fields.get("Relations")?.includes("derived-from OBS-001"), "contradiction gap must derive from one opposing entry");
assert(entries.get("GAP-001")?.fields.get("Relations")?.includes("derived-from OBS-005"), "contradiction gap must derive from the other opposing entry");
assert(!entries.get("GAP-002")?.fields.get("Relations")?.includes("contradicts"), "unavailable content must create a missing-comparison gap rather than a fabricated contradiction");
assert(entries.get("INT-002")?.fields.get("Statement")?.includes("aims to"), "unsupported benefit must normalize to intended outcome");
assert(!entries.get("INT-002")?.fields.get("Statement")?.match(/reduces|improves|decreases/), "unsupported benefit must not appear as a measured observation");
assert(entries.get("ASM-001")?.fields.get("Statement")?.includes("has not been measured"), "unsupported benefit assumption must preserve missing evidence");

assert(ledger.includes("# Type Extensions\n\nNo extensions."), "fixture must not add an unjustified custom top-level type");
assert(!/^### (?!SRC|OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS|SNAP|EXT)[A-Z]+-\d{3}:/m.test(ledger), "fixture must reject undeclared custom entry types");
assert(extractionContract.includes("Do not use an undeclared custom top-level type."), "extraction contract must reject undeclared custom types");
for (const field of ["Status", "Scope", "Semantics", "Why core types are insufficient", "Owner", "Introduced", "Example", "Promotion evidence"]) assert(extractionContract.includes(`\`${field}\``), `custom type governance contract must require ${field}`);

const availableSourceText = new Map([
  ["SRC-001", conversation],
  ["SRC-002", transcript],
  ["SRC-007", research],
]);
for (const entry of entries.values()) {
  for (const locator of (entry.fields.get("Sources") || "").split("; ")) {
    const sourceId = sourcePathFromLocator(locator);
    if (!availableSourceText.has(sourceId)) continue;
    const text = availableSourceText.get(sourceId);
    if (entry.id === "OBS-001") assert(text.includes("register supplied artifacts before any semantic extraction"), "OBS-001 must be supported by supplied conversation text");
    if (entry.id === "OBS-002") assert(text.includes("source registration before extraction"), "OBS-002 must be supported by supplied transcript text");
    if (entry.id === "OBS-003") assert(text.includes("must not have inferred content"), "OBS-003 must be supported by supplied transcript text");
    if (entry.id === "OBS-005") assert(text.includes("extracting entries before source registration"), "OBS-005 must be supported by supplied research text");
    if (entry.id === "INT-002" || entry.id === "ASM-001") assert(text.includes("aims to reduce document review burden") && text.includes("does not include a measurement"), `${entry.id} must be supported by supplied research text`);
  }
}
assert(research.includes("Primary links are not expanded") && transcript.includes("must not have inferred content"), "OBS-004 synthesis must be supported by both supplied sources");
for (const entry of entries.values()) assert(!/(?:SRC-003|SRC-004|SRC-005|SRC-006) \/ (?:proposal section|description|parseCaseModel|cycle-time panel|claimed benefit)/.test(entry.fields.get("Sources") || ""), `${entry.id} must not infer content from metadata-only source records`);

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
      else {
        assert(generated.includes(generatedHeader), `${target} generated skill must include its generated header`);
        assert(generated.endsWith(withoutFrontmatter(skill).trimStart()), `${target} generated SKILL body must match canonical source`);
      }
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
