'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ImportedQuestion, ImportResult } from '@/types/bulk-import';
import { parseExcel } from '@/lib/import/parse-excel';
import { parseJson } from '@/lib/import/parse-json';
import { downloadExcelTemplate, downloadJsonTemplate } from '@/lib/import/template-generator';
import { supabase } from '@/lib/supabase';
import { UploadCloud, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function TableImporterPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'json'].includes(ext || '')) {
      setError('Format non supporté. Utilisez .xlsx, .xls, .csv ou .json');
      return;
    }
    setFile(selectedFile);
    setError(null);
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

  const handleUpload = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);

    try {
      // Step 1: Parse file
      const ext = file.name.split('.').pop()?.toLowerCase();
      const result: ImportResult = ext === 'json'
        ? await parseJson(file)
        : await parseExcel(file);

      if (result.total === 0) {
        setError('Aucune question trouvée dans le fichier');
        setParsing(false);
        return;
      }

      // Step 2: POST to staging API
      setUploading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const questionsForApi = result.questions.map((q) => ({
        year: q.data.year,
        module_name: q.data.module_name,
        sub_discipline: q.data.sub_discipline,
        exam_type: q.data.exam_type,
        exam_year: q.data.exam_year,
        number: q.data.number,
        question_text: q.data.question_text,
        speciality: q.data.speciality,
        cours: q.data.cours,
        faculty_source: q.data.faculty_source,
        explanation: q.data.explanation,
        answers: q.data.answers,
        status: q.status,
        errors: q.errors,
        warnings: q.warnings,
      }));

      const response = await fetch('/api/import/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: ext || 'unknown',
          questions: questionsForApi,
        }),
      });

      const batchResult = await response.json();
      if (!response.ok) throw new Error(batchResult.error || 'Erreur lors de l\'envoi');

      // Step 3: Redirect to batch review page
      router.push(`/import-dashboard/${batchResult.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du traitement');
    } finally {
      setParsing(false);
      setUploading(false);
    }
  };

  const isLoading = parsing || uploading;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl">📥</span>
            Import en masse
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Uploadez un fichier Excel ou JSON pour créer un batch d&apos;import
          </p>
        </div>

        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isLoading && fileInputRef.current?.click()}
          className={`bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
            isLoading ? 'opacity-60 cursor-not-allowed' : ''
          } ${
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
          <div className="flex justify-center mb-4 text-primary">
            {isLoading ? (
              <RefreshCw className="w-12 h-12 animate-spin" />
            ) : file ? (
              <CheckCircle2 className="w-12 h-12" />
            ) : (
              <UploadCloud className="w-12 h-12" />
            )}
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-white mb-2">
            {isLoading
              ? (uploading ? 'Envoi en cours...' : 'Analyse en cours...')
              : file
                ? file.name
                : 'Glissez-déposez votre fichier ici'
            }
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {file && !isLoading
              ? `${(file.size / 1024).toFixed(1)} Ko — Cliquez pour changer`
              : 'Formats acceptés : .xlsx, .xls, .csv, .json'
            }
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          {file && !isLoading && (
            <button
              onClick={handleUpload}
              className="px-6 py-3 bg-primary text-white rounded-2xl hover:bg-primary-600 font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <UploadCloud className="w-5 h-5" />
              Analyser & Envoyer
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); downloadExcelTemplate(); }}
            className="px-5 py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-sm font-bold shadow-sm flex items-center gap-2"
          >
            📥 Template Excel
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); downloadJsonTemplate(); }}
            className="px-5 py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-sm font-bold shadow-sm flex items-center gap-2"
          >
            📥 Template JSON
          </button>
        </div>
      </div>
    </div>
  );
}
