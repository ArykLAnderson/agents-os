import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyPackageAssets } from "./package-assets.mjs";

const MAX = 1024 * 1024;
const SETTINGS_MAX = 64 * 1024;
const STDERR_MAX = 64 * 1024;
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
const NAMESPACE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAMESPACE_UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const cliRefusal = (code, message, evidence = {}) => Object.assign(Error(message), { code, evidence });
function canonicalReadIdentity(value, { flag, prefix, operation, code }) {
  if (LOWERCASE_UUID.test(value)) return `${prefix}:${value}`;
  if (new RegExp(`^${prefix}:${LOWERCASE_UUID.source.slice(1, -1)}$`).test(value)) return value;
  throw cliRefusal(code, `${flag} must be a lowercase UUID or a ${prefix}:<lowercase UUID> identity for ${operation}.`, { flag, expected_prefix: prefix, operation });
}
function normalizeReadIdentities(operation, flags) {
  const owner = operation === "case.read" ? { key: "case_id", flag: "--case-id", prefix: "case", code: "case_id_invalid" }
    : operation === "frame.read" ? { key: "frame_id", flag: "--frame-id", prefix: "frame", code: "frame_id_invalid" } : null;
  if (!owner) return;
  flags[owner.key] = canonicalReadIdentity(flags[owner.key], { ...owner, operation });
  if (flags.owner_revision_id != null) flags.owner_revision_id = canonicalReadIdentity(flags.owner_revision_id, {
    flag: "--owner-revision-id",
    prefix: operation === "case.read" ? "case-revision" : "frame-revision",
    operation,
    code: "owner_revision_id_invalid",
  });
}
function canonicalNamespace(value, field = "namespace") {
  if (typeof value !== "string" || !value.trim() || value.length > 1024) throw Error(`${field}_invalid`);
  const raw = value.normalize("NFKC").trim(), pathValue = raw.startsWith("namespace:") ? raw.slice("namespace:".length) : raw;
  const parts = pathValue.split("/").map((part) => part.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[\s_]+/g, "-"));
  if (parts.length < 1 || parts.length > 8 || parts.some((part) => !NAMESPACE_SEGMENT.test(part) || NAMESPACE_UUID_SEGMENT.test(part))) throw Error(`${field}_invalid`);
  return `namespace:${parts.join("/")}`;
}
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

async function safeSettings(file, location = "local") {
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
    if (!data || Array.isArray(data)) throw Error("settings_invalid");
    if (data.schema === "casebook-cli-settings@2") {
      if (location !== "local" || !keys.every((key) => key === "schema" || key === "namespace") || typeof data.namespace !== "string") throw Error("settings_invalid");
      return { namespace: canonicalNamespace(data.namespace) };
    }
    if (data.schema === "casebook-cli-settings@1") {
      if (!keys.every((key) => key === "schema" || key === "store") || (data.store != null && !absolute(data.store))) throw Error("settings_store_authority_forbidden");
      return { store: data.store ?? undefined };
    }
    throw Error("settings_invalid");
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error?.code)) return undefined;
    throw error;
  } finally {
    await fh?.close();
  }
}

const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"].includes(key)));
async function gitOutput(directory, args) {
  const git = spawn("git", ["--no-optional-locks", "-C", directory, ...args], { shell: false, env: gitEnvironment, stdio: ["ignore", "pipe", "ignore"] });
  let out = "";
  for await (const chunk of git.stdout) out += chunk;
  return { code: await new Promise((resolve) => git.once("close", resolve)), out: out.trim() };
}
async function rejectBareRepository(directory) {
  const bare = await gitOutput(directory, ["rev-parse", "--is-bare-repository"]);
  if (bare.code === 0 && bare.out === "true") throw Error("bare_repository");
}
async function resolveWorkspace(explicit) {
  if (explicit != null) {
    const candidate = absolute(explicit), info = candidate && await lstat(candidate).catch(() => null);
    if (!info?.isDirectory()) throw Error("workspace_invalid");
    const workspace = await realpath(candidate);
    await rejectBareRepository(workspace);
    return workspace;
  }
  let cursor = await realpath(process.cwd());
  while (true) {
    if (await lstat(path.join(cursor, ".git")).catch(() => null)) {
      const result = await gitOutput(cursor, ["rev-parse", "--show-toplevel"]);
      if (result.code !== 0 || !result.out) throw Error("git_marker_invalid");
      return realpath(result.out);
    }
    await rejectBareRepository(cursor);
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
    } else if (value === "--draft") {
      if (flags.draft !== undefined) throw Error("grammar_invalid");
      flags.draft = true;
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
  ["create case", "case.create"], ["read case", "case.read"], ["commit case", "case.commit_revision"], ["delete case", "case.delete"],
  ["create frame", "frame.create"], ["read frame", "frame.read"], ["commit frame", "frame.commit_revision"], ["delete frame", "frame.delete"],
  ["search", "query.search"], ["receipt read", "substrate.get_receipt"], ["operation status", "substrate.get_receipt"], ["operation recent", "operation.recent"],
]);
const allowedFlags = {
  "case.create": ["commit_basis", "namespace", "namespace_id", "draft", "id", "title", "summary", "scope", "body", "acting_role", "authority_basis"],
  "case.read": ["case_id", "owner_revision_id"],
  "case.commit_revision": ["case_id", "expected_revision", "commit_basis", "namespace", "namespace_id", "draft", "id", "title", "summary", "scope", "body", "acting_role", "authority_basis"],
  "case.delete": ["case_id", "expected_revision", "reason", "namespace", "namespace_id"],
  "frame.create": ["commit_basis", "namespace", "namespace_id", "draft", "id", "title", "outcome", "discovery_title", "discovery_body", "discovery_category", "human_authority"],
  "frame.read": ["frame_id", "owner_revision_id"],
  "frame.commit_revision": ["frame_id", "expected_revision", "commit_basis", "namespace", "namespace_id", "draft", "id", "title", "outcome", "discovery_title", "discovery_body", "discovery_category", "human_authority"],
  "frame.delete": ["frame_id", "expected_revision", "reason", "namespace", "namespace_id"],
  "query.search": ["query", "namespace", "namespace_id", "limit", "cursor"],
  "substrate.get_receipt": ["operation_id"],
  "operation.recent": ["limit", "before_operation_fence"],
};
function required(operation, flags, input) {
  const needed = {
    "case.create": ["commit_basis"], "case.commit_revision": ["case_id", "expected_revision", "commit_basis"], "case.delete": ["case_id", "expected_revision", "reason"], "case.read": ["case_id"],
    "frame.create": ["commit_basis"], "frame.commit_revision": ["frame_id", "expected_revision", "commit_basis"], "frame.delete": ["frame_id", "expected_revision", "reason"], "frame.read": ["frame_id"],
    "query.search": ["query"], "substrate.get_receipt": ["operation_id"], "operation.recent": [],
  }[operation];
  if (!needed || needed.some((key) => flags[key] == null) || Object.keys(flags).some((key) => !allowedFlags[operation].includes(key))) throw Error("grammar_invalid");
  if (flags.namespace != null && flags.namespace_id != null) throw Error("namespace_selector_conflict");
  const mutation = ["case.create", "case.commit_revision", "frame.create", "frame.commit_revision"].includes(operation);
  const deletion = ["case.delete", "frame.delete"].includes(operation);
  const commit = ["case.commit_revision", "frame.commit_revision"].includes(operation);
  const authoringFlags = new Set(["draft", "id", "title", "summary", "scope", "body", "acting_role", "authority_basis", "outcome", "discovery_title", "discovery_body", "discovery_category", "human_authority"]);
  if (commit && Object.keys(flags).some((key) => authoringFlags.has(key))) throw Error("commit_aggregate_required");
  if (mutation && input && flags.draft) throw Error("aggregate_transport_conflict");
  if (mutation && !input && !flags.draft && !flags.id && !flags.title && !flags.discovery_title) throw Error("aggregate_or_direct_input_required");
  const direct = mutation && !input && !flags.draft;
  if (direct && operation.startsWith("case.") && ["title", "summary", "scope", "body", "acting_role"].some((key) => flags[key] == null || flags[key] === "")) throw Error("case_direct_fields_required");
  if (direct && operation.startsWith("frame.") && ["title", "outcome", "discovery_title", "discovery_body"].some((key) => flags[key] == null || flags[key] === "")) throw Error("frame_direct_fields_required");
  if (deletion && input) throw Error("aggregate_not_allowed");
  if (flags.draft && !mutation) throw Error("draft_not_allowed");
  if ((operation === "query.search" && flags.limit != null && (!/^\d+$/.test(flags.limit) || +flags.limit < 1 || +flags.limit > 100))
    || (operation === "operation.recent" && flags.limit != null && (!/^\d+$/.test(flags.limit) || +flags.limit < 1 || +flags.limit > 20))
    || (flags.before_operation_fence != null && (!/^\d+$/.test(flags.before_operation_fence) || +flags.before_operation_fence < 1))
    || (flags.expected_revision != null && (!/^\d+$/.test(flags.expected_revision) || +flags.expected_revision < 1))) throw Error("grammar_invalid");
  if (flags.draft && Object.keys(flags).some((key) => !["draft", "commit_basis", "namespace", "namespace_id"].includes(key))) throw Error("draft_direct_flags_conflict");
  if (mutation && input && flags.draft) throw Error("draft_input_conflict");
}

function generatedId(prefix) { return `${prefix}:${randomUUID().toLowerCase()}`; }
function knowledgeEntry(value, draft, index = 0) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const body = item.body ?? draft.body;
  const actingRole = item.acting_role ?? item.provenance?.acting_role ?? draft.acting_role ?? draft.provenance?.acting_role;
  if (body == null || actingRole == null) throw Error("draft_knowledge_fields_required");
  const provenance = item.provenance ?? { acting_role: actingRole, ...(item.authority_basis ?? draft.authority_basis ?? draft.provenance?.authority_basis ? { authority_basis: item.authority_basis ?? draft.authority_basis ?? draft.provenance.authority_basis } : {}) };
  return { id: item.id && item.id !== draft.id ? item.id : generatedId("knowledge"), state: item.state ?? "active", version: { display_label: item.display_label ?? `K-${String(index + 1).padStart(3, "0")}`, title: item.title ?? draft.title, purpose: item.purpose ?? draft.summary, classification: item.classification ?? "provisional", body, ...(item.scope == null && draft.scope == null ? {} : { scope: item.scope ?? draft.scope }), visibility: item.visibility ?? "private", provenance, positions: item.positions ?? [], relationships: item.relationships ?? [], references: item.references ?? [] } };
}
function expandDiscovery(value, index) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { ...item, id: item.id ?? generatedId("discovery"), display_order: item.display_order ?? index, lifecycle: item.lifecycle ?? "active", category: item.category ?? "frontier", title: item.title, body: item.body, human_authority: item.human_authority ?? "unclear", dependencies: item.dependencies ?? [] };
}
function expandDraft(kind, draft, flags, namespace, existingId = null) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw Error("draft_object_required");
  const id = draft.id ?? existingId ?? generatedId(kind);
  if (kind === "case") {
    const compact = draft.knowledge ?? (draft.body != null ? draft : null);
    const entries = Array.isArray(draft.entries)
      ? (draft.entries.length === 0 || draft.entries.every((entry) => entry?.version) ? draft.entries : draft.entries.map((entry, index) => knowledgeEntry(entry, draft, index)))
      : compact ? (Array.isArray(compact) ? compact : [compact]).map((entry, index) => knowledgeEntry(entry, draft, index)) : [];
    return { id, home_namespace_id: namespace, state: "active", title: draft.title, summary: draft.summary, scope: draft.scope, provenance: draft.provenance, aliases: draft.aliases ?? [], facets: draft.facets ?? [], entries, sources: draft.sources ?? [], relationships: draft.relationships ?? [], references: draft.references ?? [] };
  }
  const suppliedDiscovery = draft.discovery ?? (draft.discovery_title != null || draft.discovery_body != null ? [{ title: draft.discovery_title, body: draft.discovery_body, category: draft.discovery_category, human_authority: draft.human_authority }] : []);
  const discovery = suppliedDiscovery.map(expandDiscovery);
  return { id, home_namespace_id: namespace, status: draft.status ?? "active", ...(draft.title == null ? {} : { title: draft.title }), ...(draft.outcome == null ? {} : { outcome: draft.outcome }), ...(draft.included_scope == null ? {} : { included_scope: draft.included_scope }), ...(draft.excluded_scope == null ? {} : { excluded_scope: draft.excluded_scope }), ...(draft.limitations == null ? {} : { limitations: draft.limitations }), ...(draft.completion_condition == null ? {} : { completion_condition: draft.completion_condition }), discovery, case_links: draft.case_links ?? [], frame_links: draft.frame_links ?? [], downstream_links: draft.downstream_links ?? [], artifact_links: draft.artifact_links ?? [], ...(draft.authorization_provenance == null ? {} : { authorization_provenance: draft.authorization_provenance }), disposition_boundaries: draft.disposition_boundaries ?? [], case_dispositions: draft.case_dispositions ?? [] };
}
function directAggregate(kind, flags, namespace) {
  if (kind === "case") return expandDraft(kind, { id: flags.id, title: flags.title, summary: flags.summary, scope: flags.scope, body: flags.body, acting_role: flags.acting_role, authority_basis: flags.authority_basis }, flags, namespace);
  return expandDraft(kind, { id: flags.id, title: flags.title, outcome: flags.outcome, discovery_title: flags.discovery_title, discovery_body: flags.discovery_body, discovery_category: flags.discovery_category, human_authority: flags.human_authority }, flags, namespace);
}

async function bridgeCall(request, workspace) {
  const encoded = Buffer.from(JSON.stringify(request));
  if (encoded.length > MAX) throw Error("bridge_request_too_large");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridge.pathname], { cwd: workspace, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const mutation = ["case.create", "case.commit_revision", "case.delete", "frame.create", "frame.commit_revision", "frame.delete"].includes(request.operation);
    let output = Buffer.alloc(0), stderr = Buffer.alloc(0), stderrOverflow = false, transportSubmitted = false, settled = false, aborting = false;
    let timer;
    const terminal = new Promise((resolveTerminal) => child.once("close", (code, signal) => resolveTerminal({ code, signal })));
    const boundedAppend = (current, chunk) => {
      const combined = Buffer.concat([current, chunk]);
      if (combined.length <= STDERR_MAX) return combined;
      stderrOverflow = true;
      return combined.subarray(combined.length - STDERR_MAX);
    };
    // Child diagnostics are bounded for parent-process hygiene only. They never
    // cross the casebook-cli-result boundary.
    const diagnostic = (termination = null) => ({
      stderr_bytes_retained: stderr.length,
      stderr_overflow: stderrOverflow,
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
    await verifyPackageAssets();
    const parsed = parse(argv);
    operation = operations.get(parsed.command.join(" ")) ?? null;
    if (!operation) throw Error("grammar_invalid");
    const declaredInput = parsed.global["--input"] !== undefined || parsed.global["--input-file"] !== undefined;
    required(operation, parsed.flags, declaredInput);
    normalizeReadIdentities(operation, parsed.flags);
    const workspace = await resolveWorkspace(parsed.global["--workspace"]);
    let authority = baseAuthority(workspace);
    ctx = { authority };
    let store = parsed.global["--store"] ? absolute(parsed.global["--store"]) : null, source = store ? "cli_override" : null;
    if (parsed.global["--store"] && !store) throw Error("store_invalid");
    const localSettings = parsed.global["--store"] && (parsed.flags.namespace != null || parsed.flags.namespace_id != null)
      ? undefined
      : await safeSettings(path.join(workspace, ".casebook", "settings.json"));
    if (localSettings?.store) throw Error("settings_store_authority_forbidden");
    let selectedNamespace = parsed.flags.namespace ?? parsed.flags.namespace_id ?? localSettings?.namespace ?? null;
    if (selectedNamespace != null) selectedNamespace = canonicalNamespace(selectedNamespace);
    const namespaceRequired = ["case.create", "case.commit_revision", "frame.create", "frame.commit_revision", "case.delete", "frame.delete", "query.search"].includes(operation);
    if (namespaceRequired && !selectedNamespace) throw Error("namespace_required");
    if (selectedNamespace) { parsed.flags.namespace_id = selectedNamespace; delete parsed.flags.namespace; }
    if (!store) {
      const globalSettings = await safeSettings(path.join(absolute(process.env.XDG_CONFIG_HOME) || path.join(process.env.HOME || os.homedir(), ".config"), "casebook", "config.json"), "global");
      if (globalSettings?.store) { store = globalSettings.store; source = "global_config"; }
    }
    if (!store) { store = path.join(absolute(process.env.XDG_DATA_HOME) || path.join(process.env.HOME || os.homedir(), ".local", "share"), "casebook", "casebook.sqlite"); source = "xdg_default"; }
    // This is retained solely as the request candidate. It is never rendered until
    // the provider has admitted this same canonical path through target.describe.
    const canonicalCandidate = store;
    authority = { ...authority, resolution_source: source };
    ctx.authority = authority;
    let aggregate = null;
    const modes = [parsed.global["--input"] !== undefined, parsed.global["--input-file"] !== undefined, parsed.flags.draft === true].filter(Boolean).length;
    if (modes > 1) throw Error("input_transport_conflict");
    if (parsed.flags.draft === true) {
      const raw = await new Response(process.stdin).text();
      if (!raw.trim()) throw Error("draft_empty");
      if (Buffer.byteLength(raw) > MAX) throw Error("aggregate_too_large");
      const draft = duplicateFreeJson(raw);
      aggregate = expandDraft(operation.startsWith("case") ? "case" : "frame", draft, parsed.flags, selectedNamespace);
    }
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
    const direct = ["case.create", "frame.create", "case.commit_revision", "frame.commit_revision"].includes(operation) && !declaredInput && !parsed.flags.draft;
    if (direct) aggregate = directAggregate(operation.startsWith("case") ? "case" : "frame", parsed.flags, selectedNamespace);
    if (!aggregate && ["case.create", "frame.create", "case.commit_revision", "frame.commit_revision"].includes(operation)) throw Error("aggregate_transport_required");
    if (operation === "case.commit_revision" && aggregate?.id !== parsed.flags.case_id) throw Error("case_id_mismatch");
    if (operation === "frame.commit_revision" && aggregate?.id !== parsed.flags.frame_id) throw Error("frame_id_mismatch");
    const describe = await bridgeCall({ operation: "target.describe", workspace, store: canonicalCandidate }, workspace);
    if (!describe.ok) return { result: refuse(operation, authority, describe.failure?.code ?? "target_refused", describe.failure?.message ?? "Target admission refused."), exitCode: 2 };
    const target = describe.result;
    if (!target || typeof target.store_id !== "string" || typeof target.admission_slot_id !== "string" || typeof target.profile_id !== "string" || typeof target.profile_revision_id !== "string" || !Number.isInteger(target.activation_fence)) throw Error("target_response_invalid");
    const canonicalStore = await realpath(canonicalCandidate);
    authority = { status: "target_admitted", workspace, store: canonicalStore, resolution_source: source, store_id: target.store_id, admission_slot_id: target.admission_slot_id, profile_id: target.profile_id, profile_revision_id: target.profile_revision_id, activation_fence: target.activation_fence };
    ctx = { authority };
    const mutation = ["case.create", "case.commit_revision", "frame.create", "frame.commit_revision", "case.delete", "frame.delete"].includes(operation);
    const operationId = mutation ? `operation:${randomUUID().toLowerCase()}` : null;
    const answer = await bridgeCall({ operation, workspace, store: canonicalStore, target, flags: parsed.flags, aggregate, operation_id: operationId }, workspace);
    if (!answer || typeof answer.ok !== "boolean" || (answer.ok && (!answer.result || typeof answer.result !== "object")) || (!answer.ok && (!answer.failure || typeof answer.failure !== "object"))) throw Object.assign(Error("bridge_contradiction"), { delivery: mutation, operation_id: operationId, diagnostics: answer?.__bridgeDiagnostics });
    if (!answer.ok) return { result: refuse(operation, authority, answer.failure?.code ?? "provider_refused", answer.failure?.message ?? "Provider refused the operation."), exitCode: 2 };
    const raw = answer.result;
    let result;
    if (mutation) {
      const kind = operation.startsWith("case") ? "case" : "frame";
      const ownerId = (raw.case ?? raw.frame)?.id ?? raw.owner?.id ?? parsed.flags[`${kind}_id`];
      result = { owner: { kind, id: ownerId }, revision: { id: raw.revision.id, number: raw.revision.number }, operation_id: operationId };
    }
    else if (operation === "query.search") result = { items: raw.matches, next_cursor: raw.next_cursor, result_completeness: raw.bounds.completeness, observed_operation_fence: target.observed_operation_fence };
    else if (operation === "substrate.get_receipt") result = { observation: raw.status === "settled" ? "settled" : "absent_at_fence", operation_id: parsed.flags.operation_id, receipt: raw.receipt ?? null, observed_operation_fence: raw.operation_fence ?? target.observed_operation_fence };
    else if (operation === "operation.recent") result = raw;
    else result = { owner: { kind: operation.startsWith("case") ? "case" : "frame", id: (raw.case ?? raw.frame).id }, revision: { id: raw.revision.id, number: raw.revision.number }, aggregate: raw.case ?? raw.frame };
    return { result: terminal(operation, authority, "success", { result, receipt: mutation ? raw.receipt ?? null : null }), exitCode: 0 };
  } catch (error) {
    const authority = ctx?.authority ?? baseAuthority();
    const delivery = Boolean(error.delivery);
    return { result: refuse(operation, authority, error.code ?? error.message ?? "cli_refusal", delivery ? "Bridge delivery may have occurred." : error.message ?? "CLI invocation was refused.", delivery, { commit_may_have_occurred: delivery, operation_id: error.operation_id ?? null, ...(error.evidence ?? {}) }), exitCode: delivery ? 3 : 1 };
  }
}
