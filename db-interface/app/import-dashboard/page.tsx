'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ImportBatch } from '@/types/bulk-import';
import { supabase } from '@/lib/supabase';
import { RefreshCw, Trash2, Eye, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportDashboardPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchBatches = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch(`/api/import/batches?page=${page}&limit=${pagination.limit}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur de chargement');

      // successResponse wraps in { success, data: { data: [...], pagination: {...} } }
      const payload = result.data;
      setBatches(Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []);
      setPagination((prev) => payload?.pagination || { ...prev, total: 0, totalPages: 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBatches(pagination.page); }, [pagination.page]);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (batchId: string) => {
    if (!confirm('Supprimer ce batch et toutes ses données ?')) return;
    if (deletingId) return; // prevent double submission

    setDeletingId(batchId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Non authentifié — reconnectez-vous');
        return;
      }

      const response = await fetch(`/api/import/batches/${batchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || 'Erreur lors de la suppression');
        return;
      }

      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      toast.success('Batch supprimé');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'partial': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'processing': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'pending': return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <span className="text-3xl">📋</span>
              Import Dashboard
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Vue d&apos;ensemble de tous les imports
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => fetchBatches(pagination.page)}
              disabled={loading}
              className="px-4 py-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <Link
              href="/table-importer"
              className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-600 transition-all flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Nouvel import
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-300 text-sm mb-6">
            ❌ {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/5 p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Chargement...</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/5 p-12 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Aucun import</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Les batches d&apos;import apparaîtront ici
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">Fichier</th>
                    <th className="px-5 py-3">Statut</th>
                    <th className="px-5 py-3 text-center">Total</th>
                    <th className="px-5 py-3 text-center">✅ Valide</th>
                    <th className="px-5 py-3 text-center">⚠️ Avertissements</th>
                    <th className="px-5 py-3 text-center">❌ Erreurs</th>
                    <th className="px-5 py-3 text-center">👍 Approuvées</th>
                    <th className="px-5 py-3 text-center">👎 Rejetées</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 dark:text-white">{batch.file_name}</div>
                        <div className="text-xs text-slate-400">{batch.file_type.toUpperCase()}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${statusColor(batch.status)}`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center font-bold text-slate-900 dark:text-white">
                        {batch.total_rows}
                      </td>
                      <td className="px-5 py-4 text-center text-green-600 dark:text-green-400 font-bold">
                        {batch.valid_count}
                      </td>
                      <td className="px-5 py-4 text-center text-amber-600 dark:text-amber-400 font-bold">
                        {batch.warning_count}
                      </td>
                      <td className="px-5 py-4 text-center text-red-600 dark:text-red-400 font-bold">
                        {batch.error_count}
                      </td>
                      <td className="px-5 py-4 text-center text-primary font-bold">
                        {batch.approved_count}
                      </td>
                      <td className="px-5 py-4 text-center text-slate-500 dark:text-slate-400 font-bold">
                        {batch.rejected_count}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(batch.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/import-dashboard/${batch.id}`}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-primary transition-colors"
                            title="Voir le batch"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(batch.id)}
                            disabled={deletingId === batch.id}
                            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors disabled:opacity-40"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="px-5 py-4 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Affichage {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)}
                    sur {pagination.total} batches
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ← Précédent
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPagination(p => ({ ...p, page: pageNum }))}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                              pagination.page === pageNum
                                ? 'bg-primary text-white'
                                : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Suivant →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
