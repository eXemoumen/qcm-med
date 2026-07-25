'use client';

import { useState, useCallback, useRef } from 'react';
import type { CreateQuestionData } from '@/lib/api/questions';
import type { ImportedQuestion, ImportResult, BulkSaveResult } from '@/types/bulk-import';
import { parseExcel } from '@/lib/import/parse-excel';
import { parseJson } from '@/lib/import/parse-json';
import { downloadExcelTemplate, downloadJsonTemplate } from '@/lib/import/template-generator';
import { validateFullQuestion } from '@/lib/import/validate-import';
import { supabase } from '@/lib/supabase';
import { UploadCloud, FileSpreadsheet, FileJson, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Download, RefreshCw, Save, Edit2, Undo2, Check, X, FileOutput, Plus, Trash2 } from 'lucide-react';

type Phase = 'upload' | 'review' | 'saving' | 'results';

export default function TableImporterPage() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [saveResult, setSaveResult] = useState<BulkSaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState<CreateQuestionData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'json'].includes(ext || '')) {
      setParseError('Format non supporté. Utilisez .xlsx, .xls, .csv ou .json');
      return;
    }
    setFile(selectedFile);
    setParseError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const result = ext === 'json' ? await parseJson(file) : await parseExcel(file);
      setImportResult(result);
      setPhase('review');
    } catch (err: any) {
      setParseError(err.message || 'Erreur lors de la lecture du fichier');
    } finally {
      setParsing(false);
    }
  };

  const handleApprove = (index: number) => {
    if (!importResult) return;
    const updated = { ...importResult };
    updated.questions = [...updated.questions];
    updated.questions[index] = { ...updated.questions[index], status: 'approved' };
    setImportResult(updated);
  };

  const handleReject = (index: number) => {
    if (!importResult) return;
    const updated = { ...importResult };
    updated.questions = [...updated.questions];
    updated.questions[index] = { ...updated.questions[index], status: 'rejected' };
    setImportResult(updated);
  };

  const handleApproveAllValid = () => {
    if (!importResult) return;
    const updated = { ...importResult };
    updated.questions = updated.questions.map((q) =>
      q.status === 'valid' || q.status === 'warning' ? { ...q, status: 'approved' as const } : q
    );
    setImportResult(updated);
  };

  const handleRejectAllErrors = () => {
    if (!importResult) return;
    const updated = { ...importResult };
    updated.questions = updated.questions.map((q) =>
      q.status === 'error' ? { ...q, status: 'rejected' as const } : q
    );
    setImportResult(updated);
  };

  const handleEdit = (index: number) => {
    if (!importResult) return;
    setEditingIndex(index);
    // Deep copy to avoid mutating importResult
    const src = importResult.questions[index].data;
    setEditData({
      ...src,
      cours: src.cours ? [...src.cours] : undefined,
      answers: src.answers.map((a) => ({ ...a })),
    });
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !editData || !importResult) return;
    // Revalidate edited question
    const { errors, warnings } = validateFullQuestion(editData);
    const updated = { ...importResult };
    updated.questions = [...updated.questions];
    updated.questions[editingIndex] = {
      ...updated.questions[editingIndex],
      data: editData,
      status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'approved',
      errors,
      warnings,
    };
    setImportResult(updated);
    setEditingIndex(null);
    setEditData(null);
  };

  const handleBulkSave = async () => {
    if (!importResult) return;
    const approved = importResult.questions.filter((q) => q.status === 'approved');
    if (approved.length === 0) return;

    setSaving(true);
    setPhase('saving');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          questions: approved.map((q) => q.data),
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors de la sauvegarde');

      setSaveResult(result.data);
      setPhase('results');
    } catch (err: any) {
      setParseError(err.message || 'Erreur lors de la sauvegarde');
      setPhase('review');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPhase('upload');
    setFile(null);
    setImportResult(null);
    setSaveResult(null);
    setParseError(null);
    setEditingIndex(null);
    setEditData(null);
  };

  const approvedCount = importResult?.questions.filter((q) => q.status === 'approved').length || 0;

  return (
    <div className="min-h-screen bg-neutral-light dark:bg-neutral-dark font-body">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <a
            href="/questions"
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mb-3 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Retour aux Questions
          </a>
          <h1 className="text-3xl font-heading font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary flex items-center gap-3">
            <UploadCloud className="w-8 h-8 text-primary" />
            Table Importer
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Importez des données en masse depuis des fichiers Excel ou JSON
          </p>
        </div>

        {/* Phase: Upload */}
        {phase === 'upload' && (
          <div className="space-y-6">
            {/* Upload Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`bg-white dark:bg-[#1a1a1a] rounded-brand-lg border-2 border-dashed p-12 text-center cursor-pointer transition-all shadow-sm ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-300 dark:border-white/10 hover:border-primary/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                aria-label="Choisir un fichier Excel ou JSON à importer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                className="sr-only"
              />
              <div className="flex justify-center mb-4 text-primary"><UploadCloud className="w-12 h-12" /></div>
              <p className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {file ? file.name : 'Glissez-déposez votre fichier ici'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {file
                  ? `${(file.size / 1024).toFixed(1)} Ko — Cliquez pour changer`
                  : 'Formats acceptés : .xlsx, .xls, .csv, .json'}
              </p>
            </div>

            {/* Parse Error */}
            {parseError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-brand-lg p-4 text-red-700 dark:text-red-300 text-sm">
                ❌ {parseError}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {file && (
                <button
                  onClick={handleParse}
                  disabled={parsing}
                  className="px-6 py-3 bg-primary text-white rounded-brand-lg hover:bg-primary-600 font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">{parsing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}{parsing ? 'Analyse en cours...' : 'Analyser le fichier'}</span>
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); downloadExcelTemplate(); }}
                className="px-5 py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-brand-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-sm font-bold shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Template Excel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); downloadJsonTemplate(); }}
                className="px-5 py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-brand-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-sm font-bold shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Template JSON
              </button>
            </div>
          </div>
        )}

        {/* Phase: Review */}
        {phase === 'review' && importResult && (
          <div className="space-y-6">
            {/* Stats Bar */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-brand-lg border border-slate-200 dark:border-white/5 p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm font-bold">
                <span className="text-slate-900 dark:text-white">
                  {importResult.total} total
                </span>
                <span className="text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" /> {importResult.valid} valide{importResult.valid > 1 ? 's' : ''}
                </span>
                {importResult.warnings > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 inline mr-1" /> {importResult.warnings} avertissement{importResult.warnings > 1 ? 's' : ''}
                  </span>
                )}
                {importResult.errors > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    <XCircle className="w-4 h-4 inline mr-1" /> {importResult.errors} erreur{importResult.errors > 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-primary-600 dark:text-primary-400">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" /> {approvedCount} approuvé{approvedCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleApproveAllValid}
                className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-xl text-sm font-bold hover:bg-green-100 dark:hover:bg-green-900/30 transition-all"
              >
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Tout approuver</span> (valides)
              </button>
              <button
                onClick={handleRejectAllErrors}
                className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
              >
                <span className="flex items-center gap-2"><XCircle className="w-4 h-4" /> Tout rejeter</span> (erreurs)
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
              >
                <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Recommencer</span>
              </button>
            </div>

            {/* Parse Error */}
            {parseError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-brand-lg p-4 text-red-700 dark:text-red-300 text-sm">
                ❌ {parseError}
              </div>
            )}

            {/* Review Table (Now Cards) */}
            <div className="grid grid-cols-1 gap-4">
              {importResult.questions.map((q, idx) => (
                <div
                  key={idx}
                  className={`bg-white dark:bg-[#1a1a1a] rounded-brand-lg border shadow-sm overflow-hidden flex flex-col ${
                    q.status === 'approved'
                      ? 'border-green-200 dark:border-green-900/30'
                      : q.status === 'rejected'
                      ? 'border-red-200 dark:border-red-900/30'
                      : q.status === 'error'
                      ? 'border-red-300 dark:border-red-800'
                      : q.status === 'warning'
                      ? 'border-amber-300 dark:border-amber-800'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
                    q.status === 'approved'
                      ? 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/20'
                      : q.status === 'rejected'
                      ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20'
                      : q.status === 'error'
                      ? 'bg-red-50/30 dark:bg-red-900/5 border-red-100 dark:border-red-900/10'
                      : q.status === 'warning'
                      ? 'bg-amber-50/30 dark:bg-amber-900/5 border-amber-100 dark:border-amber-900/10'
                      : 'bg-slate-50/50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        q.status === 'approved'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : q.status === 'rejected'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : q.status === 'error'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : q.status === 'warning'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {q.status === 'approved' && <CheckCircle2 className="w-4 h-4" />}
                        {q.status === 'rejected' && <XCircle className="w-4 h-4" />}
                        {q.status === 'error' && <XCircle className="w-4 h-4" />}
                        {q.status === 'warning' && <AlertTriangle className="w-4 h-4" />}
                        {q.status === 'valid' && <Check className="w-4 h-4" />}
                        {q.status === 'pending' && <RefreshCw className="w-4 h-4 animate-spin" />}
                        <span className="ml-1 hidden sm:inline">{q.status === 'approved' ? 'Approuvé' : q.status === 'rejected' ? 'Rejeté' : q.status === 'error' ? 'Erreur' : q.status === 'warning' ? 'Avertissement' : q.status === 'valid' ? 'Valide' : 'En attente'}</span>
                      </span>
                      <span className="text-slate-400 text-sm font-bold">#{idx + 1}</span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-white/5">{q.data.year}A</span>
                      <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-white/5 truncate max-w-[150px]" title={q.data.module_name}>{q.data.module_name} {q.data.sub_discipline && `(${q.data.sub_discipline})`}</span>
                      <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-white/5">{q.data.exam_type} {q.data.exam_year}</span>
                      <span className="bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-white/5">Q{q.data.number}</span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col gap-4">
                    <p className="text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap">
                      {q.data.question_text || <span className="text-red-400 italic">Question manquante</span>}
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {q.data.answers.map((a, i) => (
                        <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${a.is_correct ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-white/5'}`}>
                          <span className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${a.is_correct ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            {a.option_label || '?'}
                          </span>
                          <span className={`text-sm ${a.is_correct ? 'text-green-800 dark:text-green-200 font-medium' : 'text-slate-600 dark:text-slate-400 break-words'}`}>
                            {a.answer_text || <span className="text-red-400 italic">Texte manquant</span>}
                          </span>
                        </div>
                      ))}
                      {(!q.data.answers || q.data.answers.length === 0) && (
                        <div className="text-red-500 text-sm italic col-span-full">Aucune réponse trouvée</div>
                      )}
                    </div>
                  </div>

                  {/* Errors and Warnings */}
                  {(q.errors.length > 0 || q.warnings.length > 0) && (
                    <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-white/5">
                      {q.errors.map((err, i) => (
                        <p key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 mb-1">
                          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {err}
                        </p>
                      ))}
                      {q.warnings.map((warn, i) => (
                        <p key={i} className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-1.5 mb-1">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {warn}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 bg-white dark:bg-[#1a1a1a]">
                    <button
                      onClick={() => handleEdit(idx)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-brand-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" /> Modifier
                    </button>
                    
                    <div className="flex items-center gap-2">
                      {q.status !== 'approved' && q.status !== 'rejected' && (
                        <>
                          <button
                            onClick={() => handleReject(idx)}
                            className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-brand-lg text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
                          >
                            <X className="w-4 h-4" /> Rejeter
                          </button>
                          {q.errors.length === 0 && (
                            <button
                              onClick={() => handleApprove(idx)}
                              className="px-4 py-2 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 rounded-brand-lg text-sm font-bold hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors flex items-center gap-2"
                            >
                              <Check className="w-4 h-4" /> Approuver
                            </button>
                          )}
                        </>
                      )}
                      {q.status === 'approved' && (
                        <button
                          onClick={() => handleReject(idx)}
                          className="px-4 py-2 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 rounded-brand-lg text-sm font-bold hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2"
                        >
                          <Undo2 className="w-4 h-4" /> Annuler l&apos;approbation
                        </button>
                      )}
                      {q.status === 'rejected' && (
                        <button
                          onClick={() => handleApprove(idx)}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-brand-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                        >
                          <Undo2 className="w-4 h-4" /> Réapprouver
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleBulkSave}
                disabled={approvedCount === 0}
                className="px-8 py-4 bg-primary text-white rounded-brand-lg hover:bg-primary-600 font-heading font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-lg flex items-center justify-center gap-3"
              >
                <Save className="w-5 h-5" /> Sauvegarder {approvedCount} question{approvedCount > 1 ? 's' : ''} approuvée{approvedCount > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Phase: Saving */}
        {phase === 'saving' && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-brand-lg border border-slate-200 dark:border-white/5 p-12 text-center shadow-sm">
            <div className="flex justify-center mb-4 text-primary"><Save className="w-16 h-16 animate-bounce" /></div>
            <p className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Sauvegarde en cours...
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Veuillez patienter...
            </p>
            <div className="mt-4 w-full max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div className="bg-primary h-full rounded-full animate-[shimmer_1.5s_infinite] bg-[length:200%_100%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)]" style={{ width: '100%' }} />
            </div>
          </div>
        )}

        {/* Phase: Results */}
        {phase === 'results' && saveResult && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-brand-lg border border-slate-200 dark:border-white/5 p-8 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                📊 Résultats de l&apos;importation
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-brand-lg p-5 text-center border border-green-200 dark:border-green-800">
                  <div className="text-3xl font-black text-green-600 dark:text-green-400">
                    {saveResult.saved}
                  </div>
                  <div className="text-sm font-bold text-green-700 dark:text-green-300 mt-1">
                    ✅ Sauvegardée{saveResult.saved > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-brand-lg p-5 text-center border border-red-200 dark:border-red-800">
                  <div className="text-3xl font-black text-red-600 dark:text-red-400">
                    {saveResult.failed}
                  </div>
                  <div className="text-sm font-bold text-red-700 dark:text-red-300 mt-1">
                    ❌ Échouée{saveResult.failed > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-brand-lg p-5 text-center border border-slate-200 dark:border-slate-700">
                  <div className="text-3xl font-black text-slate-600 dark:text-slate-400">
                    {saveResult.skipped}
                  </div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-1">
                    ⏭️ Ignorée{saveResult.skipped > 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Missing courses */}
              {saveResult.missingCourses && saveResult.missingCourses.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-brand-lg p-4 mb-4">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-1">
                    ⚠️ Cours non trouvés dans la base de données :
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {saveResult.missingCourses.join(', ')}
                  </p>
                </div>
              )}

              {/* Failed details */}
              {saveResult.results.filter((r) => r.status === 'error').length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Détails des erreurs :
                  </h3>
                  {saveResult.results
                    .filter((r) => r.status === 'error')
                    .map((r, i) => (
                      <div
                        key={i}
                        className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm"
                      >
                        <span className="font-bold text-red-700 dark:text-red-300">
                          Question #{r.index + 1} :
                        </span>{' '}
                        <span className="text-red-600 dark:text-red-400">{r.error}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Skipped details */}
              {saveResult.results.filter((r) => r.status === 'skipped').length > 0 && (
                <div className="space-y-2 mt-4">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Détails des ignorées :
                  </h3>
                  {saveResult.results
                    .filter((r) => r.status === 'skipped')
                    .map((r, i) => (
                      <div
                        key={i}
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm"
                      >
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Question #{r.index + 1} :
                        </span>{' '}
                        <span className="text-slate-600 dark:text-slate-400">{r.error}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-primary text-white rounded-brand-lg hover:bg-primary-600 font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
              >
                📥 Importer d&apos;autres données
              </button>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingIndex !== null && editData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-brand-lg border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-3xl my-8 flex flex-col max-h-[90vh]">
              
              <div className="p-6 md:p-8 border-b border-slate-100 dark:border-white/5 flex-shrink-0">
                <h3 className="text-xl font-heading font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
                  <Edit2 className="w-6 h-6 text-primary" />
                  Modifier la question #{editingIndex + 1}
                </h3>
                
                {/* Show current errors at the top of the modal */}
                {importResult?.questions[editingIndex] && (importResult.questions[editingIndex].errors.length > 0 || importResult.questions[editingIndex].warnings.length > 0) && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg">
                    <p className="text-sm font-bold text-red-800 dark:text-red-300 mb-2">À corriger :</p>
                    {importResult.questions[editingIndex].errors.map((err, i) => (
                      <p key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 mb-1">
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {err}
                      </p>
                    ))}
                    {importResult.questions[editingIndex].warnings.map((warn, i) => (
                      <p key={i} className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-1.5 mb-1">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {warn}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Année
                    </label>
                    <select
                      value={editData.year}
                      onChange={(e) => setEditData({ ...editData, year: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
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
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Type d&apos;examen
                    </label>
                    <select
                      value={editData.exam_type}
                      onChange={(e) => setEditData({ ...editData, exam_type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
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
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
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
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Sous-discipline
                    </label>
                    <input
                      type="text"
                      value={editData.sub_discipline || ''}
                      onChange={(e) => setEditData({ ...editData, sub_discipline: e.target.value || undefined })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Question
                  </label>
                  <textarea
                    value={editData.question_text}
                    onChange={(e) => setEditData({ ...editData, question_text: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm resize-none"
                  />
                </div>

                {/* Enhanced Answers Section */}
                <div className="space-y-3 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Réponses ({editData.answers?.length || 0}/5)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (editData.answers.length >= 5) return;
                        const nextLabels = ['A', 'B', 'C', 'D', 'E'];
                        const used = editData.answers.map(a => a.option_label);
                        const nextAvailable = nextLabels.find(l => !used.includes(l as any)) || 'A';
                        
                        setEditData({
                          ...editData,
                          answers: [
                            ...editData.answers,
                            {
                              option_label: nextAvailable as any,
                              answer_text: '',
                              is_correct: false,
                              display_order: editData.answers.length + 1
                            }
                          ]
                        });
                      }}
                      disabled={editData.answers?.length >= 5}
                      className="text-xs font-bold text-primary hover:text-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 bg-primary/10 px-2 py-1 rounded"
                    >
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                  
                  {editData.answers?.map((answer, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-white/5 shadow-sm relative group">
                      <div className="flex items-center gap-2 w-full">
                        {/* Correct Toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            const newAnswers = [...editData.answers];
                            newAnswers[i] = { ...newAnswers[i], is_correct: !newAnswers[i].is_correct };
                            setEditData({ ...editData, answers: newAnswers });
                          }}
                          className={`flex-shrink-0 w-8 h-8 rounded text-xs font-bold transition-all ${
                            answer.is_correct
                              ? 'bg-green-500 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                          title={answer.is_correct ? "Marquer comme incorrecte" : "Marquer comme correcte"}
                        >
                          <Check className={`w-4 h-4 mx-auto ${answer.is_correct ? 'opacity-100' : 'opacity-0'}`} />
                        </button>
                        
                        {/* Label Select */}
                        <select
                          value={answer.option_label}
                          onChange={(e) => {
                            const newAnswers = [...editData.answers];
                            newAnswers[i] = { ...newAnswers[i], option_label: e.target.value as any };
                            setEditData({ ...editData, answers: newAnswers });
                          }}
                          className="w-16 flex-shrink-0 px-2 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-white text-sm font-bold text-center appearance-none"
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
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-white text-sm"
                        />
                        
                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const newAnswers = [...editData.answers];
                            newAnswers.splice(i, 1);
                            // Reorder remaining
                            newAnswers.forEach((a, idx) => a.display_order = idx + 1);
                            setEditData({ ...editData, answers: newAnswers });
                          }}
                          className="flex-shrink-0 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Cours (séparés par ;)
                    </label>
                    <input
                      type="text"
                      value={(editData.cours || []).join('; ')}
                      onChange={(e) => setEditData({
                        ...editData,
                        cours: e.target.value ? e.target.value.split(';').map((s) => s.trim()).filter(Boolean) : undefined,
                      })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Explication
                    </label>
                    <input
                      type="text"
                      value={editData.explanation || ''}
                      onChange={(e) => setEditData({ ...editData, explanation: e.target.value || undefined })}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white transition-all text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/20 flex-shrink-0">
                <button
                  onClick={() => { setEditingIndex(null); setEditData(null); }}
                  className="px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-brand-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    handleSaveEdit();
                  }}
                  className="px-6 py-2.5 bg-primary text-white rounded-brand-lg text-sm font-bold hover:bg-primary-600 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Enregistrer & Revérifier
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
