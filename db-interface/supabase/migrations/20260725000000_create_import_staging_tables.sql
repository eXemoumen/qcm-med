-- Migration: Create import staging tables
-- Creates import_batches and question_staging for the bulk import pipeline

-- ============================================================
-- Table: import_batches
-- Tracks each upload batch with status and counts
-- ============================================================
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('xlsx', 'xls', 'csv', 'json')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial')),
  total_rows INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  approved_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Table: question_staging
-- Raw parsed questions with validation status
-- ============================================================
CREATE TABLE IF NOT EXISTS question_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE NOT NULL,
  row_index INTEGER NOT NULL,
  -- Question fields (mirror questions table)
  year TEXT,
  module_name TEXT,
  sub_discipline TEXT,
  exam_type TEXT,
  exam_year INTEGER,
  number INTEGER,
  question_text TEXT,
  speciality TEXT,
  cours TEXT[],
  faculty_source TEXT,
  explanation TEXT,
  answers JSONB DEFAULT '[]'::jsonb,
  -- Validation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'warning', 'error', 'approved', 'rejected', 'saved')),
  errors TEXT[] DEFAULT '{}',
  warnings TEXT[] DEFAULT '{}',
  -- Audit
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes + Constraints
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_import_batches_uploaded_by ON import_batches(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_staging_batch_row ON question_staging(batch_id, row_index);
CREATE INDEX IF NOT EXISTS idx_question_staging_status ON question_staging(status);
CREATE INDEX IF NOT EXISTS idx_question_staging_batch_status ON question_staging(batch_id, status);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_staging ENABLE ROW LEVEL SECURITY;

-- Managers can insert batches
CREATE POLICY "Managers can insert batches"
  ON import_batches FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- Managers can see their own batches
CREATE POLICY "Managers see own batches"
  ON import_batches FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid());

-- Owners can see all batches
CREATE POLICY "Owners see all batches"
  ON import_batches FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- Managers can update their own batches
CREATE POLICY "Managers update own batches"
  ON import_batches FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

-- Owners can update all batches
CREATE POLICY "Owners update all batches"
  ON import_batches FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- Managers can delete their own batches
CREATE POLICY "Managers delete own batches"
  ON import_batches FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- Owners can delete all batches
CREATE POLICY "Owners delete all batches"
  ON import_batches FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- Staging rows: managers see/update own batches' rows, owners see/update all
CREATE POLICY "Staging: managers access own batch rows"
  ON question_staging FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_batches
      WHERE id = batch_id AND uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM import_batches
      WHERE id = batch_id AND uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Staging: owners access all rows"
  ON question_staging FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  );

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_import_batch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_import_batch_timestamp
  BEFORE UPDATE ON import_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_import_batch_timestamp();

-- ============================================================
-- Prevent modification/deletion of saved staging rows
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_saved_row_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'saved' THEN
    RAISE EXCEPTION 'Cannot modify staging row with status "saved"';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'saved' THEN
    RAISE EXCEPTION 'Cannot delete staging row with status "saved"';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_saved_row_modification
  BEFORE UPDATE OR DELETE ON question_staging
  FOR EACH ROW
  EXECUTE FUNCTION prevent_saved_row_modification();
