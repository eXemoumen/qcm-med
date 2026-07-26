-- Migration 059: Create monitoring_events table + enable Realtime on app_logs
-- for the owner monitoring dashboard

-- ============================================
-- 1. monitoring_events table
-- ============================================

-- Create enum for metric types
DO $$ BEGIN
  CREATE TYPE monitoring_metric_type AS ENUM ('health', 'errors', 'activity', 'business');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the monitoring_events table
CREATE TABLE IF NOT EXISTS monitoring_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_type monitoring_metric_type NOT NULL,
  metric_key TEXT NOT NULL,
  metric_value JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying by type and time
CREATE INDEX IF NOT EXISTS idx_monitoring_events_type_created
  ON monitoring_events (metric_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_key_created
  ON monitoring_events (metric_key, created_at DESC);

-- RLS policies
ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY;

-- Only owner can read monitoring events
CREATE POLICY "Owner can read monitoring events"
  ON monitoring_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'owner'
    )
  );

-- Service role can insert (via API routes)
CREATE POLICY "Service role can insert monitoring events"
  ON monitoring_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Enable Realtime for monitoring_events
ALTER PUBLICATION supabase_realtime ADD TABLE monitoring_events;

-- Auto-cleanup: delete monitoring_events older than 7 days
-- Uses pg_scheduled_jobs if available, otherwise relies on app-level cleanup
CREATE OR REPLACE FUNCTION cleanup_monitoring_events()
RETURNS void AS $$
BEGIN
  DELETE FROM monitoring_events
  WHERE created_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON monitoring_events TO authenticated;
GRANT INSERT ON monitoring_events TO service_role;

-- ============================================
-- 2. Enable Realtime on app_logs
-- (Required for live error feed in monitoring dashboard)
-- ============================================

-- Note: This may already be enabled. The IF NOT EXISTS behavior
-- varies by Supabase version, so we use a DO block for safety.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE app_logs;
EXCEPTION
  WHEN duplicate_object THEN null; -- already in publication
END $$;

-- ============================================
-- 3. Enable Realtime on online_payments
-- (Required for live payment feed in monitoring dashboard)
-- ============================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE online_payments;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
