#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const reconcileRoot = path.join(root, "src/skills/case-reconcile");
const fixtureRoot = path.join(reconcileRoot, "resources/fixtures/reconciliation");
const generatedTargets = ["pi", "codex", "opencode"];
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
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

const [skill, contract, fixture, mechanical, material, blocking, duplicates] = await Promise.all([
  readFile(path.join(reconcileRoot, "SKILL.md"), "utf8"),
  readFile(path.join(reconcileRoot, "resources/reconciliation.md"), "utf8"),
  readFile(path.join(fixtureRoot, "CASE.md"), "utf8"),
  readFile(path.join(fixtureRoot, "mechanical-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "material-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "blocking-result.md"), "utf8"),
  readFile(path.join(fixtureRoot, "duplicate-findings.md"), "utf8"),
]);

assert(skill.includes("resources/reconciliation.md"), "case-reconcile must load its reconciliation contract");
for (const phrase of ["semantic update ownership", "blocking", "phase-batched", "low-risk mechanical", "agent consensus"]) {
  assert(contract.includes(phrase), `reconciliation contract must govern ${phrase}`);
}
assert(contract.includes("author or explicitly declared delegated authority"), "reconciliation must preserve author authority");
assert(contract.includes("new Case snapshot"), "material accepted changes must create a new Case snapshot");

const entries = blocks(fixture, /^### ((?:OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}): (.+)$/gm);
assert(entries.some((entry) => entry.id === "OBS-001" && entry.fields.get("Status") === "current"), "fixture must retain the accepted source observation");
assert(entries.some((entry) => entry.id === "REQ-001" && entry.fields.get("Status") === "accepted"), "fixture must retain the accepted requirement");

assert(mechanical.includes("**Materiality:** low"), "mechanical correction must be low materiality");
assert(mechanical.includes("**Outcome:** applied"), "safe mechanical correction must apply without author approval");
assert(mechanical.includes("**Snapshot:** unchanged"), "mechanical correction must not create a snapshot");
assert(!mechanical.includes("APR-"), "mechanical correction must not manufacture author approval");

assert(material.includes("**Materiality:** high"), "semantic requirement change must be high materiality");
assert(material.includes("**Outcome:** queued for author approval"), "material change must wait for author approval");
assert(material.includes("**Snapshot:** unchanged"), "unapproved material change must not create a snapshot");
assert(material.includes("phase-batched"), "nonblocking material question must join the phase batch");
assert(!material.includes("**Provenance:** author-approved"), "agent proposal must not become author-approved meaning");

assert(blocking.includes("**Materiality:** blocking"), "contradictory binding claims must be blocking");
assert(blocking.includes("**Disposition:** immediate interrupt"), "blocking contradiction must interrupt immediately");
assert(blocking.includes("**Phase batch:** none"), "blocking contradiction must not wait for a batch");

const findings = blocks(duplicates, /^### (FIND-\d{3}): (.+)$/gm);
assert(findings.length === 1, "duplicate semantic findings must consolidate into one finding");
assert(findings[0]?.fields.get("Reports") === "REV-001, REV-002", "consolidated finding must retain every report locator");
assert(findings[0]?.fields.get("Authority") === "none", "reviewer agreement must not claim author authority");

for (const target of generatedTargets) {
  const generatedRoot = path.join(root, "adapters", target, "generated/skills/case-reconcile");
  for (const relative of ["SKILL.md", "resources/reconciliation.md", "resources/fixtures/reconciliation/CASE.md", "resources/fixtures/reconciliation/mechanical-result.md", "resources/fixtures/reconciliation/material-result.md", "resources/fixtures/reconciliation/blocking-result.md", "resources/fixtures/reconciliation/duplicate-findings.md"]) {
    try {
      const [source, generated] = await Promise.all([readFile(path.join(reconcileRoot, relative), "utf8"), readFile(path.join(generatedRoot, relative), "utf8")]);
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
