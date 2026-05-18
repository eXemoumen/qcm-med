"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface LogEntry {
  id: string;
  level: "info" | "warn" | "error" | "fatal";
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
}

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
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type ActiveTab = "app" | "supabase";

const LEVEL_CONFIG: Record<
  string,
  { icon: string; label: string; color: string; bgClass: string }
> = {
  info: {
    icon: "ℹ️",
    label: "Info",
    color: "text-blue-500",
    bgClass: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400",
  },
  warn: {
    icon: "⚠️",
    label: "Warning",
    color: "text-amber-500",
    bgClass: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400",
  },
  error: {
    icon: "❌",
    label: "Error",
    color: "text-red-500",
    bgClass: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400",
  },
  fatal: {
    icon: "💀",
    label: "Fatal",
    color: "text-red-700",
    bgClass: "bg-red-700/15 border-red-700/30 text-red-800 dark:text-red-300",
  },
};

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("app");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [supabaseLogs, setSupabaseLogs] = useState<SupabaseLogEntry[]>([]);
  const [supabaseService, setSupabaseService] = useState("auth");
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 50, total: 0, totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  // Filters
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Stats
  const [stats, setStats] = useState<Record<string, number>>({
    info: 0, warn: 0, error: 0, fatal: 0,
  });

  const getAuthHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Non authentifié");
    return { Authorization: `Bearer ${session.access_token}` };
  }, []);

  // Fetch app logs
  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const headers = await getAuthHeader();

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (levelFilter) params.set("level", levelFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchQuery) params.set("search", searchQuery);

      const response = await fetch(`/api/logs?${params.toString()}`, { headers });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur lors du chargement des logs");
      }

      const data = await response.json();
      setLogs(data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, levelFilter, sourceFilter, searchQuery, getAuthHeader]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      const response = await fetch("/api/logs/stats", { headers });
      if (response.ok) {
        const data = await response.json();
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // Silent fail
    }
  }, [getAuthHeader]);

  // Fetch Supabase logs
  const fetchSupabaseLogs = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const headers = await getAuthHeader();
      const response = await fetch(`/api/logs/supabase?service=${supabaseService}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setSupabaseLogs(data.data || []);
        if (data.message && data.data?.length === 0) {
          setError(data.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  }, [supabaseService, getAuthHeader]);

  // Generate test logs
  const handleGenerateTestLogs = async () => {
    setIsGenerating(true);
    setGenerateMsg(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch("/api/logs/test", {
        method: "POST",
        headers,
      });
      const data = await response.json();
      if (response.ok) {
        setGenerateMsg(`✅ ${data.message}`);
        // Refresh logs and stats
        setTimeout(() => {
          fetchLogs();
          fetchStats();
        }, 500);
      } else {
        setGenerateMsg(`❌ ${data.error}`);
      }
    } catch {
      setGenerateMsg("❌ Erreur réseau");
    } finally {
      setIsGenerating(false);
      setTimeout(() => setGenerateMsg(null), 4000);
    }
  };

  useEffect(() => {
    if (activeTab === "app") {
      fetchLogs();
      fetchStats();
    } else {
      fetchSupabaseLogs();
    }
  }, [activeTab, fetchLogs, fetchStats, fetchSupabaseLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const fn = activeTab === "app" ? fetchLogs : fetchSupabaseLogs;
    const interval = setInterval(fn, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab, fetchLogs, fetchSupabaseLogs]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts / 1000).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleFilterReset = () => {
    setLevelFilter("");
    setSourceFilter("");
    setSearchQuery("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const uniqueSources = Array.from(new Set(logs.map((l) => l.source))).sort();

  const parseSupabaseMessage = (msg: string): Record<string, unknown> | null => {
    try {
      if (msg.startsWith("{")) return JSON.parse(msg);
    } catch { /* ignore */ }
    return null;
  };

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-theme-main flex items-center gap-2">
            📋 Logs & Monitoring
          </h1>
          <p className="text-theme-muted text-sm mt-1">
            Suivi des erreurs, avertissements et événements du système
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === "app" && (
            <button
              onClick={handleGenerateTestLogs}
              disabled={isGenerating}
              className="px-4 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              {isGenerating ? "⏳ Génération..." : "🧪 Test Logs"}
            </button>
          )}

          <button
            onClick={activeTab === "app" ? fetchLogs : fetchSupabaseLogs}
            disabled={isLoading}
            className="px-4 py-2 bg-theme-secondary text-theme-secondary rounded-xl border border-theme hover:bg-primary/10 hover:text-primary transition-all text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? "⏳" : "🔄"} Actualiser
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              autoRefresh
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-theme-secondary text-theme-muted border-theme"
            }`}
          >
            {autoRefresh ? "⏸️ Auto" : "▶️ Auto"}
          </button>
        </div>
      </div>

      {/* Generate feedback */}
      {generateMsg && (
        <div className="px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm font-medium">
          {generateMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-theme-card rounded-xl border border-theme p-1">
        <button
          onClick={() => { setActiveTab("app"); setError(null); }}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "app"
              ? "bg-primary text-white shadow-md"
              : "text-theme-muted hover:text-theme-main hover:bg-theme-secondary"
          }`}
        >
          🗄️ App Logs
        </button>
        <button
          onClick={() => { setActiveTab("supabase"); setError(null); }}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "supabase"
              ? "bg-primary text-white shadow-md"
              : "text-theme-muted hover:text-theme-main hover:bg-theme-secondary"
          }`}
        >
          ⚡ Supabase Logs
        </button>
      </div>

      {/* ===== APP LOGS TAB ===== */}
      {activeTab === "app" && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["info", "warn", "error", "fatal"] as const).map((level) => {
              const config = LEVEL_CONFIG[level];
              return (
                <button
                  key={level}
                  onClick={() => {
                    setLevelFilter(levelFilter === level ? "" : level);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                    levelFilter === level
                      ? "bg-primary/10 border-primary/30 ring-2 ring-primary/20"
                      : "bg-theme-card border-theme hover:border-primary/20"
                  }`}
                >
                  <span className="text-2xl">{config.icon}</span>
                  <div className="text-left">
                    <div className="text-xs text-theme-muted uppercase tracking-wider font-medium">
                      {config.label}
                    </div>
                    <div className={`text-lg font-bold ${config.color}`}>
                      {stats[level] ?? 0}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 bg-theme-card p-4 rounded-xl border border-theme">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="🔍 Rechercher dans les messages..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="w-full px-4 py-2 bg-theme-main text-theme-main rounded-lg border border-theme text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
              />
            </div>
            <select
              value={levelFilter}
              onChange={(e) => {
                setLevelFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-3 py-2 bg-theme-main text-theme-main rounded-lg border border-theme text-sm focus:ring-2 focus:ring-primary/30 outline-none"
            >
              <option value="">Tous les niveaux</option>
              <option value="info">ℹ️ Info</option>
              <option value="warn">⚠️ Warning</option>
              <option value="error">❌ Error</option>
              <option value="fatal">💀 Fatal</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-3 py-2 bg-theme-main text-theme-main rounded-lg border border-theme text-sm focus:ring-2 focus:ring-primary/30 outline-none"
            >
              <option value="">Toutes les sources</option>
              {uniqueSources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
            {(levelFilter || sourceFilter || searchQuery) && (
              <button
                onClick={handleFilterReset}
                className="px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-all"
              >
                ✕ Reset
              </button>
            )}
          </div>

          {/* Error State */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Logs Table */}
          <div className="bg-theme-card rounded-xl border border-theme overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full" />
                  <p className="text-theme-muted text-sm">Chargement des logs...</p>
                </div>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-theme-muted">
                <span className="text-5xl mb-4">🗂️</span>
                <p className="text-lg font-medium">Aucun log trouvé</p>
                <p className="text-sm mb-4">
                  {levelFilter || sourceFilter || searchQuery
                    ? "Essayez de modifier vos filtres"
                    : "Les logs apparaîtront ici automatiquement"}
                </p>
                <button
                  onClick={handleGenerateTestLogs}
                  disabled={isGenerating}
                  className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-all text-sm disabled:opacity-50"
                >
                  🧪 Générer des logs de test
                </button>
              </div>
            ) : (
              <div className="divide-y divide-theme">
                {logs.map((log) => {
                  const config = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info;
                  const isExpanded = expandedRow === log.id;
                  return (
                    <div key={log.id}>
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-theme-secondary/50 transition-colors"
                      >
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 mt-0.5 ${config.bgClass}`}>
                          {config.icon} {config.label.toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-theme-main font-medium truncate">{log.message}</p>
                          <p className="text-xs text-theme-muted mt-0.5">
                            <span className="font-mono bg-theme-secondary px-1.5 py-0.5 rounded text-[11px]">{log.source}</span>
                            <span className="mx-2">•</span>
                            {formatDate(log.created_at)}
                          </p>
                        </div>
                        <span className={`text-theme-muted transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-theme-secondary/30 border-t border-theme">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div className="text-xs">
                              <span className="text-theme-muted font-medium">ID: </span>
                              <span className="font-mono text-theme-secondary">{log.id}</span>
                            </div>
                            <div className="text-xs">
                              <span className="text-theme-muted font-medium">User ID: </span>
                              <span className="font-mono text-theme-secondary">{log.user_id ?? "—"}</span>
                            </div>
                          </div>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div>
                              <p className="text-xs text-theme-muted font-medium mb-1.5">Metadata:</p>
                              <pre className="bg-theme-main rounded-lg p-3 text-xs text-theme-secondary font-mono overflow-x-auto border border-theme whitespace-pre-wrap break-all">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-theme-muted">
                Page {pagination.page} / {pagination.totalPages} — {pagination.total} logs au total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-theme-card border border-theme text-sm font-medium disabled:opacity-30 hover:bg-theme-secondary transition-colors"
                >
                  ← Précédent
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 rounded-lg bg-theme-card border border-theme text-sm font-medium disabled:opacity-30 hover:bg-theme-secondary transition-colors"
                >
                  Suivant →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== SUPABASE LOGS TAB ===== */}
      {activeTab === "supabase" && (
        <>
          {/* Service Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "auth", label: "🔐 Auth", desc: "Logins, tokens" },
              { key: "api", label: "🌐 API", desc: "REST requests" },
              { key: "realtime", label: "📡 Realtime", desc: "WebSockets" },
            ].map((svc) => (
              <button
                key={svc.key}
                onClick={() => setSupabaseService(svc.key)}
                className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  supabaseService === svc.key
                    ? "bg-primary/10 text-primary border-primary/30 ring-2 ring-primary/20"
                    : "bg-theme-card border-theme text-theme-muted hover:border-primary/20"
                }`}
              >
                {svc.label}
                <span className="text-[10px] ml-1 opacity-60">{svc.desc}</span>
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Supabase Logs List */}
          <div className="bg-theme-card rounded-xl border border-theme overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full" />
                  <p className="text-theme-muted text-sm">Chargement des logs Supabase...</p>
                </div>
              </div>
            ) : supabaseLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-theme-muted">
                <span className="text-5xl mb-4">⚡</span>
                <p className="text-lg font-medium">Aucun log Supabase</p>
                <p className="text-sm">Vérifiez que SUPABASE_ACCESS_TOKEN est configuré dans .env.local</p>
              </div>
            ) : (
              <div className="divide-y divide-theme">
                {supabaseLogs.map((log) => {
                  const isExpanded = expandedRow === log.id;
                  const parsed = parseSupabaseMessage(log.event_message);
                  const statusCode = log.status_code ?? (parsed?.status as number);
                  const method = log.method ?? (parsed?.method as string);
                  const isError = statusCode && statusCode >= 400;
                  const path = log.path ?? (parsed?.path as string);

                  // Determine display
                  const displayMsg = parsed?.msg as string || log.msg || log.event_message?.slice(0, 120) || "—";

                  return (
                    <div key={log.id}>
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-theme-secondary/50 transition-colors"
                      >
                        {/* Status badge */}
                        {statusCode ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold border shrink-0 mt-0.5 ${
                            isError
                              ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {method && <span className="opacity-70">{method}</span>}
                            {statusCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold border shrink-0 mt-0.5 bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400">
                            EVENT
                          </span>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-theme-main font-medium truncate">{displayMsg}</p>
                          <p className="text-xs text-theme-muted mt-0.5">
                            {path && (
                              <span className="font-mono bg-theme-secondary px-1.5 py-0.5 rounded text-[11px]">{path}</span>
                            )}
                            <span className="mx-2">•</span>
                            {formatTimestamp(log.timestamp)}
                          </p>
                        </div>
                        <span className={`text-theme-muted transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                      </button>
                      {isExpanded && parsed && (
                        <div className="px-4 pb-4 pt-1 bg-theme-secondary/30 border-t border-theme">
                          <p className="text-xs text-theme-muted font-medium mb-1.5">Détails:</p>
                          <pre className="bg-theme-main rounded-lg p-3 text-xs text-theme-secondary font-mono overflow-x-auto border border-theme whitespace-pre-wrap break-all">
                            {JSON.stringify(parsed, null, 2)}
                          </pre>
                        </div>
                      )}
                      {isExpanded && !parsed && (
                        <div className="px-4 pb-4 pt-1 bg-theme-secondary/30 border-t border-theme">
                          <p className="text-xs text-theme-muted font-medium mb-1.5">Message brut:</p>
                          <pre className="bg-theme-main rounded-lg p-3 text-xs text-theme-secondary font-mono overflow-x-auto border border-theme whitespace-pre-wrap break-all">
                            {log.event_message}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-theme-muted text-center">
            Affichage des 100 derniers logs de la dernière heure — Service: {supabaseService}
          </p>
        </>
      )}
    </div>
  );
}
