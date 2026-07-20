#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const src = path.join(root, "src");
const config = JSON.parse(await readFile(path.join(root, "config/targets.json"), "utf8"));
const models = JSON.parse(await readFile(path.join(root, "config/models.json"), "utf8"));
const header = config.generatedHeader;
const home = process.env.HOME;
const layouts = {
  pi: { agents: "agents", commands: "commands", skills: "skills" },
  codex: { agents: "agents", commands: "commands", skills: "skills" },
  opencode: { agents: "agent", commands: "command", skills: "skills" },
};

function splitFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: [], body: text };
  const fields = match[1].split("\n").map((line) => {
    const i = line.indexOf(":");
    return i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 1).trim()];
  });
  return { fields, body: match[2] };
}

function unquote(value) {
  if (/^(["']).*\1$/.test(value)) return value.slice(1, -1);
  return value;
}

function quote(value) {
  return JSON.stringify(unquote(value));
}

function resolveTier(value, target) {
  let tier = unquote(value || models.adapters[target].default);
  tier = models.aliases[tier] || tier;
  return models.adapters[target][tier] || tier;
}

function runtimeContext(target) {
  return `## Adapter Runtime Context\n\nThis agent was generated for ${target} from the ${config.scope} Agent OS source root. Before following legacy harness-specific path references, read this adapter's generated memory bundle at ./memory/MEMORY_BUNDLE.md when available. Treat references to old harness config directories as provenance from the original system unless this generated adapter explicitly installs files there.`;
}

function declaredTools(data, blocksWriting) {
  const fallback = blocksWriting ? "read, grep, find, ls, bash" : "read, write, edit, grep, find, ls, bash";
  const tools = unquote(data.tools || fallback)
    .split(",")
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean);
  return blocksWriting ? tools.filter((tool) => !["write", "edit", "notebookedit"].includes(tool)) : tools;
}

function renderOpenCodeTools(tools, blocksWriting) {
  const has = (name) => tools.includes(name);
  const entries = [
    ["  read", String(has("read"))],
    ["  glob", String(has("glob") || has("find"))],
    ["  grep", String(has("grep"))],
    ["  bash", String(has("bash"))],
    ["  skill", "true"],
    ["  edit", String(!blocksWriting && (has("write") || has("edit")))],
  ];
  if (blocksWriting) {
    entries.push(
      ["  task", "false"],
      ["  webfetch", "false"],
      ["  todowrite", "false"],
    );
  }
  return entries;
}

function renderAgent(text, target) {
  const { fields, body } = splitFrontmatter(text);
  const data = Object.fromEntries(fields);
  const blocksWriting = /Write|Edit|NotebookEdit/i.test(data.disallowedTools || "");
  const tools = declaredTools(data, blocksWriting);
  let lines;
  if (target === "opencode") {
    lines = [
      ["description", quote(data.description || "")],
      ["mode", "subagent"],
      ["model", quote(resolveTier(data.model, target))],
      ["temperature", "0.3"],
      ["tools", ""],
      ...renderOpenCodeTools(tools, blocksWriting),
    ];
  } else if (target === "pi") {
    lines = fields
      .filter(([key]) => !["disallowedTools", "maxTurns", "color", "tools"].includes(key))
      .map(([key, value]) => [key, key === "model" ? quote(resolveTier(value, target)) : quote(value)]);
    lines.push(["tools", quote(tools.join(", "))]);
  } else {
    lines = fields.map(([key, value]) => [key, quote(key === "model" ? resolveTier(value, target) : value)]);
  }
  const yaml = lines.map(([key, value]) => value === "" ? `${key}:` : `${key}: ${value}`).join("\n");
  return `---\n${yaml}\n---\n\n${header}\n\n${runtimeContext(target)}\n\n${body.trimStart()}`;
}

function addHeader(text) {
  const { fields, body } = splitFrontmatter(text);
  if (!fields.length) return `${header}\n\n${text}`;
  const yaml = fields.map(([key, value]) => value === "" ? `${key}:` : `${key}: ${value}`).join("\n");
  return `---\n${yaml}\n---\n\n${header}\n\n${body.trimStart()}`;
}

function renderSkill(text, target, rel) {
  const rendered = addHeader(text);
  if (rel.split(path.sep).join("/") !== "software-implementation/SKILL.md") return rendered;
  const adapter = `references/harnesses/${target}.md`;
  const binding = `## Generated Target Binding\n\nThis installed copy targets **${target}**. Bind dispatch through [the ${target} adapter](${adapter}); the portable Contracts remain authoritative and other harness references are comparative, not universal launch syntax.`;
  return rendered.replace(`${header}\n\n`, `${header}\n\n${binding}\n\n`);
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function pathState(file) {
  try { return await lstat(file); } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function filesUnder(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(file));
    else out.push(file);
  }
  return out;
}

function excludedSkills(target) {
  return new Set(config.skillExcludes?.[target] || []);
}

function skillName(rel) {
  return rel.split(path.sep)[0];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function aggregateContentDigest(assets) {
  const canonical = [...assets]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path: assetPath, sha256: digest }) => `${assetPath}\0${digest}\n`)
    .join("");
  return sha256(Buffer.from(canonical));
}

async function refreshGeneratedPackageManifests(skillsRoot) {
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(skillsRoot, entry.name);
    const manifestPath = path.join(packageRoot, "manifest.json");
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!Array.isArray(manifest.assets) || typeof manifest.content_digest?.sha256 !== "string") continue;
    const transformedAssets = manifest.assets.filter((asset) => path.basename(asset.path) === "SKILL.md");
    if (!transformedAssets.length) continue;
    for (const asset of transformedAssets) {
      const assetPath = path.resolve(packageRoot, asset.path);
      const relative = path.relative(packageRoot, assetPath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Invalid generated package asset path: ${asset.path}`);
      asset.sha256 = sha256(await readFile(assetPath));
    }
    manifest.content_digest.sha256 = aggregateContentDigest(manifest.assets);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function expandHome(file) {
  if (!file.startsWith("~/")) return file;
  if (!home) throw new Error("HOME is required to install adapter surfaces");
  return path.join(home, file.slice(2));
}

function generatedKindRoot(target, kind) {
  return path.join(root, "adapters", target, "generated", layouts[target][kind]);
}

function resolveLinkTarget(linkPath, targetValue) {
  return path.resolve(path.dirname(linkPath), targetValue);
}

function isOwnedGeneratedTarget(targetPath, target, kind) {
  const marker = `${path.sep}adapters${path.sep}${target}${path.sep}generated${path.sep}${layouts[target][kind]}`;
  return targetPath === path.join(root, "adapters", target, "generated", layouts[target][kind]) || targetPath.includes(`${marker}${path.sep}`) || targetPath.endsWith(marker);
}

async function ensureOwnedLink(destination, sourcePath, target, kind) {
  const current = await pathState(destination);
  if (current?.isSymbolicLink()) {
    const currentTarget = resolveLinkTarget(destination, await readlink(destination));
    if (currentTarget === sourcePath) return false;
    if (!isOwnedGeneratedTarget(currentTarget, target, kind)) throw new Error(`Refusing to replace unmanaged symlink: ${destination}`);
    await rm(destination, { force: true });
  } else if (current) {
    throw new Error(`Refusing to replace unmanaged installed path: ${destination}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await symlink(sourcePath, destination);
  return true;
}

async function removeStaleOwnedLinks(directory, desiredNames, target, kind) {
  if (!(await exists(directory))) return 0;
  const explicitlyRetired = kind === "skills" ? new Set(config.retiredSkills || []) : new Set();
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (desiredNames.has(entry.name) || !entry.isSymbolicLink()) continue;
    const linkPath = path.join(directory, entry.name);
    const currentTarget = resolveLinkTarget(linkPath, await readlink(linkPath));
    if (!isOwnedGeneratedTarget(currentTarget, target, kind)) continue;
    if (!explicitlyRetired.has(entry.name) && await exists(currentTarget)) continue;
    await rm(linkPath, { force: true });
    removed += 1;
  }
  return removed;
}

async function topLevelDirectories(directory) {
  return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function installEntryDirectory(target, kind, installPath, names) {
  const destination = expandHome(installPath);
  await mkdir(destination, { recursive: true });
  const desired = new Set(names);
  const removed = await removeStaleOwnedLinks(destination, desired, target, kind);
  let changed = 0;
  for (const name of names) {
    if (await ensureOwnedLink(path.join(destination, name), path.join(generatedKindRoot(target, kind), name), target, kind)) changed += 1;
  }
  return { installed: names.length, changed, removed };
}

async function installCopiedFiles(target, kind, installPath, names) {
  const destination = expandHome(installPath);
  await mkdir(destination, { recursive: true });
  let changed = 0;
  for (const name of names) {
    const sourcePath = path.join(generatedKindRoot(target, kind), name);
    const destinationPath = path.join(destination, name);
    const current = await pathState(destinationPath);
    if (current?.isSymbolicLink()) {
      const currentTarget = resolveLinkTarget(destinationPath, await readlink(destinationPath));
      if (!isOwnedGeneratedTarget(currentTarget, target, kind)) throw new Error(`Refusing to replace unmanaged symlink: ${destinationPath}`);
      await rm(destinationPath, { force: true });
    }
    const rendered = await readFile(sourcePath);
    if (!(await exists(destinationPath)) || !Buffer.from(await readFile(destinationPath)).equals(rendered)) {
      await writeFile(destinationPath, rendered);
      changed += 1;
    }
  }
  return { installed: names.length, changed, removed: 0 };
}

async function installTarget(target) {
  const surface = config.adapterSurfaces[target];
  if (!surface) throw new Error(`Missing adapter surface configuration: ${target}`);
  const skillNames = await topLevelDirectories(generatedKindRoot(target, "skills"));
  let skills;
  if (surface.skills.mode === "namespace") {
    const destination = expandHome(surface.skills.path);
    const changed = await ensureOwnedLink(destination, generatedKindRoot(target, "skills"), target, "skills");
    skills = { installed: skillNames.length, changed: Number(changed), removed: 0 };
  } else if (surface.skills.mode === "configured") {
    const destination = expandHome(surface.skills.path);
    if (destination !== generatedKindRoot(target, "skills")) throw new Error(`${target}: configured skill path must equal its generated skill root`);
    skills = { installed: skillNames.length, changed: 0, removed: 0 };
  } else {
    skills = await installEntryDirectory(target, "skills", surface.skills.path, skillNames);
  }

  let agents = { installed: 0, changed: 0, removed: 0 };
  if (surface.agents) {
    const generatedAgentNames = (await readdir(generatedKindRoot(target, "agents"), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
    const names = surface.agents.files === "all" ? generatedAgentNames : surface.agents.files;
    agents = surface.agents.mode === "copy"
      ? await installCopiedFiles(target, "agents", surface.agents.path, names)
      : await installEntryDirectory(target, "agents", surface.agents.path, names);
  }
  return { skills, agents };
}

async function renderTarget(target, destination) {
  const layout = layouts[target];
  const excluded = excludedSkills(target);
  const surface = config.adapterSurfaces[target];
  if (!layout || !surface) throw new Error(`Unsupported target: ${target}`);
  await mkdir(destination, { recursive: true });
  for (const kind of ["agents", "commands", "skills"]) {
    const out = path.join(destination, layout[kind]);
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
  }

  if (surface.generateAgents) {
    for (const file of await filesUnder(path.join(src, "agents"))) {
      const rel = path.relative(path.join(src, "agents"), file);
      const out = path.join(destination, layout.agents, rel);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, renderAgent(await readFile(file, "utf8"), target));
    }
  }
  for (const file of await filesUnder(path.join(src, "commands"))) {
    const rel = path.relative(path.join(src, "commands"), file);
    const out = path.join(destination, layout.commands, rel);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${header}\n\n${await readFile(file, "utf8")}`);
  }
  for (const file of await filesUnder(path.join(src, "skills"))) {
    const rel = path.relative(path.join(src, "skills"), file);
    if (excluded.has(skillName(rel))) continue;
    const out = path.join(destination, layout.skills, rel);
    await mkdir(path.dirname(out), { recursive: true });
    if (path.basename(file) === "SKILL.md") await writeFile(out, renderSkill(await readFile(file, "utf8"), target, rel));
    else await writeFile(out, await readFile(file));
  }
  await refreshGeneratedPackageManifests(path.join(destination, layout.skills));

  const instructionsSource = path.join(src, "AGENTS.md");
  if (await exists(instructionsSource)) {
    const rendered = `${header}\n\n${await readFile(instructionsSource, "utf8")}`;
    await writeFile(path.join(destination, "AGENTS.md"), rendered);
    const installPath = config.globalInstructions?.[target];
    if (installPath) {
      const expanded = expandHome(installPath);
      await mkdir(path.dirname(expanded), { recursive: true });
      await writeFile(expanded, rendered);
    }
  }
}

async function sync() {
  for (const target of config.targets) {
    await renderTarget(target, path.join(root, "adapters", target, "generated"));
    const result = await installTarget(target);
    console.log(`synced ${target}; installed ${result.skills.installed} skills and ${result.agents.installed} agents; updated ${result.skills.changed + result.agents.changed}, removed ${result.skills.removed + result.agents.removed} stale links`);
  }
}

async function checkExactLink(problems, destination, sourcePath, label) {
  const current = await pathState(destination);
  if (!current?.isSymbolicLink()) {
    problems.push(`${label}: missing installed symlink at ${destination}`);
    return;
  }
  const actual = resolveLinkTarget(destination, await readlink(destination));
  if (actual !== sourcePath) problems.push(`${label}: installed symlink points to ${actual}, expected ${sourcePath}`);
}

async function doctorInstalledSurface(target, problems) {
  const surface = config.adapterSurfaces[target];
  const skillRoot = generatedKindRoot(target, "skills");
  const skillNames = await topLevelDirectories(skillRoot);
  if (surface.skills.mode === "namespace") {
    await checkExactLink(problems, expandHome(surface.skills.path), skillRoot, `${target} skills`);
  } else if (surface.skills.mode === "configured") {
    if (expandHome(surface.skills.path) !== skillRoot) problems.push(`${target}: configured skill path does not equal generated skill root`);
  } else {
    for (const name of skillNames) {
      await checkExactLink(problems, path.join(expandHome(surface.skills.path), name), path.join(skillRoot, name), `${target} skill ${name}`);
    }
  }
  for (const name of config.requiredPublicSkills) {
    const installed = surface.skills.mode === "namespace"
      ? path.join(expandHome(surface.skills.path), name, "SKILL.md")
      : path.join(expandHome(surface.skills.path), name, "SKILL.md");
    if (!(await exists(installed))) problems.push(`${target}: public skill ${name} is not readable at ${installed}`);
  }

  if (surface.agents) {
    const generatedNames = (await readdir(generatedKindRoot(target, "agents"), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
    const names = surface.agents.files === "all" ? generatedNames : surface.agents.files;
    for (const name of names) {
      const installed = path.join(expandHome(surface.agents.path), name);
      const generated = path.join(generatedKindRoot(target, "agents"), name);
      if (surface.agents.mode === "copy") {
        if (!(await exists(installed))) problems.push(`${target} agent ${name}: missing installed copy at ${installed}`);
        else if (!Buffer.from(await readFile(installed)).equals(await readFile(generated))) problems.push(`${target} agent ${name}: installed copy differs from generated source`);
      } else {
        await checkExactLink(problems, installed, generated, `${target} agent ${name}`);
      }
    }
  }
  for (const dependency of surface.dependencies) {
    if (!(await exists(expandHome(dependency)))) problems.push(`${target}: missing adapter dependency ${dependency}`);
  }
}

async function doctor() {
  const problems = [];
  for (const target of config.targets) {
    const layout = layouts[target];
    const base = path.join(root, "adapters", target, "generated");
    const excluded = excludedSkills(target);
    const instructionsSource = path.join(src, "AGENTS.md");
    if (await exists(instructionsSource)) {
      const generated = path.join(base, "AGENTS.md");
      if (!(await exists(generated))) problems.push(`${target}: missing AGENTS.md`);
      else if (!(await readFile(generated, "utf8")).includes(header)) problems.push(`${target}: missing generated header in AGENTS.md`);
      const installPath = config.globalInstructions?.[target];
      if (installPath) {
        const installed = expandHome(installPath);
        if (!(await exists(installed))) problems.push(`${target}: missing installed global instructions at ${installPath}`);
        else if ((await readFile(installed, "utf8")) !== (await readFile(generated, "utf8"))) problems.push(`${target}: installed global instructions differ from generated AGENTS.md`);
      }
    }
    for (const kind of ["agents", "commands", "skills"]) {
      const dir = path.join(base, layout[kind]);
      if (!(await exists(dir))) problems.push(`${target}: missing ${layout[kind]}/`);
    }
    for (const file of await filesUnder(path.join(src, "skills"))) {
      const rel = path.relative(path.join(src, "skills"), file);
      if (excluded.has(skillName(rel))) continue;
      const generated = path.join(base, layout.skills, rel);
      if (!(await exists(generated))) problems.push(`${target}: missing skill file ${rel}`);
      else if (path.basename(file) === "SKILL.md" && !(await readFile(generated, "utf8")).includes(header)) problems.push(`${target}: missing generated header in ${rel}`);
    }
    const allSourceNames = new Set((await readdir(path.join(src, "skills"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    const sourceNames = new Set([...allSourceNames].filter((name) => !excluded.has(name)));
    for (const entry of await readdir(path.join(base, layout.skills), { withFileTypes: true })) {
      if (entry.isDirectory() && !sourceNames.has(entry.name)) problems.push(`${target}: stale generated skill ${entry.name}`);
    }
    for (const name of config.requiredPublicSkills) {
      if (!sourceNames.has(name)) problems.push(`${target}: required public skill ${name} is excluded or missing from source`);
    }
    const coordinator = path.join(base, layout.skills, "software-implementation", "SKILL.md");
    if (await exists(coordinator)) {
      const text = await readFile(coordinator, "utf8");
      if (!text.includes(`references/harnesses/${target}.md`)) problems.push(`${target}: coordinator lacks explicit target binding`);
    }
    if (config.adapterSurfaces[target].generateAgents) {
      const validator = path.join(base, layout.agents, "focused-validator.md");
      if (!(await exists(validator))) problems.push(`${target}: missing generated focused-validator profile`);
      else {
        const text = (await readFile(validator, "utf8")).toLowerCase();
        if (!text.includes("bash")) problems.push(`${target}: focused-validator profile lacks Bash capability`);
        if (target === "pi" && !text.includes('tools: "read, bash, grep, find, ls"')) problems.push("pi: focused-validator profile lacks the expected non-writing tool allowlist");
        if (target === "opencode") {
          for (const capability of ["read", "glob", "grep", "bash", "skill"]) {
            if (!text.includes(`  ${capability}: true`)) problems.push(`opencode: focused-validator must enable ${capability}`);
          }
          for (const capability of ["edit", "task", "webfetch", "todowrite"]) {
            if (!text.includes(`  ${capability}: false`)) problems.push(`opencode: focused-validator must disable ${capability}`);
          }
        }
      }
    }
    await doctorInstalledSurface(target, problems);
  }
  if (problems.length) {
    console.error(problems.map((problem) => `ERROR ${problem}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`doctor: ok (${config.targets.join(", ")}); installed public skills discoverable; focused-validator profiles verified for pi/opencode; codex uses inline role binding`);
  }
}

const command = process.argv[2];
if (command === "sync") await sync();
else if (command === "doctor") await doctor();
else {
  console.error("Usage: node scripts/agents-os.mjs <sync|doctor>");
  process.exitCode = 2;
}
