import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyPins, parsePins, validateRegistry } from "./model.mjs";

let tempCounter = 0;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function statePaths(env = process.env) {
  const home = env.HOME || os.homedir(); const stateHome = env.XDG_STATE_HOME || path.join(home, ".local", "state");
  if (!path.isAbsolute(stateHome)) throw new TypeError("XDG_STATE_HOME must be absolute");
  const root = path.join(stateHome, "agent-os", "herdr-trials", "casebook");
  return { root, registry: path.join(root, "bindings", "registry.json"), projects: path.join(root, "project-pins.json"), locals: path.join(root, "local-pins.json"), history: path.join(root, "focus-history.json"), result: path.join(root, "action-result.json") };
}

/** Refuse every existing symlink in the absolute path. Checks run both before and after parent creation. */
export async function assertNoSymlinkPath(file) {
  if (!path.isAbsolute(file)) throw new TypeError("state path must be absolute");
  const parsed = path.parse(path.normalize(file)); let current = parsed.root;
  for (const component of path.normalize(file).slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try { const stat = await fs.lstat(current); if (stat.isSymbolicLink()) throw new Error(`state path contains symlink: ${current}`); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
  }
}
async function prepareParent(file) {
  await assertNoSymlinkPath(path.dirname(file));
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await assertNoSymlinkPath(path.dirname(file));
  const actual = await fs.realpath(path.dirname(file));
  if (actual !== path.normalize(path.dirname(file))) throw new Error("state parent canonical path mismatch");
}
export async function atomicWriteJson(file, value) {
  await prepareParent(file);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.${tempCounter++}.tmp`);
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600); await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); await handle.close(); handle = null;
    await assertNoSymlinkPath(path.dirname(file)); await fs.rename(temp, file);
    const dir = await fs.open(path.dirname(file), "r"); try { await dir.sync(); } finally { await dir.close(); }
  } catch (error) { if (handle) await handle.close().catch(() => {}); await fs.rm(temp, { force: true }).catch(() => {}); throw error; }
}
export async function readStateJson(file) { await assertNoSymlinkPath(file); return JSON.parse(await fs.readFile(file, "utf8")); }
export async function loadPins(file) { try { return parsePins(await readStateJson(file)); } catch (error) { if (error.code === "ENOENT") return emptyPins(); throw error; } }
export async function savePins(file, pins) { await atomicWriteJson(file, parsePins(pins)); }
export async function loadRegistry(file) { return validateRegistry(await readStateJson(file)); }
export async function loadHistory(file) {
  try { const value = await readStateJson(file); if (value?.schemaVersion !== 1 || !value.projects || typeof value.projects !== "object" || Array.isArray(value.projects)) throw new TypeError("invalid focus history schema"); return value; }
  catch (error) { if (error.code === "ENOENT") return { schemaVersion: 1, projects: {} }; throw error; }
}

async function withFileLock(file, operation, { attempts = 200, delayMs = 5 } = {}) {
  const lock = `${file}.lock`; await prepareParent(lock); let handle;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { handle = await fs.open(lock, "wx", 0o600); break; }
    catch (error) { if (error.code !== "EEXIST") throw error; if (attempt === attempts - 1) throw new Error(`state lock unavailable: ${lock}`); await sleep(delayMs); }
  }
  const held = await handle.stat();
  try { return await operation(); }
  finally {
    let current = null; try { current = await fs.lstat(lock); } catch {}
    await handle.close();
    if (current && current.dev === held.dev && current.ino === held.ino) await fs.unlink(lock);
  }
}

/** Lock covers the complete load/transform/durable-write transaction. Crash-left locks are never deleted as stale. */
export async function transactionalPins(file, transform, lockOptions) {
  return withFileLock(file, async () => {
    const pins = await loadPins(file); const outcome = await transform(pins);
    if (!outcome || !outcome.pins) throw new TypeError("pin transaction must return pins");
    await savePins(file, outcome.pins); return outcome.result;
  }, lockOptions);
}
export async function transactionalHistory(file, transform, lockOptions) {
  return withFileLock(file, async () => {
    const history = await loadHistory(file); const outcome = await transform(history);
    if (!outcome || !outcome.history) throw new TypeError("history transaction must return history");
    await atomicWriteJson(file, outcome.history); return outcome.result;
  }, lockOptions);
}
