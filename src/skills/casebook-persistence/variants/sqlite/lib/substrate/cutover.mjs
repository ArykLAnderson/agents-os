import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, link, lstat, open, readFile, realpath, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "./embedded-sqlite.mjs";
import { validateAuthorityConfiguration } from "../../../../shared/config.mjs";
import { failure, RETRY_DISPOSITIONS, SCHEMA_ID, SCHEMA_VERSION, success } from "../../../../shared/protocol.mjs";
import { caseRelationshipProjectionsFromCanonicalContent, caseResourceProjectionFromCanonicalContent, caseSearchDocument } from "../case/resources/complete.mjs";
import { APPLICATION_ID } from "./index.mjs";
import { mechanicalDigest } from "./mechanical.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FINAL_SCHEMA = path.resolve(HERE, "../../sql/schema-final.sql");
const CUTOVER_MANIFEST = path.resolve(HERE, "../../migrations/manifest.json");
const PREDECESSOR_FINGERPRINT = path.resolve(HERE, "../../cutover/predecessor-v1-fingerprint.json");
const CUTOVER_ID = "cutover-schema1-predecessor-to-final";
const REGISTERED = new Set(["case", "frame"]);

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function rows(db, sql, ...params) { return db.prepare(sql).all(...params).map((row) => ({ ...row })); }
function one(db, sql, ...params) { const row = db.prepare(sql).get(...params); return row ? { ...row } : null; }
function insert(db, table, row) {
  const keys = Object.keys(row), marks = keys.map(() => "?").join(",");
  db.prepare(`INSERT INTO ${table}(${keys.join(",")}) VALUES(${marks})`).run(...keys.map((key) => row[key]));
}
function exactKeys(value, keys, field) {
  if (!object(value) || Object.keys(value).some((key) => !keys.has(key))) throw Object.assign(new Error(`${field} is invalid.`), { code: "cutover_request_invalid" });
}
function sourceInventory(db) { return rows(db, "SELECT type,name,tbl_name AS 'table',sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name"); }
function normalizedAlias(value) { return String(value).normalize("NFC").trim().toLocaleLowerCase("en-US"); }

async function admitPredecessor(targetPath) {
  const [fingerprint, sourceBytes] = await Promise.all([readFile(PREDECESSOR_FINGERPRINT, "utf8").then(JSON.parse), readFile(targetPath)]);
  const db = new DatabaseSync(targetPath, { readOnly: true });
  try {
    const header = one(db, "SELECT (SELECT application_id FROM pragma_application_id) application_id,(SELECT user_version FROM pragma_user_version) user_version,(SELECT quick_check FROM pragma_quick_check) quick_check,(SELECT count(*) FROM pragma_foreign_key_check) foreign_key_violations");
    const metadata = one(db, "SELECT * FROM store_metadata WHERE singleton=1");
    const ledger = one(db, "SELECT * FROM schema_migrations ORDER BY applied_at LIMIT 1");
    const inventory = sourceInventory(db);
    const inventoryDigest = sha256(JSON.stringify(inventory));
    const accepted = header?.application_id === fingerprint.application_id && header.user_version === fingerprint.user_version
      && header.quick_check === "ok" && header.foreign_key_violations === 0
      && metadata?.schema_id === fingerprint.schema_id && metadata.schema_version === fingerprint.schema_version
      && ledger?.migration_id === "0001-initialize-store" && ledger.schema_asset_digest === fingerprint.schema_asset_sha256
      && ledger.migration_manifest_digest === fingerprint.migration_manifest_sha256
      && inventoryDigest === fingerprint.inventory_sha256 && JSON.stringify(inventory) === JSON.stringify(fingerprint.inventory);
    if (!accepted) throw Object.assign(new Error("The target is not the exact inspected schema-1 predecessor."), { code: "cutover_predecessor_mismatch" });
    return { fingerprint, metadata, operationFence: one(db, "SELECT operation_fence FROM store_fence WHERE singleton=1").operation_fence, sourceSha256: sha256(sourceBytes), sourceSize: sourceBytes.length };
  } finally { db.close(); }
}

function selectedByRevision(source) {
  const result = new Map();
  for (const row of rows(source, `SELECT s.revision_id,s.family_id,s.version_id,v.content_json,v.content_digest
    FROM owner_revision_selections s JOIN owner_versions v ON v.version_id=s.version_id ORDER BY s.revision_id,s.family_id`)) {
    const selected = result.get(row.revision_id) ?? [];
    selected.push({ ...row, content: JSON.parse(row.content_json) }); result.set(row.revision_id, selected);
  }
  return result;
}

function transformedCanonical(source) {
  const owners = rows(source, "SELECT * FROM owners ORDER BY owner_id");
  const revisions = rows(source, "SELECT * FROM owner_revisions ORDER BY owner_id,revision_number");
  const versions = rows(source, "SELECT * FROM owner_versions ORDER BY version_id");
  const selections = rows(source, "SELECT * FROM owner_revision_selections ORDER BY revision_id,family_id");
  const bindings = rows(source, "SELECT * FROM owner_family_bindings ORDER BY family_id");
  for (const row of versions) {
    let content;
    try { content = JSON.parse(row.content_json); } catch { throw Object.assign(new Error("Canonical owner version JSON is malformed."), { code: "cutover_registered_owner_malformed" }); }
    if (mechanicalDigest(content) !== row.content_digest) throw Object.assign(new Error("Canonical owner version digest is invalid."), { code: "cutover_registered_owner_malformed" });
  }
  const versionsById = new Map(versions.map((row) => [row.version_id, row]));
  const aliasFamilyIds = new Set(versions.filter((row) => JSON.parse(row.content_json)?.schema === "case-alias@1").map((row) => row.family_id));
  const aliasesByRevision = new Map();
  for (const selected of selections) {
    if (!aliasFamilyIds.has(selected.family_id)) continue;
    const content = JSON.parse(versionsById.get(selected.version_id).content_json);
    if (content.state !== "active") continue;
    const list = aliasesByRevision.get(selected.revision_id) ?? [];
    list.push({ value: content.value, normalized: normalizedAlias(content.normalized_value ?? content.value), namespace_id: content.namespace_id });
    aliasesByRevision.set(selected.revision_id, list);
  }
  const currentRevisionIds = new Set(rows(source, "SELECT revision_id FROM owner_current").map((row) => row.revision_id));
  const aliasClaims = new Map();
  for (const revision of revisions.filter((row) => currentRevisionIds.has(row.revision_id))) for (const alias of aliasesByRevision.get(revision.revision_id) ?? []) {
    const key = `${alias.namespace_id}\0${alias.normalized}`, prior = aliasClaims.get(key);
    if (prior && prior !== revision.owner_id) throw Object.assign(new Error("Alias kind collapse would create a namespace alias collision."), { code: "cutover_alias_collision" });
    aliasClaims.set(key, revision.owner_id);
  }
  const profileVersionByRevision = new Map();
  for (const revision of revisions) {
    if (revision.owner_id.startsWith("case:")) {
      const normalized = JSON.parse(revision.normalized_json);
      const selected = selections.filter((row) => row.revision_id === revision.revision_id && row.family_id === revision.owner_id)[0];
      if (!selected) throw Object.assign(new Error("Registered Case profile selection is malformed."), { code: "cutover_registered_owner_malformed" });
      profileVersionByRevision.set(revision.revision_id, selected.version_id);
      normalized.schema = "case-canonical-final-selection@1";
      if (Array.isArray(normalized.selected_family_ids)) normalized.selected_family_ids = normalized.selected_family_ids.filter((id) => !aliasFamilyIds.has(id));
      revision.normalized_json = JSON.stringify(normalized); revision.representation_id = "case-canonical-final"; revision.representation_version = 1;
      const profile = versionsById.get(selected.version_id), content = JSON.parse(profile.content_json);
      if (content.schema !== "case-profile@2" && content.schema !== "case-profile@1") throw Object.assign(new Error("Registered Case profile is malformed."), { code: "cutover_registered_owner_malformed" });
      content.schema = "case-profile-final@1"; content.aliases = (aliasesByRevision.get(revision.revision_id) ?? []).map((alias) => alias.value);
      profile.content_json = JSON.stringify(content); profile.content_digest = mechanicalDigest(content);
    } else if (revision.owner_id.startsWith("frame:") && (revision.representation_id !== "frame-canonical" || revision.representation_version !== 3 || JSON.parse(revision.normalized_json)?.schema !== "frame-canonical-selection@3")) {
      throw Object.assign(new Error("Registered Frame is not the final canonical representation."), { code: "cutover_registered_owner_malformed" });
    }
  }
  return { owners, revisions, versions: versions.filter((row) => !aliasFamilyIds.has(row.family_id)), selections: selections.filter((row) => !aliasFamilyIds.has(row.family_id)), bindings: bindings.filter((row) => !aliasFamilyIds.has(row.family_id)), aliasFamilyIds, aliasesByRevision, aliasClaims };
}

function copyViewPolicy(source, destination) {
  for (const row of rows(source, "SELECT * FROM view_policy_revisions ORDER BY view_id,revision_number")) insert(destination, "view_policy_revisions", { ...row, lifecycle: "created", activation_fence: null, superseded_fence: null, retirement_fence: null });
  for (const row of rows(source, "SELECT * FROM view_policy_namespace_grants ORDER BY view_policy_revision_id,namespace_id")) insert(destination, "view_policy_namespace_grants", row);
  for (const row of rows(source, "SELECT * FROM view_policy_revisions ORDER BY view_id,revision_number")) destination.prepare("UPDATE view_policy_revisions SET lifecycle=?,activation_fence=?,superseded_fence=?,retirement_fence=? WHERE view_policy_revision_id=?").run(row.lifecycle,row.activation_fence,row.superseded_fence,row.retirement_fence,row.view_policy_revision_id);
}

function rebuildProjections(destination, canonical, currentRows) {
  const versions = new Map(canonical.versions.map((row) => [row.version_id, { ...row, content: JSON.parse(row.content_json) }]));
  const selected = new Map(); for (const row of canonical.selections) { const list = selected.get(row.revision_id) ?? []; list.push({ ...row, content: versions.get(row.version_id).content }); selected.set(row.revision_id, list); }
  const owners = new Map(canonical.owners.map((row) => [row.owner_id, row]));
  for (const current of currentRows) {
    const owner = owners.get(current.owner_id); if (!REGISTERED.has(owner.owner_kind)) continue;
    const resources = selected.get(current.revision_id) ?? [];
    const profile = resources.find((item) => item.family_id === owner.owner_id);
    if (!profile) throw Object.assign(new Error("Registered owner current selection is malformed."), { code: "cutover_registered_owner_malformed" });
    if (owner.owner_kind === "case") {
      const facets = resources.filter((item) => item.content.schema === "case-facet@1" && item.content.state === "active").map((item) => ({ id: item.family_id, state: "active", version: item.content }));
      for (const item of resources) {
        const kind = item.family_id === owner.owner_id ? "case" : item.content.schema === "case-facet@1" ? "facet" : item.content.schema === "case-knowledge@1" || item.family_id.startsWith("knowledge:") ? "knowledge" : item.family_id.startsWith("source:") ? "source" : item.family_id.startsWith("evidence:") ? "evidence" : item.family_id.startsWith("relationship:") ? "relationship" : null;
        if (!kind) throw Object.assign(new Error("Registered Case family is malformed."), { code: "cutover_registered_owner_malformed" });
        const lifecycle = item.content.state === "tombstoned" ? "tombstoned" : "active";
        const projection = kind === "case" ? { schema: "case-profile-resource@1", state: item.content.state, version: { title: item.content.title, summary: item.content.summary, scope: item.content.scope, ...(item.content.provenance ? { provenance: item.content.provenance } : {}) } } : caseResourceProjectionFromCanonicalContent(kind, item.content);
        insert(destination, "resource_current", { resource_id: item.family_id, resource_kind: kind, owner_id: owner.owner_id, owner_revision_id: current.revision_id, owner_revision: current.revision_number, family_id: item.family_id, version_id: item.version_id, lifecycle, projection_json: JSON.stringify(projection), updated_at: current.updated_at });
        if (lifecycle === "active") {
          const search = caseSearchDocument(kind, item.content, facets);
          insert(destination, "resource_search_current", { resource_id: item.family_id, owner_id: owner.owner_id, owner_revision_id: current.revision_id, resource_kind: kind, search_text: search.text, metadata_json: JSON.stringify(search.metadata) });
          destination.prepare("INSERT INTO resource_search_fts(resource_id,search_text) VALUES(?,?)").run(item.family_id, search.text);
        }
        for (const edge of caseRelationshipProjectionsFromCanonicalContent(kind, item.family_id, item.content)) insert(destination, "relationship_current", { relationship_id: edge.relationship_id, owner_id: owner.owner_id, owner_revision_id: current.revision_id, source_resource_id: edge.source_resource_id, target_kind: edge.target.kind, target_id: edge.target.id, predicate: edge.predicate, metadata_json: JSON.stringify(edge.metadata) });
      }
      for (const value of profile.content.aliases ?? []) insert(destination, "case_alias_current", { namespace_id: owner.home_namespace_id, normalized_alias: normalizedAlias(value), case_id: owner.owner_id, owner_revision_id: current.revision_id, display_alias: value });
    } else {
      for (const item of resources) {
        const kind = item.family_id === owner.owner_id ? "frame" : item.family_id.startsWith("discovery:") ? "discovery" : item.family_id.startsWith("disposition-boundary:") ? "disposition_boundary" : item.family_id.startsWith("case-disposition:") ? "case_disposition" : null;
        if (!kind) throw Object.assign(new Error("Registered Frame family is malformed."), { code: "cutover_registered_owner_malformed" });
        const content = { ...item.content }; delete content.schema;
        const projection = kind === "frame" ? { schema: "frame-profile-resource@1", profile: content } : { schema: `frame-${kind.replaceAll("_", "-")}-resource@1`, version: content };
        insert(destination, "resource_current", { resource_id: item.family_id, resource_kind: kind, owner_id: owner.owner_id, owner_revision_id: current.revision_id, owner_revision: current.revision_number, family_id: item.family_id, version_id: item.version_id, lifecycle: item.content.lifecycle === "tombstoned" ? "tombstoned" : "active", projection_json: JSON.stringify(projection), updated_at: current.updated_at });
      }
    }
  }
}

export function rebuildFinalProjections(databasePath, expectedFence, { fault = false } = {}) {
  const db = new DatabaseSync(databasePath);
  try {
    const metadata = one(db, "SELECT schema_id,schema_version FROM store_metadata WHERE singleton=1");
    const fence = one(db, "SELECT operation_fence FROM store_fence WHERE singleton=1")?.operation_fence;
    if (metadata?.schema_id !== SCHEMA_ID || metadata.schema_version !== SCHEMA_VERSION || fence !== expectedFence) throw Object.assign(new Error("The FINAL projection rebuild fence is unavailable."), { code: "projection_rebuild_fence_conflict" });
    const canonical = {
      owners: rows(db, "SELECT * FROM owners ORDER BY owner_id"),
      revisions: rows(db, "SELECT * FROM owner_revisions ORDER BY owner_id,revision_number"),
      versions: rows(db, "SELECT * FROM owner_versions ORDER BY version_id"),
      selections: rows(db, "SELECT * FROM owner_revision_selections ORDER BY revision_id,family_id"),
    };
    for (const version of canonical.versions) {
      let content;
      try { content = JSON.parse(version.content_json); } catch { throw Object.assign(new Error("Canonical owner version JSON is malformed."), { code: "projection_rebuild_canonical_corrupt" }); }
      if (mechanicalDigest(content) !== version.content_digest) throw Object.assign(new Error("Canonical owner version digest is invalid."), { code: "projection_rebuild_canonical_corrupt" });
    }
    const currentRows = rows(db, "SELECT * FROM owner_current ORDER BY owner_id");
    db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; DELETE FROM case_alias_current; DELETE FROM relationship_current; DELETE FROM resource_search_fts; DELETE FROM resource_search_current; DELETE FROM resource_current;");
    rebuildProjections(db, canonical, currentRows);
    if (fault) db.exec("SELECT * FROM synthetic_projection_rebuild_fault;");
    const advanced = db.prepare("UPDATE store_fence SET operation_fence=? WHERE singleton=1 AND operation_fence=?").run(expectedFence + 1, expectedFence);
    if (advanced.changes !== 1) throw Object.assign(new Error("The FINAL projection rebuild fence advanced concurrently."), { code: "projection_rebuild_fence_conflict" });
    db.exec("COMMIT;");
    return { status: "rebuilt", operation_fence: expectedFence + 1, canonical_owner_mutations: 0, components: ["resource_current", "relationship_current", "resource_search_current", "resource_search_fts", "case_alias_current"] };
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    throw error;
  } finally { db.close(); }
}

async function buildFinal(sourcePath, siblingPath, admitted, request, snapshot, requestDigest) {
  const [schema, manifestBytes] = await Promise.all([readFile(FINAL_SCHEMA, "utf8"), readFile(CUTOVER_MANIFEST)]);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  let destination;
  try {
    const canonical = transformedCanonical(source);
    destination = new DatabaseSync(siblingPath);
    destination.exec(schema);
    destination.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
    const metadata = one(source, "SELECT * FROM store_metadata WHERE singleton=1");
    insert(destination, "store_metadata", { ...metadata, schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION });
    for (const table of ["namespaces", "view_families"] ) for (const row of rows(source, `SELECT * FROM ${table}`)) insert(destination, table, row);
    copyViewPolicy(source, destination);
    insert(destination, "store_fence", { singleton: 1, operation_fence: admitted.operationFence + 1 });
    for (const row of canonical.owners) insert(destination, "owners", row);
    for (const row of canonical.bindings) insert(destination, "owner_family_bindings", row);
    for (const row of canonical.versions) insert(destination, "owner_versions", row);
    for (const row of canonical.revisions) insert(destination, "owner_revisions", row);
    for (const row of canonical.selections) insert(destination, "owner_revision_selections", row);
    const currentRows = rows(source, "SELECT * FROM owner_current ORDER BY owner_id");
    const revisionById = new Map(canonical.revisions.map((row) => [row.revision_id, row]));
    const versionById = new Map(canonical.versions.map((row) => [row.version_id, row]));
    const selectionByRevision = new Map(); for (const row of canonical.selections) { const list = selectionByRevision.get(row.revision_id) ?? []; list.push(row); selectionByRevision.set(row.revision_id, list); }
    for (const row of currentRows) {
      const owner = canonical.owners.find((item) => item.owner_id === row.owner_id);
      if (owner?.owner_kind === "case") {
        const revision = revisionById.get(row.revision_id), profileSelection = (selectionByRevision.get(row.revision_id) ?? []).find((item) => item.family_id === row.owner_id), profile = JSON.parse(versionById.get(profileSelection.version_id).content_json);
        row.projection_json = JSON.stringify({ schema: "case-current-final@1", id: row.owner_id, home_namespace_id: owner.home_namespace_id, state: profile.state, identity_discoverable: profile.state === "active", identity_links: [], title: profile.title, summary: profile.summary, case_version_id: profileSelection.version_id, aliases: (profile.aliases ?? []).map((value) => ({ value, normalized_value: normalizedAlias(value) })), structural_claims: (profile.aliases ?? []).map((value) => ({ namespace_id: owner.home_namespace_id, claim_type: "alias", normalized_value: normalizedAlias(value) })) });
      }
      insert(destination, "owner_current", row);
    }
    for (const table of ["owner_events", "owner_outbox", "event_retention", "consumer_checkpoints"]) for (const row of rows(source, `SELECT * FROM ${table}`)) insert(destination, table, row);
    for (const row of rows(source, "SELECT * FROM store_operation_receipts")) insert(destination, "store_operation_receipts", { ...row, snapshot_sha256: null, snapshot_size_bytes: null });
    for (const row of rows(source, "SELECT * FROM schema_migrations")) insert(destination, "schema_migrations", row);
    rebuildProjections(destination, canonical, currentRows);
    const sourceCounts = Object.fromEntries(["owners","owner_revisions","owner_events","owner_outbox","owner_family_bindings","owner_versions","owner_revision_selections","store_operation_receipts"].map((table) => [table, one(source, `SELECT count(*) count FROM ${table}`).count]));
    const finalCounts = Object.fromEntries(Object.keys(sourceCounts).map((table) => [table, one(destination, `SELECT count(*) count FROM ${table}`).count]));
    const crosswalk = { schema: "casebook-cutover-semantic-crosswalk@1", source_counts: sourceCounts, final_counts_before_cutover_receipt: finalCounts, removed_alias_family_count: canonical.aliasFamilyIds.size, registered_owner_kinds: ["case", "frame"], unknown_owner_projection_policy: "preserved-canonical-ignored" };
    for (const [table, count] of Object.entries(sourceCounts)) if (finalCounts[table] !== count && !(canonical.aliasFamilyIds.size && ["owner_family_bindings","owner_versions","owner_revision_selections"].includes(table))) throw Object.assign(new Error(`Canonical count crosswalk failed for ${table}.`), { code: "cutover_crosswalk_failed" });
    const settledAt = new Date().toISOString();
    const result = { status: "settled", terminal: { outcome: "cutover", code: "cutover_completed", failure_class: null, retry_disposition: "never", canonical_state_effect: "separate-final-destination-publication" }, store_id: metadata.store_id, predecessor: admitted.fingerprint, source: { path: request.configuration.sqlite.database_url, sha256: snapshot.sha256, size_bytes: snapshot.size, selection: "unchanged" }, destination: { path: request.destination_path, publication: "atomic-hard-link-no-replace", selected: false, durability: { database_file_fsync: "completed-before-publication", directory_entry_fsync: "not-claimed-by-settled-receipt" } }, final_schema: { id: SCHEMA_ID, version: SCHEMA_VERSION, application_id: APPLICATION_ID, schema_asset_sha256: sha256(schema), cutover_manifest_sha256: sha256(manifestBytes) }, snapshot: { path: request.retained_prior_path, sha256: snapshot.sha256, size_bytes: snapshot.size }, crosswalk, operation_fence: admitted.operationFence + 1 };
    insert(destination, "store_operation_receipts", { operation_id: request.operation_id, operation_kind: "cutover", store_id: metadata.store_id, request_digest: requestDigest, outcome: "cutover", result_json: JSON.stringify(result), result_digest: mechanicalDigest(result), authority_claim_json: JSON.stringify(request.authority_claim), settled_at: settledAt, failure_class: null, retry_disposition: "never", operation_fence: admitted.operationFence + 1, owner_id: null, owner_kind: null, owner_home_namespace_id: null, view_policy_revision_id: null, expected_revision: null, observed_revision: null, committed_revision: null, event_id: null, snapshot_sha256: snapshot.sha256, snapshot_size_bytes: snapshot.size });
    insert(destination, "store_cutovers", { cutover_id: CUTOVER_ID, operation_id: request.operation_id, predecessor_fingerprint_json: JSON.stringify(admitted.fingerprint), final_schema_asset_digest: sha256(schema), cutover_manifest_digest: sha256(manifestBytes), source_snapshot_sha256: snapshot.sha256, semantic_crosswalk_json: JSON.stringify(crosswalk), applied_at: settledAt });
    destination.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
    const check = one(destination, "SELECT (SELECT quick_check FROM pragma_quick_check) quick_check,(SELECT count(*) FROM pragma_foreign_key_check) foreign_key_violations");
    if (check.quick_check !== "ok" || check.foreign_key_violations !== 0) throw Object.assign(new Error("FINAL cutover integrity verification failed."), { code: "cutover_integrity_failed" });
    return result;
  } catch (error) {
    try { destination?.exec("ROLLBACK"); } catch {}
    throw error;
  } finally { source.close(); destination?.close(); }
}

function cutoverRequestDigest(request, admitted, sourcePath, destinationPath, snapshot) {
  return mechanicalDigest({
    operation: "cutover_store",
    operation_id: request.operation_id,
    store_id: admitted.metadata.store_id,
    source_path: sourcePath,
    destination_path: destinationPath,
    retained_prior_path: request.retained_prior_path,
    authority_claim: request.authority_claim,
    safety: request.safety,
    predecessor: admitted.fingerprint,
    source_snapshot: snapshot,
  });
}

function readPublishedCutover(destinationPath, operationId, requestDigest) {
  const db = new DatabaseSync(destinationPath, { readOnly: true });
  try {
    const metadata = one(db, "SELECT schema_id,schema_version FROM store_metadata WHERE singleton=1");
    if (metadata?.schema_id !== SCHEMA_ID || metadata.schema_version !== SCHEMA_VERSION) throw Object.assign(new Error("The cutover destination exists but is not FINAL."), { code: "cutover_destination_exists" });
    const receipt = one(db, "SELECT operation_kind,request_digest,result_json,result_digest FROM store_operation_receipts WHERE operation_id=?", operationId);
    if (!receipt) throw Object.assign(new Error("The FINAL destination does not contain the requested cutover receipt."), { code: "cutover_destination_exists" });
    if (receipt.operation_kind !== "cutover" || receipt.request_digest !== requestDigest) throw Object.assign(new Error("operation_id is already settled for a different canonical cutover request."), { code: "idempotency_mismatch" });
    const result = JSON.parse(receipt.result_json);
    if (mechanicalDigest(result) !== receipt.result_digest) throw Object.assign(new Error("The FINAL cutover receipt digest is invalid."), { code: "cutover_receipt_invalid" });
    return result;
  } finally { db.close(); }
}

function validateBuiltDestination(destinationPath, operationId, requestDigest) {
  const result = readPublishedCutover(destinationPath, operationId, requestDigest);
  const db = new DatabaseSync(destinationPath, { readOnly: true });
  try {
    const health = one(db, "SELECT (SELECT quick_check FROM pragma_quick_check) quick_check,(SELECT count(*) FROM pragma_foreign_key_check) foreign_key_violations,(SELECT count(*) FROM store_cutovers WHERE operation_id=?) cutover_count", operationId);
    if (health.quick_check !== "ok" || health.foreign_key_violations !== 0 || health.cutover_count !== 1) throw Object.assign(new Error("FINAL destination validation failed before publication."), { code: "cutover_integrity_failed" });
  } finally { db.close(); }
  return result;
}

async function syncFile(filePath) {
  const handle = await open(filePath, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(directoryPath) {
  const handle = await open(directoryPath, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function cutoverStore(request, internal = {}) {
  let temporaryPath, destinationPath, requestDigest, published = false;
  try {
    exactKeys(request, new Set(["protocol","operation","operation_id","authority_claim","safety","retained_prior_path","destination_path","configuration"]), "request");
    if (request.operation !== "cutover_store" || typeof request.operation_id !== "string" || !request.operation_id.trim()) throw Object.assign(new Error("Cutover operation identity is required."), { code: "cutover_request_invalid" });
    if (request.authority_claim?.human_authorized !== true || typeof request.authority_claim.human_confirmation_reference !== "string" || !request.authority_claim.human_confirmation_reference.trim()) throw Object.assign(new Error("Explicit human cutover authority is required."), { code: "human_authority_claim_required" });
    if (request.safety?.separately_authorized_copy !== true || request.safety?.live_source === true) throw Object.assign(new Error("Cutover accepts only a separately authorized non-live source copy."), { code: "cutover_live_source_forbidden" });
    const configuration = validateAuthorityConfiguration(request.configuration);
    if (configuration.authority_mode !== "sqlite") throw Object.assign(new Error("Cutover requires SQLite authority."), { code: "sqlite_authority_required" });
    const sourcePath = configuration.sqlite.store_path;
    destinationPath = request.destination_path;
    const retainedPath = request.retained_prior_path;
    if (![destinationPath, retainedPath].every((value) => typeof value === "string" && path.isAbsolute(value))) throw Object.assign(new Error("Cutover destination and retained snapshot paths must be absolute."), { code: "cutover_path_invalid" });
    const distinct = new Set([path.resolve(sourcePath), path.resolve(destinationPath), path.resolve(retainedPath)]);
    if (distinct.size !== 3) throw Object.assign(new Error("Cutover source, FINAL destination, and retained snapshot paths must be distinct."), { code: "cutover_same_path_rejected" });
    await Promise.all([realpath(path.dirname(sourcePath)), realpath(path.dirname(destinationPath)), realpath(path.dirname(retainedPath))]);

    const admitted = await admitPredecessor(sourcePath);
    const snapshot = { sha256: admitted.sourceSha256, size: admitted.sourceSize };
    requestDigest = cutoverRequestDigest(request, admitted, sourcePath, destinationPath, snapshot);
    if (await lstat(destinationPath).then(() => true).catch(() => false)) return success("cutover_store", readPublishedCutover(destinationPath, request.operation_id, requestDigest));

    const retainedExists = await lstat(retainedPath).then((entry) => entry.isFile() && !entry.isSymbolicLink()).catch(() => false);
    if (!retainedExists) await copyFile(sourcePath, retainedPath, fsConstants.COPYFILE_EXCL);
    const retainedBytes = await readFile(retainedPath);
    if (sha256(retainedBytes) !== snapshot.sha256 || retainedBytes.length !== snapshot.size) throw Object.assign(new Error("The retained snapshot does not exactly bind the admitted predecessor source."), { code: "cutover_snapshot_mismatch" });
    await syncFile(retainedPath);

    temporaryPath = `${destinationPath}.tmp-${sha256(request.operation_id).slice(0,16)}-${process.pid}-${Date.now()}`;
    await buildFinal(retainedPath, temporaryPath, admitted, request, snapshot, requestDigest);
    const result = validateBuiltDestination(temporaryPath, request.operation_id, requestDigest);
    const sourceBytesAfterBuild = await readFile(sourcePath);
    if (sha256(sourceBytesAfterBuild) !== snapshot.sha256 || sourceBytesAfterBuild.length !== snapshot.size) throw Object.assign(new Error("The immutable predecessor source changed during cutover."), { code: "cutover_source_changed" });
    await syncFile(temporaryPath);
    await internal.beforePublish?.({ source_path: sourcePath, temporary_path: temporaryPath, destination_path: destinationPath, result });
    try { await link(temporaryPath, destinationPath); }
    catch (error) {
      if (error?.code === "EEXIST") throw Object.assign(new Error("The FINAL destination already exists; atomic publication did not replace it."), { code: "cutover_destination_exists" });
      throw error;
    }
    published = true;
    await internal.afterPublish?.({ source_path: sourcePath, temporary_path: temporaryPath, destination_path: destinationPath, result });
    await unlink(temporaryPath); temporaryPath = undefined;
    await (internal.syncDirectory ?? syncDirectory)(path.dirname(destinationPath));
    return success("cutover_store", result);
  } catch (error) {
    if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => {});
    if ((published || destinationPath) && destinationPath && requestDigest && await lstat(destinationPath).then((entry) => entry.isFile() && !entry.isSymbolicLink()).catch(() => false)) {
      try {
        const settled = readPublishedCutover(destinationPath, request.operation_id, requestDigest);
        return success("cutover_store", settled);
      } catch (publishedError) {
        if (published) error = publishedError;
        else if (error?.code === "cutover_destination_exists" && publishedError?.code === "idempotency_mismatch") error = publishedError;
      }
    }
    const failureClass = error.code === "idempotency_mismatch" ? "idempotency_mismatch" : error.code === "cutover_destination_exists" ? "destination_exists" : "cutover_failed";
    return failure(error.code ?? "cutover_failed", error.message ?? "Exact predecessor cutover failed.", { failureClass, retryDisposition: error.code === "idempotency_mismatch" || error.code === "cutover_destination_exists" ? RETRY_DISPOSITIONS.NEVER : RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, correctiveGuidance: "Keep the predecessor selected and untouched; inspect retained evidence and the separately named FINAL destination before any explicit retry.", evidence: { publication_state: published ? "destination_verified_settled" : "not_published_by_request" } });
  }
}
