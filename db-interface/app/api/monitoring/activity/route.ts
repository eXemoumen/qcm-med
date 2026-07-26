/**
 * Live activity feed for the monitoring dashboard
 * Returns active users, recent test attempts, and recent payments
 *
 * GET /api/monitoring/activity
 * Requires: Owner authentication
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

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run queries in parallel
    const [
      activeSessionsResult,
      recentTestsResult,
      recentPaymentsResult,
      signupsResult,
    ] = await Promise.allSettled([
      // Active users with device info (last 15 min)
      supabaseAdmin
        .from('device_sessions')
        .select(`
          id,
          user_id,
          device_name,
          device_id,
          last_active_at,
          users:user_id (
            full_name,
            email,
            faculty,
            region
          )
        `)
        .gte('last_active_at', fifteenMinAgo)
        .order('last_active_at', { ascending: false })
        .limit(50),

      // Recent test attempts (last 24h)
      supabaseAdmin
        .from('test_attempts')
        .select(`
          id,
          user_id,
          module_name,
          exam_type,
          score_percentage,
          total_questions,
          correct_answers,
          time_spent_seconds,
          completed_at,
          users:user_id (
            full_name,
            faculty
          )
        `)
        .gte('completed_at', twentyFourHoursAgo)
        .order('completed_at', { ascending: false })
        .limit(20),

      // Recent payments (last 24h)
      supabaseAdmin
        .from('online_payments')
        .select('*')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(20),

      // New signups today
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo)
        .eq('is_test', false),
    ]);

    // Extract and format results
    const activeSessions = activeSessionsResult.status === 'fulfilled'
      ? (activeSessionsResult.value.data ?? []).map((s: any) => ({
          id: s.id,
          userId: s.user_id,
          userName: s.users?.full_name || 'Inconnu',
          userEmail: s.users?.email || '',
          faculty: s.users?.faculty || '',
          region: s.users?.region || '',
          deviceName: s.device_name || 'Appareil inconnu',
          deviceId: s.device_id,
          lastActiveAt: s.last_active_at,
        }))
      : [];

    const recentTests = recentTestsResult.status === 'fulfilled'
      ? (recentTestsResult.value.data ?? []).map((t: any) => ({
          id: t.id,
          userName: t.users?.full_name || 'Inconnu',
          faculty: t.users?.faculty || '',
          moduleName: t.module_name,
          examType: t.exam_type,
          score: t.score_percentage,
          totalQuestions: t.total_questions,
          correctAnswers: t.correct_answers,
          timeSpent: t.time_spent_seconds,
          completedAt: t.completed_at,
        }))
      : [];

    const recentPayments = recentPaymentsResult.status === 'fulfilled'
      ? (recentPaymentsResult.value.data ?? []).map((p: any) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency || 'DZD',
          status: p.status,
          paymentMethod: p.payment_method || p.method || '',
          userEmail: p.user_email || p.email || '',
          createdAt: p.created_at,
        }))
      : [];

    const todaySignups = signupsResult.status === 'fulfilled'
      ? (signupsResult.value.count ?? 0)
      : 0;

    // Calculate daily payment total
    const dailyPaymentTotal = recentPayments
      .filter(p => p.status === 'succeeded' || p.status === 'completed' || p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return NextResponse.json({
      success: true,
      activeSessions,
      activeCount: activeSessions.length,
      recentTests,
      recentPayments,
      todaySignups,
      dailyPaymentTotal,
    });
  } catch (error) {
    console.error('[api/monitoring/activity] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
