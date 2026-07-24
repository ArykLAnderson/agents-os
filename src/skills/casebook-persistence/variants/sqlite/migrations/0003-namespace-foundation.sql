-- Casebook persistence hard cutover migration: schema 1 -> 3.
-- Preserve legacy disclosure configuration as immutable migration evidence, then
-- remove it from the active operational schema.
CREATE TABLE migration_archives (
  archive_id TEXT PRIMARY KEY,
  migration_id TEXT NOT NULL,
  archive_json TEXT NOT NULL CHECK (json_valid(archive_json)),
  archived_at TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE
) STRICT;

INSERT INTO migration_archives (archive_id,migration_id,archive_json,archived_at,operation_id)
SELECT 'migration-archive:0003-namespace-foundation', '0003-namespace-foundation',
  json_object(
    'view_families', (SELECT COALESCE(json_group_array(json_object('view_id',view_id,'home_namespace_id',home_namespace_id,'created_at',created_at)),json('[]')) FROM view_families),
    'view_policy_revisions', (SELECT COALESCE(json_group_array(json_object(
      'view_policy_revision_id',view_policy_revision_id,
      'view_id',view_id,
      'revision_number',revision_number,
      'audience_ceiling',audience_ceiling,
      'lifecycle',lifecycle,
      'authority_claim_json',authority_claim_json,
      'object_kinds_json',object_kinds_json,
      'store_operation_receipts_visible',store_operation_receipts_visible,
      'predecessor_revision_id',predecessor_revision_id,
      'activation_fence',activation_fence,
      'created_at',created_at,
      'limits_json',limits_json,
      'superseded_fence',superseded_fence,
      'retirement_fence',retirement_fence
    )),json('[]')) FROM view_policy_revisions),
    'view_policy_namespace_grants', (SELECT COALESCE(json_group_array(json_object('view_policy_revision_id',view_policy_revision_id,'namespace_id',namespace_id)),json('[]')) FROM view_policy_namespace_grants),
    'consumer_checkpoints', (SELECT COALESCE(json_group_array(json_object(
      'view_id',view_id,
      'consumer_id',consumer_id,
      'view_policy_revision_id',view_policy_revision_id,
      'checkpoint_revision',checkpoint_revision,
      'event_cursor',event_cursor,
      'event_sequence',event_sequence,
      'snapshot_fence',snapshot_fence,
      'pending_event_ids_json',pending_event_ids_json,
      'freshness',freshness,
      'predecessor_policy_revision_id',predecessor_policy_revision_id,
      'updated_at',updated_at
    )),json('[]')) FROM (SELECT * FROM consumer_checkpoints ORDER BY view_id, consumer_id)),
    'receipt_policy_associations', (SELECT COALESCE(json_group_array(json_object(
      'operation_id',operation_id,
      'view_policy_revision_id',view_policy_revision_id
    )),json('[]')) FROM (
      SELECT operation_id, view_policy_revision_id
      FROM store_operation_receipts
      WHERE view_policy_revision_id IS NOT NULL
      ORDER BY operation_id
    ))
  ), datetime('now'), 'migration:0003-namespace-foundation';

DROP TRIGGER owners_identity_immutable;
CREATE TRIGGER owners_identity_immutable BEFORE UPDATE OF owner_id, owner_kind ON owners
BEGIN SELECT RAISE(ABORT, 'owner identity is immutable'); END;

CREATE TABLE owner_placement_events (
  placement_event_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(owner_id),
  from_namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  to_namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id),
  operation_id TEXT NOT NULL UNIQUE,
  operation_fence INTEGER NOT NULL UNIQUE CHECK (operation_fence > 0),
  authority_claim_json TEXT NOT NULL CHECK (json_valid(authority_claim_json)),
  committed_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER owner_placement_events_immutable_update BEFORE UPDATE ON owner_placement_events
BEGIN SELECT RAISE(ABORT, 'owner placement events are immutable'); END;
CREATE TRIGGER owner_placement_events_immutable_delete BEFORE DELETE ON owner_placement_events
BEGIN SELECT RAISE(ABORT, 'owner placement events are immutable'); END;

DROP TRIGGER store_operation_receipts_immutable_update;
DROP TRIGGER store_operation_receipts_immutable_delete;
ALTER TABLE store_operation_receipts DROP COLUMN view_policy_revision_id;
ALTER TABLE store_operation_receipts ADD COLUMN snapshot_sha256 TEXT;
ALTER TABLE store_operation_receipts ADD COLUMN snapshot_size_bytes INTEGER CHECK (snapshot_size_bytes IS NULL OR snapshot_size_bytes > 0);
CREATE TRIGGER store_operation_receipts_immutable_update BEFORE UPDATE ON store_operation_receipts
BEGIN SELECT RAISE(ABORT, 'store operation receipts are immutable'); END;
CREATE TRIGGER store_operation_receipts_immutable_delete BEFORE DELETE ON store_operation_receipts
BEGIN SELECT RAISE(ABORT, 'store operation receipts are immutable'); END;

DROP TABLE consumer_checkpoints;
DROP TABLE view_policy_namespace_grants;
DROP TABLE view_policy_revisions;
DROP TABLE view_families;

DROP TRIGGER store_metadata_immutable_update;
UPDATE store_metadata SET schema_version = 3 WHERE singleton = 1 AND schema_version = 1;
CREATE TRIGGER store_metadata_immutable_update BEFORE UPDATE ON store_metadata
BEGIN SELECT RAISE(ABORT, 'store metadata is immutable'); END;
