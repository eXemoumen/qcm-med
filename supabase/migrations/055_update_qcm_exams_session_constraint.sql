-- Drop the old constraint FIRST so we can update the data
ALTER TABLE public.qcm_exams DROP CONSTRAINT IF EXISTS qcm_exams_session_check;

-- Update existing "Normal" sessions to "EMD"
UPDATE public.qcm_exams SET session = 'EMD' WHERE session = 'Normal';

-- Add the new constraint
ALTER TABLE public.qcm_exams ADD CONSTRAINT qcm_exams_session_check CHECK (session IN ('EMD', 'Rattrapage'));
