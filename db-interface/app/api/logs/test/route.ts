/**
 * POST /api/logs/test — Generate test log entries (development/owner only)
 * Used to verify the logging system works end-to-end.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Check auth
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
      return NextResponse.json({ error: 'Forbidden — Owner only' }, { status: 403 });
    }

    // Generate test log entries
    const testLogs = [
      {
        level: 'info' as const,
        message: 'Test log: System health check passed',
        source: 'test/health-check',
        metadata: { uptime: '48h', memory: '256MB', timestamp: new Date().toISOString() },
      },
      {
        level: 'info' as const,
        message: 'Test log: User login successful',
        source: 'test/auth',
        metadata: { method: 'email', ip: '105.102.131.8', userAgent: 'Chrome/148' },
      },
      {
        level: 'warn' as const,
        message: 'Test log: Rate limit approaching for API key',
        source: 'test/rate-limiter',
        metadata: { currentRate: 85, maxRate: 100, endpoint: '/api/questions' },
      },
      {
        level: 'warn' as const,
        message: 'Test log: Slow database query detected (>500ms)',
        source: 'test/performance',
        metadata: { query: 'SELECT * FROM questions', duration: '782ms', table: 'questions' },
      },
      {
        level: 'error' as const,
        message: 'Test log: Failed to process question import batch',
        source: 'test/import',
        metadata: {
          batchId: 'batch_2026_05_18',
          failedRows: [12, 45, 67],
          error: 'Invalid CSV format at row 12',
          stack: 'Error: Invalid CSV format\n    at parseCSV (lib/csv.ts:42)\n    at importBatch (api/import/route.ts:15)',
        },
      },
      {
        level: 'error' as const,
        message: 'Test log: Supabase connection timeout',
        source: 'test/database',
        metadata: {
          host: 'db.tkthvgvjecihqfnknosj.supabase.co',
          timeout: '30000ms',
          retries: 3,
          lastError: 'ETIMEDOUT',
        },
      },
      {
        level: 'fatal' as const,
        message: 'Test log: Unhandled exception in payment webhook',
        source: 'test/webhook',
        metadata: {
          webhookId: 'wh_test_123',
          payload: { event: 'payment.success', amount: 500 },
          error: 'Cannot read properties of undefined (reading "subscription")',
          stack: 'TypeError: Cannot read properties of undefined\n    at processPayment (api/webhooks/route.ts:89)\n    at POST (api/webhooks/route.ts:12)',
        },
      },
    ];

    // Insert all test logs
    for (const testLog of testLogs) {
      logger[testLog.level](testLog.message, {
        source: testLog.source,
        userId: user.id,
        metadata: testLog.metadata,
      });
    }

    // Small delay to let fire-and-forget complete
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return NextResponse.json({
      success: true,
      message: `${testLogs.length} test logs generated`,
      levels: {
        info: testLogs.filter((l) => l.level === 'info').length,
        warn: testLogs.filter((l) => l.level === 'warn').length,
        error: testLogs.filter((l) => l.level === 'error').length,
        fatal: testLogs.filter((l) => l.level === 'fatal').length,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate test logs' },
      { status: 500 }
    );
  }
}
