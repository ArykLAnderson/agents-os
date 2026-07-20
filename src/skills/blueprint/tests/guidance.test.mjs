import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillRoot = new URL("../", import.meta.url);
const read = (relativePath) => readFile(new URL(relativePath, skillRoot), "utf8");

test("Blueprint classifies questions by authority and preserves the Frame boundary", async () => {
  const skill = await read("SKILL.md");

  for (const classification of [
    "Terrain/evidence",
    "Blueprint architecture",
    "Behavioral boundary",
    "Realization",
    "External authorization",
    "Acceptance",
  ]) {
    assert.match(skill, new RegExp(`\\*\\*${classification}:\\*\\*`));
  }

  assert.match(skill, /Return to or reopen Frame only when[^\n]+materially change, add, remove, or contradict the accepted behavioral boundary/);
  assert.match(skill, /Acceptance authorizes Route design only\./);
});

test("accepted Blueprint and RFC have one architecture and distinct authority", async () => {
  const [skill, artifact] = await Promise.all([
    read("SKILL.md"),
    read("references/artifact.md"),
  ]);

  assert.match(skill, /resolves exactly one coherent new architecture/);
  assert.match(artifact, /Casework \(Frame and Cases\).*owns the accepted behavioral boundary/s);
  assert.match(artifact, /\*\*Blueprint\*\* owns the selected architecture/);
  assert.match(artifact, /\*\*Document\*\* owns RFC composition/);
  assert.match(artifact, /RFC is its verified reader-facing projection/);
  assert.match(artifact, /It authorizes Route to design a realization[^\n]+nothing more/);
});

test("persisted state and abstract RFC structure retain required bindings and design views", async () => {
  const artifact = await read("references/artifact.md");

  for (const requiredMeaning of [
    "source Frame and every governing Case",
    "old/current and selected new architecture views",
    "modules, responsibilities, Secrets, placement, and lifecycle Ownership",
    "Contracts, states, failure/recovery semantics, and schemas",
    "unresolved behavioral questions and architecture Findings",
    "supporting alternatives and dispositions in Casework",
    "Document projection identity/revision",
    "Architect acceptance provenance",
  ]) {
    assert.ok(artifact.includes(requiredMeaning), `missing persisted meaning: ${requiredMeaning}`);
  }

  for (const section of [
    "Authority and decision",
    "Context and accepted boundary",
    "Old view",
    "New view",
    "Modules and ownership",
    "Contracts and information model",
    "Consequences and sufficiency",
    "Questions and alternatives",
    "Projection verification",
  ]) {
    assert.match(artifact, new RegExp(`\\*\\*${section}\\*\\*`));
  }

  assert.match(artifact, /A \*\*compact\*\* RFC still includes/);
  assert.match(artifact, /Use a \*\*full\*\* treatment where/);
  assert.match(artifact, /`N\/A` is valid only when the item is genuinely inapplicable and includes a short reason/);
});

test("shared codebase vocabulary is diagnostic rather than a scorecard", async () => {
  const vocabulary = await read("../codebase-design/SKILL.md");

  for (const lens of ["Secrets", "Contract", "Depth", "Unity", "Ownership"]) {
    assert.match(vocabulary, new RegExp(`\\*\\*${lens}:\\*\\*`));
  }

  assert.match(vocabulary, /as interacting questions, not a scorecard/);
  assert.match(vocabulary, /Do not total, rank, or require equal performance across the lenses/);
});
