-- Synthetic L09-W01 malformed canonical semantic record. The fixture removes
-- the immutability guard only inside its disposable store, then makes the
-- selected Case profile digest disagree with the retained content.
DROP TRIGGER owner_versions_immutable_update;
UPDATE owner_versions
SET content_digest = '0000000000000000000000000000000000000000000000000000000000000000'
WHERE family_id = 'case:15cf9a6f-163a-4db2-afb2-e39573b36b5b';
