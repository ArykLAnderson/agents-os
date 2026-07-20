-- Casebook persistence schema identity: casebook-persistence-sqlite@1
-- L01-W02 initializes this schema only through the explicitly authorized
-- initialize_store operation. Ordinary access must never execute this asset.
PRAGMA foreign_keys = ON;

CREATE TABLE store_metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  store_id TEXT NOT NULL UNIQUE,
  schema_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  protocol_id TEXT NOT NULL,
  protocol_version INTEGER NOT NULL CHECK (protocol_version > 0),
  initialized_at TEXT NOT NULL,
  initialization_operation_id TEXT NOT NULL
) STRICT;

CREATE TRIGGER store_metadata_immutable_update
BEFORE UPDATE ON store_metadata
BEGIN
  SELECT RAISE(ABORT, 'store metadata is immutable');
END;

CREATE TRIGGER store_metadata_immutable_delete
BEFORE DELETE ON store_metadata
BEGIN
  SELECT RAISE(ABORT, 'store metadata is immutable');
END;

CREATE TABLE namespaces (
  namespace_id TEXT PRIMARY KEY,
  namespace_key TEXT NOT NULL UNIQUE,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active', 'retired')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE view_families (
  view_id TEXT PRIMARY KEY,
  home_namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE view_policy_revisions (
  view_policy_revision_id TEXT PRIMARY KEY,
  view_id TEXT NOT NULL REFERENCES view_families(view_id),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  audience_ceiling TEXT NOT NULL CHECK (audience_ceiling = 'private'),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('created', 'active', 'superseded', 'retired')),
  authority_claim_json TEXT NOT NULL CHECK (json_valid(authority_claim_json)),
  object_kinds_json TEXT NOT NULL CHECK (json_valid(object_kinds_json)),
  store_operation_receipts_visible INTEGER NOT NULL CHECK (store_operation_receipts_visible IN (0, 1)),
  predecessor_revision_id TEXT REFERENCES view_policy_revisions(view_policy_revision_id),
  activation_fence INTEGER,
  created_at TEXT NOT NULL,
  limits_json TEXT NOT NULL DEFAULT '{"max_results":100,"max_traversal_depth":8}' CHECK (json_valid(limits_json)),
  superseded_fence INTEGER,
  retirement_fence INTEGER,
  UNIQUE (view_id, revision_number)
) STRICT;

CREATE TRIGGER view_policy_meaning_immutable
BEFORE UPDATE OF view_policy_revision_id, view_id, revision_number, audience_ceiling,
  authority_claim_json, object_kinds_json, store_operation_receipts_visible,
  predecessor_revision_id, created_at, limits_json
ON view_policy_revisions
BEGIN
  SELECT RAISE(ABORT, 'view policy meaning is immutable');
END;

CREATE TRIGGER view_policy_revisions_immutable_delete
BEFORE DELETE ON view_policy_revisions
BEGIN
  SELECT RAISE(ABORT, 'view policy revisions are immutable');
END;

CREATE UNIQUE INDEX one_active_policy_per_view
ON view_policy_revisions(view_id)
WHERE lifecycle = 'active';

CREATE TABLE view_policy_namespace_grants (
  view_policy_revision_id TEXT NOT NULL REFERENCES view_policy_revisions(view_policy_revision_id),
  namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  PRIMARY KEY (view_policy_revision_id, namespace_id)
) STRICT, WITHOUT ROWID;

CREATE TRIGGER view_policy_grants_only_while_created
BEFORE INSERT ON view_policy_namespace_grants
WHEN NOT EXISTS (
  SELECT 1 FROM view_policy_revisions
  WHERE view_policy_revision_id = NEW.view_policy_revision_id AND lifecycle = 'created'
)
BEGIN
  SELECT RAISE(ABORT, 'view policy grants are immutable after activation');
END;

CREATE TRIGGER view_policy_grants_immutable_update
BEFORE UPDATE ON view_policy_namespace_grants
BEGIN
  SELECT RAISE(ABORT, 'view policy grants are immutable');
END;

CREATE TRIGGER view_policy_grants_immutable_delete
BEFORE DELETE ON view_policy_namespace_grants
BEGIN
  SELECT RAISE(ABORT, 'view policy grants are immutable');
END;

CREATE TABLE store_fence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  operation_fence INTEGER NOT NULL CHECK (operation_fence >= 0)
) STRICT;

CREATE TABLE store_operation_receipts (
  operation_id TEXT PRIMARY KEY,
  operation_kind TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES store_metadata(store_id),
  request_digest TEXT NOT NULL,
  outcome TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_digest TEXT NOT NULL,
  authority_claim_json TEXT NOT NULL CHECK (json_valid(authority_claim_json)),
  settled_at TEXT NOT NULL,
  failure_class TEXT,
  retry_disposition TEXT NOT NULL CHECK (retry_disposition IN ('never', 'after_reconcile', 'after_operator_repair')),
  operation_fence INTEGER NOT NULL CHECK (operation_fence > 0),
  owner_id TEXT,
  owner_kind TEXT,
  owner_home_namespace_id TEXT REFERENCES namespaces(namespace_id),
  view_policy_revision_id TEXT REFERENCES view_policy_revisions(view_policy_revision_id),
  expected_revision INTEGER CHECK (expected_revision IS NULL OR expected_revision >= 0),
  observed_revision INTEGER CHECK (observed_revision IS NULL OR observed_revision >= 0),
  committed_revision INTEGER CHECK (committed_revision IS NULL OR committed_revision > 0),
  event_id TEXT
) STRICT;

CREATE TABLE owners (
  owner_id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  home_namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, owner_kind)
) STRICT;

CREATE TABLE owner_family_bindings (
  family_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  created_at TEXT NOT NULL,
  UNIQUE (family_id, owner_id)
) STRICT;

CREATE TABLE owner_versions (
  version_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  family_id TEXT NOT NULL REFERENCES owner_family_bindings(family_id),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  content_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, family_id, version_id),
  FOREIGN KEY (family_id, owner_id) REFERENCES owner_family_bindings(family_id, owner_id)
) STRICT;

CREATE TABLE owner_revisions (
  revision_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  normalized_json TEXT NOT NULL CHECK (json_valid(normalized_json)),
  representation_id TEXT NOT NULL,
  representation_version INTEGER NOT NULL CHECK (representation_version > 0),
  operation_id TEXT NOT NULL UNIQUE,
  committed_at TEXT NOT NULL,
  UNIQUE (owner_id, revision_number)
) STRICT;

CREATE TABLE owner_revision_selections (
  revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  family_id TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES owner_versions(version_id),
  PRIMARY KEY (revision_id, family_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE owner_current (
  owner_id TEXT PRIMARY KEY REFERENCES owners(owner_id),
  revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE owner_events (
  event_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  owner_kind TEXT NOT NULL,
  owner_revision_id TEXT NOT NULL REFERENCES owner_revisions(revision_id),
  owner_revision INTEGER NOT NULL CHECK (owner_revision > 0),
  namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  event_type TEXT NOT NULL,
  event_schema_version INTEGER NOT NULL CHECK (event_schema_version > 0),
  operation_id TEXT NOT NULL UNIQUE,
  causation TEXT,
  correlation TEXT,
  commit_sequence INTEGER NOT NULL UNIQUE CHECK (commit_sequence > 0),
  committed_at TEXT NOT NULL,
  visibility_ceiling TEXT NOT NULL CHECK (visibility_ceiling = 'private'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_digest TEXT NOT NULL
) STRICT;

CREATE TABLE owner_outbox (
  outbox_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  outbox_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_digest TEXT NOT NULL,
  commit_sequence INTEGER NOT NULL REFERENCES owner_events(commit_sequence),
  created_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER owners_identity_immutable
BEFORE UPDATE OF owner_id, owner_kind, home_namespace_id ON owners
BEGIN
  SELECT RAISE(ABORT, 'owner identity is immutable');
END;

CREATE TRIGGER owner_family_bindings_immutable_update BEFORE UPDATE ON owner_family_bindings
BEGIN SELECT RAISE(ABORT, 'owner family bindings are immutable'); END;
CREATE TRIGGER owner_family_bindings_immutable_delete BEFORE DELETE ON owner_family_bindings
BEGIN SELECT RAISE(ABORT, 'owner family bindings are immutable'); END;
CREATE TRIGGER owner_versions_immutable_update BEFORE UPDATE ON owner_versions
BEGIN SELECT RAISE(ABORT, 'owner versions are immutable'); END;
CREATE TRIGGER owner_versions_immutable_delete BEFORE DELETE ON owner_versions
BEGIN SELECT RAISE(ABORT, 'owner versions are immutable'); END;
CREATE TRIGGER owner_revisions_immutable_update BEFORE UPDATE ON owner_revisions
BEGIN SELECT RAISE(ABORT, 'owner revisions are immutable'); END;
CREATE TRIGGER owner_revisions_immutable_delete BEFORE DELETE ON owner_revisions
BEGIN SELECT RAISE(ABORT, 'owner revisions are immutable'); END;
CREATE TRIGGER owner_revision_selections_immutable_update BEFORE UPDATE ON owner_revision_selections
BEGIN SELECT RAISE(ABORT, 'owner revision selections are immutable'); END;
CREATE TRIGGER owner_revision_selections_immutable_delete BEFORE DELETE ON owner_revision_selections
BEGIN SELECT RAISE(ABORT, 'owner revision selections are immutable'); END;
CREATE TRIGGER owner_events_immutable_update BEFORE UPDATE ON owner_events
BEGIN SELECT RAISE(ABORT, 'owner events are immutable'); END;
CREATE TRIGGER owner_events_immutable_delete BEFORE DELETE ON owner_events
BEGIN SELECT RAISE(ABORT, 'owner events are immutable'); END;
CREATE TRIGGER owner_outbox_immutable_update BEFORE UPDATE ON owner_outbox
BEGIN SELECT RAISE(ABORT, 'owner outbox is immutable'); END;
CREATE TRIGGER owner_outbox_immutable_delete BEFORE DELETE ON owner_outbox
BEGIN SELECT RAISE(ABORT, 'owner outbox is immutable'); END;

CREATE TRIGGER store_operation_receipts_immutable_update
BEFORE UPDATE ON store_operation_receipts
BEGIN
  SELECT RAISE(ABORT, 'store operation receipts are immutable');
END;

CREATE TRIGGER store_operation_receipts_immutable_delete
BEFORE DELETE ON store_operation_receipts
BEGIN
  SELECT RAISE(ABORT, 'store operation receipts are immutable');
END;

CREATE TABLE schema_migrations (
  migration_id TEXT PRIMARY KEY,
  schema_id TEXT NOT NULL,
  from_version INTEGER NOT NULL CHECK (from_version >= 0),
  to_version INTEGER NOT NULL CHECK (to_version > from_version),
  schema_asset_digest TEXT NOT NULL,
  migration_manifest_digest TEXT NOT NULL,
  operation_id TEXT NOT NULL REFERENCES store_operation_receipts(operation_id),
  applied_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER schema_migrations_immutable_update
BEFORE UPDATE ON schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'schema migration ledger is immutable');
END;

CREATE TRIGGER schema_migrations_immutable_delete
BEFORE DELETE ON schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'schema migration ledger is immutable');
END;
