/**
 * API route for receiving client-side application logs
 * Inserts into app_logs table via supabaseAdmin (service role)
 *
 * POST /api/logs
 * Body: { level, source, message, metadata?, userId? }
 *
 * Security:
 * - IP-based rate limiting (100 req/min per IP)
 * - Payload shape & size validation
 * - Field truncation with dev warnings
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/rate-limiter';

const VALID_LEVELS = ['info', 'warn', 'error', 'fatal'] as const;

/** Max allowed metadata JSON size (10 KB) */
const MAX_METADATA_SIZE = 10_000;

/**
 * Extract client IP from request headers (resilient to missing headers).
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be comma-separated; take the first (original client)
    return forwarded.split(',')[0].trim();
  }
  // Fallback — Next.js sometimes provides ip on the request object
  return (request as unknown as { ip?: string }).ip ?? 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting (early, before body parsing) ---
    const ip = getClientIp(request);
    const { allowed, remaining } = checkRateLimit(ip, 100, 60_000);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' },
        }
      );
    }

    const body = await request.json();
    const { level, metadata, userId } = body;
    let { source, message } = body;

    // --- Payload validation ---
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

    // Validate metadata size to prevent oversized payloads
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        return NextResponse.json(
          { error: 'metadata must be a JSON object' },
          { status: 400 }
        );
      }
      const metaSize = JSON.stringify(metadata).length;
      if (metaSize > MAX_METADATA_SIZE) {
        return NextResponse.json(
          { error: `metadata exceeds max size (${MAX_METADATA_SIZE} chars)` },
          { status: 400 }
        );
      }
    }

    // Validate userId shape if provided
    if (userId !== undefined && userId !== null && typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'userId must be a string' },
        { status: 400 }
      );
    }

    // --- Field truncation with warnings ---
    if (source.length > 255) {
      console.warn(
        `[api/logs] Truncating 'source': original=${source.length} → 255 (ip=${ip}, ts=${new Date().toISOString()})`
      );
      source = source.slice(0, 255);
    }

    if (message.length > 2000) {
      console.warn(
        `[api/logs] Truncating 'message': original=${message.length} → 2000 (ip=${ip}, ts=${new Date().toISOString()})`
      );
      message = message.slice(0, 2000);
    }

    // --- Insert the log entry ---
    const { error } = await supabaseAdmin.from('app_logs').insert({
      level,
      source,
      message,
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

    return NextResponse.json(
      { success: true },
      {
        status: 201,
        headers: { 'X-RateLimit-Remaining': String(remaining) },
      }
    );
  } catch {
    // If parsing fails or anything else, return 400
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
