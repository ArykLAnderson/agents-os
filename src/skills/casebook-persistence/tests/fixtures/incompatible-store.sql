-- Synthetic incompatible fixture: ordinary access must classify migration as
-- required and must never execute schema-v1.sql against this file.
PRAGMA application_id = 12345;
PRAGMA user_version = 99;
CREATE TABLE foreign_store_payload (
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT INTO foreign_store_payload(value) VALUES ('must-remain-unchanged');
