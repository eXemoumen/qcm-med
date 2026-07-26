"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  faculty: string;
  region: string;
  deviceName: string;
  deviceId: string;
  lastActiveAt: string;
}

interface RecentTest {
  id: string;
  userName: string;
  faculty: string;
  moduleName: string;
  examType: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeSpent: number;
  completedAt: string;
}

interface RecentPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  userEmail: string;
  createdAt: string;
}

interface ActivityData {
  activeSessions: ActiveSession[];
  activeCount: number;
  recentTests: RecentTest[];
  recentPayments: RecentPayment[];
  todaySignups: number;
  dailyPaymentTotal: number;
}

interface LogEntry {
  id: string;
  level: "info" | "warn" | "error" | "fatal";
  source: string;
  message: string;
  created_at: string;
}

const LEVEL_BADGE: Record<string, { icon: string; bg: string }> = {
  error: { icon: "❌", bg: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400" },
  fatal: { icon: "💀", bg: "bg-red-700/15 border-red-700/30 text-red-700 dark:text-red-300" },
  warn: { icon: "⚠️", bg: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}

export default function LiveActivityFeed() {
  const [activeTab, setActiveTab] = useState<"errors" | "users" | "payments">("errors");
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [liveErrors, setLiveErrors] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/monitoring/activity", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setActivity(data);
      }
    } catch (err) {
      console.error("Failed to fetch activity:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch recent errors for the error feed
  const fetchRecentErrors = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/monitoring/errors", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setLiveErrors(data.recentErrors || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    fetchRecentErrors();

    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      fetchActivity();
      fetchRecentErrors();
    }, 15_000);

    return () => clearInterval(interval);
  }, [fetchActivity, fetchRecentErrors]);

  // Realtime: listen for new errors in app_logs
  useEffect(() => {
    const channel = supabase
      .channel("monitoring-live-errors")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_logs",
          filter: "level=in.(error,fatal)",
        },
        (payload) => {
          const newLog = payload.new as LogEntry;
          setLiveErrors((prev) => [newLog, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Realtime: listen for device session changes
  useEffect(() => {
    const channel = supabase
      .channel("monitoring-live-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_sessions" },
        () => {
          // Re-fetch activity when sessions change
          fetchActivity();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActivity]);

  const tabs = [
    { key: "errors" as const, label: "🔴 Erreurs Live", count: liveErrors.length },
    { key: "users" as const, label: "👥 Utilisateurs", count: activity?.activeCount ?? 0 },
    { key: "payments" as const, label: "💰 Paiements", count: activity?.recentPayments?.length ?? 0 },
  ];

  return (
    <div className="bg-theme-card border border-theme rounded-xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-theme overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-0 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-theme-muted hover:text-theme-main hover:bg-theme-secondary"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-theme-secondary rounded-full font-bold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {/* Errors Tab */}
        {activeTab === "errors" && (
          <div>
            {liveErrors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-theme-muted">
                <span className="text-4xl mb-2">✅</span>
                <p className="text-sm font-medium">Aucune erreur récente</p>
                <p className="text-xs">Les erreurs apparaîtront ici en temps réel</p>
              </div>
            ) : (
              <div className="divide-y divide-theme">
                {liveErrors.map((log) => {
                  const badge = LEVEL_BADGE[log.level] || LEVEL_BADGE.error;
                  return (
                    <div
                      key={log.id}
                      className="px-4 py-3 flex items-start gap-3 hover:bg-theme-secondary/50 transition-colors"
                    >
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 mt-0.5 ${badge.bg}`}
                      >
                        {badge.icon} {log.level.toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-theme-main font-medium truncate">
                          {log.message}
                        </p>
                        <p className="text-xs text-theme-muted mt-0.5">
                          <span className="font-mono bg-theme-secondary px-1 py-0.5 rounded text-[10px]">
                            {log.source}
                          </span>
                          <span className="mx-1.5">•</span>
                          {timeAgo(log.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div>
            {!activity || isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full" />
              </div>
            ) : activity.activeSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-theme-muted">
                <span className="text-4xl mb-2">😴</span>
                <p className="text-sm font-medium">Aucun utilisateur en ligne</p>
              </div>
            ) : (
              <div className="divide-y divide-theme">
                {activity.activeSessions.map((session) => (
                  <div
                    key={session.id}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-theme-secondary/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {session.userName?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-theme-main font-medium truncate">
                        {session.userName}
                      </p>
                      <p className="text-xs text-theme-muted truncate">
                        {session.faculty && (
                          <span className="font-mono bg-theme-secondary px-1 py-0.5 rounded text-[10px]">
                            {session.faculty}
                          </span>
                        )}
                        <span className="mx-1">•</span>
                        {session.deviceName}
                      </p>
                    </div>
                    <span className="text-[10px] text-theme-muted shrink-0">
                      {timeAgo(session.lastActiveAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div>
            {!activity || isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full" />
              </div>
            ) : (
              <>
                {/* Daily total */}
                <div className="px-4 py-3 bg-emerald-500/5 border-b border-theme flex items-center justify-between">
                  <span className="text-xs text-theme-muted font-medium">
                    Total aujourd&apos;hui
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {activity.dailyPaymentTotal.toLocaleString()} DZD
                  </span>
                </div>
                {activity.recentPayments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-theme-muted">
                    <span className="text-4xl mb-2">💸</span>
                    <p className="text-sm font-medium">Aucun paiement récent</p>
                  </div>
                ) : (
                  <div className="divide-y divide-theme">
                    {activity.recentPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-theme-secondary/50 transition-colors"
                      >
                        <span className="text-lg">💳</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-theme-main font-medium">
                            {payment.amount.toLocaleString()} {payment.currency}
                          </p>
                          <p className="text-xs text-theme-muted truncate">
                            {payment.userEmail || "Client"}
                            {payment.paymentMethod && (
                              <>
                                <span className="mx-1">•</span>
                                {payment.paymentMethod}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              payment.status === "succeeded" || payment.status === "completed" || payment.status === "paid"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : payment.status === "failed"
                                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {payment.status}
                          </span>
                          <p className="text-[10px] text-theme-muted mt-0.5">
                            {timeAgo(payment.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
