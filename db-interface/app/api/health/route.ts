/**
 * Health check endpoint for uptime monitoring
 * No authentication required - used by monitoring services
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const HEALTH_TIMEOUT_MS = 5000;

export async function GET() {
  try {
    // Create an AbortSignal with timeout for the probe
    // AbortSignal.timeout is available in Node 18+ and modern runtimes
    const signal = typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(HEALTH_TIMEOUT_MS)
      : (() => {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
          return controller.signal;
        })();

    // Check database connectivity with timeout
    const { error } = await supabase
      .from('users')
      .select('id', { head: true })
      .abortSignal(signal);

    if (error) throw error;

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error: any) {
    // Handle abort/timeout errors as unhealthy
    const isTimeout = error?.name === 'AbortError' || error?.message?.includes('timeout');
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: isTimeout ? 'timeout' : 'disconnected',
      },
      { status: 503 }
    );
  }
}
