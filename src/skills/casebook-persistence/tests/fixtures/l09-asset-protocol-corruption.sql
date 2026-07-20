-- Synthetic L09-W01 protocol incompatibility. The immutable metadata trigger
-- is removed only in the disposable fixture so the observer can distinguish
-- asset/protocol incompatibility from canonical or semantic corruption.
DROP TRIGGER store_metadata_immutable_update;
UPDATE store_metadata SET protocol_version = 99 WHERE singleton = 1;
