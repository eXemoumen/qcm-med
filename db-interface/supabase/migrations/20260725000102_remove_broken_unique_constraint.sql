-- Remove the old unique constraint that doesn't handle NULL sub_discipline
-- All 3 insert paths (manual, bulk, staging push) now have application-level
-- pre-checks that catch duplicates before INSERT.
--
-- If you want to re-add a DB-level constraint later after cleaning up duplicates,
-- use the COALESCE version from migration 20260725000100.

DROP INDEX IF EXISTS questions_unique_per_exam;
