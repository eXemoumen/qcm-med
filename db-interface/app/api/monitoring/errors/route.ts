/**
 * Error rate time series and top errors for the monitoring dashboard
 *
 * GET /api/monitoring/errors
 * Requires: Owner authentication
 * Returns: Hourly error counts for last 24h, top error sources, top error messages
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

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run queries in parallel
    const [
      recentErrorsResult,
      topSourcesResult,
      topMessagesResult,
      totalCountResult,
    ] = await Promise.allSettled([
      // Recent errors/warnings (last 24h, limit 500 for aggregation)
      // Skip metadata to reduce payload size
      supabaseAdmin
        .from('app_logs')
        .select('level, source, message, created_at')
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

    // Build hourly buckets — single-pass O(n) instead of O(n×24)
    const now = Date.now();
    const hourlyBuckets: { hour: string; errors: number; warnings: number; fatals: number }[] = [];

    // Initialize empty buckets
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now - (i + 1) * 60 * 60 * 1000);
      const hourLabel = hourStart.toISOString().slice(0, 13);
      hourlyBuckets.push({ hour: hourLabel, errors: 0, warnings: 0, fatals: 0 });
    }

    // Single pass: classify each error into its bucket
    for (const log of recentErrors) {
      const logTime = new Date(log.created_at).getTime();
      const hoursAgo = (now - logTime) / (60 * 60 * 1000);
      const bucketIndex = 23 - Math.floor(hoursAgo);

      if (bucketIndex >= 0 && bucketIndex < 24) {
        if (log.level === 'fatal') {
          hourlyBuckets[bucketIndex].fatals++;
        } else if (log.level === 'error') {
          hourlyBuckets[bucketIndex].errors++;
        } else if (log.level === 'warn') {
          hourlyBuckets[bucketIndex].warnings++;
        }
      }
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
      const key = m.message.slice(0, 100);
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
      // Only return essential fields, no metadata
      recentErrors: recentErrors.slice(0, 20).map(e => ({
        id: (e as any).id,
        level: e.level,
        source: e.source,
        message: e.message,
        created_at: e.created_at,
      })),
    });
  } catch (error) {
    console.error('[api/monitoring/errors] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
