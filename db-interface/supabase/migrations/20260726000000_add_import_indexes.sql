-- Migration: Add indexes for improved import performance
-- Optimizes duplicate checking, pagination, and status queries

-- ============================================================
-- Optimize duplicate checking (used in push operations)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_questions_composite_lookup
ON questions(year, module_name, exam_type, exam_year, number);

-- ============================================================
-- Optimize staging queries for push-valid
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_question_staging_valid
ON question_staging(batch_id, status) WHERE status = 'valid';

-- ============================================================
-- Optimize batch status queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_import_batches_status_created
ON import_batches(status, created_at DESC);

-- ============================================================
-- Optimize pagination queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_question_staging_batch_row
ON question_staging(batch_id, row_index);

-- ============================================================
-- Optimize status count queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_question_staging_status_count
ON question_staging(batch_id, status);

-- ============================================================
-- Optimize batch listing with pagination
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_import_batches_uploaded_created
ON import_batches(uploaded_by, created_at DESC);

-- ============================================================
-- Optimize questions table for bulk inserts
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_questions_created_by
ON questions(created_by);

-- ============================================================
-- Optimize answers table for bulk inserts
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_answers_question_id
ON answers(question_id);
