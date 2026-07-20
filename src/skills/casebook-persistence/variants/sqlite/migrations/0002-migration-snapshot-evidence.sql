-- Casebook persistence monotonic migration: schema 1 -> 2.
-- This asset is executed only inside the explicitly authorized migrate_store
-- transaction after a verified pre-migration snapshot has been created.
ALTER TABLE store_operation_receipts ADD COLUMN snapshot_sha256 TEXT;
ALTER TABLE store_operation_receipts ADD COLUMN snapshot_size_bytes INTEGER
  CHECK (snapshot_size_bytes IS NULL OR snapshot_size_bytes > 0);

DROP TRIGGER store_metadata_immutable_update;
UPDATE store_metadata SET schema_version = 2 WHERE singleton = 1 AND schema_version = 1;
CREATE TRIGGER store_metadata_immutable_update
BEFORE UPDATE ON store_metadata
BEGIN
  SELECT RAISE(ABORT, 'store metadata is immutable');
END;
