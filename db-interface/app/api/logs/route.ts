/**
 * API route for receiving client-side application logs
 * Inserts into app_logs table via supabaseAdmin (service role)
 *
 * POST /api/logs
 * Body: { level, source, message, metadata?, userId? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const VALID_LEVELS = ['info', 'warn', 'error', 'fatal'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { level, source, message, metadata, userId } = body;

    // Basic validation
    if (!level || !VALID_LEVELS.includes(level)) {
      return NextResponse.json(
        { error: 'Invalid or missing log level' },
        { status: 400 }
      );
    }

    if (!source || typeof source !== 'string') {
      return NextResponse.json(
        { error: 'Missing log source' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing log message' },
        { status: 400 }
      );
    }

    // Insert the log entry
    const { error } = await supabaseAdmin.from('app_logs').insert({
      level,
      source: source.slice(0, 255), // Cap source length
      message: message.slice(0, 2000), // Cap message length
      metadata: metadata ?? {},
      user_id: userId ?? null,
    });

    if (error) {
      console.error('[api/logs] Failed to insert log:', error.message);
      return NextResponse.json(
        { error: 'Failed to persist log' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    // If parsing fails or anything else, silently accept
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}

/**
 * GET /api/logs — Fetch logs for the admin dashboard
 * Requires authenticated admin/owner
 */
export async function GET(request: NextRequest) {
  try {
    // Check auth via authorization header
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

    // Parse query params
    const url = new URL(request.url);
    const level = url.searchParams.get('level');
    const source = url.searchParams.get('source');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = (page - 1) * limit;

    // Build query
    let query = supabaseAdmin
      .from('app_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (level && VALID_LEVELS.includes(level as typeof VALID_LEVELS[number])) {
      query = query.eq('level', level);
    }

    if (source) {
      query = query.ilike('source', `%${source}%`);
    }

    if (search) {
      query = query.ilike('message', `%${search}%`);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('[api/logs] Failed to fetch logs:', error.message);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
