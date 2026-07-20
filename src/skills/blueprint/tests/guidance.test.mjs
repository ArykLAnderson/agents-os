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

test("terrain stops when the accepted architecture view is sufficient for candidate design", async () => {
  const terrain = await read("references/terrain.md");

  assert.match(terrain, /Inspect only enough terrain to remove material unchecked assumptions/);
  assert.match(terrain, /Stop terrain work when candidate designs no longer depend on important unchecked architectural assumptions/);
  assert.match(terrain, /Do not turn the survey into whole-codebase documentation or select a future module inside the terrain record/);
  assert.match(terrain, /the current responsibility and interaction model/);
  assert.match(terrain, /current Contract, state, schema, and ownership canon/);
  assert.match(terrain, /explicit unknowns classified as behavioral, architectural, realization, evidence, or external-authorization questions/);
});

test("Contract depth is proportional and sufficient for consumers and ownership", async () => {
  const contracts = await read("references/contracts.md");

  assert.match(contracts, /depth required by actual use and material risk—not to checklist completeness/);
  assert.match(contracts, /Specify what materially affects consumers/);
  assert.match(contracts, /A Contract is consumer-sufficient when each materially different consumer can achieve accepted behavior, handle relevant failure\/recovery, and observe required outcomes using only the Contract and declared context/);
  assert.match(contracts, /Name one canonical owner and definition for every material Contract, state machine, and schema/);
  assert.match(contracts, /Stop when consumer and ownership sufficiency are established for material paths; do not prescribe private algorithms or Route sequencing/);
  assert.match(contracts, /A genuinely inapplicable dimension may be recorded as justified `N\/A`; an unknown or deferred semantic is a Finding, not `N\/A`/);
});

test("Architect acceptance is gated on completed independent fresh-context review and persisted evidence", async () => {
  const [skill, review, artifact] = await Promise.all([
    read("SKILL.md"),
    read("references/review.md"),
    read("references/artifact.md"),
  ]);

  assert.match(skill, /The Blueprint is eligible for acceptance only when/);
  assert.match(skill, /an independent fresh-context challenge of the coherent current candidate has completed and every resulting Finding has a recorded disposition/);
  assert.match(skill, /Architect acceptance is invalid and must not be given effect or used to set `accepted` unless/);
  assert.match(skill, /persisted Blueprint state and acceptance provenance identify the independent review evidence/);

  assert.match(review, /Architect acceptance is invalid and must be blocked unless/);
  assert.match(review, /reviewer who did not author or coordinate the candidate/);
  assert.match(review, /Persist the reviewer identity or role, independence and fresh-context basis, bounded mandate and supplied evidence, completed review output locator/);
  assert.match(review, /every resulting Finding and disposition in the Blueprint state and acceptance provenance/);
  assert.match(review, /Reviewers advise: they have no semantic authority, and neither their labels nor consensus can accept or redefine the Blueprint/);
  assert.doesNotMatch(review, /Before recommending Architect acceptance/);
  assert.doesNotMatch(review, /fresh-context reviewers when available/);

  assert.match(artifact, /independent completion-review evidence: reviewer identity or role, independence and fresh-context basis/);
  assert.match(artifact, /Architect acceptance provenance:[^\n]+a binding to the independent completion-review evidence/);
  assert.match(artifact, /Architect acceptance is invalid, the Blueprint must remain active, and `accepted` must not be set unless/);
  assert.match(artifact, /persisted state and acceptance provenance contain the independent completion-review evidence/);
});

test("shared codebase vocabulary is diagnostic rather than a scorecard", async () => {
  const vocabulary = await read("../codebase-design/SKILL.md");

  for (const lens of ["Secrets", "Contract", "Depth", "Unity", "Ownership"]) {
    assert.match(vocabulary, new RegExp(`\\*\\*${lens}:\\*\\*`));
  }

  assert.match(vocabulary, /as interacting questions, not a scorecard/);
  assert.match(vocabulary, /Do not total, rank, or require equal performance across the lenses/);
});
