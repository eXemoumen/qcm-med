/**
 * GET /api/logs/stats — Fetch stats (level counts) for the logs dashboard
 * Requires authenticated admin/owner
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

    // Count per level using separate queries
    const levels = ['info', 'warn', 'error', 'fatal'] as const;
    const counts: Record<string, number> = {};

    for (const level of levels) {
      const { count } = await supabaseAdmin
        .from('app_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', level);

      counts[level] = count ?? 0;
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
