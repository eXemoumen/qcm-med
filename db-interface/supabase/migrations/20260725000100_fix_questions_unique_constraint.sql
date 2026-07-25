-- Migration: Fix question number unique constraint
-- Problem: PostgreSQL UNIQUE treats NULL as distinct, so two questions with
-- sub_discipline = NULL and the same other fields would NOT be caught.
-- Solution: Use COALESCE to map NULL to empty string for uniqueness.

-- Drop the old constraint if it exists (name from api-utils.ts error handler)
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_unique_per_exam;

-- Create a unique index using COALESCE for sub_discipline
-- This ensures: same year + module + exam + exam_year + number = BLOCKED
-- regardless of whether sub_discipline is NULL or a value
CREATE UNIQUE INDEX IF NOT EXISTS questions_unique_per_exam
  ON questions (
    year,
    module_name,
    COALESCE(sub_discipline, ''),
    exam_type,
    exam_year,
    number
  );

-- Verify: this should block these inserts:
-- INSERT INTO questions (year, module_name, exam_type, exam_year, number, question_text)
-- VALUES ('1', 'Anatomie', 'EMD1', 2024, 1, 'Test');
-- INSERT INTO questions (year, module_name, sub_discipline, exam_type, exam_year, number, question_text)
-- VALUES ('1', 'Anatomie', NULL, 'EMD1', 2024, 1, 'Test 2');
-- Both should fail with unique violation.
