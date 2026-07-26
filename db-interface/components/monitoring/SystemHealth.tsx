"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface HealthData {
  status: "ok" | "degraded" | "error";
  database: { connected: boolean; responseTimeMs: number };
  activeSessions: number;
  onlineUsers: number;
  maintenanceMode: boolean;
  tableStats: { users: number; questions: number; app_logs: number };
}

interface KpiCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

function KpiCard({ icon, label, value, sub, accent }: KpiCardProps) {
  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-xl bg-theme-card border border-theme transition-all ${
        accent || ""
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-theme-muted uppercase tracking-wider font-medium truncate">
          {label}
        </div>
        <div className="text-lg font-bold text-theme-main truncate">{value}</div>
        {sub && (
          <div className="text-[11px] text-theme-muted truncate">{sub}</div>
        )}
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/monitoring/health", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setHealth(data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch health:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (isLoading && !health) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-theme-card border border-theme animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!health) return null;

  const statusConfig = {
    ok: {
      icon: "🟢",
      label: "Système OK",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    degraded: {
      icon: "🟡",
      label: "Dégradé",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    error: {
      icon: "🔴",
      label: "Erreur",
      bg: "bg-red-500/10 border-red-500/20",
    },
  };

  const statusInfo = statusConfig[health.status];
  const dbTime = health.database.responseTimeMs;

  return (
    <div className="space-y-3">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={statusInfo.icon}
          label="État du Système"
          value={statusInfo.label}
          sub={lastUpdated ? `Mis à jour ${lastUpdated.toLocaleTimeString("fr-FR")}` : ""}
          accent={statusInfo.bg}
        />
        <KpiCard
          icon="⚡"
          label="Temps Réponse DB"
          value={`${dbTime}ms`}
          sub={dbTime < 500 ? "Excellent" : dbTime < 1500 ? "Acceptable" : "Lent"}
          accent={
            dbTime < 500
              ? "bg-emerald-500/10 border-emerald-500/20"
              : dbTime < 1500
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-red-500/10 border-red-500/20"
          }
        />
        <KpiCard
          icon="👥"
          label="Utilisateurs En Ligne"
          value={health.onlineUsers}
          sub={`${health.activeSessions} session(s) active(s)`}
          accent="bg-blue-500/10 border-blue-500/20"
        />
        <KpiCard
          icon={health.maintenanceMode ? "🔧" : "✅"}
          label="Maintenance"
          value={health.maintenanceMode ? "Actif" : "Inactif"}
          sub={health.maintenanceMode ? "App indisponible" : "App opérationnelle"}
          accent={
            health.maintenanceMode
              ? "bg-amber-500/10 border-amber-500/20"
              : "bg-emerald-500/10 border-emerald-500/20"
          }
        />
      </div>

      {/* Database Overview */}
      <div className="bg-theme-card border border-theme rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-theme-main flex items-center gap-2">
            📊 Vue d&apos;ensemble de la base de données
          </h3>
          <button
            onClick={fetchHealth}
            className="text-xs text-theme-muted hover:text-primary transition-colors"
          >
            🔄 Actualiser
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Utilisateurs",
              value: health.tableStats.users,
              max: Math.max(health.tableStats.users, 1000),
              color: "bg-primary",
            },
            {
              label: "Questions",
              value: health.tableStats.questions,
              max: Math.max(health.tableStats.questions, 1000),
              color: "bg-blue-500",
            },
            {
              label: "Logs",
              value: health.tableStats.app_logs,
              max: Math.max(health.tableStats.app_logs, 1000),
              color: "bg-purple-500",
            },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-theme-muted">{stat.label}</span>
                <span className="text-xs font-bold text-theme-main">
                  {stat.value.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-2 bg-theme-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full ${stat.color} rounded-full transition-all duration-1000`}
                  style={{
                    width: `${Math.min((stat.value / stat.max) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
