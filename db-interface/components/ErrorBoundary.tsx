"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Error Boundary — catches unhandled React rendering errors
 * and logs them to the app_logs table for diagnostics.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error("Unhandled React rendering error", {
      source: "client/error-boundary",
      metadata: {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      },
    });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="text-6xl">💥</div>
            <div>
              <h2 className="text-xl font-bold text-theme-main mb-2">
                Une erreur est survenue
              </h2>
              <p className="text-theme-muted text-sm">
                L&apos;application a rencontré un problème inattendu. L&apos;erreur a
                été automatiquement enregistrée pour analyse.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-left">
                <p className="text-red-700 dark:text-red-400 text-xs font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg shadow-primary/25"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
