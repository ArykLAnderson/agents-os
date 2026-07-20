-- Synthetic L09-W01 corruption of only the disposable/current projection
-- bytes. Canonical owner revision and immutable selected versions remain intact.
UPDATE owner_current
SET projection_json = json_set(projection_json, '$.title', 'synthetic corrupt projection')
WHERE owner_id = 'case:15cf9a6f-163a-4db2-afb2-e39573b36b5b';
