import type { CreateQuestionData } from '@/lib/api/questions';
import type { ImportedQuestion, ImportResult } from '@/types/bulk-import';
import { validateFullQuestion } from './validate-import';

interface ExportFormatQuestion {
  year?: number;
  study_year?: number;
  module_name?: string;
  module?: string;
  sub_discipline?: string;
  exam_type?: string;
  exam_year?: number;
  number?: number;
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
    display_order?: number;
  }>;
}

interface FlatFormatQuestion {
  year?: string | number;
  module_name?: string;
  sub_discipline?: string;
  exam_type?: string;
  exam_year?: number;
  number?: number;
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

function parseCorrectAnswers(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const cleaned = raw.replace(/\s/g, '').toUpperCase();
  if (cleaned.includes(',')) {
    return cleaned.split(',').filter((c) => /^[A-E]$/.test(c));
  }
  return cleaned.split('').filter((c) => /^[A-E]$/.test(c));
}

function buildAnswersFromExport(
  answers: ExportFormatQuestion['answers']
): CreateQuestionData['answers'] {
  if (!answers || !Array.isArray(answers)) return [];
  const labels = ['A', 'B', 'C', 'D', 'E'] as const;
  return answers.map((a, i) => {
    // Preserve raw values — let the validator catch empties
    const rawLabel = (a.option_label || a.label || '').toString().trim().toUpperCase();
    const rawText = (a.answer_text || a.text || '').toString().trim();
    return {
      option_label: (rawLabel || labels[i]) as 'A' | 'B' | 'C' | 'D' | 'E',
      answer_text: rawText, // keep empty — validator will catch it
      is_correct: a.is_correct === true, // strict boolean check
      display_order: a.display_order || i + 1,
    };
  });
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
    exam_year: q.exam_year || 0,
    number: q.number || 0,
    question_text: (q.question_text || '').trim(),
    speciality: q.speciality || undefined,
    cours: q.cours || undefined,
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
    exam_year: q.exam_year || 0,
    number: q.number || 0,
    question_text: (q.question_text || '').trim(),
    speciality: q.speciality || undefined,
    cours: q.cours || undefined,
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
        const raw = JSON.parse(text);

        // Accept: { questions: [...] } or [...] (raw array)
        let items: Record<string, unknown>[];
        if (Array.isArray(raw)) {
          items = raw;
        } else if (raw && typeof raw === 'object' && Array.isArray(raw.questions)) {
          items = raw.questions;
        } else {
          reject(new Error('Invalid JSON format. Expected an array or { questions: [...] }'));
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

        const questions: ImportedQuestion[] = [];

        for (let i = 0; i < items.length; i++) {
          const rawRow = items[i];
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
            rawData: rawRow,
          });
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

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
