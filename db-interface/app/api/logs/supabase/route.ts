/**
 * GET /api/logs/supabase — Fetch Supabase internal logs (auth, api, postgres)
 * Proxies the Supabase Management API logs for the admin dashboard.
 * Requires authenticated owner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?.replace('https://', '')
  ?.replace('.supabase.co', '') ?? '';

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? '';

interface SupabaseLogEntry {
  id: string;
  timestamp: number;
  event_message: string;
  level?: string;
  msg?: string;
  path?: string;
  status?: string;
  method?: string;
  status_code?: number;
  error?: string | null;
}

export async function GET(request: NextRequest) {
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

    // Parse query params
    const url = new URL(request.url);
    const service = url.searchParams.get('service') || 'auth'; // auth, api, postgres
    const validServices = ['auth', 'api', 'postgres', 'storage', 'realtime'];
    
    if (!validServices.includes(service)) {
      return NextResponse.json({ error: 'Invalid service' }, { status: 400 });
    }

    // Check if we have the access token
    if (!SUPABASE_ACCESS_TOKEN || !SUPABASE_PROJECT_REF) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Supabase access token or project ref not configured. Set SUPABASE_ACCESS_TOKEN in .env.local to enable Supabase logs.',
      });
    }

    // Fetch logs from Supabase Management API
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const logResponse = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/analytics/endpoints/logs.all?` +
      new URLSearchParams({
        iso_timestamp_start: oneHourAgo.toISOString(),
        iso_timestamp_end: now.toISOString(),
      }),
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!logResponse.ok) {
      // Fallback: return empty but don't error
      return NextResponse.json({
        success: true,
        data: [],
        message: `Supabase API returned ${logResponse.status}. Ensure SUPABASE_ACCESS_TOKEN is valid.`,
      });
    }

    const rawLogs = await logResponse.json();

    // Normalize and filter logs
    const logs: SupabaseLogEntry[] = (rawLogs?.result || rawLogs || [])
      .filter((log: SupabaseLogEntry) => {
        // Filter by service
        if (service === 'auth') {
          const msg = log.event_message || '';
          return msg.includes('/auth/') || msg.includes('"path":"/token"') || 
                 msg.includes('"path":"/user"') || msg.includes('Login') ||
                 msg.includes('logout');
        }
        if (service === 'api') {
          const msg = log.event_message || '';
          return msg.includes('/rest/v1/') || msg.includes('REST');
        }
        if (service === 'realtime') {
          const msg = log.event_message || '';
          return msg.includes('/realtime/');
        }
        return true;
      })
      .slice(0, 100); // Limit to 100 entries

    return NextResponse.json({
      success: true,
      data: logs,
      service,
      count: logs.length,
    });
  } catch (err) {
    console.error('[api/logs/supabase] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch Supabase logs' },
      { status: 500 }
    );
  }
}
