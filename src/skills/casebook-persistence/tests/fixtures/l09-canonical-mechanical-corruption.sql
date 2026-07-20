-- Synthetic L09-W01 canonical mechanical corruption. Foreign-key enforcement
-- is disabled only by the disposable fixture writer so integrity observation
-- must classify the dangling canonical family binding without repairing it.
PRAGMA foreign_keys = OFF;
INSERT INTO owner_family_bindings (family_id, owner_id, created_at)
VALUES (
  'knowledge:bba75e27-d753-4e44-a75d-4eccb6d2827a',
  'case:77154f13-21bc-45f7-bf41-315affe5b401',
  '2026-01-01T00:00:00.000Z'
);
