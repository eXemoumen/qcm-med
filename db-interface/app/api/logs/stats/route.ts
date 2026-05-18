/**
 * GET /api/logs/stats — Fetch stats (level counts) for the logs dashboard
 * Uses a single aggregated SQL query instead of N separate count queries.
 * Requires authenticated admin/owner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALL_LEVELS = ['info', 'warn', 'error', 'fatal'] as const;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin/owner role
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Single aggregated query — GROUP BY level in one round-trip
    const { data: rows, error } = await supabaseAdmin.rpc('get_log_stats');

    // Initialize all levels to 0
    const counts: Record<string, number> = {};
    for (const level of ALL_LEVELS) {
      counts[level] = 0;
    }

    if (!error && rows) {
      for (const row of rows as { level: string; count: number }[]) {
        if (row.level in counts) {
          counts[row.level] = Number(row.count);
        }
      }
    } else if (error) {
      // Fallback: if the RPC doesn't exist yet, use a single raw count
      console.warn('[api/logs/stats] RPC get_log_stats failed, falling back:', error.message);

      // Graceful degradation — single count per level via Promise.all
      await Promise.all(
        ALL_LEVELS.map(async (level) => {
          const { count } = await supabaseAdmin
            .from('app_logs')
            .select('*', { count: 'exact', head: true })
            .eq('level', level);
          counts[level] = count ?? 0;
        })
      );
    }

    return NextResponse.json({
      success: true,
      stats: counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
