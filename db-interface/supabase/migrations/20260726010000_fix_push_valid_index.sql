-- Migration: Fix push-valid index to cover both 'valid' and 'warning' statuses
-- The old partial index WHERE status = 'valid' was only half the story.
-- The push-valid endpoint now queries .in('status', ['valid', 'warning']),
-- so we need the non-partial composite index (already exists as
-- idx_question_staging_status_count) and can drop the misleading partial one.

DROP INDEX IF EXISTS idx_question_staging_valid;
