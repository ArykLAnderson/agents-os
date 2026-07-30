import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3InitModule from "../../vendor/sqlite-wasm-3.53.0-build1/dist/node.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDORED_RUNTIME_ROOT = path.resolve(HERE, "../../vendor/sqlite-wasm-3.53.0-build1");
export const VENDORED_NODE_MODULE = path.join(VENDORED_RUNTIME_ROOT, "dist/node.mjs");
export const VENDORED_WASM = path.join(VENDORED_RUNTIME_ROOT, "dist/sqlite3.wasm");
export const VENDORED_LICENSE_NOTICE = path.join(VENDORED_RUNTIME_ROOT, "LICENSE-NOTICE.txt");
export const VENDORED_ASSET_DIGESTS = Object.freeze({
  node_mjs: "d74e4b74920d1499b0bf349ced70372c55ac9a9ea72af718e5f6b23b0c1b29c4",
  sqlite3_wasm: "02d7e48164395fa68f81c6ec33e9da5461be397dc57602ac0cd89b4bbba1d312",
  license_notice: "9f5f68675d98acdfaa5f21d26e02392834c799302fc73f3ebcaff82419a05efb",
});

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function verifyVendoredAssets() {
  const paths = { node_mjs: VENDORED_NODE_MODULE, sqlite3_wasm: VENDORED_WASM, license_notice: VENDORED_LICENSE_NOTICE };
  const actual = {}, problems = [];
  let wasmBytes;
  for (const [id, assetPath] of Object.entries(paths)) {
    try {
      const bytes = readFileSync(assetPath);
      actual[id] = sha256(bytes);
      if (actual[id] !== VENDORED_ASSET_DIGESTS[id]) problems.push(`asset_digest:${id}`);
      if (id === "sqlite3_wasm") wasmBytes = bytes;
    } catch { problems.push(`asset_missing:${id}`); }
  }
  return { ok: problems.length === 0, paths, actual, required: VENDORED_ASSET_DIGESTS, problems, wasmBytes };
}

const vendoredAssets = verifyVendoredAssets();
let sqlite3, runtimeLoadError;
if (vendoredAssets.ok) {
  try {
    sqlite3 = await sqlite3InitModule({ wasmBinary: vendoredAssets.wasmBytes, print: () => {}, printErr: () => {} });
  } catch (error) { runtimeLoadError = error; }
}

export function inspectVendoredAssets() {
  return {
    ok: vendoredAssets.ok && !runtimeLoadError,
    paths: { ...vendoredAssets.paths },
    actual: { ...vendoredAssets.actual },
    required: { ...VENDORED_ASSET_DIGESTS },
    problems: [...vendoredAssets.problems, ...(runtimeLoadError ? ["wasm_initialization_failed"] : [])],
  };
}

function requireEngine() {
  if (!sqlite3) throw Object.assign(new Error("The exact package-vendored SQLite WASM runtime is unavailable."), {
    code: "vendored_runtime_unavailable", evidence: inspectVendoredAssets(),
  });
  return sqlite3;
}

let virtualSequence = 0, temporarySequence = 0;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));
function sleep(milliseconds) { Atomics.wait(sleepCell, 0, 0, milliseconds); }
function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}
function acquirePackageLock(database, timeout) {
  const lockPath = `${database}.casebook-lock`, deadline = Date.now() + timeout;
  while (true) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      writeFileSync(path.join(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`, { mode: 0o600 });
      return () => rmSync(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const age = Date.now() - lstatSync(lockPath).mtimeMs;
        let owner;
        try { owner = JSON.parse(readFileSync(path.join(lockPath, "owner.json"), "utf8")); } catch {}
        if (age >= 60_000 && owner && !processExists(owner.pid)) { rmSync(lockPath, { recursive: true, force: true }); continue; }
      } catch (inspectionError) { if (inspectionError?.code === "ENOENT") continue; }
      if (Date.now() >= deadline) throw Object.assign(new Error("Timed out waiting for the bounded Casebook database package lock."), { code: "sqlite_package_lock_timeout", lock_path: lockPath });
      sleep(Math.min(25, Math.max(1, deadline - Date.now())));
    }
  }
}
function syncDirectory(directory) {
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}
function atomicPersist(database, bytes, { noReplace = false } = {}) {
  const directory = path.dirname(database);
  const temporary = `${database}.casebook-write-${process.pid}-${Date.now()}-${temporarySequence += 1}`;
  let descriptor;
  try {
    const mode = existsSync(database) ? statSync(database).mode & 0o777 : 0o600;
    descriptor = openSync(temporary, "wx", mode);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    chmodSync(temporary, mode);
    if (noReplace) { linkSync(temporary, database); unlinkSync(temporary); }
    else renameSync(temporary, database);
    syncDirectory(directory);
  } finally {
    if (descriptor != null) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}
function normalizeValue(value) {
  if (typeof value === "bigint") return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
  return value;
}

class StatementSync {
  constructor(owner, sql) {
    this.owner = owner;
    this.statement = owner.db.prepare(sql);
    this.readonly = requireEngine().capi.sqlite3_stmt_readonly(this.statement.pointer) !== 0;
  }
  columns() { return this.statement.columnCount ? this.statement.getColumnNames().map((name) => ({ name })) : []; }
  bind(params) { if (params.length) this.statement.bind(params); }
  finish() { this.statement.finalize(); }
  all(...params) {
    try {
      this.bind(params); const result = [];
      while (this.statement.step()) {
        const row = this.statement.get({});
        for (const key of Object.keys(row)) row[key] = normalizeValue(row[key]);
        result.push(row);
      }
      if (!this.readonly) this.owner.dirty = true;
      return result;
    } finally { this.finish(); }
  }
  get(...params) { return this.all(...params)[0]; }
  run(...params) {
    try {
      this.bind(params); this.statement.step();
      if (!this.readonly) this.owner.dirty = true;
      const changes = this.owner.db.changes(false, false);
      const lastInsertRowid = requireEngine().capi.sqlite3_last_insert_rowid(this.owner.db.pointer);
      return { changes: normalizeValue(changes), lastInsertRowid: normalizeValue(lastInsertRowid) };
    } finally { this.finish(); }
  }
}

export class DatabaseSync {
  constructor(database = ":memory:", { readOnly = false, timeout = 10_000 } = {}) {
    const engine = requireEngine();
    this.database = database; this.readOnly = readOnly; this.dirty = false; this.closed = false;
    this.persistent = database !== ":memory:" && database !== "";
    if (this.persistent && !path.isAbsolute(database)) throw Object.assign(new Error("Persistent SQLite database paths must be absolute."), { code: "relative_path_rejected" });
    if (this.persistent && readOnly && !existsSync(database)) throw Object.assign(new Error("SQLite database does not exist."), { code: "SQLITE_CANTOPEN" });
    if (this.persistent && !readOnly) this.releaseLock = acquirePackageLock(database, timeout);
    try {
      const virtualName = `/casebook-${process.pid}-${virtualSequence += 1}.sqlite3`;
      if (this.persistent && existsSync(database)) {
        if (existsSync(`${database}-wal`) && statSync(`${database}-wal`).size > 0) throw Object.assign(new Error("An uncheckpointed external WAL sidecar cannot be imported safely."), { code: "sqlite_external_wal_uncheckpointed" });
        const bytes = Uint8Array.from(readFileSync(database));
        // A clean checkpointed database may retain WAL read/write header bytes even
        // without a sidecar. The package persistence boundary is an atomic fsynced
        // snapshot, so the private in-memory copy uses rollback-journal header bytes.
        if (bytes.length >= 20 && bytes[18] === 2 && bytes[19] === 2) { bytes[18] = 1; bytes[19] = 1; }
        engine.capi.sqlite3_js_posix_create_file(virtualName, bytes);
      }
      this.db = new engine.oo1.DB(virtualName, readOnly ? "r" : "c");
    } catch (error) { this.releaseLock?.(); throw error; }
  }
  prepare(sql) { if (this.closed) throw new Error("Database is closed."); return new StatementSync(this, sql); }
  exec(sql) { if (this.closed) throw new Error("Database is closed."); this.db.exec(sql); if (!this.readOnly) this.dirty = true; }
  exportSnapshot(destination) {
    if (this.closed || !path.isAbsolute(destination)) throw Object.assign(new Error("Snapshot destination must be an absolute path."), { code: "snapshot_path_invalid" });
    try { atomicPersist(destination, requireEngine().capi.sqlite3_js_db_export(this.db), { noReplace: true }); }
    catch (error) { if (error?.code === "EEXIST") error.code = "snapshot_target_exists"; throw error; }
  }
  close() {
    if (this.closed) return;
    let failure;
    try {
      if (requireEngine().capi.sqlite3_get_autocommit(this.db.pointer) === 0) this.db.exec("ROLLBACK");
      if (this.persistent && !this.readOnly && this.dirty) atomicPersist(this.database, requireEngine().capi.sqlite3_js_db_export(this.db));
    } catch (error) { failure = error; }
    try { this.db.close(); } catch (error) { failure ??= error; }
    this.closed = true;
    try { this.releaseLock?.(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
}

function stripShellDirectives(sql) {
  const lines = String(sql).split("\n");
  for (const line of lines) {
    const value = line.trim();
    if (value.startsWith(".") && !value.startsWith(".bail") && !value.startsWith(".timeout")) {
      throw Object.assign(new Error("SQLite shell directives are unavailable through the package-vendored WASM runtime."), { code: "sqlite_shell_directive_unsupported" });
    }
  }
  return lines.filter((line) => { const value = line.trim(); return !value.startsWith(".bail") && !value.startsWith(".timeout"); }).join("\n");
}

function statementEnds(source) {
  const ends = []; let quote = null, lineComment = false, blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) { if (char === quote) { if (next === quote && quote !== "]") index += 1; else quote = null; } continue; }
    if (char === "-" && next === "-") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "[") { quote = "]"; continue; }
    if (char === ";") ends.push(index + 1);
  }
  if (source.slice(ends.at(-1) ?? 0).trim()) ends.push(source.length);
  return ends;
}

function plainValue(value) {
  if (value == null) return "";
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString("hex").toUpperCase();
  return String(value);
}

export function executeSqlite(database, sql, { json = false, timeout = 10_000, readOnly = false } = {}) {
  const db = new DatabaseSync(database, { timeout, readOnly }); const documents = [];
  try {
    const source = stripShellDirectives(sql), ends = statementEnds(source); let start = 0;
    while (start < source.length) {
      if (!source.slice(start).trim()) break;
      let executed = false, lastError;
      for (const end of ends) {
        if (end <= start) continue;
        const candidate = source.slice(start, end).trim();
        if (!candidate) { start = end; executed = true; break; }
        try {
          const vacuumInto = candidate.match(/^VACUUM\s+INTO\s+'((?:''|[^'])+)'\s*;?$/i);
          if (vacuumInto) db.exportSnapshot(vacuumInto[1].replaceAll("''", "'"));
          else {
            const statement = db.prepare(candidate), columns = statement.columns();
            if (columns.length) documents.push(statement.all()); else statement.run();
          }
          start = end; executed = true; break;
        } catch (error) {
          lastError = error;
          if (/incomplete input|unrecognized token/i.test(error.message) && end < source.length) continue;
          throw error;
        }
      }
      if (!executed) throw lastError ?? new Error("SQLite statement could not be prepared.");
    }
    const stdout = json
      ? documents.map((rows) => JSON.stringify(rows)).join("\n")
      : documents.flatMap((rows) => rows.map((row) => Object.values(row).map(plainValue).join("|"))).join("\n") + (documents.length ? "\n" : "");
    return { stdout, stderr: "" };
  } finally { db.close(); }
}
