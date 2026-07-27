import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => readFile(path.join(src, relative), "utf8");

const required = (text, patterns, subject) => {
  for (const pattern of patterns) assert.match(text, pattern, `${subject} must expose ${pattern}`);
};

test("software implementation exposes Atlas as a distinct fail-closed admission mode", async () => {
  const [skill, contracts] = await Promise.all([
    read("skills/software-implementation/SKILL.md"),
    read("skills/software-implementation/references/contracts.md"),
  ]);

  required(skill, [
    /`atlas`:[\s\S]*HandoffReady[\s\S]*HandoffWithLimitations/,
    /There is no generic `route` admission mode/,
    /summary, historical Decision,[\s\S]*incomplete\/conflicted[\s\S]*omitted authority/,
    /Atlas admission[\s\S]*coordinator resume[\s\S]*dependency frontier[\s\S]*effectful gate[\s\S]*result/,
  ], "software-implementation admission");
  assert.doesNotMatch(contracts, /^Mode:.*\broute\b/m);
  assert.match(contracts, /^Mode: atlas \| ad_hoc \| prototype$/m);
  required(contracts, [
    /### Atlas Delivery Binding/,
    /Features:.*candidate-local label -> stable F-\*/,
    /Work Items:.*candidate-local label -> stable WI-\*/,
    /Proof allocation:.*focused, independent convergence,[\s\S]*security, cleanup, ordering/,
    /create\/update matching draft PRs: <allowed boundary>[\s\S]*Explicitly absent:.*merge, deployment, release, landing/,
    /Disposition: clear \| exact_admitted_limitation \| stop/,
  ], "Atlas Delivery Contract");
});

test("Blueprint handoff requires exact accepted publication and a current dispatch", async () => {
  const [blueprint, handoff, invalidation] = await Promise.all([
    read("skills/blueprint/SKILL.md"),
    read("skills/blueprint/contracts/atlas-handoff.md"),
    read("skills/implementation-invalidation/SKILL.md"),
  ]);

  required(blueprint, [
    /load and use `\.\.\/feature-atlas\/SKILL\.md`/,
    /exact current accepted and configured-adapter-published Atlas Map Decision/,
    /explicit current production dispatch naming that Decision and production movement/,
  ], "Blueprint admission");
  required(handoff, [
    /load and use `\.\.\/\.\.\/feature-atlas\/SKILL\.md`/,
    /exact complete current Map candidate/,
    /expected predecessor, and current\/superseding effect/,
    /configured Feature Atlas Publisher\/adapter must atomically record it/,
    /project the exact accepted snapshot, reread\/verify the current Decision/,
  ], "Blueprint Atlas handoff");
  assert.match(invalidation, /without the exact current accepted, configured-adapter-published Atlas Map Decision; or without an explicit current production dispatch/);

  const contractPath = path.join(src, "skills/blueprint/contracts/atlas-handoff.md");
  const invalidationLink = "../../implementation-invalidation/SKILL.md";
  await access(path.resolve(path.dirname(contractPath), invalidationLink));
});

test("imported Atlas proof remains ordered and can gate between Work Items", async () => {
  const [skill, loop, gates, map] = await Promise.all([
    read("skills/software-implementation/SKILL.md"),
    read("skills/software-implementation/references/execution-loop.md"),
    read("skills/software-implementation/references/release-gates.md"),
    read("skills/software-implementation/templates/execution-map.md"),
  ]);

  required(skill, [/bounded-live proof after WI-014 and before WI-015/], "skill");
  required(loop, [/WI-014 → bounded-live proof → WI-015/], "execution loop");
  required(gates, [/inter-Work-Item bounded-live proof[\s\S]*upstream item[\s\S]*downstream item/], "release gates");
  required(loop, [/writer-owned focused proof only[\s\S]*do not add a generic independent task gate/], "execution loop");
  required(gates, [
    /must not:[\s\S]*remove, weaken, replace, reorder, or OR-combine/,
    /universally add architecture, code-quality, design-fidelity, security, or E2E gates/,
  ], "release-gate contract");
  required(map, [
    /## Atlas Delivery Binding/,
    /## Currentness/,
    /## Imported \/ Admitted Proof Gates/,
    /Downstream blockers/,
  ], "execution map");
});

test("Feature Atlas storage seam supports GitHub and local filesystem without granting Git semantic authority", async () => {
  const [atlas, seam, github, local] = await Promise.all([
    read("skills/feature-atlas/SKILL.md"),
    read("skills/feature-atlas/references/storage-adapters.md"),
    read("skills/feature-atlas/references/configured-private-github.md"),
    read("skills/feature-atlas/references/configured-local-filesystem.md"),
  ]);

  required(atlas, [/storage adapter contract/, /private GitHub adapter/, /local filesystem\/Git-backed adapter/], "Feature Atlas skill");
  required(seam, [
    /readMapDecision\(exact Atlas\/Map\/Decision\)/,
    /verifyPublication\(exact Atlas\/Map\/Decision\)/,
    /exportExecutionHandoff\(exact Atlas\/Map\/Decision\)/,
    /recordMapDecision\(acceptance package, expected predecessor, mutation authority\)/,
    /Blueprint and Software Implementation call Feature Atlas domain operations/,
  ], "storage adapter seam");
  assert.match(github, /`gh` examples below are adapter-owned mechanics/);
  required(local, [
    /filesystem-only:.*content digest/,
    /Git-backed: exact repository identity plus commit and blob\/object locator/,
    /A digest proves byte integrity, not human acceptance or semantic currentness/,
    /branches, tags, `HEAD`, working-tree paths,[\s\S]*not Atlas authority/,
    /expected-predecessor\/CAS/,
    /Receipts And Recovery/,
  ], "local filesystem adapter");
});

test("Blueprint and engineering router admit only complete current typed Atlas handoffs", async () => {
  const [blueprint, router] = await Promise.all([
    read("skills/blueprint/SKILL.md"),
    read("skills/engineering-workflow/SKILL.md"),
  ]);

  required(blueprint, [
    /non-authoritative draft handoff candidate/,
    /Atlas is authoritative thereafter for the accepted delivery plan/,
  ], "Blueprint handoff boundary");
  required(router, [
    /HandoffReady.*HandoffWithLimitations.*`software-implementation` in explicit `atlas` mode/,
    /Summary-only, historical, conflicted, incomplete, unverifiable, `HandoffRefusal`, or authority-omitting Atlas input/,
  ], "engineering router");
  assert.doesNotMatch(router, /ephemeral `route`/);
});
