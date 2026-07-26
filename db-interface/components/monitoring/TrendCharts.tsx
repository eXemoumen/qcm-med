"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HourlyBucket {
  hour: string;
  errors: number;
  warnings: number;
  fatals: number;
}

interface TopSource {
  source: string;
  count: number;
}

interface TopMessage {
  message: string;
  source: string;
  level: string;
  count: number;
}

interface ErrorsData {
  totalCount: number;
  hourlyBuckets: HourlyBucket[];
  topSources: TopSource[];
  topMessages: TopMessage[];
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-theme-card border border-theme rounded-lg p-3 shadow-lg">
      <p className="text-xs text-theme-muted mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

const CHART_COLORS = {
  errors: "#ef4444",
  warnings: "#f59e0b",
  fatals: "#991b1b",
  primary: "#09b2ac",
  secondary: "#9941ff",
};

export default function TrendCharts() {
  const [errorsData, setErrorsData] = useState<ErrorsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
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
        setErrorsData(data);
      }
    } catch (err) {
      console.error("Failed to fetch trend data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (isLoading && !errorsData) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-64 rounded-xl bg-theme-card border border-theme animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!errorsData) return null;

  // Format hourly labels for display
  const chartData = errorsData.hourlyBuckets.map((b) => ({
    ...b,
    label: b.hour.slice(11, 13) + "h", // "14h"
  }));

  return (
    <div className="space-y-4">
      {/* Error Rate Chart */}
      <div className="bg-theme-card border border-theme rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-theme-main flex items-center gap-2">
              📈 Taux d&apos;erreurs (24h)
            </h3>
            <p className="text-xs text-theme-muted mt-0.5">
              {errorsData.totalCount} erreur(s)/avertissement(s) au total
            </p>
          </div>
        </div>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-theme-muted"
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-theme-muted"
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="fatals"
                stackId="1"
                stroke={CHART_COLORS.fatals}
                fill={CHART_COLORS.fatals}
                fillOpacity={0.6}
                name="Fatals"
              />
              <Area
                type="monotone"
                dataKey="errors"
                stackId="1"
                stroke={CHART_COLORS.errors}
                fill={CHART_COLORS.errors}
                fillOpacity={0.4}
                name="Erreurs"
              />
              <Area
                type="monotone"
                dataKey="warnings"
                stackId="1"
                stroke={CHART_COLORS.warnings}
                fill={CHART_COLORS.warnings}
                fillOpacity={0.3}
                name="Avertissements"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Sources & Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Error Sources */}
        <div className="bg-theme-card border border-theme rounded-xl p-4">
          <h3 className="text-sm font-semibold text-theme-main mb-3 flex items-center gap-2">
            🎯 Sources d&apos;erreurs (Top 10)
          </h3>
          {errorsData.topSources.length === 0 ? (
            <div className="text-center py-8 text-theme-muted">
              <p className="text-sm">Aucune source d&apos;erreur</p>
            </div>
          ) : (
            <div className="space-y-2">
              {errorsData.topSources.map((source, i) => {
                const maxCount = errorsData.topSources[0]?.count || 1;
                return (
                  <div key={source.source} className="flex items-center gap-2">
                    <span className="text-xs text-theme-muted w-5 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-mono text-theme-main truncate">
                          {source.source}
                        </span>
                        <span className="text-xs font-bold text-theme-secondary shrink-0 ml-2">
                          {source.count}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-theme-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 rounded-full"
                          style={{
                            width: `${(source.count / maxCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Error Messages */}
        <div className="bg-theme-card border border-theme rounded-xl p-4">
          <h3 className="text-sm font-semibold text-theme-main mb-3 flex items-center gap-2">
            💬 Messages d&apos;erreurs (Top 10)
          </h3>
          {errorsData.topMessages.length === 0 ? (
            <div className="text-center py-8 text-theme-muted">
              <p className="text-sm">Aucun message d&apos;erreur</p>
            </div>
          ) : (
            <div className="space-y-2">
              {errorsData.topMessages.slice(0, 10).map((msg, i) => (
                <div
                  key={i}
                  className="p-2 rounded-lg bg-theme-secondary/50 border border-theme"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-theme-main font-medium line-clamp-2 flex-1">
                      {msg.message.slice(0, 120)}
                      {msg.message.length > 120 ? "..." : ""}
                    </p>
                    <span className="text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full shrink-0">
                      ×{msg.count}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-theme-muted bg-theme-card px-1 py-0.5 rounded">
                      {msg.source}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                        msg.level === "fatal"
                          ? "bg-red-700/15 text-red-700 dark:text-red-300"
                          : "bg-red-500/10 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {msg.level.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
