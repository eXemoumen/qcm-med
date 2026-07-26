/**
 * Error rate time series and top errors for the monitoring dashboard
 *
 * GET /api/monitoring/errors
 * Requires: Owner authentication
 * Returns: Hourly error counts for last 24h, top error sources, top error messages
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify owner role
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run queries in parallel
    const [
      recentErrorsResult,
      topSourcesResult,
      topMessagesResult,
      totalCountResult,
    ] = await Promise.allSettled([
      // Recent errors/warnings (last 24h, limit 500 for aggregation)
      supabaseAdmin
        .from('app_logs')
        .select('level, source, message, created_at, metadata')
        .in('level', ['error', 'fatal', 'warn'])
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(500),

      // Top error sources
      supabaseAdmin
        .from('app_logs')
        .select('source')
        .in('level', ['error', 'fatal'])
        .gte('created_at', twentyFourHoursAgo)
        .limit(200),

      // Top error messages (for dedup)
      supabaseAdmin
        .from('app_logs')
        .select('message, source, level')
        .in('level', ['error', 'fatal'])
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(200),

      // Total error count
      supabaseAdmin
        .from('app_logs')
        .select('id', { count: 'exact', head: true })
        .in('level', ['error', 'fatal'])
        .gte('created_at', twentyFourHoursAgo),
    ]);

    const recentErrors = recentErrorsResult.status === 'fulfilled'
      ? (recentErrorsResult.value.data ?? [])
      : [];

    const totalCount = totalCountResult.status === 'fulfilled'
      ? (totalCountResult.value.count ?? 0)
      : 0;

    // Build hourly buckets for the last 24 hours
    const hourlyBuckets: { hour: string; errors: number; warnings: number; fatals: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(Date.now() - (i + 1) * 60 * 60 * 1000);
      const hourEnd = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourLabel = hourStart.toISOString().slice(0, 13); // "2026-07-26T14"

      const bucketErrors = recentErrors.filter(e => {
        const t = new Date(e.created_at);
        return t >= hourStart && t < hourEnd && (e.level === 'error' || e.level === 'fatal');
      }).length;

      const bucketWarnings = recentErrors.filter(e => {
        const t = new Date(e.created_at);
        return t >= hourStart && t < hourEnd && e.level === 'warn';
      }).length;

      const bucketFatals = recentErrors.filter(e => {
        const t = new Date(e.created_at);
        return t >= hourStart && t < hourEnd && e.level === 'fatal';
      }).length;

      hourlyBuckets.push({
        hour: hourLabel,
        errors: bucketErrors,
        warnings: bucketWarnings,
        fatals: bucketFatals,
      });
    }

    // Top sources (deduplicated with count)
    const sourceCounts: Record<string, number> = {};
    const sourcesData = topSourcesResult.status === 'fulfilled'
      ? (topSourcesResult.value.data ?? [])
      : [];
    sourcesData.forEach(s => {
      sourceCounts[s.source] = (sourceCounts[s.source] || 0) + 1;
    });
    const topSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    // Top messages (deduplicated, keep first occurrence)
    const messagesData = topMessagesResult.status === 'fulfilled'
      ? (topMessagesResult.value.data ?? [])
      : [];
    const seenMessages = new Set<string>();
    const topMessages: { message: string; source: string; level: string; count: number }[] = [];
    const messageCounts: Record<string, number> = {};

    messagesData.forEach(m => {
      const key = m.message.slice(0, 100); // Use first 100 chars as dedup key
      messageCounts[key] = (messageCounts[key] || 0) + 1;
      if (!seenMessages.has(key)) {
        seenMessages.add(key);
        topMessages.push({
          message: m.message,
          source: m.source,
          level: m.level,
          count: 0,
        });
      }
    });
    topMessages.forEach(tm => {
      tm.count = messageCounts[tm.message.slice(0, 100)] || 0;
    });
    topMessages.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      totalCount,
      hourlyBuckets,
      topSources: topSources.slice(0, 10),
      topMessages: topMessages.slice(0, 10),
      recentErrors: recentErrors.slice(0, 20),
    });
  } catch (error) {
    console.error('[api/monitoring/errors] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
