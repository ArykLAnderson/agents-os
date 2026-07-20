import { lstat } from "node:fs/promises";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "./diagnostics.mjs";
import { inspectStore, readStoreOperationReceipt } from "./index.mjs";
import { mechanicalDigest } from "./mechanical.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const PROJECTION_KINDS = Object.freeze(["lexical", "reverse_reference", "staleness", "attention"]);
const POSTCONDITION_EVIDENCE = Object.freeze([
  "source_fence", "projection_digest", "verification", "atomic_selection", "canonical_state_unchanged",
]);
const REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id", "context", "authority_claim",
  "safety", "projection_kinds", "canonical_fence", "canonical_state_effect",
  "requested_postcondition_evidence", "configuration",
]);
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const MAX_OWNERS = 256;
const MAX_ENTRIES = 4096;

class ProjectionError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.code = code;
    this.failureClass = options.failureClass ?? "projection_rebuild_invalid";
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER;
    this.evidence = options.evidence ?? {};
  }
}

function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function exact(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.has(key))) {
    throw new ProjectionError("projection_rebuild_invalid", `${label} contains unsupported or invalid fields.`);
  }
}

function requireString(value, field, max = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ProjectionError("projection_rebuild_invalid", `${field} must be a non-empty bounded string.`);
  }
  return value;
}

function requireId(value, field, prefix) {
  requireString(value, field, 128);
  if (!UUID_ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) {
    throw new ProjectionError("projection_rebuild_invalid", `${field} must be a lowercase UUID-based identity.`);
  }
  return value;
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateRequest(request) {
  exact(request, REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new ProjectionError("projection_rebuild_invalid", "request_version must be 1.");
  requireString(request.operation_id, "operation_id", 256);
  requireId(request.store_id, "store_id", "store");
  exact(request.context, CONTEXT_FIELDS, "context");
  requireId(request.context.view_id, "context.view_id", "view");
  requireId(request.context.view_policy_revision_id, "context.view_policy_revision_id", "view-policy");
  requireString(request.context.purpose, "context.purpose");
  if (request.context.requested_audience_ceiling != null && request.context.requested_audience_ceiling !== "private") {
    throw new ProjectionError("view_invalid", "Projection rebuild cannot widen the exact active view.", { failureClass: "view_invalid" });
  }
  exact(request.authority_claim, new Set([
    "human_authorized", "acting_role", "authority_basis", "human_confirmation_reference", "causation", "correlation", "session",
  ]), "authority_claim");
  if (request.authority_claim.human_authorized !== true) {
    throw new ProjectionError("human_authority_claim_required", "Projection rebuild requires explicit human authorization.", { failureClass: "authority_required" });
  }
  for (const field of ["acting_role", "authority_basis", "human_confirmation_reference"]) {
    requireString(request.authority_claim[field], `authority_claim.${field}`);
  }
  exact(request.safety, new Set(["store_class", "authorization_reference"]), "safety");
  if (request.safety.store_class !== "disposable") {
    throw new ProjectionError("disposable_store_authorization_required", "This slice rebuilds projections only in an explicitly authorized disposable store.", { failureClass: "authority_required" });
  }
  requireString(request.safety.authorization_reference, "safety.authorization_reference");
  if (!sameArray(request.projection_kinds, PROJECTION_KINDS)) {
    throw new ProjectionError("projection_kinds_invalid", "projection_kinds must name lexical, reverse_reference, staleness, and attention exactly once in canonical order.");
  }
  if (!Number.isInteger(request.canonical_fence) || request.canonical_fence < 1) {
    throw new ProjectionError("canonical_fence_invalid", "canonical_fence must be a positive integer.");
  }
  if (request.canonical_state_effect !== "none") {
    throw new ProjectionError("canonical_state_effect_invalid", "Projection rebuild must declare no canonical-state effect.");
  }
  if (!sameArray(request.requested_postcondition_evidence, POSTCONDITION_EVIDENCE)) {
    throw new ProjectionError("postcondition_evidence_invalid", "Projection rebuild requires the exact fenced build, verification, selection, and canonical non-mutation evidence set.");
  }
}

async function queryJson(binary, database, query) {
  const { stdout } = await sqlite(binary, database, `PRAGMA query_only = ON;\n${query}`, {
    args: ["-batch", "-bail", "-json", "-cmd", ".timeout 5000"],
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout || "[]");
}

async function prepare(request) {
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) {
    return { failure: failure("asset_incompatible", "Projection rebuild package assets are incompatible.", {
      failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { problems: manifest.problems },
    }) };
  }
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return { failure: failure("sqlite_authority_required", "Projection rebuild requires explicitly selected sqlite authority.", {
      failureClass: "configuration_or_store_unavailable",
    }) };
  }
  const storeEntry = await lstat(configuration.sqlite.store_path).catch(() => null);
  if (!storeEntry?.isFile()) {
    return { failure: failure("store_unavailable", "The configured store is unavailable and was not created.", {
      failureClass: "store_unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { store_present: Boolean(storeEntry), regular_file: storeEntry ? false : null },
    }) };
  }
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) {
    return { failure: failure("sqlite_runtime_incompatible", "The selected SQLite runtime cannot safely rebuild projections.", {
      failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { problems: probe.problems },
    }) };
  }
  const state = await inspectStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") {
    return { failure: failure(state.code ?? "store_unavailable", "The configured store is not available for projection rebuild.", {
      failureClass: state.status === "migration_required" ? "schema_migration_required" : "store_unavailable",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: state.evidence ?? {},
    }) };
  }
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}

async function activeView(binary, storePath, request) {
  const rows = await queryJson(binary, storePath, `
    SELECT vpr.view_policy_revision_id
    FROM view_policy_revisions vpr
    JOIN view_families vf ON vf.view_id=vpr.view_id
    JOIN view_policy_namespace_grants grant ON grant.view_policy_revision_id=vpr.view_policy_revision_id
    JOIN namespaces ns ON ns.namespace_id=grant.namespace_id AND ns.lifecycle='active'
    WHERE vpr.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
      AND vpr.view_id=${sqlText(request.context.view_id)}
      AND vpr.lifecycle='active' AND vpr.audience_ceiling='private'
    LIMIT 1;
  `);
  return rows.length === 1;
}

function requestDigest(request) {
  return mechanicalDigest({
    domain: "casebook-projection-rebuild-request@1",
    protocol: request.protocol,
    operation: request.operation,
    request_version: request.request_version,
    operation_id: request.operation_id,
    store_id: request.store_id,
    context: request.context,
    authority_claim: request.authority_claim,
    safety: request.safety,
    projection_kinds: request.projection_kinds,
    canonical_fence: request.canonical_fence,
    canonical_state_effect: request.canonical_state_effect,
    requested_postcondition_evidence: request.requested_postcondition_evidence,
  });
}

function stableUuid(seed) {
  const hex = mechanicalDigest({ seed });
  const variant = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function readProjectionSelection(binary, storePath) {
  const table = await queryJson(binary, storePath, "SELECT name FROM sqlite_schema WHERE type='table' AND name='disposable_projection_selection';");
  if (!table.length) return { status: "unavailable", generationId: null, sourceFence: null };
  const rows = await queryJson(binary, storePath, "SELECT selection_status,current_generation_id,source_fence FROM disposable_projection_selection WHERE singleton=1;");
  if (!rows.length) return { status: "unavailable", generationId: null, sourceFence: null };
  return {
    status: rows[0].selection_status,
    generationId: rows[0].current_generation_id ?? null,
    sourceFence: rows[0].source_fence ?? null,
  };
}

async function readCanonicalCorpus(binary, storePath, request) {
  const rows = await queryJson(binary, storePath, `
    SELECT json_object(
      'canonical_fence',(SELECT operation_fence FROM store_fence WHERE singleton=1),
      'owners',json(COALESCE((
        SELECT json_group_array(json(owner_json)) FROM (
          SELECT json_object(
            'owner_id',o.owner_id,'owner_kind',o.owner_kind,'home_namespace_id',o.home_namespace_id,
            'revision_id',current.revision_id,'revision_number',current.revision_number,
            'normalized_json',revision.normalized_json,
            'selected_versions',json(COALESCE((
              SELECT json_group_array(json(version_json)) FROM (
                SELECT json_object(
                  'family_id',selected.family_id,'version_id',selected.version_id,
                  'content_json',version.content_json,'content_digest',version.content_digest
                ) AS version_json
                FROM owner_revision_selections selected
                JOIN owner_versions version ON version.version_id=selected.version_id
                WHERE selected.revision_id=current.revision_id
                ORDER BY selected.family_id
              )
            ),'[]'))
          ) AS owner_json
          FROM owners o
          JOIN owner_current current ON current.owner_id=o.owner_id
          JOIN owner_revisions revision ON revision.revision_id=current.revision_id
          JOIN view_policy_namespace_grants grant ON grant.namespace_id=o.home_namespace_id
            AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
          JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
            AND policy.view_id=${sqlText(request.context.view_id)} AND policy.lifecycle='active'
          JOIN json_each(policy.object_kinds_json) kind ON kind.value=o.owner_kind
          ORDER BY o.owner_kind,o.owner_id
        )
      ),'[]'))
    ) AS corpus_json;
  `);
  const corpus = JSON.parse(rows[0]?.corpus_json ?? "{}");
  if (!Number.isInteger(corpus.canonical_fence) || !Array.isArray(corpus.owners)) {
    throw new ProjectionError("projection_source_unavailable", "Canonical projection source could not be read at one fence.");
  }
  return corpus;
}

function tokenize(value, tokens) {
  if (typeof value === "string") {
    for (const token of value.normalize("NFKC").toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}_-]+/u).filter(Boolean)) tokens.add(token);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) tokenize(item, tokens);
    return;
  }
  if (value && typeof value === "object") for (const item of Object.values(value)) tokenize(item, tokens);
}

function mechanicalRevision(value) {
  if (typeof value !== "string" || !value.includes(":")) return value ?? null;
  return `owner-revision:${value.slice(value.indexOf(":") + 1)}`;
}

function referencesIn(value, sourceFamilyId, pathParts = [], output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => referencesIn(item, sourceFamilyId, [...pathParts, index], output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (typeof value.target_kind === "string" && typeof value.target_id === "string") {
    output.push({
      source_family_id: sourceFamilyId,
      path: pathParts.join("."),
      target: { kind: value.target_kind, id: value.target_id },
      predicate: value.predicate ?? "references",
      observed_revision_id: value.observed_revision_id ?? null,
      pinned_revision_id: value.pinned_revision_id ?? null,
    });
  }
  if (value.schema === "case-relationship@1"
    && value.subject?.kind && value.subject?.id && value.object?.kind && value.object?.id) {
    output.push({
      source_family_id: sourceFamilyId,
      path: pathParts.join("."),
      from: { kind: value.subject.kind, id: value.subject.id },
      target: { kind: value.object.kind, id: value.object.id },
      predicate: value.predicate ?? "references",
      observed_revision_id: null,
      pinned_revision_id: null,
    });
  }
  for (const [key, child] of Object.entries(value)) referencesIn(child, sourceFamilyId, [...pathParts, key], output);
  return output;
}

function entry(kind, keyInput, payload) {
  return {
    kind,
    key: mechanicalDigest({ kind, key: keyInput }),
    payload,
    digest: mechanicalDigest(payload),
  };
}

function buildReplacement(corpus, generationId) {
  if (corpus.owners.length > MAX_OWNERS) {
    throw new ProjectionError("projection_bound_exceeded", "The visible canonical owner corpus exceeds the bounded projection rebuild.");
  }
  const owners = [];
  const targetByFamily = new Map();
  for (const raw of corpus.owners) {
    const normalized = JSON.parse(raw.normalized_json);
    const selected = raw.selected_versions.map((version) => ({
      family_id: version.family_id,
      version_id: version.version_id,
      content: JSON.parse(version.content_json),
      content_digest: version.content_digest,
    }));
    if (!selected.length || selected.length > 256) throw new ProjectionError("projection_source_invalid", "A canonical owner selection is absent or exceeds rebuild bounds.");
    for (const version of selected) {
      if (mechanicalDigest(version.content) !== version.content_digest) {
        throw new ProjectionError("projection_source_invalid", "A canonical selected version digest is inconsistent.");
      }
      targetByFamily.set(version.family_id, { ownerId: raw.owner_id, revisionId: raw.revision_id });
    }
    const ownerFamilyId = normalized[`${raw.owner_kind}_family_id`];
    const ownerVersionId = normalized[`${raw.owner_kind}_version_id`];
    const profile = selected.find((version) => version.family_id === raw.owner_id);
    if (ownerFamilyId !== raw.owner_id || !profile || profile.version_id !== ownerVersionId) {
      throw new ProjectionError("projection_source_invalid", "Canonical owner selection identity is inconsistent.");
    }
    owners.push({ ...raw, normalized, selected, profile });
  }

  const entries = [];
  const reverse = [];
  for (const owner of owners) {
    const tokens = new Set();
    for (const selected of owner.selected) tokenize(selected.content, tokens);
    entries.push(entry("lexical", owner.owner_id, {
      schema: "casebook-lexical-projection@1",
      owner: { id: owner.owner_id, kind: owner.owner_kind, home_namespace_id: owner.home_namespace_id },
      revision: { id: owner.revision_id, number: owner.revision_number },
      tokens: [...tokens].sort(),
      selected_family_ids: owner.selected.map((version) => version.family_id).sort(),
    }));
    for (const selected of owner.selected) {
      for (const reference of referencesIn(selected.content, selected.family_id)) {
        const payload = {
          schema: "casebook-reverse-reference-projection@1",
          source_owner: { id: owner.owner_id, kind: owner.owner_kind },
          source_revision_id: owner.revision_id,
          ...reference,
        };
        const reverseEntry = entry("reverse_reference", payload, payload);
        reverse.push({ owner, reference, reverseEntry });
        entries.push(reverseEntry);
      }
    }
  }

  const attentionByOwner = new Map();
  for (const item of reverse) {
    const target = targetByFamily.get(item.reference.target.id);
    const currentRevision = target?.revisionId ?? null;
    const observed = mechanicalRevision(item.reference.observed_revision_id);
    const pinned = mechanicalRevision(item.reference.pinned_revision_id);
    const condition = !target ? "unknown"
      : pinned && pinned !== currentRevision ? "pinned_drift"
        : observed && observed !== currentRevision ? "stale"
          : "current";
    const payload = {
      schema: "casebook-staleness-projection@1",
      source_owner: { id: item.owner.owner_id, kind: item.owner.owner_kind },
      source_family_id: item.reference.source_family_id,
      target: item.reference.target,
      observed_revision_id: item.reference.observed_revision_id,
      pinned_revision_id: item.reference.pinned_revision_id,
      current_target_revision_id: currentRevision,
      condition,
    };
    entries.push(entry("staleness", item.reverseEntry.key, payload));
    if (condition !== "current") {
      const ownerAttention = attentionByOwner.get(item.owner.owner_id) ?? {
        owner: { id: item.owner.owner_id, kind: item.owner.owner_kind },
        conditions: [],
      };
      ownerAttention.conditions.push({
        target: item.reference.target,
        condition,
        observed_revision_id: item.reference.observed_revision_id,
        current_target_revision_id: currentRevision,
      });
      attentionByOwner.set(item.owner.owner_id, ownerAttention);
    }
  }
  for (const attention of attentionByOwner.values()) {
    attention.conditions.sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    entries.push(entry("attention", attention.owner.id, {
      schema: "casebook-attention-projection@1",
      ...attention,
      attention_required: true,
    }));
  }
  if (entries.length > MAX_ENTRIES) throw new ProjectionError("projection_bound_exceeded", "The replacement projection exceeds bounded entry count.");
  entries.sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const counts = Object.fromEntries(PROJECTION_KINDS.map((kind) => [kind, entries.filter((item) => item.kind === kind).length]));
  for (const item of entries) {
    if (!PROJECTION_KINDS.includes(item.kind) || mechanicalDigest(item.payload) !== item.digest) {
      throw new ProjectionError("projection_verification_failed", "Replacement projection entry verification failed.");
    }
  }
  const projectionDigest = mechanicalDigest({
    domain: "casebook-disposable-projection-generation@1",
    generation_id: generationId,
    source_fence: corpus.canonical_fence,
    projection_kinds: PROJECTION_KINDS,
    entries,
  });
  return { entries, counts, projectionDigest };
}

const PROJECTION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS disposable_projection_generations (
    generation_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    source_fence INTEGER NOT NULL CHECK(source_fence > 0),
    projection_kinds_json TEXT NOT NULL CHECK(json_valid(projection_kinds_json)),
    projection_digest TEXT NOT NULL,
    entry_count INTEGER NOT NULL CHECK(entry_count >= 0),
    verification_status TEXT NOT NULL CHECK(verification_status = 'verified'),
    verified_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS disposable_projection_entries (
    generation_id TEXT NOT NULL REFERENCES disposable_projection_generations(generation_id) ON DELETE CASCADE,
    projection_kind TEXT NOT NULL CHECK(projection_kind IN ('lexical','reverse_reference','staleness','attention')),
    entry_key TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    payload_digest TEXT NOT NULL,
    PRIMARY KEY(generation_id,projection_kind,entry_key)
  ) STRICT, WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS disposable_projection_selection (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    selection_status TEXT NOT NULL CHECK(selection_status IN ('current','stale','unavailable')),
    current_generation_id TEXT REFERENCES disposable_projection_generations(generation_id),
    source_fence INTEGER,
    selected_at TEXT NOT NULL
  ) STRICT;
`;

function publicReceipt({ operationId, storeId, requestDigestValue, outcome, resultDigest, settledAt, failureClass, retryDisposition, operationFence }) {
  return {
    operation_id: operationId,
    operation_kind: "projection_rebuild",
    store_id: storeId,
    request_digest: requestDigestValue,
    outcome,
    result_digest: resultDigest,
    settled_at: settledAt,
    failure_class: failureClass,
    retry_disposition: retryDisposition,
    operation_fence: operationFence,
  };
}

async function settleFailure(prepared, request, requestDigestValue, terminalCode, expectedFence) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await inspectStore(prepared.binary, prepared.storePath);
    if (state.status !== "available") throw new ProjectionError("projection_failure_receipt_unavailable", "Projection failure could not be durably classified.");
    const prior = await readProjectionSelection(prepared.binary, prepared.storePath);
    const projectionState = prior.generationId ? "stale" : "unavailable";
    const retryDisposition = terminalCode === "canonical_fence_mismatch" ? RETRY_DISPOSITIONS.AFTER_RECONCILE : RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR;
    const terminal = {
      outcome: terminalCode === "canonical_fence_mismatch" ? "conflict" : "failed",
      code: terminalCode,
      failure_class: terminalCode === "canonical_fence_mismatch" ? "projection_rebuild_precondition_failed" : "projection_rebuild_failed",
      retry_disposition: retryDisposition,
      canonical_state_effect: "none",
      projection_state: projectionState,
    };
    const settledAt = new Date().toISOString();
    const resultDigest = mechanicalDigest({ terminal, expectedFence, observedFence: state.operation_fence, prior });
    const receipt = publicReceipt({
      operationId: request.operation_id, storeId: request.store_id, requestDigestValue,
      outcome: terminal.outcome, resultDigest, settledAt, failureClass: terminal.failure_class,
      retryDisposition, operationFence: state.operation_fence + 1,
    });
    const result = {
      status: "settled",
      terminal,
      projection: { replacement_generation_id: null, preserved_generation_id: prior.generationId },
      selection: { selected: false, status: projectionState, preserved_generation_id: prior.generationId },
      fence_evidence: {
        expected_canonical_fence: expectedFence,
        observed_canonical_fence: state.operation_fence,
        receipt_fence: state.operation_fence + 1,
        one_canonical_fence: false,
        canonical_owner_records_events_unchanged: true,
      },
      receipt,
    };
    const command = `.bail on
      PRAGMA busy_timeout=5000;
      PRAGMA foreign_keys=ON;
      BEGIN IMMEDIATE;
      CREATE TEMP TABLE projection_failure_guard(valid INTEGER NOT NULL CHECK(valid=1));
      INSERT INTO projection_failure_guard VALUES(CASE WHEN (SELECT operation_fence FROM store_fence WHERE singleton=1)=${state.operation_fence} THEN 1 ELSE 0 END);
      ${PROJECTION_SCHEMA_SQL}
      INSERT INTO disposable_projection_selection(singleton,selection_status,current_generation_id,source_fence,selected_at)
      VALUES(1,'unavailable',NULL,NULL,${sqlText(settledAt)})
      ON CONFLICT(singleton) DO UPDATE SET selection_status=${sqlText(projectionState)},selected_at=excluded.selected_at;
      INSERT INTO store_operation_receipts(
        operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,
        settled_at,failure_class,retry_disposition,operation_fence
      ) VALUES(
        ${sqlText(request.operation_id)},'projection_rebuild',${sqlText(request.store_id)},${sqlText(requestDigestValue)},
        ${sqlText(terminal.outcome)},${sqlText(JSON.stringify(result))},${sqlText(resultDigest)},${sqlText(JSON.stringify(request.authority_claim))},
        ${sqlText(settledAt)},${sqlText(terminal.failure_class)},${sqlText(retryDisposition)},${state.operation_fence + 1}
      );
      UPDATE store_fence SET operation_fence=${state.operation_fence + 1} WHERE singleton=1 AND operation_fence=${state.operation_fence};
      DROP TABLE projection_failure_guard;
      COMMIT;`;
    try {
      await sqlite(prepared.binary, prepared.storePath, command, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
      return result;
    } catch (error) {
      const existing = await readStoreOperationReceipt(prepared.binary, prepared.storePath, request.operation_id).catch(() => null);
      if (existing) return existing.operation_kind === "projection_rebuild" && existing.request_digest === requestDigestValue ? existing.result : false;
      if (attempt === 2) throw error;
    }
  }
  return null;
}

async function selectReplacement(prepared, request, requestDigestValue, corpus, replacement, generationId, prior) {
  const settledAt = new Date().toISOString();
  const receiptFence = corpus.canonical_fence + 1;
  const terminal = {
    outcome: "rebuilt", code: "projection_rebuild_completed", failure_class: null,
    retry_disposition: RETRY_DISPOSITIONS.NEVER, canonical_state_effect: "none", projection_state: "current",
  };
  const projection = {
    generation_id: generationId,
    kinds: [...PROJECTION_KINDS],
    digest: replacement.projectionDigest,
    source_fence: corpus.canonical_fence,
    entry_counts: replacement.counts,
    entry_count: replacement.entries.length,
    verified: true,
    verification: { payload_digests: "passed", bounded_complete_build: "passed", canonical_source: "immutable_selected_revisions" },
  };
  const fenceEvidence = {
    canonical_source_fence: corpus.canonical_fence,
    selection_precondition_fence: corpus.canonical_fence,
    receipt_fence: receiptFence,
    one_canonical_fence: true,
    canonical_owner_records_events_unchanged: true,
  };
  const selection = {
    atomic: true,
    selected: true,
    status: "current",
    previous_generation_id: prior.generationId,
    method: "single_sqlite_immediate_transaction",
  };
  const resultDigest = mechanicalDigest({ terminal, projection, fence_evidence: fenceEvidence, selection });
  const receipt = publicReceipt({
    operationId: request.operation_id, storeId: request.store_id, requestDigestValue,
    outcome: terminal.outcome, resultDigest, settledAt, failureClass: null,
    retryDisposition: RETRY_DISPOSITIONS.NEVER, operationFence: receiptFence,
  });
  const result = { status: "settled", terminal, projection, selection, fence_evidence: fenceEvidence, receipt };
  const entryValues = replacement.entries.map((item) => `(
    ${sqlText(generationId)},${sqlText(item.kind)},${sqlText(item.key)},${sqlText(JSON.stringify(item.payload))},${sqlText(item.digest)}
  )`).join(",");
  const command = `.bail on
    PRAGMA busy_timeout=5000;
    PRAGMA foreign_keys=ON;
    BEGIN IMMEDIATE;
    CREATE TEMP TABLE projection_selection_guard(valid INTEGER NOT NULL CHECK(valid=1));
    INSERT INTO projection_selection_guard VALUES(CASE WHEN (SELECT operation_fence FROM store_fence WHERE singleton=1)=${corpus.canonical_fence} THEN 1 ELSE 0 END);
    ${PROJECTION_SCHEMA_SQL}
    INSERT INTO disposable_projection_generations VALUES(
      ${sqlText(generationId)},${sqlText(request.operation_id)},${corpus.canonical_fence},${sqlText(JSON.stringify(PROJECTION_KINDS))},
      ${sqlText(replacement.projectionDigest)},${replacement.entries.length},'verified',${sqlText(settledAt)}
    );
    ${entryValues ? `INSERT INTO disposable_projection_entries VALUES ${entryValues};` : ""}
    DELETE FROM projection_selection_guard;
    INSERT INTO projection_selection_guard VALUES(CASE WHEN
      (SELECT count(*) FROM disposable_projection_generations WHERE generation_id=${sqlText(generationId)} AND verification_status='verified' AND entry_count=${replacement.entries.length})=1
      AND (SELECT count(*) FROM disposable_projection_entries WHERE generation_id=${sqlText(generationId)})=${replacement.entries.length}
      AND (SELECT count(*) FROM disposable_projection_entries WHERE generation_id=${sqlText(generationId)} AND json_valid(payload_json)=0)=0
      THEN 1 ELSE 0 END);
    INSERT INTO disposable_projection_selection(singleton,selection_status,current_generation_id,source_fence,selected_at)
    VALUES(1,'current',${sqlText(generationId)},${corpus.canonical_fence},${sqlText(settledAt)})
    ON CONFLICT(singleton) DO UPDATE SET selection_status='current',current_generation_id=excluded.current_generation_id,
      source_fence=excluded.source_fence,selected_at=excluded.selected_at;
    INSERT INTO store_operation_receipts(
      operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,
      settled_at,failure_class,retry_disposition,operation_fence
    ) VALUES(
      ${sqlText(request.operation_id)},'projection_rebuild',${sqlText(request.store_id)},${sqlText(requestDigestValue)},'rebuilt',
      ${sqlText(JSON.stringify(result))},${sqlText(resultDigest)},${sqlText(JSON.stringify(request.authority_claim))},${sqlText(settledAt)},
      NULL,'never',${receiptFence}
    );
    UPDATE store_fence SET operation_fence=${receiptFence} WHERE singleton=1 AND operation_fence=${corpus.canonical_fence};
    DROP TABLE projection_selection_guard;
    COMMIT;`;
  await sqlite(prepared.binary, prepared.storePath, command, { args: ["-batch", "-bail"], timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  return result;
}

async function rebuild(request) {
  validateRequest(request);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  if (prepared.state.metadata.store_id !== request.store_id) {
    return failure("not_visible", "The requested store state is not visible.", { failureClass: "not_visible", evidence: {} });
  }
  if (!await activeView(prepared.binary, prepared.storePath, request)) {
    return failure("view_invalid", "The exact active projection-rebuild view is unavailable.", {
      failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {},
    });
  }
  const digestValue = requestDigest(request);
  const existing = await readStoreOperationReceipt(prepared.binary, prepared.storePath, request.operation_id);
  if (existing) {
    if (existing.operation_kind !== "projection_rebuild" || existing.request_digest !== digestValue) {
      return failure("idempotency_mismatch", "operation_id is already settled for a different canonical projection request.", {
        failureClass: "idempotency_mismatch", retryDisposition: RETRY_DISPOSITIONS.NEVER,
        evidence: { operation_id: request.operation_id, settled_kind: existing.operation_kind },
      });
    }
    return success("projection.rebuild", existing.result);
  }
  if (prepared.state.operation_fence !== request.canonical_fence) {
    const result = await settleFailure(prepared, request, digestValue, "canonical_fence_mismatch", request.canonical_fence);
    if (result === false) return failure("idempotency_mismatch", "operation_id settled concurrently for a different request.", { failureClass: "idempotency_mismatch" });
    return success("projection.rebuild", result);
  }

  const generationId = `projection-generation:${stableUuid(`${request.store_id}\0${request.operation_id}\0${digestValue}`)}`;
  const prior = await readProjectionSelection(prepared.binary, prepared.storePath);
  try {
    const corpus = await readCanonicalCorpus(prepared.binary, prepared.storePath, request);
    if (corpus.canonical_fence !== request.canonical_fence) {
      const result = await settleFailure(prepared, request, digestValue, "canonical_fence_mismatch", request.canonical_fence);
      return success("projection.rebuild", result);
    }
    const replacement = buildReplacement(corpus, generationId);
    const result = await selectReplacement(prepared, request, digestValue, corpus, replacement, generationId, prior);
    return success("projection.rebuild", result);
  } catch (error) {
    const existingAfterFailure = await readStoreOperationReceipt(prepared.binary, prepared.storePath, request.operation_id).catch(() => null);
    if (existingAfterFailure) return success("projection.rebuild", existingAfterFailure.result);
    const current = await inspectStore(prepared.binary, prepared.storePath);
    const code = current.status === "available" && current.operation_fence !== request.canonical_fence
      ? "canonical_fence_mismatch"
      : "projection_verification_failed";
    const result = await settleFailure(prepared, request, digestValue, code, request.canonical_fence);
    return success("projection.rebuild", result);
  }
}

export async function invokeProjectionOperation(request) {
  try {
    if (request.operation !== "projection.rebuild") return null;
    return await rebuild(request);
  } catch (error) {
    if (error instanceof ProjectionError || error instanceof ConfigurationError) {
      return failure(error.code, error.message, {
        failureClass: error.failureClass ?? "projection_rebuild_invalid",
        retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER,
        evidence: error.evidence ?? {},
      });
    }
    return failure("projection_rebuild_unavailable", "Projection replacement failed without selecting an unverified generation.", {
      failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {},
    });
  }
}
