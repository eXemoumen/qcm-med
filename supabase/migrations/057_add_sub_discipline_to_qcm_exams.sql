-- Add sub_discipline column to qcm_exams table
-- This stores the sub-discipline (e.g., Anatomie, Histologie) for UEI modules
-- to maintain consistency with the questions table naming conventions

ALTER TABLE public.qcm_exams
  ADD COLUMN IF NOT EXISTS sub_discipline TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN public.qcm_exams.sub_discipline IS 'Sub-discipline name for UEI modules (e.g., Anatomie, Histologie). Matches predefined sub-disciplines used in questions.';
