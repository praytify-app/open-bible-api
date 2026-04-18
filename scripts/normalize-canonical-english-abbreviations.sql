-- Normalize known English version abbreviations to canonical short codes.
-- This is intentionally scoped to explicit mappings so it is safe to run on
-- an existing production-like database without colliding with unrelated rows.
--
-- Usage:
--   psql postgresql://bible:bible@localhost:5432/praytify_bible \
--     -f scripts/normalize-canonical-english-abbreviations.sql

BEGIN;

UPDATE versions
SET abbreviation = 'ASV'
WHERE abbreviation = 'American Standard Version (1901)';

UPDATE versions
SET abbreviation = 'BSB'
WHERE abbreviation = 'English Berean Standard Bible';

UPDATE versions
SET abbreviation = 'MSB'
WHERE abbreviation = 'Majority Standard BIble';

UPDATE versions
SET abbreviation = 'OEB'
WHERE abbreviation = 'Open English Bible (US)';

UPDATE versions
SET abbreviation = 'OEB-CW'
WHERE abbreviation = 'Open English Bible (Commonwealth)';

UPDATE versions
SET abbreviation = 'WEBU'
WHERE abbreviation = 'World English Bible Updated';

SELECT abbreviation, name
FROM versions
WHERE abbreviation IN ('ASV', 'BSB', 'MSB', 'OEB', 'OEB-CW', 'WEBU')
ORDER BY abbreviation;

COMMIT;
