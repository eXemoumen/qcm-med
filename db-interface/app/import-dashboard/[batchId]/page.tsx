'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { ImportBatch, StagingQuestion } from '@/types/bulk-import';
import { supabase } from '@/lib/supabase';
import { validateFullQuestion } from '@/lib/import/validate-import';
import {
  ArrowLeft, RefreshCw, Check, X, Undo2, Play,
  AlertTriangle, CheckCircle2, XCircle, Edit2, Plus, Trash2,
} from 'lucide-react';

type PushResult = {
  total: number;
  saved: number;
  failed: number;
  results: { stagingId: string; status: string; error?: string }[];
};

export default function BatchReviewPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [questions, setQuestions] = useState<StagingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editingQuestion, setEditingQuestion] = useState<StagingQuestion | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch(`/api/import/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur de chargement');

      setBatch(result.data.batch);
      setQuestions(result.data.questions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [batchId]);

  const handleReview = async (questionIds: string[], action: 'approve' | 'reject') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/import/batches/${batchId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ questionIds, action }),
      });

      if (!response.ok) {
        const result = await response.json();
        alert(result.error || 'Erreur');
        return;
      }

      // Update local state
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      setQuestions((prev) =>
        prev.map((q) =>
          questionIds.includes(q.id) ? { ...q, status: newStatus as any } : q
        )
      );

      // Update batch counts
      if (batch) {
        const updated = { ...batch };
        if (action === 'approve') {
          updated.approved_count += questionIds.length;
        } else {
          updated.rejected_count += questionIds.length;
        }
        setBatch(updated);
      }

      setSelectedIds(new Set());
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch(`/api/import/batches/${batchId}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors de la poussée');

      setPushResult(result.data);

      // Update batch status
      if (batch) {
        setBatch({ ...batch, status: result.data.failed === 0 ? 'completed' : 'partial' });
      }

      // Refresh questions to get updated statuses
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPushing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllValid = () => {
    const validIds = questions
      .filter((q) => q.status === 'valid' || q.status === 'warning')
      .map((q) => q.id);
    setSelectedIds(new Set(validIds));
  };

  // ── Edit modal handlers ──
  const openEdit = (q: StagingQuestion) => {
    setEditingQuestion(q);
    const answers = Array.isArray(q.answers) ? q.answers : [];
    setEditData({
      year: q.year || '',
      module_name: q.module_name || '',
      sub_discipline: q.sub_discipline || '',
      exam_type: q.exam_type || '',
      exam_year: q.exam_year || 0,
      number: q.number || 0,
      question_text: q.question_text || '',
      speciality: q.speciality || '',
      cours: q.cours || [],
      faculty_source: q.faculty_source || '',
      explanation: q.explanation || '',
      answers: answers.map((a: any) => ({ ...a })),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingQuestion || !editData) return;
    setSavingEdit(true);

    try {
      // Re-validate the edited question
      const { errors, warnings } = validateFullQuestion(editData);
      const newStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

      // Save to the staging table via API
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch(`/api/import/batches/${batchId}/questions/${editingQuestion.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...editData,
          status: newStatus,
          errors,
          warnings,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erreur lors de la sauvegarde');
      }

      // Update local state
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id
            ? {
                ...q,
                ...editData,
                status: newStatus as any,
                errors,
                warnings,
              }
            : q
        )
      );

      setEditingQuestion(null);
      setEditData(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Computed ──
  const approvedCount = questions.filter((q) => q.status === 'approved').length;
  const validCount = questions.filter((q) => q.status === 'valid').length;
  const warningCount = questions.filter((q) => q.status === 'warning').length;
  const errorCount = questions.filter((q) => q.status === 'error').length;
  const rejectedCount = questions.filter((q) => q.status === 'rejected').length;
  const savedCount = questions.filter((q) => q.status === 'saved').length;

  const filteredQuestions = statusFilter === 'all'
    ? questions
    : questions.filter((q) => q.status === statusFilter);

  const statusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Approuvé';
      case 'rejected': return 'Rejeté';
      case 'error': return 'Erreur';
      case 'warning': return 'Avertissement';
      case 'valid': return 'Valide';
      case 'saved': return 'Sauvegardé';
      default: return 'En attente';
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'rejected': return <XCircle className="w-3.5 h-3.5" />;
      case 'error': return <XCircle className="w-3.5 h-3.5" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'valid': return <Check className="w-3.5 h-3.5" />;
      case 'saved': return <CheckCircle2 className="w-3.5 h-3.5" />;
      default: return <RefreshCw className="w-3.5 h-3.5" />;
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-600 text-white';
      case 'valid': return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
      case 'warning': return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
      case 'error': return 'bg-red-500/10 text-red-600 border border-red-500/20';
      case 'rejected': return 'bg-red-600 text-white';
      case 'saved': return 'bg-blue-600 text-white';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-500';
    }
  };

  const cardBorderClass = (status: string) => {
    switch (status) {
      case 'approved': return 'border-green-200 dark:border-green-500/20 hover:shadow-green-500/5';
      case 'valid': return 'border-emerald-200 dark:border-emerald-500/10 hover:shadow-emerald-500/5';
      case 'warning': return 'border-amber-200 dark:border-amber-500/10 hover:shadow-amber-500/5';
      case 'error': return 'border-red-200 dark:border-red-500/10 hover:shadow-red-500/5';
      case 'rejected': return 'border-red-300 dark:border-red-500/20 opacity-60';
      case 'saved': return 'border-blue-200 dark:border-blue-500/20 hover:shadow-blue-500/5';
      default: return 'border-slate-100 dark:border-white/5 hover:shadow-primary-500/5';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 animate-spin text-primary" />
          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            Chargement du batch...
          </p>
        </div>
      </div>
    );
  }

  if (error && !batch) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">❌ {error}</p>
          <Link href="/import-dashboard" className="text-primary hover:underline">
            ← Retour au dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/import-dashboard"
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors mb-3 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Retour au dashboard
          </Link>
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <span className="text-3xl">📦</span>
                {batch?.file_name}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {batch?.total_rows} questions • Importé le {batch && new Date(batch.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handlePush}
                disabled={pushing || approvedCount === 0}
                className="px-6 py-2.5 bg-primary text-white rounded-2xl text-sm font-bold hover:bg-primary-600 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 active:scale-[0.98]"
              >
                <Play className="w-4 h-4" />
                {pushing ? 'Poussée en cours...' : `Pousser ${approvedCount} question${approvedCount > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>

        {/* Push Result */}
        {pushResult && (
          <div className={`rounded-3xl p-5 mb-6 border ${
            pushResult.failed === 0
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          }`}>
            <p className="font-bold text-sm">
              ✅ {pushResult.saved} sauvegardée{pushResult.saved > 1 ? 's' : ''}
              {pushResult.failed > 0 && <> • ❌ {pushResult.failed} échouée{pushResult.failed > 1 ? 's' : ''}</>}
            </p>
            {pushResult.results.filter((r) => r.status === 'error').length > 0 && (
              <div className="mt-2 space-y-1">
                {pushResult.results
                  .filter((r) => r.status === 'error')
                  .map((r, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">• {r.error}</p>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Bar */}
        <div className="bg-white dark:bg-slate-900/80 rounded-3xl border border-slate-200 dark:border-white/5 p-5 mb-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {[
              { label: 'Total', count: questions.length, color: 'text-slate-900 dark:text-white', bg: '' },
              { label: 'Valides', count: validCount, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Avert.', count: warningCount, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
              { label: 'Erreurs', count: errorCount, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
              { label: 'Approuvées', count: approvedCount, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
              { label: 'Rejetées', count: rejectedCount, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/10' },
              ...(savedCount > 0 ? [{ label: 'Sauvées', count: savedCount, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' }] : []),
            ].map((stat) => (
              <button
                key={stat.label}
                onClick={() => {
                  if (stat.label === 'Total') setStatusFilter('all');
                  else if (stat.label === 'Valides') setStatusFilter('valid');
                  else if (stat.label === 'Avert.') setStatusFilter('warning');
                  else if (stat.label === 'Erreurs') setStatusFilter('error');
                  else if (stat.label === 'Approuvées') setStatusFilter('approved');
                  else if (stat.label === 'Rejetées') setStatusFilter('rejected');
                  else if (stat.label === 'Sauvées') setStatusFilter('saved');
                }}
                className={`px-3 py-2 rounded-xl text-sm font-bold transition-all ${stat.bg || 'bg-slate-50 dark:bg-slate-800'} ${stat.color} ${
                  (statusFilter === 'all' && stat.label === 'Total') ||
                  (statusFilter === 'valid' && stat.label === 'Valides') ||
                  (statusFilter === 'warning' && stat.label === 'Avert.') ||
                  (statusFilter === 'error' && stat.label === 'Erreurs') ||
                  (statusFilter === 'approved' && stat.label === 'Approuvées') ||
                  (statusFilter === 'rejected' && stat.label === 'Rejetées') ||
                  (statusFilter === 'saved' && stat.label === 'Sauvées')
                    ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-950'
                    : 'hover:ring-1 hover:ring-slate-300 dark:hover:ring-white/10'
                }`}
              >
                {stat.count} {stat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={selectAllValid}
            className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all"
          >
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Sélectionner les valides + avert.</span>
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => handleReview(Array.from(selectedIds), 'approve')}
                className="px-4 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-all shadow-lg shadow-green-500/20 active:scale-[0.98]"
              >
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Approuver ({selectedIds.size})</span>
              </button>
              <button
                onClick={() => handleReview(Array.from(selectedIds), 'reject')}
                className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 active:scale-[0.98]"
              >
                <span className="flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Rejeter ({selectedIds.size})</span>
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-2 text-slate-500 text-xs font-bold hover:text-slate-700 dark:hover:text-slate-300 transition-all"
              >
                Désélectionner tout
              </button>
            </>
          )}
        </div>

        {/* Question Cards (catalog-style) */}
        <div className="space-y-6">
          {filteredQuestions.map((q) => {
            const answers = Array.isArray(q.answers) ? q.answers : [];
            const isSelected = selectedIds.has(q.id);

            return (
              <div
                key={q.id}
                className={`group bg-white dark:bg-slate-950/40 border rounded-3xl p-6 transition-all hover:shadow-xl ${cardBorderClass(q.status)} ${
                  isSelected ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-950' : ''
                }`}
              >
                {/* Card Header — badges + actions */}
                <div className="flex justify-between items-start mb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(q.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-primary focus:ring-primary mr-1"
                    />

                    {/* Status badge */}
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${statusBadgeClass(q.status)}`}>
                      {statusIcon(q.status)}
                      {statusLabel(q.status)}
                    </span>

                    {/* Question number */}
                    <span className="px-3 py-1 bg-primary-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest shadow-lg shadow-primary-500/20">
                      Q{q.number}
                    </span>

                    {/* Row index */}
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-[10px] font-bold rounded-lg">
                      Ligne {q.row_index + 1}
                    </span>

                    {/* Year */}
                    {q.year && (
                      <span className="px-3 py-1 bg-primary-500/10 text-primary-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-primary-500/20">
                        {q.year}A
                      </span>
                    )}

                    {/* Module */}
                    {q.module_name && (
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black rounded-lg uppercase tracking-widest max-w-[180px] truncate" title={q.module_name}>
                        {q.module_name}
                      </span>
                    )}

                    {/* Sub-discipline */}
                    {q.sub_discipline && (
                      <span className="px-3 py-1 bg-purple-500/10 text-purple-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-purple-500/20">
                        {q.sub_discipline}
                      </span>
                    )}

                    {/* Exam type */}
                    {q.exam_type && (
                      <span className="px-3 py-1 bg-indigo-500/10 text-indigo-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-indigo-500/20">
                        {q.exam_type}
                      </span>
                    )}

                    {/* Exam year (promo) */}
                    {q.exam_year && (
                      <span className="px-3 py-1 bg-blue-500/10 text-blue-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-blue-500/20">
                        M{q.exam_year > 2000 ? q.exam_year - 2000 : q.exam_year}
                      </span>
                    )}

                    {/* Answer count warning */}
                    {answers.length > 0 && answers.length < 5 && (
                      <span className="px-3 py-1 bg-amber-500/10 text-amber-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-amber-500/20">
                        {answers.length}/5 rép.
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                    {/* Edit button */}
                    <button
                      onClick={() => openEdit(q)}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-all"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Approve / Reject / Undo */}
                    {q.status !== 'approved' && q.status !== 'rejected' && q.status !== 'saved' && (
                      <>
                        <button
                          onClick={() => handleReview([q.id], 'reject')}
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                          title="Rejeter"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {(q.status === 'valid' || q.status === 'warning') && (
                          <button
                            onClick={() => handleReview([q.id], 'approve')}
                            className="w-8 h-8 flex items-center justify-center text-green-600 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 rounded-xl transition-all"
                            title="Approuver"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                    {(q.status === 'approved' || q.status === 'rejected') && (
                      <button
                        onClick={() => handleReview([q.id], q.status === 'approved' ? 'reject' : 'approve')}
                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                        title="Annuler"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Question Text */}
                <div className="space-y-5">
                  <p className="text-slate-900 dark:text-slate-100 font-bold leading-relaxed whitespace-pre-wrap">
                    {q.question_text || <span className="text-red-400 italic">Texte de la question manquant</span>}
                  </p>

                  {/* Answers Grid (catalog-style) */}
                  <div className="grid grid-cols-1 gap-3">
                    {answers.map((a: any, i: number) => (
                      <div
                        key={a.option_label || i}
                        className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                          a.is_correct
                            ? 'bg-green-50/50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 shadow-sm'
                            : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-white/5'
                        }`}
                      >
                        <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black shrink-0 ${
                          a.is_correct
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {(a.option_label || '?').toUpperCase()}
                        </span>
                        <span className={`text-sm py-1.5 flex-1 ${
                          a.is_correct ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                          {a.answer_text || <span className="text-red-400 italic">Texte manquant</span>}
                        </span>
                        {a.is_correct && (
                          <span className="text-green-600 dark:text-green-400 text-[10px] font-black uppercase tracking-widest mt-2">
                            ✓ Correct
                          </span>
                        )}
                      </div>
                    ))}
                    {answers.length === 0 && (
                      <div className="text-red-400 text-sm italic p-4 rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5">
                        Aucune réponse trouvée
                      </div>
                    )}
                  </div>

                  {/* Cours */}
                  {q.cours && q.cours.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cours:</span>
                      <div className="flex flex-wrap gap-2">
                        {q.cours.map((c: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded-md">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Explication:</span>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{q.explanation}</p>
                    </div>
                  )}

                  {/* Errors & Warnings */}
                  {((q.errors && q.errors.length > 0) || (q.warnings && q.warnings.length > 0)) && (
                    <div className="pt-4 border-t border-slate-100 dark:border-white/5 space-y-2">
                      {(q.errors || []).map((err: string, i: number) => (
                        <div key={`e${i}`} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{err}</span>
                        </div>
                      ))}
                      {(q.warnings || []).map((warn: string, i: number) => (
                        <div key={`w${i}`} className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{warn}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-950 rounded-2xl flex items-center justify-center text-3xl mb-4 grayscale opacity-50">
                📂
              </div>
              <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Aucune question avec ce filtre
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════ Edit Modal ═══════════════════════ */}
      {editingQuestion && editData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-3xl my-8 flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="p-6 md:p-8 border-b border-slate-100 dark:border-white/5 flex-shrink-0">
              <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <Edit2 className="w-6 h-6 text-primary" />
                Modifier la question — Ligne {editingQuestion.row_index + 1}
              </h3>

              {/* Show current errors at the top of the modal */}
              {(editingQuestion.errors?.length > 0 || editingQuestion.warnings?.length > 0) && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl">
                  <p className="text-sm font-bold text-red-800 dark:text-red-300 mb-2">À corriger :</p>
                  {(editingQuestion.errors || []).map((err: string, i: number) => (
                    <p key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 mb-1">
                      <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {err}
                    </p>
                  ))}
                  {(editingQuestion.warnings || []).map((warn: string, i: number) => (
                    <p key={i} className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {warn}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6">
              {/* Metadata fields */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Année
                  </label>
                  <select
                    value={editData.year}
                    onChange={(e) => setEditData({ ...editData, year: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  >
                    <option value="">Sélectionner</option>
                    <option value="1">1ère Année</option>
                    <option value="2">2ème Année</option>
                    <option value="3">3ème Année</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Module
                  </label>
                  <input
                    type="text"
                    value={editData.module_name}
                    onChange={(e) => setEditData({ ...editData, module_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Type d&apos;examen
                  </label>
                  <select
                    value={editData.exam_type}
                    onChange={(e) => setEditData({ ...editData, exam_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  >
                    <option value="">Sélectionner</option>
                    <option value="EMD">EMD</option>
                    <option value="EMD1">EMD1</option>
                    <option value="EMD2">EMD2</option>
                    <option value="Rattrapage">Rattrapage</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Promo
                  </label>
                  <input
                    type="number"
                    value={editData.exam_year || ''}
                    onChange={(e) => setEditData({ ...editData, exam_year: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Numéro
                  </label>
                  <input
                    type="number"
                    value={editData.number || ''}
                    onChange={(e) => setEditData({ ...editData, number: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Sous-discipline
                  </label>
                  <input
                    type="text"
                    value={editData.sub_discipline || ''}
                    onChange={(e) => setEditData({ ...editData, sub_discipline: e.target.value || '' })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  />
                </div>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Question
                </label>
                <textarea
                  value={editData.question_text}
                  onChange={(e) => setEditData({ ...editData, question_text: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm resize-none"
                />
              </div>

              {/* Answers */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Réponses ({editData.answers?.length || 0}/5)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (editData.answers.length >= 5) return;
                      const nextLabels = ['A', 'B', 'C', 'D', 'E'];
                      const used = editData.answers.map((a: any) => a.option_label);
                      const nextAvailable = nextLabels.find((l) => !used.includes(l)) || 'A';
                      setEditData({
                        ...editData,
                        answers: [
                          ...editData.answers,
                          { option_label: nextAvailable, answer_text: '', is_correct: false, display_order: editData.answers.length + 1 },
                        ],
                      });
                    }}
                    disabled={editData.answers?.length >= 5}
                    className="text-xs font-bold text-primary hover:text-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 bg-primary/10 px-2.5 py-1.5 rounded-lg"
                  >
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>

                {editData.answers?.map((answer: any, i: number) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-center gap-2 w-full">
                      {/* Correct Toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          const newAnswers = [...editData.answers];
                          newAnswers[i] = { ...newAnswers[i], is_correct: !newAnswers[i].is_correct };
                          setEditData({ ...editData, answers: newAnswers });
                        }}
                        className={`flex-shrink-0 w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          answer.is_correct
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                        title={answer.is_correct ? 'Marquer comme incorrecte' : 'Marquer comme correcte'}
                      >
                        <Check className={`w-4 h-4 mx-auto ${answer.is_correct ? 'opacity-100' : 'opacity-0'}`} />
                      </button>

                      {/* Label Select */}
                      <select
                        value={answer.option_label}
                        onChange={(e) => {
                          const newAnswers = [...editData.answers];
                          newAnswers[i] = { ...newAnswers[i], option_label: e.target.value };
                          setEditData({ ...editData, answers: newAnswers });
                        }}
                        className="w-16 flex-shrink-0 px-2 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-white text-sm font-bold text-center appearance-none"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                      </select>

                      {/* Answer Text */}
                      <input
                        type="text"
                        value={answer.answer_text}
                        onChange={(e) => {
                          const newAnswers = [...editData.answers];
                          newAnswers[i] = { ...newAnswers[i], answer_text: e.target.value };
                          setEditData({ ...editData, answers: newAnswers });
                        }}
                        placeholder="Texte de la réponse..."
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-white text-sm"
                      />

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const newAnswers = [...editData.answers];
                          newAnswers.splice(i, 1);
                          newAnswers.forEach((a: any, idx: number) => (a.display_order = idx + 1));
                          setEditData({ ...editData, answers: newAnswers });
                        }}
                        className="flex-shrink-0 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Supprimer cette réponse"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {(!editData.answers || editData.answers.length === 0) && (
                  <div className="text-center py-4 text-slate-500 dark:text-slate-400 text-sm italic">
                    Aucune réponse. Cliquez sur &quot;Ajouter&quot; pour en créer une.
                  </div>
                )}
              </div>

              {/* Cours + Explanation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Cours (séparés par ;)
                  </label>
                  <input
                    type="text"
                    value={(editData.cours || []).join('; ')}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        cours: e.target.value ? e.target.value.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
                      })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Explication
                  </label>
                  <input
                    type="text"
                    value={editData.explanation || ''}
                    onChange={(e) => setEditData({ ...editData, explanation: e.target.value || '' })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/20 flex-shrink-0 rounded-b-3xl">
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setEditData(null);
                }}
                className="px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-6 py-2.5 bg-primary text-white rounded-2xl text-sm font-bold hover:bg-primary-600 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {savingEdit ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Enregistrer & Revérifier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
