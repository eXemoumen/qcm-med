-- Migration 059: Create monitoring_events table for real-time monitoring dashboard
-- Stores aggregated metrics snapshots and alerts for the owner monitoring page

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

-- Auto-cleanup: delete events older than 7 days (via cron or manual)
-- We'll rely on the app to query only recent data

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

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE monitoring_events;

-- Grant permissions
GRANT SELECT ON monitoring_events TO authenticated;
GRANT INSERT ON monitoring_events TO service_role;
