-- Migration 059: Create monitoring_events table + enable Realtime on app_logs
-- for the owner monitoring dashboard
-- All statements are idempotent — safe to re-run if partially applied.

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

-- RLS (idempotent — no-op if already enabled)
ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent — catch duplicate if already created)
DO $$ BEGIN
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
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert monitoring events"
    ON monitoring_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enable Realtime for monitoring_events
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE monitoring_events;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Cleanup function: delete monitoring_events older than 7 days
-- Called app-level from /api/monitoring/health (throttled to once per 6 hours)
-- NOTE: pg_cron is NOT available on the free tier, so cleanup is driven by the app.
CREATE OR REPLACE FUNCTION cleanup_monitoring_events()
RETURNS void AS $$
BEGIN
  DELETE FROM monitoring_events
  WHERE created_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (idempotent)
GRANT SELECT ON monitoring_events TO authenticated;
GRANT INSERT ON monitoring_events TO service_role;

-- ============================================
-- 2. count_online_users RPC
-- Returns the number of distinct users with an active device session
-- since the given timestamp.
-- ============================================

CREATE OR REPLACE FUNCTION count_online_users(since TIMESTAMPTZ)
RETURNS INTEGER AS $$
  SELECT COUNT(DISTINCT user_id)::INTEGER
  FROM device_sessions
  WHERE last_active_at >= since;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 3. Enable Realtime on app_logs
-- (Required for live error feed in monitoring dashboard)
-- ============================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE app_logs;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 4. Enable Realtime on online_payments
-- (Required for live payment feed in monitoring dashboard)
-- ============================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE online_payments;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
