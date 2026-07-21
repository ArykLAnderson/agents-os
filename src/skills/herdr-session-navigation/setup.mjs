#!/usr/bin/env node
import { access, copyFile, lstat, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { trialPaths } from "./lib/paths.mjs";

function usage() {
  return "usage: node setup.mjs [--dry-run] --staging-destination EXISTING_DIR [--herdr-path FILE]\n       node setup.mjs --apply --staging-destination EXISTING_DIR [--herdr-path FILE]";
}

export function parseArguments(argv) {
  const options = { apply: false, destination: null, herdrPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.apply = false;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--staging-destination") options.destination = argv[++i];
    else if (arg === "--herdr-path") options.herdrPath = argv[++i];
    else throw new Error(`unsupported argument: ${arg}`);
  }
  if (!options.destination) throw new Error("--staging-destination is required");
  options.destination = path.resolve(options.destination);
  if (options.herdrPath) options.herdrPath = path.resolve(options.herdrPath);
  return options;
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function physicalPath(target) {
  const missing = [];
  let cursor = path.resolve(target);
  while (!(await exists(cursor))) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`cannot resolve physical path: ${target}`);
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(await realpath(cursor), ...missing);
}

function containedBy(target, root) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

export async function runSetup(options, env = process.env) {
  const live = trialPaths(env);
  const source = path.join(path.dirname(fileURLToPath(import.meta.url)), "examples", "config.toml");
  const forbiddenRoots = await Promise.all([path.dirname(live.configPath), live.stateRoot].map(physicalPath));
  const destinationPhysical = await physicalPath(options.destination);
  if (forbiddenRoots.some((root) => containedBy(destinationPhysical, root))) {
    throw new Error("staging destination must not be a live Herdr config or Agent OS state path");
  }
  if (options.herdrPath) {
    const info = await stat(options.herdrPath);
    if (!info.isFile()) throw new Error("--herdr-path must name a file");
    await access(options.herdrPath, constants.X_OK);
  }
  const plan = {
    mode: options.apply ? "apply" : "dry-run",
    node: process.version,
    herdr: options.herdrPath ? `checked without execution: ${options.herdrPath}` : "not checked (optional --herdr-path)",
    source,
    destination: path.join(destinationPhysical, "config.toml"),
    liveConfigUntouched: live.configPath,
    stateUntouched: live.stateRoot,
  };
  if (!options.apply) return plan;

  const destinationInfo = await lstat(options.destination).catch(() => null);
  if (!destinationInfo?.isDirectory() || destinationInfo.isSymbolicLink()) {
    throw new Error("--apply requires an existing non-symlink staging directory");
  }
  const resolvedDestination = await realpath(options.destination);
  if (resolvedDestination !== destinationPhysical || forbiddenRoots.some((root) => containedBy(resolvedDestination, root))) {
    throw new Error("staging destination failed physical containment validation");
  }
  const output = path.join(resolvedDestination, "config.toml");
  if (await exists(output)) throw new Error(`refusing unmanaged existing file: ${output}`);
  await copyFile(source, output, constants.COPYFILE_EXCL);
  return { ...plan, destination: output };
}

async function main() {
  try {
    const plan = await runSetup(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    console.error(`setup: ${error.message}`);
    console.error(usage());
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
