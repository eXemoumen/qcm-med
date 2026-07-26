"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SystemHealth from "@/components/monitoring/SystemHealth";
import LiveActivityFeed from "@/components/monitoring/LiveActivityFeed";
import TrendCharts from "@/components/monitoring/TrendCharts";

interface Alert {
  id: string;
  type: "info" | "warning" | "critical";
  title: string;
  message: string;
  icon: string;
  timestamp: string;
}

export default function MonitoringPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertSummary, setAlertSummary] = useState({
    critical: 0,
    warning: 0,
    info: 0,
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auth check — owner only
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (!user || user.role !== "owner") {
        router.push("/");
        return;
      }

      setIsLoadingAuth(false);
    };

    checkAuth();
  }, [router]);

  // Fetch alerts
  const fetchAlerts = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/monitoring/alerts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
        setAlertSummary(data.summary || { critical: 0, warning: 0, info: 0 });
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (isLoadingAuth) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [isLoadingAuth]);

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full" />
          <p className="text-theme-muted text-sm">Chargement du monitoring...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-theme-main flex items-center gap-2">
            🔍 Monitoring
            <span className="text-xs font-medium px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20 animate-pulse">
              ● LIVE
            </span>
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            Vue en temps réel de l&apos;état du système, utilisateurs etactivité
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="px-4 py-2 bg-theme-secondary text-theme-secondary rounded-xl border border-theme hover:bg-primary/10 hover:text-primary transition-all text-sm font-medium"
          >
            🔄 Tout actualiser
          </button>
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {/* Critical alerts */}
          {alerts
            .filter((a) => a.type === "critical")
            .map((alert) => (
              <div
                key={alert.id}
                className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl"
              >
                <span className="text-xl">{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {alert.title}
                  </p>
                  <p className="text-xs text-red-500/80 dark:text-red-400/80">
                    {alert.message}
                  </p>
                </div>
              </div>
            ))}

          {/* Warning alerts */}
          {alerts
            .filter((a) => a.type === "warning")
            .map((alert) => (
              <div
                key={alert.id}
                className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl"
              >
                <span className="text-xl">{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {alert.title}
                  </p>
                  <p className="text-xs text-amber-500/80 dark:text-amber-400/80">
                    {alert.message}
                  </p>
                </div>
              </div>
            ))}

          {/* Info alerts (collapsed into a summary) */}
          {alerts.filter((a) => a.type === "info").length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-3 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl cursor-pointer hover:bg-blue-500/15 transition-colors">
                <span className="text-lg">ℹ️</span>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {alerts.filter((a) => a.type === "info").length} information(s)
                </span>
                <span className="text-xs text-blue-400 ml-auto group-open:rotate-180 transition-transform">
                  ▾
                </span>
              </summary>
              <div className="mt-2 space-y-2 pl-4">
                {alerts
                  .filter((a) => a.type === "info")
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center gap-3 px-3 py-2 bg-blue-500/5 border border-blue-500/10 rounded-lg"
                    >
                      <span className="text-sm">{alert.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {alert.title}
                        </p>
                        <p className="text-[11px] text-blue-500/70 dark:text-blue-400/70">
                          {alert.message}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Section A: System Health */}
      <SystemHealth key={`health-${refreshKey}`} />

      {/* Section B: Live Activity Feed */}
      <div>
        <h2 className="text-sm font-semibold text-theme-main mb-3 flex items-center gap-2">
          ⚡ Activité en temps réel
        </h2>
        <LiveActivityFeed key={`activity-${refreshKey}`} />
      </div>

      {/* Section C: Trend Charts */}
      <div>
        <h2 className="text-sm font-semibold text-theme-main mb-3 flex items-center gap-2">
          📊 Tendances
        </h2>
        <TrendCharts key={`trends-${refreshKey}`} />
      </div>
    </div>
  );
}
