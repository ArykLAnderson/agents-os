-- Synthetic fail-closed fixture: it claims schema v1 but exposes only one
-- expected table and no coherent initialization receipt/view/ledger.
PRAGMA application_id = 1128419377;
PRAGMA user_version = 1;
CREATE TABLE store_metadata (
  singleton INTEGER PRIMARY KEY,
  store_id TEXT,
  schema_id TEXT,
  schema_version INTEGER,
  protocol_id TEXT,
  protocol_version INTEGER,
  initialized_at TEXT,
  initialization_operation_id TEXT
) STRICT;
INSERT INTO store_metadata VALUES (
  1,
  'store:00000000-0000-4000-8000-000000000001',
  'casebook-persistence-sqlite',
  1,
  'casebook-persistence-json',
  1,
  '2000-01-01T00:00:00.000Z',
  'operation:partial'
);
