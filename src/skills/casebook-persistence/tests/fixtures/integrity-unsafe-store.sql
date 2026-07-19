-- Deterministic integrity-unsafe store: the dangling child row is created with
-- enforcement disabled so PRAGMA foreign_key_check must reject the store.
PRAGMA foreign_keys = OFF;
PRAGMA application_id = 1128419377;
PRAGMA user_version = 1;

CREATE TABLE integrity_parent (
  id INTEGER PRIMARY KEY
) STRICT;

CREATE TABLE integrity_child (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES integrity_parent(id)
) STRICT;

INSERT INTO integrity_child (id, parent_id) VALUES (1, 404);
