/**
 * Smart alerts system for the monitoring dashboard
 * Combines multiple signals into actionable alerts
 *
 * GET /api/monitoring/alerts
 * Requires: Owner authentication
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  icon: string;
  timestamp: string;
}

export async function GET(request: NextRequest) {
  try {
    // Auth check
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run all signal checks in parallel
    const [
      errorsLastHourResult,
      newSignupsResult,
      recentPaymentsResult,
      activeSessionsResult,
      maintenanceResult,
      fatalLogsResult,
      recentReportsResult,
    ] = await Promise.allSettled([
      // Errors in last hour
      supabaseAdmin
        .from('app_logs')
        .select('id', { count: 'exact', head: true })
        .in('level', ['error', 'fatal'])
        .gte('created_at', oneHourAgo),

      // New signups in last hour
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .eq('is_test', false),

      // Payments in last 30 min
      supabaseAdmin
        .from('online_payments')
        .select('id, amount, status')
        .gte('created_at', thirtyMinAgo),

      // Active sessions (online users)
      supabaseAdmin
        .from('device_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('last_active_at', fifteenMinAgo),

      // Maintenance mode
      supabaseAdmin
        .from('app_config')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single(),

      // Fatal logs in last 24h
      supabaseAdmin
        .from('app_logs')
        .select('id', { count: 'exact', head: true })
        .eq('level', 'fatal')
        .gte('created_at', twentyFourHoursAgo),

      // Recent question reports
      supabaseAdmin
        .from('question_reports')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo),
    ]);

    const alerts: Alert[] = [];
    const now = new Date().toISOString();

    // 1. Error rate spike
    const errorCount = errorsLastHourResult.status === 'fulfilled'
      ? (errorsLastHourResult.value.count ?? 0) : 0;
    if (errorCount >= 10) {
      alerts.push({
        id: 'error-spike',
        type: 'critical',
        title: "Pic d'erreurs détecté",
        message: `${errorCount} erreurs dans la dernière heure. Vérifiez les logs pour plus de détails.`,
        icon: '🔴',
        timestamp: now,
      });
    } else if (errorCount >= 5) {
      alerts.push({
        id: 'error-elevated',
        type: 'warning',
        title: "Erreurs élevées",
        message: `${errorCount} erreurs dans la dernière heure.`,
        icon: '⚠️',
        timestamp: now,
      });
    }

    // 2. Fatal errors
    const fatalCount = fatalLogsResult.status === 'fulfilled'
      ? (fatalLogsResult.value.count ?? 0) : 0;
    if (fatalCount > 0) {
      alerts.push({
        id: 'fatal-errors',
        type: 'critical',
        title: 'Erreurs fatales',
        message: `${fatalCount} erreur(s) fatale(s) dans les dernières 24h.`,
        icon: '💀',
        timestamp: now,
      });
    }

    // 3. New signups burst
    const signupCount = newSignupsResult.status === 'fulfilled'
      ? (newSignupsResult.value.count ?? 0) : 0;
    if (signupCount >= 5) {
      alerts.push({
        id: 'signup-burst',
        type: 'info',
        title: 'Inscriptions en rafale',
        message: `${signupCount} nouvelles inscriptions dans la dernière heure.`,
        icon: '🚀',
        timestamp: now,
      });
    } else if (signupCount > 0) {
      alerts.push({
        id: 'new-signups',
        type: 'info',
        title: 'Nouvelles inscriptions',
        message: `${signupCount} nouvelle(s) inscription(s) dans la dernière heure.`,
        icon: '👤',
        timestamp: now,
      });
    }

    // 4. Payment received
    const payments = recentPaymentsResult.status === 'fulfilled'
      ? (recentPaymentsResult.value.data ?? []) : [];
    const succeededPayments = payments.filter(
      (p: any) => p.status === 'succeeded' || p.status === 'completed' || p.status === 'paid'
    );
    if (succeededPayments.length > 0) {
      const total = succeededPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      alerts.push({
        id: 'payment-received',
        type: 'info',
        title: 'Paiement reçu',
        message: `${succeededPayments.length} paiement(s) (${total.toLocaleString()} DZD) dans les 30 dernières minutes.`,
        icon: '💰',
        timestamp: now,
      });
    }

    // 5. High concurrent users
    const activeCount = activeSessionsResult.status === 'fulfilled'
      ? (activeSessionsResult.value.count ?? 0) : 0;
    if (activeCount >= 20) {
      alerts.push({
        id: 'high-traffic',
        type: 'info',
        title: 'Trafic élevé',
        message: `${activeCount} utilisateurs actuellement en ligne.`,
        icon: '👥',
        timestamp: now,
      });
    }

    // 6. Maintenance mode
    const maintenanceMode = maintenanceResult.status === 'fulfilled'
      ? (maintenanceResult.value.data?.value === 'true') : false;
    if (maintenanceMode) {
      alerts.push({
        id: 'maintenance-active',
        type: 'warning',
        title: 'Mode maintenance actif',
        message: "Le mode maintenance est actuellement activé. Les utilisateurs ne peuvent pas accéder à l'app.",
        icon: '🔧',
        timestamp: now,
      });
    }

    // 7. Question reports pending
    const reportCount = recentReportsResult.status === 'fulfilled'
      ? (recentReportsResult.value.count ?? 0) : 0;
    if (reportCount > 0) {
      alerts.push({
        id: 'question-reports',
        type: 'info',
        title: 'Signalements de questions',
        message: `${reportCount} signalement(s) de questions dans les dernières 24h.`,
        icon: '🚩',
        timestamp: now,
      });
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.type] - severityOrder[b.type]);

    return NextResponse.json({
      success: true,
      alerts,
      summary: {
        critical: alerts.filter(a => a.type === 'critical').length,
        warning: alerts.filter(a => a.type === 'warning').length,
        info: alerts.filter(a => a.type === 'info').length,
      },
    });
  } catch (error) {
    console.error('[api/monitoring/alerts] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', alerts: [], summary: { critical: 0, warning: 0, info: 0 } },
      { status: 500 }
    );
  }
}
