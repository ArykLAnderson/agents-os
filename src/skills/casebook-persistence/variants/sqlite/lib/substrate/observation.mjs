import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "./diagnostics.mjs";
import { inspectStore, invokeSubstrateOperation } from "./index.mjs";
import { canonicalJson, mechanicalDigest } from "./mechanical.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const MAX_CURSOR_BYTES = 16 * 1024;
const MAX_EVENT_PAGE = 100;
const MAX_PENDING_EVENTS = 32;
const OWNER_KINDS = new Set(["case", "frame"]);

class ObservationError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.code = code;
    this.failureClass = options.failureClass ?? code;
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER;
    this.evidence = options.evidence ?? {};
  }
}

function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nonEmpty(value, maximum = 512) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function exact(value, allowed, field = "request") {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ObservationError("observation.request_invalid", `${field} contains unsupported or invalid fields.`);
  }
}

function requireId(value, field, prefix = null) {
  if (!nonEmpty(value, 128) || !UUID_ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) {
    throw new ObservationError("observation.request_invalid", `${field} must be a lowercase UUID-based identity.`);
  }
  return value;
}

function validateBase(request, additional = []) {
  exact(request, new Set(["protocol", "operation", "request_version", "store_id", "context", "configuration", ...additional]));
  if (request.request_version !== 1) throw new ObservationError("observation.request_invalid", "request_version must be 1.");
  requireId(request.store_id, "store_id", "store");
  exact(request.context, new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]), "context");
  requireId(request.context.view_id, "context.view_id", "view");
  requireId(request.context.view_policy_revision_id, "context.view_policy_revision_id", "view-policy");
  if (!nonEmpty(request.context.purpose)) throw new ObservationError("observation.request_invalid", "context.purpose is required.");
  if (request.context.requested_audience_ceiling != null && request.context.requested_audience_ceiling !== "private") {
    throw new ObservationError("view_invalid", "The request cannot widen the active policy.", { retryDisposition: RETRY_DISPOSITIONS.NEVER });
  }
}

async function queryJson(binary, database, query) {
  const { stdout } = await sqlite(binary, database, `PRAGMA query_only = ON;\n${query}`, {
    args: ["-batch", "-bail", "-json"], maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout || "[]");
}

async function executeSql(binary, database, query) {
  await sqlite(binary, database, query, { args: ["-batch", "-bail"], maxBuffer: 4 * 1024 * 1024 });
}

async function prepare(request) {
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return { failure: failure("sqlite_authority_required", "This operation requires explicitly selected sqlite authority.", { failureClass: "configuration_or_store_unavailable" }) };
  }
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) return { failure: failure("sqlite_feature_unsupported", "Selected SQLite runtime is incompatible.", { failureClass: "sqlite_feature_unsupported", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR }) };
  const state = await inspectStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The configured store is unavailable.", { failureClass: state.code ?? "store_unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: state.evidence ?? {} }) };
  if (state.metadata.store_id !== request.store_id) return { failure: failure("not_visible", "The requested store state is not visible.", { failureClass: "not_visible", evidence: {} }) };
  const view = await invokeSubstrateOperation({ operation: "read_active_view_scope", configuration: request.configuration, context: request.context });
  if (!view?.ok) return { failure: view };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}

function signingKey(state) {
  return createHash("sha256").update(canonicalJson({
    domain: "casebook-observation-key@1",
    store_id: state.metadata.store_id,
    initialization_operation_id: state.metadata.initialization_operation_id,
  })).digest();
}

function signState(state, value) {
  const payload = canonicalJson(value);
  const signature = createHmac("sha256", signingKey(state)).update(`casebook-observation-state@1\0${payload}`).digest("hex");
  return Buffer.from(JSON.stringify({ payload, signature }), "utf8").toString("base64url");
}

function parseState(state, value) {
  try {
    if (!nonEmpty(value, MAX_CURSOR_BYTES) || Buffer.byteLength(value) > MAX_CURSOR_BYTES) throw new Error();
    const envelope = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") throw new Error();
    const expected = createHmac("sha256", signingKey(state)).update(`casebook-observation-state@1\0${envelope.payload}`).digest("hex");
    if (expected.length !== envelope.signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(envelope.signature))) throw new Error();
    return JSON.parse(envelope.payload);
  } catch {
    throw new ObservationError("event.cursor_invalid", "The opaque event cursor is invalid or belongs to another store.", { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
}

function appliedView(request) {
  return { view_id: request.context.view_id, view_policy_revision_id: request.context.view_policy_revision_id };
}

function eventCursor(state, request, sequence, source = "event_page", snapshotFence = null) {
  return signState(state, { domain: "event-cursor@1", store_id: request.store_id, view_id: request.context.view_id, view_policy_revision_id: request.context.view_policy_revision_id, sequence, source, ...(snapshotFence == null ? {} : { snapshot_fence: snapshotFence }) });
}

function parseEventCursor(state, request, value) {
  const cursor = parseState(state, value);
  if (cursor.domain !== "event-cursor@1" || cursor.store_id !== request.store_id || cursor.view_id !== request.context.view_id) {
    throw new ObservationError("event.cursor_invalid", "The opaque event cursor is invalid or belongs to another store.", { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
  if (cursor.view_policy_revision_id !== request.context.view_policy_revision_id) {
    throw new ObservationError("event.policy_transition_required", "A material view-policy transition requires owner snapshot bootstrap.", { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { snapshot_bootstrap_required: true } });
  }
  if (!Number.isInteger(cursor.sequence) || cursor.sequence < 0) throw new ObservationError("event.cursor_invalid", "The opaque event cursor is invalid.");
  return cursor;
}

async function pageEvents(request) {
  validateBase(request, ["after_cursor", "limit"]);
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_EVENT_PAGE) {
    throw new ObservationError("event.page_invalid", `limit must be between 1 and ${MAX_EVENT_PAGE}.`);
  }
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  let after = 0;
  if (request.after_cursor != null) after = parseEventCursor(state, request, request.after_cursor).sequence;
  const bounds = (await queryJson(binary, storePath, `
    SELECT (SELECT retained_after_sequence FROM event_retention WHERE singleton=1) AS retained_after_sequence,
      COALESCE((SELECT max(commit_sequence) FROM owner_events), 0) AS latest_sequence;
  `))[0];
  if (after < bounds.retained_after_sequence || (request.after_cursor == null && bounds.retained_after_sequence > 0)) {
    return failure("event.cursor_expired", "The event cursor is outside the retained feed and requires owner snapshot reconciliation.", {
      failureClass: "cursor_expired", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { snapshot_reconciliation_required: true },
    });
  }
  if (after > bounds.latest_sequence) throw new ObservationError("event.cursor_invalid", "The event cursor is ahead of the resolved store.");
  const rows = await queryJson(binary, storePath, `
    SELECT e.event_id,e.owner_id,e.owner_kind,e.owner_revision_id,e.owner_revision,e.namespace_id,
      e.event_type,e.event_schema_version,e.operation_id,e.causation,e.correlation,e.commit_sequence,
      e.committed_at,e.visibility_ceiling,e.payload_digest
    FROM owner_events e
    JOIN view_policy_namespace_grants grant ON grant.namespace_id=e.namespace_id
      AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
    JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
      AND policy.view_id=${sqlText(request.context.view_id)} AND policy.lifecycle='active'
    JOIN json_each(policy.object_kinds_json) kind ON kind.value=e.owner_kind
    WHERE e.commit_sequence > ${after}
    ORDER BY e.commit_sequence,e.event_id LIMIT ${request.limit + 1};
  `);
  const more = rows.length > request.limit;
  const page = rows.slice(0, request.limit);
  const through = more ? page.at(-1).commit_sequence : bounds.latest_sequence;
  const events = page.map((row) => ({
    event_id: row.event_id,
    deduplication_key: { store_id: request.store_id, event_id: row.event_id },
    owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.namespace_id },
    owner_revision: { id: `${row.owner_kind}-revision:${row.owner_revision_id.slice(row.owner_revision_id.indexOf(":") + 1)}`, number: row.owner_revision },
    type: row.event_type, schema_version: row.event_schema_version, operation_id: row.operation_id,
    causation: row.causation ?? null, correlation: row.correlation ?? null,
    commit_sequence: row.commit_sequence, committed_at: row.committed_at,
    visibility_ceiling: row.visibility_ceiling, payload_digest: row.payload_digest,
  }));
  return success("events.page", {
    status: "available", events,
    next_cursor: eventCursor(state, request, through),
    retention_status: "available",
    result_completeness: more ? "truncated" : "complete",
    delivery_semantics: "at_least_once",
    stable_order: "commit_sequence_asc_event_id_asc",
    freshness: "unknown_until_checkpoint_reconciled",
    applied_view: appliedView(request),
  });
}

function snapshotToken(state, request, ownerKinds, operationFence, eventSequence) {
  return signState(state, {
    domain: "reconciliation-snapshot@1", store_id: request.store_id,
    view_id: request.context.view_id, view_policy_revision_id: request.context.view_policy_revision_id,
    owner_kinds: ownerKinds, operation_fence: operationFence, event_sequence: eventSequence,
  });
}

function parseSnapshot(state, request, value) {
  const snapshot = parseState(state, value);
  if (snapshot.domain !== "reconciliation-snapshot@1" || snapshot.store_id !== request.store_id
    || snapshot.view_id !== request.context.view_id || snapshot.view_policy_revision_id !== request.context.view_policy_revision_id
    || !Array.isArray(snapshot.owner_kinds) || !Number.isInteger(snapshot.operation_fence)
    || !Number.isInteger(snapshot.event_sequence)) {
    throw new ObservationError("snapshot.invalid", "The reconciliation snapshot is invalid or belongs to another exact view.", { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
  return snapshot;
}

function snapshotCursor(state, snapshot, offset) {
  return signState(state, { domain: "reconciliation-snapshot-cursor@1", snapshot_digest: mechanicalDigest(snapshot), offset });
}

function parseSnapshotCursor(state, snapshot, value) {
  const cursor = parseState(state, value);
  if (cursor.domain !== "reconciliation-snapshot-cursor@1" || cursor.snapshot_digest !== mechanicalDigest(snapshot)
    || !Number.isInteger(cursor.offset) || cursor.offset < 0) {
    throw new ObservationError("snapshot.cursor_invalid", "The reconciliation snapshot cursor is invalid.", { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
  return cursor;
}

async function beginSnapshot(request) {
  validateBase(request, ["owner_kinds"]);
  if (!Array.isArray(request.owner_kinds) || request.owner_kinds.length < 1 || request.owner_kinds.length > OWNER_KINDS.size) {
    throw new ObservationError("snapshot.request_invalid", "owner_kinds must be a non-empty bounded array.");
  }
  const ownerKinds = [...new Set(request.owner_kinds)].sort();
  if (ownerKinds.length !== request.owner_kinds.length || ownerKinds.some((kind) => !OWNER_KINDS.has(kind))) {
    throw new ObservationError("snapshot.request_invalid", "owner_kinds contains unsupported or duplicate owner kinds.");
  }
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const bounds = (await queryJson(prepared.binary, prepared.storePath, `
    SELECT operation_fence,COALESCE((SELECT max(commit_sequence) FROM owner_events),0) AS event_sequence
    FROM store_fence WHERE singleton=1;
  `))[0];
  const token = snapshotToken(prepared.state, request, ownerKinds, bounds.operation_fence, bounds.event_sequence);
  const snapshot = parseSnapshot(prepared.state, request, token);
  return success("reconciliation_snapshot.begin", {
    status: "started", snapshot_token: token, first_cursor: snapshotCursor(prepared.state, snapshot, 0),
    snapshot_fence: bounds.operation_fence, event_sequence_at_fence: bounds.event_sequence,
    owner_kinds: ownerKinds, applied_view: appliedView(request), freshness: "partial",
  });
}

async function snapshotIdentityRows(prepared, request, snapshot) {
  const kinds = snapshot.owner_kinds.map(sqlText).join(",");
  return queryJson(prepared.binary, prepared.storePath, `
    WITH ranked AS (
      SELECT e.owner_id,e.owner_kind,e.namespace_id,e.owner_revision_id,e.owner_revision,e.commit_sequence,
        row_number() OVER (PARTITION BY e.owner_id ORDER BY e.commit_sequence DESC,e.event_id DESC) AS rank
      FROM owner_events e
      WHERE e.commit_sequence <= ${snapshot.event_sequence} AND e.owner_kind IN (${kinds})
    )
    SELECT ranked.* FROM ranked
    JOIN view_policy_namespace_grants grant ON grant.namespace_id=ranked.namespace_id
      AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
    JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
      AND policy.view_id=${sqlText(request.context.view_id)} AND policy.lifecycle='active'
    JOIN json_each(policy.object_kinds_json) kind ON kind.value=ranked.owner_kind
    WHERE ranked.rank=1 ORDER BY ranked.owner_kind,ranked.owner_id;
  `);
}

async function pageSnapshot(request) {
  validateBase(request, ["snapshot_token", "cursor", "limit"]);
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_EVENT_PAGE) {
    throw new ObservationError("snapshot.page_invalid", `limit must be between 1 and ${MAX_EVENT_PAGE}.`);
  }
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const snapshot = parseSnapshot(prepared.state, request, request.snapshot_token);
  const cursor = parseSnapshotCursor(prepared.state, snapshot, request.cursor);
  const rows = await snapshotIdentityRows(prepared, request, snapshot);
  if (cursor.offset > rows.length) throw new ObservationError("snapshot.cursor_invalid", "The reconciliation snapshot cursor is beyond the snapshot.");
  const page = rows.slice(cursor.offset, cursor.offset + request.limit);
  const nextOffset = cursor.offset + page.length;
  const more = nextOffset < rows.length;
  const identities = page.map((row) => ({
    stable_id: row.owner_id, owner_kind: row.owner_kind, home_namespace_id: row.namespace_id,
    owner_revision_at_fence: { id: `${row.owner_kind}-revision:${row.owner_revision_id.slice(row.owner_revision_id.indexOf(":") + 1)}`, number: row.owner_revision },
  }));
  const completion = more ? null : signState(prepared.state, {
    domain: "reconciliation-snapshot-complete@1", snapshot_digest: mechanicalDigest(snapshot), identity_count: rows.length,
  });
  return success("reconciliation_snapshot.page", {
    status: "available", identities,
    next_cursor: more ? snapshotCursor(prepared.state, snapshot, nextOffset) : null,
    completion_token: completion,
    snapshot_fence: snapshot.operation_fence,
    result_completeness: more ? "truncated" : "complete",
    freshness: "partial_until_checkpoint_cas",
    applied_view: appliedView(request),
  });
}

async function finishSnapshot(request) {
  validateBase(request, ["snapshot_token", "completion_token"]);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const snapshot = parseSnapshot(prepared.state, request, request.snapshot_token);
  const completion = parseState(prepared.state, request.completion_token);
  if (completion.domain !== "reconciliation-snapshot-complete@1" || completion.snapshot_digest !== mechanicalDigest(snapshot)) {
    throw new ObservationError("snapshot.incomplete", "Every visible snapshot identity page must be reconciled before finish.", { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
  const rows = await snapshotIdentityRows(prepared, request, snapshot);
  if (completion.identity_count !== rows.length) throw new ObservationError("snapshot.incomplete", "The snapshot completion token is inconsistent.");
  return success("reconciliation_snapshot.finish", {
    status: "complete", snapshot_fence: snapshot.operation_fence,
    event_cursor: eventCursor(prepared.state, request, snapshot.event_sequence, "snapshot_bootstrap", snapshot.operation_fence),
    event_cursor_sequence_at_fence: snapshot.event_sequence,
    reconciled_identity_count: rows.length, freshness: "partial_until_checkpoint_cas",
    applied_view: appliedView(request),
  });
}

function checkpointFromRow(row) {
  return {
    consumer_id: row.consumer_id, view_id: row.view_id,
    view_policy_revision_id: row.view_policy_revision_id, revision: row.checkpoint_revision,
    event_cursor: row.event_cursor, event_sequence: row.event_sequence,
    snapshot_fence: row.snapshot_fence, pending_event_ids: JSON.parse(row.pending_event_ids_json),
    freshness: row.freshness,
    predecessor_policy_revision_id: row.predecessor_policy_revision_id ?? null,
    updated_at: row.updated_at,
  };
}

async function checkpointRow(prepared, request, consumerId) {
  const rows = await queryJson(prepared.binary, prepared.storePath, `
    SELECT * FROM consumer_checkpoints WHERE view_id=${sqlText(request.context.view_id)} AND consumer_id=${sqlText(consumerId)} LIMIT 1;
  `);
  return rows.length ? rows[0] : null;
}

async function readCheckpoint(request) {
  validateBase(request, ["consumer_id"]);
  const consumerId = requireId(request.consumer_id, "consumer_id", "consumer");
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const row = await checkpointRow(prepared, request, consumerId);
  if (!row) return success("checkpoint.read", { status: "absent", freshness: "unknown", snapshot_bootstrap_required: true, applied_view: appliedView(request) });
  if (row.view_policy_revision_id !== request.context.view_policy_revision_id) {
    return success("checkpoint.read", {
      status: "policy_transition_required", freshness: "unknown", snapshot_bootstrap_required: true,
      historical_lineage: { checkpoint_revision: row.checkpoint_revision, view_policy_revision_id: row.view_policy_revision_id },
      applied_view: appliedView(request),
    });
  }
  return success("checkpoint.read", { status: "found", checkpoint: checkpointFromRow(row), freshness: row.freshness, snapshot_bootstrap_required: false, applied_view: appliedView(request) });
}

async function compareAndSetCheckpoint(request) {
  validateBase(request, ["operation_id", "consumer_id", "expected_checkpoint_revision", "next_checkpoint"]);
  if (!nonEmpty(request.operation_id, 256)) throw new ObservationError("checkpoint.request_invalid", "operation_id is required.");
  const consumerId = requireId(request.consumer_id, "consumer_id", "consumer");
  if (!Number.isInteger(request.expected_checkpoint_revision) || request.expected_checkpoint_revision < 0) throw new ObservationError("checkpoint.request_invalid", "expected_checkpoint_revision must be a non-negative integer.");
  exact(request.next_checkpoint, new Set(["event_cursor", "snapshot_fence", "pending_event_ids"]), "next_checkpoint");
  if (!Array.isArray(request.next_checkpoint.pending_event_ids)) throw new ObservationError("checkpoint.request_invalid", "pending_event_ids must be an array.");
  if (request.next_checkpoint.pending_event_ids.length > MAX_PENDING_EVENTS) {
    return failure("checkpoint.pending_overflow", "The bounded pending-event set overflowed and requires snapshot reconciliation.", {
      failureClass: "pending_event_overflow", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: { maximum_pending_events: MAX_PENDING_EVENTS, snapshot_reconciliation_required: true },
    });
  }
  const pending = request.next_checkpoint.pending_event_ids.map((value) => requireId(value, "pending_event_ids[]", "event"));
  if (new Set(pending).size !== pending.length) throw new ObservationError("checkpoint.request_invalid", "pending_event_ids must be unique.");
  if (!Number.isInteger(request.next_checkpoint.snapshot_fence) || request.next_checkpoint.snapshot_fence < 0) throw new ObservationError("checkpoint.request_invalid", "snapshot_fence must be a non-negative integer.");
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const requestDigest = mechanicalDigest({
    operation: request.operation, store_id: request.store_id, context: request.context,
    operation_id: request.operation_id, consumer_id: consumerId,
    expected_checkpoint_revision: request.expected_checkpoint_revision, next_checkpoint: request.next_checkpoint,
  });
  const settled = await queryJson(prepared.binary, prepared.storePath, `SELECT operation_kind,request_digest,result_json FROM store_operation_receipts WHERE operation_id=${sqlText(request.operation_id)} LIMIT 1;`);
  if (settled.length) {
    if (settled[0].operation_kind !== "checkpoint.compare_and_set" || settled[0].request_digest !== requestDigest) return failure("checkpoint.idempotency_mismatch", "operation_id is settled for a different checkpoint request.", { failureClass: "idempotency_mismatch", evidence: {} });
    return success("checkpoint.compare_and_set", { ...JSON.parse(settled[0].result_json), idempotent_replay: true });
  }
  const current = await checkpointRow(prepared, request, consumerId);
  const observedRevision = current?.checkpoint_revision ?? 0;
  if (observedRevision !== request.expected_checkpoint_revision) {
    return failure("checkpoint.revision_conflict", "The consumer checkpoint advanced concurrently.", {
      failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: { observed_checkpoint_revision: observedRevision },
    });
  }
  const cursor = parseEventCursor(prepared.state, request, request.next_checkpoint.event_cursor);
  const transition = Boolean(current && current.view_policy_revision_id !== request.context.view_policy_revision_id);
  const initial = !current;
  if ((initial || transition) && (cursor.source !== "snapshot_bootstrap" || pending.length > 0
    || cursor.snapshot_fence !== request.next_checkpoint.snapshot_fence)) {
    return failure("checkpoint.snapshot_bootstrap_required", "Initial and policy-transition checkpoints require one completed owner snapshot.", {
      failureClass: "snapshot_bootstrap_required", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: { snapshot_bootstrap_required: true },
    });
  }
  if (!initial && !transition && (cursor.sequence < current.event_sequence || request.next_checkpoint.snapshot_fence !== current.snapshot_fence)) {
    return failure("checkpoint.progress_invalid", "Checkpoint progress cannot move backward or change its snapshot fence without bootstrap.", { failureClass: "checkpoint_progress_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
  if (transition && pending.length) throw new ObservationError("checkpoint.request_invalid", "A policy bootstrap cannot retain old-view pending identities.");
  if (pending.length) {
    const visible = await queryJson(prepared.binary, prepared.storePath, `
      SELECT e.event_id FROM owner_events e
      JOIN view_policy_namespace_grants grant ON grant.namespace_id=e.namespace_id AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
      JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id AND policy.lifecycle='active'
      JOIN json_each(policy.object_kinds_json) kind ON kind.value=e.owner_kind
      WHERE e.event_id IN (${pending.map(sqlText).join(",")}) AND e.commit_sequence <= ${cursor.sequence};
    `);
    if (visible.length !== pending.length) throw new ObservationError("checkpoint.request_invalid", "Every pending event must be visible and at or before the reconciled cursor.");
  }
  const now = new Date().toISOString();
  const nextRevision = observedRevision + 1;
  const freshness = pending.length ? "partial" : "complete";
  const predecessor = transition ? current.view_policy_revision_id : (current?.predecessor_policy_revision_id ?? null);
  const checkpoint = {
    consumer_id: consumerId, view_id: request.context.view_id,
    view_policy_revision_id: request.context.view_policy_revision_id, revision: nextRevision,
    event_cursor: request.next_checkpoint.event_cursor, event_sequence: cursor.sequence,
    snapshot_fence: request.next_checkpoint.snapshot_fence, pending_event_ids: pending,
    freshness, predecessor_policy_revision_id: predecessor, updated_at: now,
  };
  const oldFence = prepared.state.operation_fence;
  const nextFence = oldFence + 1;
  const result = {
    status: "settled", checkpoint,
    bootstrap: initial ? "initial_snapshot" : transition ? "policy_transition_snapshot" : "not_required",
    operation_fence: nextFence, idempotent_replay: false,
  };
  const resultDigest = mechanicalDigest(result);
  try {
    await executeSql(prepared.binary, prepared.storePath, `
      PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
      CREATE TEMP TABLE checkpoint_guard(ok INTEGER CHECK(ok=1));
      INSERT INTO checkpoint_guard VALUES (CASE WHEN (SELECT operation_fence FROM store_fence WHERE singleton=1)=${oldFence}
        AND NOT EXISTS(SELECT 1 FROM store_operation_receipts WHERE operation_id=${sqlText(request.operation_id)})
        AND ${current ? `(SELECT checkpoint_revision FROM consumer_checkpoints WHERE view_id=${sqlText(request.context.view_id)} AND consumer_id=${sqlText(consumerId)})=${observedRevision}` : `NOT EXISTS(SELECT 1 FROM consumer_checkpoints WHERE view_id=${sqlText(request.context.view_id)} AND consumer_id=${sqlText(consumerId)})`}
        THEN 1 ELSE 0 END);
      UPDATE store_fence SET operation_fence=operation_fence+1 WHERE singleton=1;
      INSERT INTO consumer_checkpoints(view_id,consumer_id,view_policy_revision_id,checkpoint_revision,event_cursor,event_sequence,snapshot_fence,pending_event_ids_json,freshness,predecessor_policy_revision_id,updated_at)
      VALUES(${sqlText(request.context.view_id)},${sqlText(consumerId)},${sqlText(request.context.view_policy_revision_id)},${nextRevision},${sqlText(request.next_checkpoint.event_cursor)},${cursor.sequence},${request.next_checkpoint.snapshot_fence},${sqlText(JSON.stringify(pending))},${sqlText(freshness)},${sqlText(predecessor)},${sqlText(now)})
      ON CONFLICT(view_id,consumer_id) DO UPDATE SET view_policy_revision_id=excluded.view_policy_revision_id,checkpoint_revision=excluded.checkpoint_revision,event_cursor=excluded.event_cursor,event_sequence=excluded.event_sequence,snapshot_fence=excluded.snapshot_fence,pending_event_ids_json=excluded.pending_event_ids_json,freshness=excluded.freshness,predecessor_policy_revision_id=excluded.predecessor_policy_revision_id,updated_at=excluded.updated_at;
      INSERT INTO store_operation_receipts(operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,settled_at,failure_class,retry_disposition,operation_fence,view_policy_revision_id)
      VALUES(${sqlText(request.operation_id)},'checkpoint.compare_and_set',${sqlText(request.store_id)},${sqlText(requestDigest)},'settled',${sqlText(JSON.stringify(result))},${sqlText(resultDigest)},'{}',${sqlText(now)},NULL,'never',${nextFence},${sqlText(request.context.view_policy_revision_id)});
      COMMIT;
    `);
  } catch {
    return failure("checkpoint.revision_conflict", "The consumer checkpoint advanced concurrently.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  }
  return success("checkpoint.compare_and_set", result);
}

export async function invokeObservationOperation(request) {
  try {
    if (request.operation === "events.page") return await pageEvents(request);
    if (request.operation === "checkpoint.read") return await readCheckpoint(request);
    if (request.operation === "checkpoint.compare_and_set") return await compareAndSetCheckpoint(request);
    if (request.operation === "reconciliation_snapshot.begin") return await beginSnapshot(request);
    if (request.operation === "reconciliation_snapshot.page") return await pageSnapshot(request);
    if (request.operation === "reconciliation_snapshot.finish") return await finishSnapshot(request);
    return null;
  } catch (error) {
    if (error instanceof ObservationError || error instanceof ConfigurationError) {
      return failure(error.code, error.message, { failureClass: error.failureClass ?? "observation.request_invalid", retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER, evidence: error.evidence ?? {} });
    }
    return failure("internal_failure", "The observation operation failed without exposing owner state.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {} });
  }
}

export const observationLimits = Object.freeze({ maximum_pending_events: MAX_PENDING_EVENTS });
