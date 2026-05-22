'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface QuestionReport {
  id: string;
  question_id: string;
  user_id: string;
  report_type: string;
  description: string | null;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  question?: {
    number: number;
    question_text: string;
    module_name: string;
    exam_type: string;
    unity_name: string | null;
    sub_discipline: string | null;
  };
  user?: {
    email: string;
    full_name: string | null;
  };
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  orthographe: "Faute d'orthographe",
  wrong_answer: 'Réponse incorrecte',
  false_explanation: 'Fausse explication',
  other: 'Autre',
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; darkBg: string }> = {
  pending: { label: 'En attente', color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-900/30' },
  reviewing: { label: 'En révision', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100', darkBg: 'dark:bg-blue-900/30' },
  resolved: { label: 'Résolu', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100', darkBg: 'dark:bg-green-900/30' },
  dismissed: { label: 'Rejeté', color: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800' },
};

export default function ReportsPage() {
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<QuestionReport | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('question_reports')
        .select(`
          *,
          question:questions(number, question_text, module_name, exam_type, unity_name, sub_discipline),
          user:users!question_reports_user_id_fkey(email, full_name)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setReports(data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des signalements';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ── Delete Report ──────────────────────────────────────────────────────
  const deleteReport = async (id: string) => {
    if (!confirm('Supprimer ce signalement ? Cette action est irréversible.')) return;
    setDeleting(id);
    try {
      const { error: deleteError } = await supabase
        .from('question_reports')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setReports(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) {
        setSelectedReport(null);
        setAdminNotes('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      setError(message);
    } finally {
      setDeleting(null);
    }
  };

  // ── Derived filter options ─────────────────────────────────────────────
  const availableModules = useMemo(() => {
    const modules = new Set<string>();
    reports.forEach(r => {
      if (r.question?.module_name) modules.add(r.question.module_name);
    });
    return Array.from(modules).sort();
  }, [reports]);

  const availableSubDisciplines = useMemo(() => {
    const subs = new Set<string>();
    reports.forEach(r => {
      // Only show sub-disciplines for the selected module (or all if no module filter)
      if (moduleFilter !== 'all' && r.question?.module_name !== moduleFilter) return;
      if (r.question?.sub_discipline) subs.add(r.question.sub_discipline);
    });
    return Array.from(subs).sort();
  }, [reports, moduleFilter]);

  // Reset unit filter when module changes
  const handleModuleFilterChange = (value: string) => {
    setModuleFilter(value);
    setUnitFilter('all');
  };

  // ── Filtered reports ───────────────────────────────────────────────────
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;
      if (typeFilter !== 'all' && report.report_type !== typeFilter) return false;
      if (moduleFilter !== 'all' && report.question?.module_name !== moduleFilter) return false;
      if (unitFilter !== 'all' && report.question?.sub_discipline !== unitFilter) return false;
      return true;
    });
  }, [reports, statusFilter, typeFilter, moduleFilter, unitFilter]);

  const stats = useMemo(() => ({
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    reviewing: reports.filter(r => r.status === 'reviewing').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    dismissed: reports.filter(r => r.status === 'dismissed').length,
  }), [reports]);

  const updateReportStatus = async (reportId: string, newStatus: string) => {
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { error: updateError } = await supabase
        .from('question_reports')
        .update({
          status: newStatus,
          admin_notes: adminNotes || null,
          reviewed_by: session?.user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (updateError) throw updateError;
      
      await loadReports();
      setSelectedReport(null);
      setAdminNotes('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
      setError(message);
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
            Signalements
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
            Gestion des signalements • FMC APP
          </p>
        </div>
        <button
          onClick={loadReports}
          className="px-5 py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-sm font-bold shadow-sm flex items-center gap-2"
        >
          <span>🔄</span> Actualiser
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-300">❌ {error}</p>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: '📊', color: 'primary' },
          { label: 'En attente', value: stats.pending, icon: '⏳', color: 'yellow' },
          { label: 'En révision', value: stats.reviewing, icon: '👀', color: 'blue' },
          { label: 'Résolus', value: stats.resolved, icon: '✅', color: 'green' },
          { label: 'Rejetés', value: stats.dismissed, icon: '❌', color: 'slate' },
        ].map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-white/5 shadow-sm">
            <p className="text-slate-500 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{item.label}</p>
            <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>{item.icon}</span> {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-white/5 shadow-sm">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="all">Tous</option>
              <option value="pending">En attente</option>
              <option value="reviewing">En révision</option>
              <option value="resolved">Résolus</option>
              <option value="dismissed">Rejetés</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="all">Tous</option>
              {Object.entries(REPORT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Module</label>
            <select
              value={moduleFilter}
              onChange={(e) => handleModuleFilterChange(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="all">Tous les modules</option>
              {availableModules.map((mod) => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
            </select>
          </div>
          {availableSubDisciplines.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sous-discipline</label>
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="all">Toutes les sous-disciplines</option>
                {availableSubDisciplines.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {/* Active filter count */}
        {(statusFilter !== 'all' || typeFilter !== 'all' || moduleFilter !== 'all' || unitFilter !== 'all') && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {filteredReports.length} résultat{filteredReports.length !== 1 ? 's' : ''} sur {reports.length}
            </span>
            <button
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setModuleFilter('all');
                setUnitFilter('all');
              }}
              className="text-xs text-primary-500 hover:text-primary-600 font-semibold"
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-slate-500">Chargement des signalements...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-slate-500">Aucun signalement trouvé</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_LABELS[report.status].bg} ${STATUS_LABELS[report.status].darkBg} ${STATUS_LABELS[report.status].color}`}>
                      {STATUS_LABELS[report.status].label}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {REPORT_TYPE_LABELS[report.report_type] || report.report_type}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(report.created_at)}
                    </span>
                  </div>

                  {/* Question Info */}
                  {report.question && (
                    <div className="mb-3">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold rounded-md">
                          Q{report.question.number}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-md">
                          📚 {report.question.module_name}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-md">
                          {report.question.exam_type}
                        </span>
                        {report.question.sub_discipline && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-md">
                            {report.question.sub_discipline}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                        {report.question.question_text}
                      </p>
                    </div>
                  )}

                  {/* Description */}
                  {report.description && (
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 mb-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{report.description}</p>
                    </div>
                  )}

                  {/* Reporter */}
                  {report.user && (
                    <p className="text-xs text-slate-400">
                      Signalé par: {report.user.full_name || report.user.email}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setSelectedReport(report);
                      setAdminNotes(report.admin_notes || '');
                    }}
                    className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-colors"
                  >
                    Gérer
                  </button>
                  {report.question_id && (
                    <a
                      href={`/questions?edit=${report.question_id}`}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-center"
                    >
                      ✏️ Modifier
                    </a>
                  )}
                  <button
                    onClick={() => deleteReport(report.id)}
                    disabled={deleting === report.id}
                    className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                  >
                    {deleting === report.id ? '⏳' : '🗑️'} Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedReport(null); setAdminNotes(''); } }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Gérer le signalement</h2>
              <button
                onClick={() => {
                  setSelectedReport(null);
                  setAdminNotes('');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            {/* Status Badge */}
            <div className="mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_LABELS[selectedReport.status].bg} ${STATUS_LABELS[selectedReport.status].darkBg} ${STATUS_LABELS[selectedReport.status].color}`}>
                {STATUS_LABELS[selectedReport.status].label}
              </span>
            </div>

            {/* Report Info */}
            <div className="space-y-4 mb-6">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Type</p>
                <p className="text-slate-700 dark:text-slate-300">{REPORT_TYPE_LABELS[selectedReport.report_type] || selectedReport.report_type}</p>
              </div>
              
              {selectedReport.description && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-slate-700 dark:text-slate-300">{selectedReport.description}</p>
                </div>
              )}

              {selectedReport.question && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Question</p>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold rounded-lg">
                      Q{selectedReport.question.number}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg">
                      📚 {selectedReport.question.module_name}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg">
                      {selectedReport.question.exam_type}
                    </span>
                    {selectedReport.question.sub_discipline && (
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-lg">
                        {selectedReport.question.sub_discipline}
                      </span>
                    )}
                    {selectedReport.question.unity_name && (
                      <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded-lg">
                        {selectedReport.question.unity_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedReport.question.question_text.length > 300
                      ? selectedReport.question.question_text.substring(0, 300) + '...'
                      : selectedReport.question.question_text}
                  </p>
                </div>
              )}

              {/* Reporter Info */}
              {selectedReport.user && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Signalé par</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {selectedReport.user.full_name || 'Anonyme'}
                    {selectedReport.user.email && (
                      <span className="text-slate-400 dark:text-slate-500 ml-1">({selectedReport.user.email})</span>
                    )}
                  </p>
                </div>
              )}

              {/* Date */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date</p>
                <p className="text-slate-700 dark:text-slate-300">{formatDate(selectedReport.created_at)}</p>
              </div>
            </div>

            {/* Admin Notes */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Notes admin (optionnel)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Ajouter des notes internes..."
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white resize-none"
                rows={3}
              />
            </div>

            {/* Status Actions */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Changer le statut</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateReportStatus(selectedReport.id, 'reviewing')}
                  disabled={updating || selectedReport.status === 'reviewing'}
                  className="px-4 py-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-xl font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                >
                  👀 En révision
                </button>
                <button
                  onClick={() => updateReportStatus(selectedReport.id, 'resolved')}
                  disabled={updating}
                  className="px-4 py-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl font-semibold hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                >
                  ✅ Résolu
                </button>
                <button
                  onClick={() => updateReportStatus(selectedReport.id, 'dismissed')}
                  disabled={updating}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  ❌ Rejeter
                </button>
                <button
                  onClick={() => updateReportStatus(selectedReport.id, 'pending')}
                  disabled={updating || selectedReport.status === 'pending'}
                  className="px-4 py-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-xl font-semibold hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors disabled:opacity-50"
                >
                  ⏳ En attente
                </button>
              </div>
            </div>

            {/* Delete from Modal */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
              <button
                onClick={() => deleteReport(selectedReport.id)}
                disabled={deleting === selectedReport.id}
                className="w-full px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting === selectedReport.id ? (
                  <><span className="animate-spin">⏳</span> Suppression...</>
                ) : (
                  <><span>🗑️</span> Supprimer ce signalement</>
                )}
              </button>
            </div>

            {updating && (
              <div className="mt-4 text-center text-slate-500">
                <span className="animate-spin inline-block">⏳</span> Mise à jour...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
