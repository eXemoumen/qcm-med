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

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyOwnerAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Run all health checks in parallel
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
      // DB response time measurement — simple lightweight query
      (async () => {
        const start = Date.now();
        const { error } = await supabaseAdmin
          .from('users')
          .select('id', { head: true })
          .limit(1);
        const elapsed = Date.now() - start;
        return { connected: !error, responseTimeMs: elapsed };
      })(),

      // Active device sessions (last 5 min)
      supabaseAdmin
        .from('device_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('last_active_at', fiveMinAgo),

      // Online users (last 15 min) — distinct user_ids
      supabaseAdmin
        .from('device_sessions')
        .select('user_id')
        .gte('last_active_at', fifteenMinAgo),

      // Maintenance mode
      supabaseAdmin
        .from('app_config')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single(),

      // Table row counts
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('app_logs').select('id', { count: 'exact', head: true }),
    ]);

    // Extract results
    const dbProbeValue = dbProbe.status === 'fulfilled'
      ? dbProbe.value
      : { connected: false, responseTimeMs: -1 };

    const activeSessions = activeSessionsResult.status === 'fulfilled'
      ? (activeSessionsResult.value.count ?? 0)
      : 0;

    // Count distinct users for online count
    const onlineUsers = onlineUsersResult.status === 'fulfilled'
      ? new Set((onlineUsersResult.value.data ?? []).map((r: any) => r.user_id)).size
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
