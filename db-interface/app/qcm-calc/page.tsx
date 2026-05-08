'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getQcmExams,
  createQcmExam,
  updateQcmExam,
  deleteQcmExam,
  getQcmExamFilterValues,
} from '@/lib/api/qcm-calc';
import type {
  QcmExam,
  QcmExamFormData,
  QcmExamFilters,
  TestType,
  ExamSession,
  ExamKind,
  ExamSection,
  SectionType,
} from '@/types/qcm-calc';
import {
  TEST_TYPE_OPTIONS,
  SESSION_OPTIONS,
  EXAM_KIND_OPTIONS,
  GRADE_OPTIONS,
  SPECIALITY_OPTIONS,
  TEST_TYPE_LABELS,
  SECTION_TYPE_LABELS,
} from '@/types/qcm-calc';

const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

// Grades that support théorique/clinique sections (only 4th year and above)
const GRADES_WITH_SECTIONS = new Set(['4ème année', '5ème année', '6ème année']);

const INITIAL_FORM: QcmExamFormData = {
  name: '',
  description: '',
  speciality: 'Médecine',
  grade: '1ère année',
  year: '',
  subject: '',
  num_questions: 20,
  test_type: 'QCSs',
  correct_answers: {},
  session: 'Normal',
  rotation: '',
  exam_type: 'Théorique',
  sections: [],
};

const SECTION_COLORS: Record<SectionType, { bg: string; border: string; text: string }> = {
  théorique: { bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300' },
  clinique: { bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300' },
};

export default function QcmCalcPage() {
  // ---------- State ----------
  const [exams, setExams] = useState<QcmExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<QcmExamFormData>(INITIAL_FORM);
  const [filters, setFilters] = useState<QcmExamFilters>({});
  const [filterValues, setFilterValues] = useState<{
    specialities: string[];
    grades: string[];
    years: string[];
    subjects: string[];
  }>({ specialities: [], grades: [], years: [], subjects: [] });

  // ---------- Data Loading ----------
  const loadExams = useCallback(async () => {
    setLoading(true);
    const result = await getQcmExams(filters);
    if (result.success) {
      setExams(result.data);
    } else {
      setError(result.error || 'Erreur de chargement');
    }
    setLoading(false);
  }, [filters]);

  const loadFilterValues = useCallback(async () => {
    const result = await getQcmExamFilterValues();
    if (result.success) {
      setFilterValues(result.data);
    }
  }, []);

  useEffect(() => { loadExams(); }, [loadExams]);
  useEffect(() => { loadFilterValues(); }, [loadFilterValues]);

  // ---------- Form Handlers ----------
  const toggleAnswer = (questionNum: number, label: string) => {
    setFormData(prev => {
      const current = prev.correct_answers[questionNum] || [];
      const isNested = current.length > 0 && Array.isArray(current[0]);
      // If it's a nested array, we only modify the first set in the UI
      let workingSet = isNested ? [...(current[0] as unknown as string[])] : [...(current as string[])];
      
      const updatedSet = workingSet.includes(label)
        ? workingSet.filter(l => l !== label)
        : [...workingSet, label];
        
      // If it was nested, reconstruct the nested array keeping other sets intact
      const updated = isNested 
        ? [updatedSet, ...(current.slice(1) as string[][])]
        : updatedSet;

      return {
        ...prev,
        correct_answers: { ...prev.correct_answers, [questionNum]: updated },
      };
    });
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'Le nom de l\'examen est requis.';
    if (!formData.year.trim()) return 'L\'année est requise.';
    if (!formData.subject.trim()) return 'La matière est requise.';
    if (formData.num_questions < 1 || formData.num_questions > 200)
      return 'Le nombre de questions doit être entre 1 et 200.';

    // Check that every question has at least one answer
    for (let i = 1; i <= formData.num_questions; i++) {
      const answers = formData.correct_answers[i];
      if (!answers || answers.length === 0) {
        return `La question ${i} n'a pas de réponse correcte.`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const result = editingId
      ? await updateQcmExam(editingId, formData)
      : await createQcmExam(formData);

    if (result.success) {
      setSuccess(editingId ? '✅ Examen modifié!' : '✅ Examen créé!');
      setShowForm(false);
      setEditingId(null);
      setFormData(INITIAL_FORM);
      await loadExams();
      await loadFilterValues();
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error || 'Erreur');
    }
    setSaving(false);
  };

  const handleEdit = (exam: QcmExam) => {
    // Convert JSONB answers back to form format
    const answers: Record<number, string[] | string[][]> = {};
    let hasNested = false;
    for (const [key, val] of Object.entries(exam.correct_answers)) {
      if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0])) {
        hasNested = true;
        answers[Number(key)] = val as string[][]; // Preserve full nested structure
      } else {
        answers[Number(key)] = val as string[];
      }
    }

    if (hasNested) {
      if (!window.confirm("Cet examen contient des combinaisons de réponses multiples. L'interface ne permet d'éditer que la première combinaison, mais les autres seront préservées. Continuer ?")) {
        return;
      }
    }

    setFormData({
      name: exam.name,
      description: exam.description,
      speciality: exam.speciality,
      grade: exam.grade,
      year: exam.year,
      subject: exam.subject,
      num_questions: exam.num_questions,
      test_type: exam.test_type,
      correct_answers: answers,
      session: exam.session,
      rotation: exam.rotation || '',
      exam_type: exam.exam_type,
      sections: exam.sections || [],
    });
    setEditingId(exam.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet examen ?')) return;
    const result = await deleteQcmExam(id);
    if (result.success) {
      setSuccess('✅ Examen supprimé!');
      await loadExams();
      await loadFilterValues();
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error || 'Erreur de suppression');
    }
  };

  // Stats
  const stats = useMemo(() => ({
    total: exams.length,
    subjects: new Set(exams.map(e => e.subject)).size,
    totalQuestions: exams.reduce((sum, e) => sum + e.num_questions, 0),
  }), [exams]);

  // ---------- Shared Styles ----------
  const inputCls = "w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white transition-all";
  const labelCls = "block text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1";

  // ---------- Render ----------
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
            QCM Calc
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
            Gestion des examens • FMC APP
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setEditingId(null);
              setFormData(INITIAL_FORM);
            } else {
              setShowForm(true);
            }
          }}
          className={`px-6 py-3 rounded-2xl transition-all text-sm font-bold shadow-lg flex items-center gap-2 ${
            showForm
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 shadow-none'
              : 'bg-primary-600 text-white hover:bg-primary-700 shadow-primary-500/20 active:scale-[0.98]'
          }`}
        >
          {showForm ? 'Annuler' : <><span>➕</span> Nouvel Examen</>}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-300">❌ {error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-800 dark:text-green-300">{success}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Examens', value: stats.total, icon: '📋' },
          { label: 'Matières', value: stats.subjects, icon: '📚' },
          { label: 'Questions', value: stats.totalQuestions, icon: '❓' },
        ].map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-white/5 shadow-sm">
            <p className="text-slate-500 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{item.label}</p>
            <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* ========== CREATE / EDIT FORM ========== */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-2xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-50" />

          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <span className="w-10 h-10 flex items-center justify-center bg-primary-50 dark:bg-primary-900/20 rounded-xl text-primary-600">
                {editingId ? '✏️' : '✨'}
              </span>
              {editingId ? 'Modifier l\'Examen' : 'Nouvel Examen'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Section: Exam Info */}
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
                Informations de l&apos;Examen
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Nom de l&apos;examen *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="ex: EMD Anatomie 2025" required />
                </div>
                {/* Description */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Description</label>
                  <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className={inputCls + " min-h-[80px]"} placeholder="Description optionnelle..." />
                </div>
                {/* Speciality */}
                <div>
                  <label className={labelCls}>Spécialité *</label>
                  <select value={formData.speciality} onChange={e => setFormData({ ...formData, speciality: e.target.value })} className={inputCls} required>
                    {SPECIALITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {/* Grade */}
                <div>
                  <label className={labelCls}>Niveau *</label>
                  <select value={formData.grade} onChange={e => {
                    const newGrade = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      grade: newGrade,
                      // Auto-clear sections when switching to a grade that doesn't support them
                      sections: GRADES_WITH_SECTIONS.has(newGrade) ? prev.sections : [],
                    }));
                  }} className={inputCls} required>
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                {/* Year */}
                <div>
                  <label className={labelCls}>Année Universitaire *</label>
                  <input type="text" value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })} className={inputCls} placeholder="ex: 2024-2025" required />
                </div>
                {/* Subject */}
                <div>
                  <label className={labelCls}>Matière *</label>
                  <input type="text" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} className={inputCls} placeholder="ex: Anatomie" required />
                </div>
                {/* Session */}
                <div>
                  <label className={labelCls}>Session *</label>
                  <select value={formData.session} onChange={e => setFormData({ ...formData, session: e.target.value as ExamSession })} className={inputCls}>
                    {SESSION_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {/* Exam Kind */}
                <div>
                  <label className={labelCls}>Type d&apos;Examen *</label>
                  <select value={formData.exam_type} onChange={e => setFormData({ ...formData, exam_type: e.target.value as ExamKind })} className={inputCls}>
                    {EXAM_KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                {/* Rotation */}
                <div>
                  <label className={labelCls}>Rotation (optionnel)</label>
                  <input type="text" value={formData.rotation} onChange={e => setFormData({ ...formData, rotation: e.target.value })} className={inputCls} placeholder="ex: Rotation A" />
                </div>
              </div>
            </div>

            {/* Section: Questions Config */}
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
                Configuration des Questions
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <label className={labelCls}>Nombre de Questions *</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={formData.num_questions}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 1;
                      setFormData(prev => ({
                        ...prev,
                        num_questions: Math.min(200, Math.max(1, val)),
                      }));
                    }}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Type de Correction *</label>
                  <select
                    value={formData.test_type}
                    onChange={e => setFormData({ ...formData, test_type: e.target.value as TestType })}
                    className={inputCls}
                  >
                    {TEST_TYPE_OPTIONS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Sections Builder — only for 4th year and above */}
            {GRADES_WITH_SECTIONS.has(formData.grade) && (
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
                Sections (Théorique / Cas Clinique)
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
              </h3>

              <p className="text-xs text-slate-400 dark:text-slate-500">
                Optionnel — Définissez les plages de questions théoriques et cliniques si l&apos;examen est mixte.
              </p>

              {/* Existing sections */}
              {(formData.sections || []).map((section, idx) => (
                <div key={idx} className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${SECTION_COLORS[section.type].bg} ${SECTION_COLORS[section.type].border}`}>
                  <span className={`text-xs font-bold uppercase ${SECTION_COLORS[section.type].text}`}>
                    {SECTION_TYPE_LABELS[section.type]}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Q{section.from} → Q{section.to} ({section.to - section.from + 1} questions)
                  </span>
                  {section.label && (
                    <span className="text-xs text-slate-400 italic">— {section.label}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        sections: prev.sections.filter((_, i) => i !== idx),
                      }));
                    }}
                    className="ml-auto text-red-400 hover:text-red-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Add section form */}
              <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-white/10">
                <div>
                  <label className={labelCls}>Type</label>
                  <select id="new-section-type" className={inputCls + " !w-auto"} defaultValue="théorique">
                    <option value="théorique">Théorique</option>
                    <option value="clinique">Cas Clinique</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>De Q</label>
                  <input id="new-section-from" type="number" min={1} max={200} className={inputCls + " !w-24"} placeholder="1" />
                </div>
                <div>
                  <label className={labelCls}>À Q</label>
                  <input id="new-section-to" type="number" min={1} max={200} className={inputCls + " !w-24"} placeholder="13" />
                </div>
                <div>
                  <label className={labelCls}>Label (opt.)</label>
                  <input id="new-section-label" type="text" className={inputCls + " !w-40"} placeholder="Cas Clinique 1" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const typeEl = document.getElementById('new-section-type') as HTMLSelectElement;
                    const fromEl = document.getElementById('new-section-from') as HTMLInputElement;
                    const toEl = document.getElementById('new-section-to') as HTMLInputElement;
                    const labelEl = document.getElementById('new-section-label') as HTMLInputElement;
                    const from = parseInt(fromEl.value);
                    const to = parseInt(toEl.value);
                    if (!from || !to || from > to) {
                      setError('Plage invalide: "De" doit être ≤ "À".');
                      return;
                    }
                    if (to > formData.num_questions) {
                      setError(`Q${to} dépasse le nombre total de questions (${formData.num_questions}).`);
                      return;
                    }
                    const newSection: ExamSection = {
                      type: typeEl.value as SectionType,
                      from,
                      to,
                      ...(labelEl.value.trim() ? { label: labelEl.value.trim() } : {}),
                    };
                    setFormData(prev => ({
                      ...prev,
                      sections: [...prev.sections, newSection].sort((a, b) => a.from - b.from),
                    }));
                    setError(null);
                    fromEl.value = '';
                    toEl.value = '';
                    labelEl.value = '';
                  }}
                  className="px-4 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all"
                >
                  + Ajouter
                </button>
              </div>
            </div>
            )}

            {/* Section: Answer Grid (grouped by sections if defined) */}
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
                Réponses Correctes
                <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
              </h3>

              {(() => {
                // Build question list, grouped by sections if defined
                const hasSections = (formData.sections || []).length > 0;
                const allQuestions = Array.from({ length: formData.num_questions }, (_, i) => i + 1);

                if (!hasSections) {
                  // No sections: flat grid
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {allQuestions.map(qNum => {
                        const rawSelected = formData.correct_answers[qNum] || [];
                        const selected = (rawSelected.length > 0 && Array.isArray(rawSelected[0])) 
                          ? (rawSelected[0] as unknown as string[]) 
                          : (rawSelected as string[]);
                        const hasAnswer = selected.length > 0;
                        return (
                          <div key={qNum} className={`p-3 rounded-xl border transition-all ${hasAnswer ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'}`}>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Q{qNum}</p>
                            <div className="flex gap-1.5">
                              {ANSWER_LABELS.map(label => {
                                const isSelected = selected.includes(label);
                                return (
                                  <button key={label} type="button" onClick={() => toggleAnswer(qNum, label)} className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-primary-600 text-white shadow-md shadow-primary-500/30 scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // With sections: grouped display
                const assignedQuestions = new Set<number>();
                (formData.sections || []).forEach(s => {
                  for (let q = s.from; q <= s.to; q++) assignedQuestions.add(q);
                });
                const unassigned = allQuestions.filter(q => !assignedQuestions.has(q));

                return (
                  <div className="space-y-6">
                    {(formData.sections || []).map((section, sIdx) => {
                      const sectionQuestions = Array.from({ length: section.to - section.from + 1 }, (_, i) => section.from + i);
                      const colors = SECTION_COLORS[section.type];
                      return (
                        <div key={sIdx} className={`p-4 rounded-2xl border ${colors.bg} ${colors.border}`}>
                          <p className={`text-xs font-black uppercase tracking-widest mb-3 ${colors.text}`}>
                            {SECTION_TYPE_LABELS[section.type]} — Q{section.from}→Q{section.to}
                            {section.label && ` (${section.label})`}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {sectionQuestions.map(qNum => {
                              const rawSelected = formData.correct_answers[qNum] || [];
                              const selected = (rawSelected.length > 0 && Array.isArray(rawSelected[0])) 
                                ? (rawSelected[0] as unknown as string[]) 
                                : (rawSelected as string[]);
                              const hasAnswer = selected.length > 0;
                              return (
                                <div key={qNum} className={`p-3 rounded-xl border transition-all bg-white dark:bg-slate-900 ${hasAnswer ? 'border-primary-200 dark:border-primary-800' : 'border-red-200 dark:border-red-800'}`}>
                                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Q{qNum}</p>
                                  <div className="flex gap-1.5">
                                    {ANSWER_LABELS.map(label => {
                                      const isSelected = selected.includes(label);
                                      return (
                                        <button key={label} type="button" onClick={() => toggleAnswer(qNum, label)} className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-primary-600 text-white shadow-md shadow-primary-500/30 scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Unassigned questions */}
                    {unassigned.length > 0 && (
                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/50">
                        <p className="text-xs font-black uppercase tracking-widest mb-3 text-slate-400">
                          Non assignées ({unassigned.length})
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {unassigned.map(qNum => {
                            const rawSelected = formData.correct_answers[qNum] || [];
                            const selected = (rawSelected.length > 0 && Array.isArray(rawSelected[0])) 
                              ? (rawSelected[0] as unknown as string[]) 
                              : (rawSelected as string[]);
                            const hasAnswer = selected.length > 0;
                            return (
                              <div key={qNum} className={`p-3 rounded-xl border transition-all ${hasAnswer ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'}`}>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Q{qNum}</p>
                                <div className="flex gap-1.5">
                                  {ANSWER_LABELS.map(label => {
                                    const isSelected = selected.includes(label);
                                    return (
                                      <button key={label} type="button" onClick={() => toggleAnswer(qNum, label)} className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-primary-600 text-white shadow-md shadow-primary-500/30 scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 bg-primary-600 text-white rounded-2xl font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 active:scale-[0.98]"
              >
                {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Créer l\'Examen'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData(INITIAL_FORM);
                }}
                className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========== FILTERS ========== */}
      {!showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={filters.speciality || ''} onChange={e => setFilters({ ...filters, speciality: e.target.value || undefined })} className={inputCls + " text-sm"}>
              <option value="">Toutes spécialités</option>
              {filterValues.specialities.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filters.grade || ''} onChange={e => setFilters({ ...filters, grade: e.target.value || undefined })} className={inputCls + " text-sm"}>
              <option value="">Tous niveaux</option>
              {filterValues.grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={filters.year || ''} onChange={e => setFilters({ ...filters, year: e.target.value || undefined })} className={inputCls + " text-sm"}>
              <option value="">Toutes années</option>
              {filterValues.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filters.subject || ''} onChange={e => setFilters({ ...filters, subject: e.target.value || undefined })} className={inputCls + " text-sm"}>
              <option value="">Toutes matières</option>
              {filterValues.subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ========== EXAM LIST ========== */}
      {!showForm && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">Chargement...</p>
            </div>
          ) : exams.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/5">
              <p className="text-5xl mb-4">📝</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mb-2">Aucun examen</p>
              <p className="text-slate-500 dark:text-slate-400">Créez votre premier examen pour commencer.</p>
            </div>
          ) : (
            exams.map(exam => (
              <div key={exam.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5 p-5 hover:shadow-lg transition-all group">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{exam.name}</h3>
                      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 uppercase whitespace-nowrap">
                        {TEST_TYPE_LABELS[exam.test_type]}
                      </span>
                      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap">
                        {exam.session}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>📚 {exam.subject}</span>
                      <span>🎓 {exam.grade}</span>
                      <span>📅 {exam.year}</span>
                      <span>❓ {exam.num_questions} questions</span>
                      <span>🏥 {exam.speciality}</span>
                      {exam.rotation && <span>🔄 {exam.rotation}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(exam)} className="px-4 py-2 text-sm font-bold bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-all">
                      ✏️ Modifier
                    </button>
                    <button onClick={() => handleDelete(exam.id)} className="px-4 py-2 text-sm font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
