import type { CreateQuestionData } from '@/lib/api/questions';
import type { ImportedQuestion, ImportResult } from '@/types/bulk-import';
import { validateFullQuestion, getDuplicateKey } from './validate-import';
import { parseCorrectAnswers } from './parse-correct-answers';

interface ExportFormatQuestion {
  year?: number | string;
  study_year?: number | string;
  module_name?: string;
  module?: string;
  sub_discipline?: string;
  exam_type?: string;
  exam_year?: number | string;
  number?: number | string;
  question_text?: string;
  cours?: string[];
  speciality?: string;
  unity_name?: string;
  module_type?: string;
  faculty_source?: string;
  explanation?: string;
  answers?: Array<{
    label?: string;
    option_label?: string;
    text?: string;
    answer_text?: string;
    is_correct?: boolean;
    display_order?: number | string;
  }>;
}

interface FlatFormatQuestion {
  year?: string | number;
  module_name?: string;
  sub_discipline?: string;
  exam_type?: string;
  exam_year?: number | string;
  number?: number | string;
  question_text?: string;
  answer_a?: string;
  answer_b?: string;
  answer_c?: string;
  answer_d?: string;
  answer_e?: string;
  correct_answers?: string;
  cours?: string[];
  speciality?: string;
  faculty_source?: string;
  explanation?: string;
}

function isExportFormat(q: Record<string, unknown>): boolean {
  return Array.isArray(q.answers) && q.answers.length > 0 && typeof q.answers[0] === 'object';
}

function isFlatFormat(q: Record<string, unknown>): boolean {
  return 'answer_a' in q || 'answer_b' in q || 'correct_answers' in q;
}

function safeParseInt(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.round(parseFloat(str));
  }
  return parseInt(str, 10) || 0;
}

function buildAnswersFromExport(
  answers: ExportFormatQuestion['answers']
): CreateQuestionData['answers'] {
  if (!answers) return [];
  const labels = ['A', 'B', 'C', 'D', 'E'] as const;
  return answers.map((a, i) => ({
    option_label: (a.option_label || a.label || labels[i]) as 'A' | 'B' | 'C' | 'D' | 'E',
    answer_text: (a.answer_text || a.text || '').trim(),
    is_correct: a.is_correct || false,
    display_order: typeof a.display_order === 'string' ? parseInt(a.display_order) || i + 1 : (a.display_order || i + 1),
  }));
}

function buildAnswersFromFlat(q: FlatFormatQuestion): CreateQuestionData['answers'] {
  const correctLetters = parseCorrectAnswers(q.correct_answers || '');
  const labels = ['A', 'B', 'C', 'D', 'E'] as const;
  const answers: CreateQuestionData['answers'] = [];

  for (let i = 0; i < labels.length; i++) {
    const key = `answer_${labels[i].toLowerCase()}` as keyof FlatFormatQuestion;
    const text = q[key];
    if (text && String(text).trim()) {
      answers.push({
        option_label: labels[i],
        answer_text: String(text).trim(),
        is_correct: correctLetters.includes(labels[i]),
        display_order: i + 1,
      });
    }
  }

  return answers;
}

function normalizeExportQuestion(q: ExportFormatQuestion): CreateQuestionData {
  return {
    year: String(q.year || q.study_year || '').trim(),
    module_name: (q.module_name || q.module || '').trim(),
    sub_discipline: q.sub_discipline ? String(q.sub_discipline).trim() : undefined,
    exam_type: (q.exam_type || '').trim(),
    exam_year: safeParseInt(q.exam_year),
    number: safeParseInt(q.number),
    question_text: (q.question_text || '').trim(),
    speciality: q.speciality || undefined,
    cours: Array.isArray(q.cours) ? q.cours.map(String).filter(Boolean) : undefined,
    faculty_source: q.faculty_source as any || undefined,
    explanation: q.explanation || undefined,
    answers: buildAnswersFromExport(q.answers),
  };
}

function normalizeFlatQuestion(q: FlatFormatQuestion): CreateQuestionData {
  return {
    year: String(q.year || '').trim(),
    module_name: (q.module_name || '').trim(),
    sub_discipline: q.sub_discipline ? String(q.sub_discipline).trim() : undefined,
    exam_type: (q.exam_type || '').trim(),
    exam_year: safeParseInt(q.exam_year),
    number: safeParseInt(q.number),
    question_text: (q.question_text || '').trim(),
    speciality: q.speciality || undefined,
    cours: Array.isArray(q.cours) ? q.cours.map(String).filter(Boolean) : undefined,
    faculty_source: q.faculty_source as any || undefined,
    explanation: q.explanation || undefined,
    answers: buildAnswersFromFlat(q),
  };
}

export function parseJson(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;

        // Check for BOM or encoding issues
        const cleanText = text.replace(/^﻿/, '');

        let raw: unknown;
        try {
          raw = JSON.parse(cleanText);
        } catch (parseErr) {
          // Try to provide helpful error for common JSON issues
          if (cleanText.includes('\\u0000')) {
            reject(new Error('Le fichier contient des caractères null — vérifiez l\'encodage'));
          } else if (cleanText.trim().startsWith('<')) {
            reject(new Error('Le fichier semble être du HTML, pas du JSON'));
          } else {
            reject(new Error('JSON invalide — vérifiez la syntaxe du fichier'));
          }
          return;
        }

        // Accept: { questions: [...] } or [...] (raw array)
        let items: Record<string, unknown>[];
        if (Array.isArray(raw)) {
          items = raw;
        } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const obj = raw as Record<string, unknown>;
          if (Array.isArray(obj.questions)) {
            items = obj.questions as Record<string, unknown>[];
          } else if (Array.isArray(obj.data)) {
            // Also accept { data: [...] } format
            items = obj.data as Record<string, unknown>[];
          } else {
            reject(new Error(
              'Format JSON non reconnu. Attendu : un tableau [...] ou { "questions": [...] } ou { "data": [...] }'
            ));
            return;
          }
        } else {
          reject(new Error('Le JSON doit être un tableau ou un objet'));
          return;
        }

        if (items.length === 0) {
          resolve({
            total: 0,
            valid: 0,
            warnings: 0,
            errors: 0,
            questions: [],
          });
          return;
        }

        // Check first item for format detection
        const firstItem = items[0];
        if (typeof firstItem !== 'object' || firstItem === null) {
          reject(new Error('Chaque élément du tableau doit être un objet'));
          return;
        }

        const questions: ImportedQuestion[] = [];
        const duplicateKeysInFile = new Map<string, number[]>();

        for (let i = 0; i < items.length; i++) {
          const rawRow = items[i];

          // Check: item is an object
          if (typeof rawRow !== 'object' || rawRow === null || Array.isArray(rawRow)) {
            questions.push({
              rowIndex: i,
              status: 'error',
              errors: [`L'élément ${i + 1} n'est pas un objet valide`],
              warnings: [],
              data: { year: '', module_name: '', exam_type: '', exam_year: 0, number: 0, question_text: '', answers: [] },
              rawData: rawRow as Record<string, unknown>,
            });
            continue;
          }

          let questionData: CreateQuestionData;

          if (isExportFormat(rawRow)) {
            questionData = normalizeExportQuestion(rawRow as unknown as ExportFormatQuestion);
          } else if (isFlatFormat(rawRow)) {
            questionData = normalizeFlatQuestion(rawRow as unknown as FlatFormatQuestion);
          } else {
            // Try flat format as fallback
            questionData = normalizeFlatQuestion(rawRow as unknown as FlatFormatQuestion);
          }

          const { errors, warnings } = validateFullQuestion(questionData);

          // Check for numeric parse issues
          const rawObj = rawRow as Record<string, unknown>;
          if (rawObj.exam_year !== undefined && questionData.exam_year === 0) {
            errors.push(`Impossible de parser l'année d'examen : "${rawObj.exam_year}"`);
          }
          if (rawObj.number !== undefined && questionData.number === 0) {
            errors.push(`Impossible de parser le numéro de question : "${rawObj.number}"`);
          }

          // In-file duplicate detection
          if (questionData.year && questionData.module_name && questionData.exam_type && questionData.exam_year && questionData.number) {
            const dupKey = getDuplicateKey(questionData);
            if (!duplicateKeysInFile.has(dupKey)) {
              duplicateKeysInFile.set(dupKey, []);
            }
            duplicateKeysInFile.get(dupKey)!.push(i);
          }

          let status: ImportedQuestion['status'] = 'pending';
          if (errors.length > 0) {
            status = 'error';
          } else if (warnings.length > 0) {
            status = 'warning';
          } else {
            status = 'valid';
          }

          questions.push({
            rowIndex: i,
            status,
            errors,
            warnings,
            data: questionData,
            rawData: rawRow as Record<string, unknown>,
          });
        }

        // Post-pass: flag in-file duplicates
        for (const [dupKey, rowIndices] of duplicateKeysInFile) {
          if (rowIndices.length > 1) {
            for (const idx of rowIndices) {
              const q = questions.find((q) => q.rowIndex === idx);
              if (q) {
                q.warnings.push(
                  `Doublon dans le fichier : même question trouvée aux positions ${rowIndices.map((r) => r + 1).join(', ')}`
                );
                if (q.status === 'valid') {
                  q.status = 'warning';
                }
              }
            }
          }
        }

        const result: ImportResult = {
          total: questions.length,
          valid: questions.filter((q) => q.status === 'valid').length,
          warnings: questions.filter((q) => q.status === 'warning').length,
          errors: questions.filter((q) => q.status === 'error').length,
          questions,
        };

        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsText(file);
  });
}
