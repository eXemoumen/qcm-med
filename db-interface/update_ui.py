import sys

def modify_file():
    filepath = 'c:/Users/MOZ/Desktop/qcm/qcm-med/db-interface/app/table-importer/page.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update imports
    content = content.replace(
        "import { UploadCloud, FileSpreadsheet, FileJson, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Download, RefreshCw, Save, Edit2, Undo2, Check, X, FileOutput } from 'lucide-react';",
        "import { UploadCloud, FileSpreadsheet, FileJson, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Download, RefreshCw, Save, Edit2, Undo2, Check, X, FileOutput, Plus, Trash2 } from 'lucide-react';"
    )

    # 2. Replace Review Table
    start_marker = "{/* Review Table */}"
    end_marker = "{/* Save Button */}"
    
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find table markers")
        return
        
    table_replacement = """{/* Review Table (Now Cards) */}
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
                          <button
                            onClick={() => handleApprove(idx)}
                            className="px-4 py-2 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 rounded-brand-lg text-sm font-bold hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" /> Approuver
                          </button>
                        </>
                      )}
                      {q.status === 'approved' && (
                        <button
                          onClick={() => handleReject(idx)}
                          className="px-4 py-2 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 rounded-brand-lg text-sm font-bold hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2"
                        >
                          <Undo2 className="w-4 h-4" /> Annuler l'approbation
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
            </div>\n\n            """
    
    content = content[:start_idx] + table_replacement + content[end_idx:]

    # 3. Replace Edit Modal
    start_modal = "{/* Edit Modal */}"
    end_modal = "      </div>\n    </div>\n  );\n}"
    
    start_m_idx = content.find(start_modal)
    end_m_idx = content.find(end_modal)
    
    if start_m_idx == -1 or end_m_idx == -1:
        print("Could not find modal markers")
        return
        
    modal_replacement = """{/* Edit Modal */}
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
                      Type d'examen
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
                      Aucune réponse. Cliquez sur "Ajouter" pour en créer une.
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
"""
    content = content[:start_m_idx] + modal_replacement + "\n" + content[end_m_idx:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("UI Overhaul complete.")

modify_file()
