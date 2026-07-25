-- Step 1: Find all duplicate question numbers
-- (same year + module + exam + exam_year + number, ignoring sub_discipline NULLs)
WITH duplicates AS (
  SELECT
    id,
    year,
    module_name,
    COALESCE(sub_discipline, '') AS sub_discipline_key,
    exam_type,
    exam_year,
    number,
    question_text,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY year, module_name, COALESCE(sub_discipline, ''), exam_type, exam_year, number
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM questions
)
SELECT id, year, module_name, sub_discipline_key, exam_type, exam_year, number,
       LEFT(question_text, 80) AS preview, created_at, rn
FROM duplicates
WHERE rn > 1
ORDER BY year, module_name, exam_type, exam_year, number, rn;

-- Step 2: Delete duplicates (keep the oldest/first one)
-- Run Step 1 first to review what will be deleted, then run this:
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY year, module_name, COALESCE(sub_discipline, ''), exam_type, exam_year, number
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM questions
)
DELETE FROM questions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 3: Now safely create the unique index
DROP INDEX IF EXISTS questions_unique_per_exam;

CREATE UNIQUE INDEX questions_unique_per_exam
  ON questions (
    year,
    module_name,
    COALESCE(sub_discipline, ''),
    exam_type,
    exam_year,
    number
  );

-- Step 4: Verify — this should return 0 rows
SELECT year, module_name, COALESCE(sub_discipline, '') AS sub_key, exam_type, exam_year, number, COUNT(*)
FROM questions
GROUP BY year, module_name, COALESCE(sub_discipline, ''), exam_type, exam_year, number
HAVING COUNT(*) > 1;
