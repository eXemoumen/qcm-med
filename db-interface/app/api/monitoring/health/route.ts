/**
 * Enhanced health check for the monitoring dashboard
 * Returns detailed system health metrics including DB response time,
 * active sessions, online users, and table statistics.
 *
 * GET /api/monitoring/health
 * Requires: Owner authentication
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyOwnerAuth } from '@/lib/monitoring-auth';

const HEALTH_TIMEOUT_MS = 8000;

/** Wraps a thenable (Promise or Supabase query builder) with a finite timeout. */
function withTimeout<T>(thenable: PromiseLike<T>, fallback: T, ms: number = HEALTH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyOwnerAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Run all health checks in parallel, each bounded by a timeout
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    const [
      dbProbe,
      activeSessionsResult,
      onlineUsersResult,
      maintenanceResult,
      usersCountResult,
      questionsCountResult,
      logsCountResult,
    ] = await Promise.allSettled([
      // DB response time measurement — lightweight probe with timeout
      withTimeout(
        (async () => {
          const start = Date.now();
          const { error } = await supabaseAdmin
            .from('users')
            .select('id', { head: true })
            .limit(1);
          const elapsed = Date.now() - start;
          return { connected: !error, responseTimeMs: elapsed };
        })(),
        { connected: false, responseTimeMs: -1 }
      ),

      // Active device sessions (last 5 min)
      withTimeout(
        supabaseAdmin
          .from('device_sessions')
          .select('id', { count: 'exact', head: true })
          .gte('last_active_at', fiveMinAgo),
        { count: 0, data: null, error: null } as any
      ),

      // Online users via RPC (distinct user count, last 15 min)
      withTimeout(
        supabaseAdmin.rpc('count_online_users', { since: fifteenMinAgo }),
        { data: 0, error: null } as any
      ),

      // Maintenance mode
      withTimeout(
        supabaseAdmin
          .from('app_config')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single(),
        { data: null, error: null } as any
      ),

      // Table row counts
      withTimeout(
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
        { count: 0, data: null, error: null } as any
      ),
      withTimeout(
        supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }),
        { count: 0, data: null, error: null } as any
      ),
      withTimeout(
        supabaseAdmin.from('app_logs').select('id', { count: 'exact', head: true }),
        { count: 0, data: null, error: null } as any
      ),
    ]);

    // Extract results
    const dbProbeValue = dbProbe.status === 'fulfilled'
      ? dbProbe.value
      : { connected: false, responseTimeMs: -1 };

    const activeSessions = activeSessionsResult.status === 'fulfilled'
      ? (activeSessionsResult.value.count ?? 0)
      : 0;

    // RPC returns a scalar count directly
    const onlineUsers = onlineUsersResult.status === 'fulfilled'
      ? (onlineUsersResult.value.data ?? 0)
      : 0;

    const maintenanceMode = maintenanceResult.status === 'fulfilled'
      ? (maintenanceResult.value.data?.value === 'true')
      : false;

    const tableStats = {
      users: usersCountResult.status === 'fulfilled' ? (usersCountResult.value.count ?? 0) : 0,
      questions: questionsCountResult.status === 'fulfilled' ? (questionsCountResult.value.count ?? 0) : 0,
      app_logs: logsCountResult.status === 'fulfilled' ? (logsCountResult.value.count ?? 0) : 0,
    };

    // Determine overall status
    let status: 'ok' | 'degraded' | 'error' = 'ok';
    if (!dbProbeValue.connected) {
      status = 'error';
    } else if (dbProbeValue.responseTimeMs > 2000) {
      status = 'degraded';
    }

    // App-level cleanup: delete monitoring_events older than 7 days
    // Throttled to run at most once per 6 hours via app_config timestamp
    const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
    const cleanupKey = 'monitoring_events_last_cleanup';
    try {
      const { data: cleanupConfig } = await supabaseAdmin
        .from('app_config')
        .select('value')
        .eq('key', cleanupKey)
        .single();

      const lastCleanup = cleanupConfig?.value ? new Date(cleanupConfig.value).getTime() : 0;
      if (Date.now() - lastCleanup > CLEANUP_INTERVAL_MS) {
        await supabaseAdmin.rpc('cleanup_monitoring_events');
        await supabaseAdmin
          .from('app_config')
          .upsert({ key: cleanupKey, value: new Date().toISOString() }, { onConflict: 'key' });
      }
    } catch {
      // Non-critical — ignore cleanup errors
    }

    return NextResponse.json({
      status,
      timestamp: now.toISOString(),
      database: {
        connected: dbProbeValue.connected,
        responseTimeMs: dbProbeValue.responseTimeMs,
      },
      activeSessions,
      onlineUsers,
      maintenanceMode,
      tableStats,
    });
  } catch (error) {
    console.error('[api/monitoring/health] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: { connected: false, responseTimeMs: -1 },
        activeSessions: 0,
        onlineUsers: 0,
        maintenanceMode: false,
        tableStats: { users: 0, questions: 0, app_logs: 0 },
      },
      { status: 500 }
    );
  }
}
