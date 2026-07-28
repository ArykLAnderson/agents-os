-- Casebook Candidate-4 owner-neutral substrate: sqlite_casebook@2
-- This is a fresh-store schema. It contains no predecessor admission or migration path.
PRAGMA foreign_keys = ON;

CREATE TABLE store_metadata (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  store_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version = 2),
  protocol_id TEXT NOT NULL,
  protocol_version INTEGER NOT NULL CHECK(protocol_version > 0),
  package_manifest_sha256 TEXT NOT NULL,
  schema_asset_sha256 TEXT NOT NULL,
  initialized_at TEXT NOT NULL,
  initialization_operation_id TEXT NOT NULL UNIQUE
) STRICT;
CREATE TRIGGER store_metadata_no_update BEFORE UPDATE ON store_metadata
BEGIN SELECT RAISE(ABORT, 'store metadata is immutable'); END;
CREATE TRIGGER store_metadata_no_delete BEFORE DELETE ON store_metadata
BEGIN SELECT RAISE(ABORT, 'store metadata is immutable'); END;

CREATE TABLE store_authority_binding (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  store_id TEXT NOT NULL UNIQUE REFERENCES store_metadata(store_id),
  workspace_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  bootstrap_grant_sha256 TEXT NOT NULL,
  bootstrap_parent_device TEXT NOT NULL,
  bootstrap_parent_inode TEXT NOT NULL,
  destination_basename TEXT NOT NULL,
  bound_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER store_authority_binding_no_update BEFORE UPDATE ON store_authority_binding
BEGIN SELECT RAISE(ABORT, 'store authority binding is immutable'); END;
CREATE TRIGGER store_authority_binding_no_delete BEFORE DELETE ON store_authority_binding
BEGIN SELECT RAISE(ABORT, 'store authority binding is immutable'); END;

CREATE TABLE store_fence (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  operation_fence INTEGER NOT NULL CHECK(operation_fence >= 1),
  hierarchy_generation INTEGER NOT NULL CHECK(hierarchy_generation >= 1),
  placement_generation INTEGER NOT NULL CHECK(placement_generation >= 0),
  resource_generation INTEGER NOT NULL CHECK(resource_generation >= 0)
) STRICT;

CREATE TABLE bootstrap_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  root_namespace_id TEXT NOT NULL,
  initial_profile_id TEXT NOT NULL,
  initial_profile_revision_id TEXT NOT NULL,
  profile_selection_id TEXT NOT NULL,
  admission_slot_id TEXT NOT NULL,
  project_default_id TEXT,
  initialization_event_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  published_receipt_digest TEXT NOT NULL
) STRICT;
CREATE TRIGGER bootstrap_state_no_update BEFORE UPDATE ON bootstrap_state
BEGIN SELECT RAISE(ABORT, 'bootstrap state is immutable'); END;
CREATE TRIGGER bootstrap_state_no_delete BEFORE DELETE ON bootstrap_state
BEGIN SELECT RAISE(ABORT, 'bootstrap state is immutable'); END;

-- Stable owner identity contains only mechanical identity and kind. Placement,
-- organization, admission, and semantic meaning belong to selected versions.
CREATE TABLE owners (
  owner_id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, owner_kind)
) STRICT;
CREATE TRIGGER owners_identity_no_update BEFORE UPDATE OF owner_id,owner_kind ON owners
BEGIN SELECT RAISE(ABORT, 'owner identity is immutable'); END;
CREATE TRIGGER owners_no_delete BEFORE DELETE ON owners
BEGIN SELECT RAISE(ABORT, 'owners cannot be deleted implicitly'); END;

CREATE TABLE owner_family_bindings (
  family_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  created_at TEXT NOT NULL,
  UNIQUE(family_id, owner_id)
) STRICT;
CREATE TRIGGER owner_family_bindings_no_update BEFORE UPDATE ON owner_family_bindings
BEGIN SELECT RAISE(ABORT, 'owner family bindings are immutable'); END;
CREATE TRIGGER owner_family_bindings_no_delete BEFORE DELETE ON owner_family_bindings
BEGIN SELECT RAISE(ABORT, 'owner family bindings are immutable'); END;

CREATE TABLE owner_versions (
  version_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  family_id TEXT NOT NULL REFERENCES owner_family_bindings(family_id),
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  content_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, family_id, version_id),
  FOREIGN KEY(family_id, owner_id) REFERENCES owner_family_bindings(family_id, owner_id)
) STRICT;
CREATE TRIGGER owner_versions_no_update BEFORE UPDATE ON owner_versions
BEGIN SELECT RAISE(ABORT, 'owner versions are immutable'); END;
CREATE TRIGGER owner_versions_no_delete BEFORE DELETE ON owner_versions
BEGIN SELECT RAISE(ABORT, 'owner versions are immutable'); END;

CREATE TABLE owner_revisions (
  revision_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json)),
  operation_id TEXT NOT NULL UNIQUE,
  committed_at TEXT NOT NULL,
  UNIQUE(owner_id, revision_number)
) STRICT;
CREATE TRIGGER owner_revisions_no_update BEFORE UPDATE ON owner_revisions
BEGIN SELECT RAISE(ABORT, 'owner revisions are immutable'); END;
CREATE TRIGGER owner_revisions_no_delete BEFORE DELETE ON owner_revisions
BEGIN SELECT RAISE(ABORT, 'owner revisions are immutable'); END;

CREATE TABLE owner_revision_selections (
  revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  family_id TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES owner_versions(version_id),
  PRIMARY KEY(revision_id, family_id)
) STRICT, WITHOUT ROWID;
CREATE TRIGGER owner_revision_selections_no_update BEFORE UPDATE ON owner_revision_selections
BEGIN SELECT RAISE(ABORT, 'revision selections are immutable'); END;
CREATE TRIGGER owner_revision_selections_no_delete BEFORE DELETE ON owner_revision_selections
BEGIN SELECT RAISE(ABORT, 'revision selections are immutable'); END;

-- Disposable current selection. Integrity/rebuild can reconstruct it from canonical revisions.
CREATE TABLE owner_current (
  owner_id TEXT PRIMARY KEY REFERENCES owners(owner_id),
  revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  projection_json TEXT NOT NULL CHECK(json_valid(projection_json)),
  updated_at TEXT NOT NULL
) STRICT;

-- Canonical Profile lifecycle and selection state. Profile content is immutable;
-- lifecycle/fence rows record human-operational activation and retirement.
CREATE TABLE profile_revision_records (
  profile_revision_id TEXT PRIMARY KEY REFERENCES owner_revisions(revision_id),
  profile_id TEXT NOT NULL REFERENCES owners(owner_id),
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  version_id TEXT NOT NULL REFERENCES owner_versions(version_id),
  predecessor_revision_id TEXT,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  content_digest TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('candidate','active','superseded','retired')),
  activation_fence INTEGER,
  retirement_fence INTEGER,
  authority_provenance_json TEXT NOT NULL CHECK(json_valid(authority_provenance_json)),
  created_at TEXT NOT NULL,
  UNIQUE(profile_id, revision_number),
  FOREIGN KEY(predecessor_revision_id) REFERENCES profile_revision_records(profile_revision_id)
) STRICT;
CREATE TRIGGER profile_revision_identity_no_update
BEFORE UPDATE OF profile_revision_id,profile_id,revision_number,version_id,predecessor_revision_id,content_json,content_digest,authority_provenance_json,created_at ON profile_revision_records
BEGIN SELECT RAISE(ABORT, 'profile revision identity and content are immutable'); END;
CREATE TRIGGER profile_revision_no_delete BEFORE DELETE ON profile_revision_records
BEGIN SELECT RAISE(ABORT, 'profile revisions are immutable'); END;

CREATE TABLE profile_selection_revisions (
  selection_revision_id TEXT PRIMARY KEY REFERENCES owner_revisions(revision_id),
  selection_id TEXT NOT NULL REFERENCES owners(owner_id),
  admission_slot_id TEXT NOT NULL,
  selected_profile_id TEXT,
  selected_profile_revision_id TEXT,
  predecessor_selection_revision_id TEXT,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','unavailable')),
  activation_fence INTEGER NOT NULL CHECK(activation_fence > 0),
  authority_provenance_json TEXT NOT NULL CHECK(json_valid(authority_provenance_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(selected_profile_revision_id) REFERENCES profile_revision_records(profile_revision_id),
  FOREIGN KEY(predecessor_selection_revision_id) REFERENCES profile_selection_revisions(selection_revision_id),
  CHECK((lifecycle='active' AND selected_profile_id IS NOT NULL AND selected_profile_revision_id IS NOT NULL)
     OR (lifecycle='unavailable' AND selected_profile_id IS NULL AND selected_profile_revision_id IS NULL))
) STRICT;
CREATE TRIGGER profile_selection_revisions_no_update BEFORE UPDATE ON profile_selection_revisions
BEGIN SELECT RAISE(ABORT, 'profile selection revisions are immutable'); END;
CREATE TRIGGER profile_selection_revisions_no_delete BEFORE DELETE ON profile_selection_revisions
BEGIN SELECT RAISE(ABORT, 'profile selection revisions are immutable'); END;

CREATE TABLE profile_selection_current (
  admission_slot_id TEXT PRIMARY KEY,
  selection_id TEXT NOT NULL REFERENCES owners(owner_id),
  selection_revision_id TEXT NOT NULL REFERENCES profile_selection_revisions(selection_revision_id),
  profile_id TEXT NOT NULL REFERENCES owners(owner_id),
  profile_revision_id TEXT NOT NULL REFERENCES profile_revision_records(profile_revision_id),
  activation_fence INTEGER NOT NULL CHECK(activation_fence > 0),
  updated_at TEXT NOT NULL,
  UNIQUE(selection_id),
  UNIQUE(selection_revision_id)
) STRICT;

-- Visibility-neutral aggregate-owned policy admission projection. Aggregate
-- adapters produce it; the provider only compares its closed mechanical facts.
CREATE TABLE owner_policy_admission_current (
  policy_owner_id TEXT PRIMARY KEY REFERENCES owners(owner_id),
  policy_owner_revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  policy_family_id TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES owner_versions(version_id),
  policy_content_digest TEXT NOT NULL,
  admission_state_version_id TEXT NOT NULL,
  projection_schema TEXT NOT NULL,
  purpose_scopes_json TEXT NOT NULL CHECK(json_valid(purpose_scopes_json)),
  disposition TEXT NOT NULL CHECK(disposition IN ('current-authorized','denied','revoked','expired')),
  revocation_fence INTEGER NOT NULL CHECK(revocation_fence >= 0),
  source_operation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE store_operation_receipts (
  operation_id TEXT PRIMARY KEY,
  operation_kind TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES store_metadata(store_id),
  request_digest TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('initialized','committed','rejected','rebuilt')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  result_digest TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  retry_disposition TEXT NOT NULL CHECK(retry_disposition IN ('never','after_reconcile','after_operator_repair')),
  operation_fence INTEGER NOT NULL CHECK(operation_fence > 0),
  owner_id TEXT,
  expected_revision INTEGER,
  observed_revision INTEGER,
  committed_revision INTEGER,
  event_id TEXT
) STRICT;
CREATE TRIGGER store_operation_receipts_no_update BEFORE UPDATE ON store_operation_receipts
BEGIN SELECT RAISE(ABORT, 'operation receipts are immutable'); END;
CREATE TRIGGER store_operation_receipts_no_delete BEFORE DELETE ON store_operation_receipts
BEGIN SELECT RAISE(ABORT, 'operation receipts are immutable'); END;

CREATE TABLE operation_admission_evidence (
  operation_id TEXT PRIMARY KEY REFERENCES store_operation_receipts(operation_id),
  profile_purpose TEXT NOT NULL,
  admission_slot_id TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  selection_revision_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_revision_id TEXT NOT NULL,
  profile_activation_fence INTEGER NOT NULL,
  owner_policy_guard_json TEXT CHECK(owner_policy_guard_json IS NULL OR json_valid(owner_policy_guard_json)),
  evidence_digest TEXT NOT NULL
) STRICT;
CREATE TRIGGER operation_admission_evidence_no_update BEFORE UPDATE ON operation_admission_evidence
BEGIN SELECT RAISE(ABORT, 'operation admission evidence is immutable'); END;
CREATE TRIGGER operation_admission_evidence_no_delete BEFORE DELETE ON operation_admission_evidence
BEGIN SELECT RAISE(ABORT, 'operation admission evidence is immutable'); END;

CREATE TABLE owner_events (
  event_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  owner_id TEXT REFERENCES owners(owner_id),
  owner_revision_id TEXT REFERENCES owner_revisions(revision_id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_digest TEXT NOT NULL,
  commit_sequence INTEGER NOT NULL UNIQUE CHECK(commit_sequence > 0),
  committed_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER owner_events_no_update BEFORE UPDATE ON owner_events
BEGIN SELECT RAISE(ABORT, 'events are immutable'); END;
CREATE TRIGGER owner_events_no_delete BEFORE DELETE ON owner_events
BEGIN SELECT RAISE(ABORT, 'events are immutable'); END;

CREATE TABLE owner_outbox (
  outbox_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  owner_id TEXT REFERENCES owners(owner_id),
  outbox_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_digest TEXT NOT NULL,
  commit_sequence INTEGER NOT NULL REFERENCES owner_events(commit_sequence),
  created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER owner_outbox_no_update BEFORE UPDATE ON owner_outbox
BEGIN SELECT RAISE(ABORT, 'outbox rows are immutable'); END;
CREATE TRIGGER owner_outbox_no_delete BEFORE DELETE ON owner_outbox
BEGIN SELECT RAISE(ABORT, 'outbox rows are immutable'); END;

CREATE TABLE disposable_projection_generations (
  generation_id TEXT PRIMARY KEY,
  source_fence INTEGER NOT NULL,
  projection_digest TEXT NOT NULL,
  built_at TEXT NOT NULL
) STRICT;
CREATE TABLE disposable_projection_selection (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  generation_id TEXT REFERENCES disposable_projection_generations(generation_id),
  source_fence INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('current','stale','unavailable'))
) STRICT;

-- WI-018 durable host-neutral Context aggregates. Context facts are append-only;
-- current rows are disposable selections and never derive authority from cwd/host state.
CREATE TABLE context_namespace_revisions (
  namespace_revision_id TEXT PRIMARY KEY REFERENCES owner_revisions(revision_id),
  namespace_id TEXT NOT NULL REFERENCES owners(owner_id),
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  parent_namespace_id TEXT REFERENCES owners(owner_id),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','retired')),
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL CHECK(json_valid(aliases_json)),
  hierarchy_generation INTEGER NOT NULL CHECK(hierarchy_generation > 0),
  created_at TEXT NOT NULL,
  UNIQUE(namespace_id, revision_number)
) STRICT;
CREATE TRIGGER context_namespace_revisions_immutable BEFORE UPDATE ON context_namespace_revisions
BEGIN SELECT RAISE(ABORT, 'context namespace revisions are immutable'); END;
CREATE TRIGGER context_namespace_revisions_no_delete BEFORE DELETE ON context_namespace_revisions
BEGIN SELECT RAISE(ABORT, 'context namespace revisions are durable'); END;
CREATE TABLE context_namespace_current (
  namespace_id TEXT PRIMARY KEY REFERENCES owners(owner_id),
  namespace_revision_id TEXT NOT NULL REFERENCES context_namespace_revisions(namespace_revision_id),
  parent_namespace_id TEXT REFERENCES owners(owner_id),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','retired')),
  hierarchy_generation INTEGER NOT NULL CHECK(hierarchy_generation > 0),
  updated_at TEXT NOT NULL
) STRICT;
-- Disposable exact-claim projection. Claim meaning is owner-neutral opaque
-- query material; Namespace scope is always taken from current placement.
CREATE TABLE owner_current_claims (
  owner_kind TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  namespace_id TEXT NOT NULL REFERENCES owners(owner_id),
  normalized_value TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  owner_revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  operation_fence INTEGER NOT NULL CHECK(operation_fence > 0),
  PRIMARY KEY(owner_kind,claim_type,namespace_id,normalized_value,owner_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE context_project_default_revisions (
  project_default_revision_id TEXT PRIMARY KEY REFERENCES owner_revisions(revision_id),
  project_default_id TEXT NOT NULL REFERENCES owners(owner_id),
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  namespace_id TEXT,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','retired')),
  default_fence INTEGER NOT NULL CHECK(default_fence > 0),
  created_at TEXT NOT NULL,
  UNIQUE(project_default_id, revision_number)
) STRICT;
CREATE TRIGGER context_project_default_revisions_immutable BEFORE UPDATE ON context_project_default_revisions
BEGIN SELECT RAISE(ABORT, 'project default revisions are immutable'); END;
CREATE TABLE context_project_default_current (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  project_default_id TEXT NOT NULL REFERENCES owners(owner_id),
  project_default_revision_id TEXT NOT NULL REFERENCES context_project_default_revisions(project_default_revision_id),
  namespace_id TEXT,
  default_fence INTEGER NOT NULL CHECK(default_fence > 0),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE context_chat_revisions (
  chat_revision_id TEXT PRIMARY KEY REFERENCES owner_revisions(revision_id),
  chat_id TEXT NOT NULL REFERENCES owners(owner_id),
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  namespace_id TEXT NOT NULL REFERENCES owners(owner_id),
  parent_chat_id TEXT REFERENCES owners(owner_id),
  lifecycle TEXT NOT NULL CHECK(lifecycle='active'),
  created_at TEXT NOT NULL,
  UNIQUE(chat_id, revision_number)
) STRICT;
CREATE TRIGGER context_chat_revisions_immutable BEFORE UPDATE ON context_chat_revisions
BEGIN SELECT RAISE(ABORT, 'chat revisions are immutable'); END;
CREATE TABLE context_chat_current (
  chat_id TEXT PRIMARY KEY REFERENCES owners(owner_id),
  chat_revision_id TEXT NOT NULL REFERENCES context_chat_revisions(chat_revision_id),
  namespace_id TEXT NOT NULL REFERENCES owners(owner_id),
  parent_chat_id TEXT REFERENCES owners(owner_id),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE context_correlation_claims (
  correlation_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  chat_id TEXT NOT NULL REFERENCES owners(owner_id),
  created_at TEXT NOT NULL,
  UNIQUE(provider,account_ref),
  CHECK(length(provider) <= 128 AND length(account_ref) = 95
    AND substr(account_ref, 1, 31) = 'redacted-account-ref:v1:sha256:'
    AND substr(account_ref, 32) NOT GLOB '*[^0-9a-f]*')
) STRICT;
CREATE TRIGGER context_correlation_claims_no_update BEFORE UPDATE ON context_correlation_claims
BEGIN SELECT RAISE(ABORT, 'correlations cannot be rebound'); END;
CREATE TRIGGER context_correlation_claims_no_delete BEFORE DELETE ON context_correlation_claims
BEGIN SELECT RAISE(ABORT, 'correlations cannot be released'); END;

-- Owner-neutral canonical query material. Aggregate façades provide opaque
-- documents/edges; the substrate only records their canonical digest and
-- applied-through fence for mechanical R projection.
CREATE TABLE owner_query_material (
  revision_id TEXT PRIMARY KEY REFERENCES owner_revisions(revision_id),
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  query_digest TEXT NOT NULL,
  documents_json TEXT NOT NULL CHECK(json_valid(documents_json)),
  edges_json TEXT NOT NULL CHECK(json_valid(edges_json)),
  applied_through_fence INTEGER NOT NULL CHECK(applied_through_fence > 0),
  committed_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER owner_query_material_no_update BEFORE UPDATE ON owner_query_material
BEGIN SELECT RAISE(ABORT, 'query material is immutable'); END;
CREATE TRIGGER owner_query_material_no_delete BEFORE DELETE ON owner_query_material
BEGIN SELECT RAISE(ABORT, 'query material cannot be deleted implicitly'); END;
CREATE TABLE owner_query_current (
  owner_id TEXT PRIMARY KEY REFERENCES owners(owner_id),
  revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  query_digest TEXT NOT NULL,
  applied_through_fence INTEGER NOT NULL CHECK(applied_through_fence > 0),
  updated_at TEXT NOT NULL
) STRICT;
-- Disposable lexical projection of canonical owner_query_material.  Search
-- never falls back to scanning historical owner versions or raw documents.
CREATE VIRTUAL TABLE owner_query_fts USING fts5(
  owner_id UNINDEXED,
  revision_id UNINDEXED,
  resource_id UNINDEXED,
  resource_kind UNINDEXED,
  document_json UNINDEXED,
  text
);


-- WI-024: provider-local reconciliation state. It is deliberately separate
-- from owner semantics. The key is generated at fresh-store initialization
-- and never leaves SQLite except into connector process memory for HMAC.
CREATE TABLE reconciliation_cursor_keys (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  secret_hex TEXT NOT NULL CHECK(length(secret_hex)=64 AND secret_hex NOT GLOB '*[^0-9a-f]*')
) STRICT;
CREATE TRIGGER reconciliation_cursor_keys_immutable BEFORE UPDATE ON reconciliation_cursor_keys
BEGIN SELECT RAISE(ABORT, 'cursor key is immutable'); END;
CREATE TRIGGER reconciliation_cursor_keys_no_delete BEFORE DELETE ON reconciliation_cursor_keys
BEGIN SELECT RAISE(ABORT, 'cursor key cannot be deleted'); END;
CREATE TABLE reconciliation_snapshot_policy (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  ttl_seconds INTEGER NOT NULL CHECK(ttl_seconds BETWEEN 1 AND 86400),
  expired_tombstone_seconds INTEGER NOT NULL CHECK(expired_tombstone_seconds BETWEEN 1 AND 604800)
) STRICT;
INSERT INTO reconciliation_snapshot_policy VALUES(1,900,86400);
CREATE TABLE reconciliation_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  operation_scope_digest TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES store_metadata(store_id),
  workspace_id TEXT NOT NULL,
  admission_slot_id TEXT NOT NULL,
  operation_fence INTEGER NOT NULL CHECK(operation_fence>0),
  event_sequence INTEGER NOT NULL CHECK(event_sequence>=0),
  hierarchy_generation INTEGER NOT NULL CHECK(hierarchy_generation>=0),
  placement_generation INTEGER NOT NULL CHECK(placement_generation>=0),
  resource_generation INTEGER NOT NULL CHECK(resource_generation>=0),
  state TEXT NOT NULL CHECK(state IN ('open','completed','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  expired_at TEXT
) STRICT;
CREATE INDEX reconciliation_snapshots_expiry ON reconciliation_snapshots(state, expires_at);
CREATE TABLE reconciliation_event_retention (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  retained_after_sequence INTEGER NOT NULL CHECK(retained_after_sequence>=0)
) STRICT;
INSERT INTO reconciliation_event_retention VALUES(1,0);
CREATE TABLE reconciliation_checkpoints (
  consumer_id TEXT PRIMARY KEY,
  checkpoint_revision INTEGER NOT NULL CHECK(checkpoint_revision>0),
  event_cursor TEXT NOT NULL,
  event_sequence INTEGER NOT NULL CHECK(event_sequence>=0),
  snapshot_fence INTEGER NOT NULL CHECK(snapshot_fence>=0),
  pending_event_ids_json TEXT NOT NULL CHECK(json_valid(pending_event_ids_json)),
  freshness TEXT NOT NULL CHECK(freshness IN ('complete','partial')),
  hierarchy_generation INTEGER NOT NULL CHECK(hierarchy_generation>=0),
  placement_generation INTEGER NOT NULL CHECK(placement_generation>=0),
  resource_generation INTEGER NOT NULL CHECK(resource_generation>=0),
  updated_at TEXT NOT NULL
) STRICT;
