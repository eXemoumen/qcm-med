/**
 * Health check endpoint for uptime monitoring
 * No authentication required - used by monitoring services
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const HEALTH_TIMEOUT_MS = 5000;

export async function GET() {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  try {
    // Create an AbortSignal with timeout for the probe
    // AbortSignal.timeout is available in Node 18+ and modern runtimes
    let signal: AbortSignal;
    if (typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
    } else {
      const controller = new AbortController();
      timerId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      signal = controller.signal;
    }

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
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}
