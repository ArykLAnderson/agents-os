import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyPackageAssets } from "./package-assets.mjs";

const MAX = 1024 * 1024;
const SETTINGS_MAX = 64 * 1024;
const STDERR_MAX = 16 * 1024;
const CHILD_CLEANUP_MS = 1_000;
const TEST_HOOK = "casebook-cli-e2e@1";
const bridgeDeadline = () => {
  if (process.env.CASEBOOK_CLI_TEST_HOOK !== TEST_HOOK) return 30_000;
  const value = Number(process.env.CASEBOOK_CLI_TEST_BRIDGE_TIMEOUT_MS);
  return Number.isInteger(value) && value >= 10 && value <= 1_000 ? value : 30_000;
};
const bridge = new URL("../bridge/persistence-bridge.mjs", import.meta.url);
const baseAuthority = (workspace = null) => ({
  status: workspace ? "workspace_resolved" : "unresolved",
  workspace,
  store: null,
  resolution_source: null,
  store_id: null,
  workspace_id: null,
  admission_slot_id: null,
  profile_id: null,
  profile_revision_id: null,
  activation_fence: null,
});
const terminal = (operation, authority, status, extra) => ({ schema: "casebook-cli-result@2", status, operation, authority, ...extra });
const refuse = (operation, authority, code, message, delivery = false, evidence = {}) => terminal(operation, authority, delivery ? "delivery_unknown" : "refused", {
  failure: {
    class: delivery ? "delivery_unknown" : "cli_refusal",
    code,
    message,
    retry_disposition: delivery ? "reconcile" : "never",
    evidence,
  },
});
const absolute = (value) => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0") && !value.includes("~") && path.normalize(value) === value ? value : null;
function duplicateFreeJson(text) {
 try {
  let at = 0;
  const whitespace = () => { while (/\s/.test(text[at] ?? "")) at += 1; };
  const string = () => {
    const start = at++;
    for (; at < text.length; at += 1) {
      if (text[at] === "\\") { at += 1; continue; }
      if (text[at] === '"') { at += 1; return JSON.parse(text.slice(start, at)); }
    }
    throw Error("json_invalid");
  };
  const value = () => {
    whitespace();
    if (text[at] === "{") {
      at += 1; const keys = new Set(); whitespace();
      if (text[at] === "}") { at += 1; return; }
      while (true) {
        whitespace(); if (text[at] !== '"') throw Error("json_invalid");
        const key = string(); if (keys.has(key)) throw Error("json_duplicate_key"); keys.add(key);
        whitespace(); if (text[at++] !== ":") throw Error("json_invalid"); value(); whitespace();
        if (text[at] === "}") { at += 1; return; }
        if (text[at++] !== ",") throw Error("json_invalid");
      }
    }
    if (text[at] === "[") {
      at += 1; whitespace(); if (text[at] === "]") { at += 1; return; }
      while (true) { value(); whitespace(); if (text[at] === "]") { at += 1; return; } if (text[at++] !== ",") throw Error("json_invalid"); }
    }
    if (text[at] === '"') { string(); return; }
    const start = at; while (at < text.length && !/[\s,\]}]/.test(text[at])) at += 1;
    JSON.parse(text.slice(start, at));
  };
  value(); whitespace(); if (at !== text.length) throw Error("json_invalid");
  return JSON.parse(text);
 } catch (error) {
  if (error?.message === "json_duplicate_key" || error?.message === "json_invalid") throw error;
  throw Error("json_invalid");
 }
}

async function safeSettings(file) {
  let fh;
  try {
    const pathInfo = await lstat(file).catch((error) => ["ENOENT", "ENOTDIR"].includes(error?.code) ? null : Promise.reject(error));
    if (pathInfo == null) return undefined;
    if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) throw Error("settings_unsafe");
    fh = await open(file, "r");
    const before = await fh.stat();
    if (!before.isFile() || before.size > SETTINGS_MAX) throw Error("settings_unsafe");
    const bytes = await fh.readFile({ encoding: "utf8" });
    const after = await fh.stat();
    if (before.ino !== after.ino || before.size !== after.size) throw Error("settings_changed");
    if (pathInfo.dev !== before.dev || pathInfo.ino !== before.ino || before.isSymbolicLink()) throw Error("settings_changed");
    const data = duplicateFreeJson(bytes), keys = Object.keys(data ?? {});
    if (!data || Array.isArray(data) || data.schema !== "casebook-cli-settings@1" || !keys.every((key) => key === "schema" || key === "store") || (data.store != null && !absolute(data.store))) throw Error("settings_invalid");
    return data.store ?? undefined;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error?.code)) return undefined;
    throw error;
  } finally {
    await fh?.close();
  }
}

async function resolveWorkspace(explicit) {
  if (explicit != null) {
    const candidate = absolute(explicit), info = candidate && await lstat(candidate).catch(() => null);
    if (!info?.isDirectory()) throw Error("workspace_invalid");
    return realpath(candidate);
  }
  let cursor = await realpath(process.cwd());
  while (true) {
    const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"].includes(key)));
    const gitOutput = async (args) => {
      const git = spawn("git", ["--no-optional-locks", "-C", cursor, ...args], { shell: false, env: gitEnvironment, stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      for await (const chunk of git.stdout) out += chunk;
      return { code: await new Promise((resolve) => git.once("close", resolve)), out: out.trim() };
    };
    if (await lstat(path.join(cursor, ".git")).catch(() => null)) {
      const result = await gitOutput(["rev-parse", "--show-toplevel"]);
      if (result.code !== 0 || !result.out) throw Error("git_marker_invalid");
      return realpath(result.out);
    }
    const bare = await gitOutput(["rev-parse", "--is-bare-repository"]);
    if (bare.code === 0 && bare.out === "true") return realpath(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) return cursor;
    cursor = parent;
  }
}

function parse(argv) {
  const global = {}, command = [], flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--workspace", "--store", "--input", "--input-file"].includes(value)) {
      if (global[value] !== undefined) throw Error("grammar_invalid");
      global[value] = argv[++index];
      if (global[value] === undefined) throw Error("grammar_invalid");
    } else if (value === "--json") {
      if (global.json) throw Error("grammar_invalid");
      global.json = true;
    } else if (value.startsWith("--")) {
      const key = value.slice(2).replaceAll("-", "_");
      if (flags[key] !== undefined) throw Error("grammar_invalid");
      flags[key] = argv[++index];
      if (flags[key] === undefined) throw Error("grammar_invalid");
    } else command.push(value);
  }
  return { global, flags, command };
}

const operations = new Map([
  ["create case", "case.create"], ["read case", "case.read"], ["commit case", "case.commit_revision"],
  ["create frame", "frame.create"], ["read frame", "frame.read"], ["commit frame", "frame.commit_revision"],
  ["search", "query.search"], ["receipt read", "substrate.get_receipt"], ["operation status", "substrate.get_receipt"], ["operation recent", "operation.recent"],
]);
const allowedFlags = {
  "case.create": ["commit_basis", "namespace_id"],
  "case.read": ["case_id", "owner_revision_id"],
  "case.commit_revision": ["case_id", "expected_revision", "commit_basis", "namespace_id"],
  "frame.create": ["commit_basis", "namespace_id"],
  "frame.read": ["frame_id", "owner_revision_id"],
  "frame.commit_revision": ["frame_id", "expected_revision", "commit_basis", "namespace_id"],
  "query.search": ["query", "namespace_id", "limit", "cursor"],
  "substrate.get_receipt": ["operation_id"],
  "operation.recent": ["limit", "before_operation_fence"],
};
function required(operation, flags, input) {
  const needed = {
    "case.create": ["commit_basis"], "case.commit_revision": ["case_id", "expected_revision", "commit_basis"], "case.read": ["case_id"],
    "frame.create": ["commit_basis"], "frame.commit_revision": ["frame_id", "expected_revision", "commit_basis"], "frame.read": ["frame_id"],
    "query.search": ["query"], "substrate.get_receipt": ["operation_id"], "operation.recent": [],
  }[operation];
  if (!needed || needed.some((key) => flags[key] == null) || Object.keys(flags).some((key) => !allowedFlags[operation].includes(key))) throw Error("grammar_invalid");
  const mutation = ["case.create", "case.commit_revision", "frame.create", "frame.commit_revision"].includes(operation);
  if (mutation !== input) throw Error("aggregate_transport_required");
  if ((operation === "query.search" && flags.limit != null && (!/^\d+$/.test(flags.limit) || +flags.limit < 1 || +flags.limit > 100))
    || (operation === "operation.recent" && flags.limit != null && (!/^\d+$/.test(flags.limit) || +flags.limit < 1 || +flags.limit > 20))
    || (flags.before_operation_fence != null && (!/^\d+$/.test(flags.before_operation_fence) || +flags.before_operation_fence < 1))
    || (flags.expected_revision != null && (!/^\d+$/.test(flags.expected_revision) || +flags.expected_revision < 1))) throw Error("grammar_invalid");
}

async function bridgeCall(request, workspace) {
  const encoded = Buffer.from(JSON.stringify(request));
  if (encoded.length > MAX) throw Error("bridge_request_too_large");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridge.pathname], { cwd: workspace, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const mutation = ["case.create", "case.commit_revision", "frame.create", "frame.commit_revision"].includes(request.operation);
    let output = Buffer.alloc(0), stderr = Buffer.alloc(0), transportSubmitted = false, settled = false, aborting = false;
    let timer;
    const terminal = new Promise((resolveTerminal) => child.once("close", (code, signal) => resolveTerminal({ code, signal })));
    const boundedAppend = (current, chunk) => {
      const combined = Buffer.concat([current, chunk]);
      return combined.length <= STDERR_MAX ? combined : combined.subarray(combined.length - STDERR_MAX);
    };
    const diagnostic = (termination = null) => ({
      stderr: stderr.toString("utf8"),
      stderr_truncated: stderr.length >= STDERR_MAX,
      termination,
    });
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const failure = (code, { delivery = false, termination = null } = {}) => Object.assign(Error(code), {
      delivery,
      operation_id: request.operation_id ?? null,
      diagnostics: diagnostic(termination),
    });
    const abort = async (code) => {
      if (settled || aborting) return;
      aborting = true;
      clearTimeout(timer);
      let requested = null;
      if (!child.killed) { child.kill("SIGTERM"); requested = "SIGTERM"; }
      let observed = await Promise.race([
        terminal,
        new Promise((resolveTerminal) => setTimeout(() => resolveTerminal(null), CHILD_CLEANUP_MS)),
      ]);
      if (!observed) {
        child.kill("SIGKILL");
        requested = "SIGKILL";
        observed = await Promise.race([
          terminal,
          new Promise((resolveTerminal) => setTimeout(() => resolveTerminal(null), CHILD_CLEANUP_MS)),
        ]);
      }
      finish(reject, failure(code, {
        delivery: mutation && transportSubmitted,
        termination: { requested, observed, cleanup_bound_ms: CHILD_CLEANUP_MS },
      }));
    };
    child.stderr.on("data", (chunk) => { stderr = boundedAppend(stderr, chunk); });
    child.stdout.on("data", (chunk) => {
      if (settled || aborting) return;
      output = Buffer.concat([output, chunk]);
      if (output.length > MAX) void abort("bridge_overflow");
    });
    child.on("error", () => finish(reject, failure("bridge_launch_failed")));
    child.on("close", (code, signal) => {
      if (settled || aborting) return;
      if (signal) return finish(reject, failure("bridge_signal", { delivery: mutation && transportSubmitted, termination: { requested: null, observed: { code, signal }, cleanup_bound_ms: CHILD_CLEANUP_MS } }));
      if (code !== 0) return finish(reject, failure("bridge_exit_nonzero", { delivery: mutation && transportSubmitted, termination: { requested: null, observed: { code, signal }, cleanup_bound_ms: CHILD_CLEANUP_MS } }));
      try {
        const response = duplicateFreeJson(output.toString("utf8"));
        if (response && typeof response === "object") Object.defineProperty(response, "__bridgeDiagnostics", { value: diagnostic({ requested: null, observed: { code, signal }, cleanup_bound_ms: CHILD_CLEANUP_MS }), enumerable: false });
        finish(resolve, response);
      } catch { finish(reject, failure("bridge_malformed", { delivery: mutation && transportSubmitted, termination: { requested: null, observed: { code, signal }, cleanup_bound_ms: CHILD_CLEANUP_MS } })); }
    });
    timer = setTimeout(() => { void abort("bridge_timeout"); }, request.operation === "target.describe" ? 30_000 : bridgeDeadline());
    child.stdin.end(encoded);
    transportSubmitted = true;
  });
}

export async function run(argv) {
  let ctx, operation = "unknown";
  try {
    const parsed = parse(argv);
    await verifyPackageAssets();
    operation = operations.get(parsed.command.join(" ")) ?? null;
    if (!operation) throw Error("grammar_invalid");
    const declaredInput = parsed.global["--input"] !== undefined || parsed.global["--input-file"] !== undefined;
    required(operation, parsed.flags, declaredInput);
    const workspace = await resolveWorkspace(parsed.global["--workspace"]);
    let authority = baseAuthority(workspace);
    ctx = { authority };
    let store = parsed.global["--store"] ? absolute(parsed.global["--store"]) : null, source = store ? "cli_override" : null;
    if (parsed.global["--store"] && !store) throw Error("store_invalid");
    if (!store) {
      for (const [file, kind] of [[path.join(workspace, ".casebook", "settings.json"), "workspace_settings"], [path.join(absolute(process.env.XDG_CONFIG_HOME) || path.join(process.env.HOME || os.homedir(), ".config"), "casebook", "config.json"), "global_config"]]) {
        const found = await safeSettings(file);
        if (found) { store = found; source = kind; break; }
      }
    }
    if (!store) { store = path.join(absolute(process.env.XDG_DATA_HOME) || path.join(process.env.HOME || os.homedir(), ".local", "share"), "casebook", "casebook.sqlite"); source = "xdg_default"; }
    // This is retained solely as the request candidate. It is never rendered until
    // the provider has admitted this same canonical path through target.describe.
    const canonicalCandidate = store;
    authority = { ...authority, resolution_source: source };
    ctx.authority = authority;
    let aggregate = null;
    const modes = [parsed.global["--input"] !== undefined, parsed.global["--input-file"] !== undefined].filter(Boolean).length;
    if (modes > 1) throw Error("input_transport_conflict");
    if (parsed.global["--input"] !== undefined) {
      const raw = parsed.global["--input"] === "-" ? await new Response(process.stdin).text() : parsed.global["--input"];
      if (Buffer.byteLength(raw) > MAX) throw Error("aggregate_too_large");
      aggregate = duplicateFreeJson(raw);
    }
    if (parsed.global["--input-file"] !== undefined) {
      const file = absolute(parsed.global["--input-file"]);
      if (!file) throw Error("input_file_invalid");
      const raw = await readFile(file, "utf8");
      if (Buffer.byteLength(raw) > MAX) throw Error("aggregate_too_large");
      aggregate = duplicateFreeJson(raw);
    }
    if (Boolean(aggregate) !== declaredInput) throw Error("aggregate_transport_required");
    if (operation === "case.commit_revision" && aggregate?.id !== parsed.flags.case_id) throw Error("case_id_mismatch");
    if (operation === "frame.commit_revision" && aggregate?.id !== parsed.flags.frame_id) throw Error("frame_id_mismatch");
    const describe = await bridgeCall({ operation: "target.describe", workspace, store: canonicalCandidate }, workspace);
    if (!describe.ok) return { result: refuse(operation, authority, describe.failure?.code ?? "target_refused", describe.failure?.message ?? "Target admission refused."), exitCode: 2 };
    const target = describe.result;
    if (!target || typeof target.store_id !== "string" || typeof target.workspace_id !== "string" || typeof target.admission_slot_id !== "string" || typeof target.profile_id !== "string" || typeof target.profile_revision_id !== "string" || !Number.isInteger(target.activation_fence)) throw Error("target_response_invalid");
    const canonicalStore = await realpath(canonicalCandidate);
    authority = { status: "target_admitted", workspace, store: canonicalStore, resolution_source: source, store_id: target.store_id, workspace_id: target.workspace_id, admission_slot_id: target.admission_slot_id, profile_id: target.profile_id, profile_revision_id: target.profile_revision_id, activation_fence: target.activation_fence };
    ctx = { authority };
    const mutation = ["case.create", "case.commit_revision", "frame.create", "frame.commit_revision"].includes(operation);
    const operationId = mutation ? `operation:${randomUUID().toLowerCase()}` : null;
    const answer = await bridgeCall({ operation, workspace, store: canonicalStore, target, flags: parsed.flags, aggregate, operation_id: operationId }, workspace);
    if (!answer || typeof answer.ok !== "boolean" || (answer.ok && (!answer.result || typeof answer.result !== "object")) || (!answer.ok && (!answer.failure || typeof answer.failure !== "object"))) throw Object.assign(Error("bridge_contradiction"), { delivery: mutation, operation_id: operationId, diagnostics: answer?.__bridgeDiagnostics });
    if (!answer.ok) return { result: refuse(operation, authority, answer.failure?.code ?? "provider_refused", answer.failure?.message ?? "Provider refused the operation."), exitCode: 2 };
    const raw = answer.result;
    let result;
    if (mutation) result = { owner: { kind: operation.startsWith("case") ? "case" : "frame", id: (raw.case ?? raw.frame).id }, revision: { id: raw.revision.id, number: raw.revision.number }, operation_id: operationId };
    else if (operation === "query.search") result = { items: raw.matches, next_cursor: raw.next_cursor, result_completeness: raw.bounds.completeness, observed_operation_fence: target.observed_operation_fence };
    else if (operation === "substrate.get_receipt") result = { observation: raw.status === "settled" ? "settled" : "absent_at_fence", operation_id: parsed.flags.operation_id, receipt: raw.receipt ?? null, observed_operation_fence: raw.operation_fence ?? target.observed_operation_fence };
    else if (operation === "operation.recent") result = raw;
    else result = { owner: { kind: operation.startsWith("case") ? "case" : "frame", id: (raw.case ?? raw.frame).id }, revision: { id: raw.revision.id, number: raw.revision.number }, aggregate: raw.case ?? raw.frame };
    return { result: terminal(operation, authority, "success", { result, receipt: mutation ? raw.receipt ?? null : null }), exitCode: 0 };
  } catch (error) {
    const authority = ctx?.authority ?? baseAuthority();
    const delivery = Boolean(error.delivery);
    return { result: refuse(operation, authority, error.message ?? "cli_refusal", delivery ? "Bridge delivery may have occurred." : "CLI invocation was refused.", delivery, { commit_may_have_occurred: delivery, operation_id: error.operation_id ?? null, ...(error.diagnostics ? { bridge: error.diagnostics } : {}) }), exitCode: delivery ? 3 : 1 };
  }
}
