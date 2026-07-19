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
  UNIQUE (view_id, revision_number)
) STRICT;

CREATE UNIQUE INDEX one_active_policy_per_view
ON view_policy_revisions(view_id)
WHERE lifecycle = 'active';

CREATE TABLE view_policy_namespace_grants (
  view_policy_revision_id TEXT NOT NULL REFERENCES view_policy_revisions(view_policy_revision_id),
  namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  PRIMARY KEY (view_policy_revision_id, namespace_id)
) STRICT, WITHOUT ROWID;

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
  operation_fence INTEGER NOT NULL CHECK (operation_fence > 0)
) STRICT;

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
