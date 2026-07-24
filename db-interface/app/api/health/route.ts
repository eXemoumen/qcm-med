/**
 * Health check endpoint for uptime monitoring
 * No authentication required - used by monitoring services
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Check database connectivity
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      },
      { status: 503 }
    );
  }
}
