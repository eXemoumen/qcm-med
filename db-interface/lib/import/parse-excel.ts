import * as XLSX from 'xlsx';
import type { CreateQuestionData } from '@/lib/api/questions';
import type { ImportedQuestion, ImportResult } from '@/types/bulk-import';
import { validateFullQuestion, getDuplicateKey } from './validate-import';

const HEADER_MAP: Record<string, keyof CreateQuestionData | 'answer_a' | 'answer_b' | 'answer_c' | 'answer_d' | 'answer_e' | 'correct_answers'> = {
  'année': 'year',
  'year': 'year',
  'module': 'module_name',
  'module_name': 'module_name',
  'sous_discipline': 'sub_discipline',
  'sub_discipline': 'sub_discipline',
  "type_examen": 'exam_type',
  'exam_type': 'exam_type',
  'promo': 'exam_year',
  'exam_year': 'exam_year',
  'numéro': 'number',
  'number': 'number',
  'question': 'question_text',
  'question_text': 'question_text',
  'réponse_a': 'answer_a',
  'reponse_a': 'answer_a',
  'answer_a': 'answer_a',
  'réponse_b': 'answer_b',
  'reponse_b': 'answer_b',
  'answer_b': 'answer_b',
  'réponse_c': 'answer_c',
  'reponse_c': 'answer_c',
  'answer_c': 'answer_c',
  'réponse_d': 'answer_d',
  'reponse_d': 'answer_d',
  'answer_d': 'answer_d',
  'réponse_e': 'answer_e',
  'reponse_e': 'answer_e',
  'answer_e': 'answer_e',
  'réponses_correctes': 'correct_answers',
  'reponses_correctes': 'correct_answers',
  'correct_answers': 'correct_answers',
  'cours': 'cours',
  'source': 'faculty_source',
  'faculty_source': 'faculty_source',
  'explication': 'explanation',
  'explanation': 'explanation',
  'spécialité': 'speciality',
  'specialite': 'speciality',
  'speciality': 'speciality',
};

function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function mapHeader(raw: string): string | null {
  const normalized = normalizeHeader(raw);
  if (HEADER_MAP[normalized]) return HEADER_MAP[normalized];
  const stripped = normalized.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
  if (HEADER_MAP[stripped]) return HEADER_MAP[stripped];
  for (const [key, value] of Object.entries(HEADER_MAP)) {
    if (normalizeHeader(key) === normalized) return value;
  }
  return null;
}

function parseCorrectAnswers(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const cleaned = raw.replace(/\s/g, '').toUpperCase();
  if (cleaned.length <= 5 && /^[A-E,]+$/.test(cleaned)) {
    if (cleaned.includes(',')) {
      return cleaned.split(',').filter((c) => /^[A-E]$/.test(c));
    }
    return cleaned.split('').filter((c) => /^[A-E]$/.test(c));
  }
  return [];
}

function parseCours(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  // Handle mixed delimiters: semicolons, commas, or both
  const normalized = raw.replace(/[,;]/g, ';');
  return normalized.split(';').map((s) => s.trim()).filter(Boolean);
}

function safeParseInt(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  // Handle "1.0" → 1, "3.00" → 3
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.round(parseFloat(str));
  }
  return parseInt(str, 10) || 0;
}

function isRowEmpty(mapped: Record<string, unknown>): boolean {
  const required = ['year', 'module_name', 'exam_type', 'exam_year', 'number', 'question_text'];
  return required.every((key) => {
    const val = mapped[key];
    return val === undefined || val === null || String(val).trim() === '';
  });
}

function buildAnswers(
  rawRow: Record<string, unknown>,
  correctLetters: string[]
): CreateQuestionData['answers'] {
  const labels = ['A', 'B', 'C', 'D', 'E'] as const;
  const answers: CreateQuestionData['answers'] = [];

  for (let i = 0; i < labels.length; i++) {
    const key = `answer_${labels[i].toLowerCase()}`;
    const text = rawRow[key];
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

export function parseExcel(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });

        // Find the Questions sheet (skip Instructions/Modules)
        const skipSheets = ['instructions', 'modules', 'guide', 'aide'];
        const sheetName = workbook.SheetNames.find(
          (name) => {
            const lower = name.toLowerCase();
            return lower.includes('question');
          }
        ) || workbook.SheetNames.find(
          (name) => !skipSheets.includes(name.toLowerCase())
        ) || workbook.SheetNames[0];

        if (!sheetName) {
          reject(new Error('Aucune feuille trouvée dans le fichier Excel'));
          return;
        }

        // Warn if multiple question-like sheets exist
        const questionSheets = workbook.SheetNames.filter((n) => n.toLowerCase().includes('question'));
        if (questionSheets.length > 1) {
          // Just use the first one, but note it
        }

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          reject(new Error(`Feuille "${sheetName}" introuvable`));
          return;
        }

        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
          raw: false,
          blankrows: false,
        });

        if (jsonData.length === 0) {
          resolve({
            total: 0,
            valid: 0,
            warnings: 0,
            errors: 0,
            questions: [],
          });
          return;
        }

        // ── Map headers ──
        const headers = Object.keys(jsonData[0]);
        const columnMap: Record<string, string> = {};
        const unmappedHeaders: string[] = [];

        for (const header of headers) {
          const mapped = mapHeader(header);
          if (mapped) {
            columnMap[header] = mapped;
          } else if (header.trim()) {
            unmappedHeaders.push(header);
          }
        }

        // Check: no recognized headers at all
        if (Object.keys(columnMap).length === 0) {
          reject(new Error(
            `Aucun en-tête reconnu. En-têtes trouvés : ${headers.join(', ')}. ` +
            `Utilisez le template pour garantir la compatibilité.`
          ));
          return;
        }

        // Check: critical headers missing
        const requiredHeaders = ['year', 'module_name', 'question_text'];
        const mappedHeaders = new Set(Object.values(columnMap));
        const missingCritical = requiredHeaders.filter((h) => !mappedHeaders.has(h));

        // ── Parse each row ──
        const questions: ImportedQuestion[] = [];
        const duplicateKeysInFile = new Map<string, number[]>(); // key → row indices

        for (let i = 0; i < jsonData.length; i++) {
          const rawRow = jsonData[i];
          const mapped: Record<string, unknown> = {};

          for (const [header, fieldName] of Object.entries(columnMap)) {
            mapped[fieldName] = rawRow[header];
          }

          // Skip completely empty rows
          if (isRowEmpty(mapped)) {
            continue;
          }

          // ── Build CreateQuestionData with safe parsing ──
          const year = String(mapped.year || '').trim();
          const moduleName = String(mapped.module_name || '').trim();
          const examType = String(mapped.exam_type || '').trim();
          const examYear = safeParseInt(mapped.exam_year);
          const number = safeParseInt(mapped.number);
          const questionText = String(mapped.question_text || '').trim();
          const correctLetters = parseCorrectAnswers(String(mapped.correct_answers || ''));
          const answers = buildAnswers(mapped, correctLetters);

          // Detect mixed delimiters in cours
          const rawCours = String(mapped.cours || '');
          const hasMixedDelimiters = rawCours.includes(',') && rawCours.includes(';');

          const questionData: CreateQuestionData = {
            year,
            module_name: moduleName,
            sub_discipline: mapped.sub_discipline ? String(mapped.sub_discipline).trim() : undefined,
            exam_type: examType,
            exam_year: examYear,
            number,
            question_text: questionText,
            speciality: mapped.speciality ? String(mapped.speciality).trim() : undefined,
            cours: rawCours.trim() ? parseCours(rawCours) : undefined,
            faculty_source: mapped.faculty_source ? String(mapped.faculty_source).trim() as any : undefined,
            explanation: mapped.explanation ? String(mapped.explanation).trim() : undefined,
            answers,
          };

          // ── Validate ──
          const { errors, warnings } = validateFullQuestion(questionData);

          // Add file-level warnings
          if (hasMixedDelimiters) {
            warnings.push('Le champ "cours" contient des délimiteurs mixtes (virgules et points-virgules)');
          }

          // Check for numeric parse issues
          if (mapped.exam_year && examYear === 0) {
            errors.push(`Impossible de parser l'année d'examen : "${mapped.exam_year}"`);
          }
          if (mapped.number && number === 0) {
            errors.push(`Impossible de parser le numéro de question : "${mapped.number}"`);
          }

          // Check for unmapped critical headers
          if (i === 0 && missingCritical.length > 0) {
            warnings.push(`Colonnes critiques non reconnues : ${missingCritical.join(', ')} — utilisez le template`);
          }

          // Check for unrecognized headers
          if (i === 0 && unmappedHeaders.length > 0) {
            warnings.push(`Colonnes ignorées : ${unmappedHeaders.join(', ')}`);
          }

          // ── In-file duplicate detection ──
          if (year && moduleName && examType && examYear && number) {
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

        // ── Post-pass: flag in-file duplicates as warnings ──
        for (const [dupKey, rowIndices] of duplicateKeysInFile) {
          if (rowIndices.length > 1) {
            for (const idx of rowIndices) {
              const q = questions.find((q) => q.rowIndex === idx);
              if (q) {
                q.warnings.push(
                  `Doublon dans le fichier : même question trouvée aux lignes ${rowIndices.map((r) => r + 1).join(', ')}`
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
      } catch (err: any) {
        // Provide helpful error messages for common parse failures
        if (err.message?.includes('Corrupt') || err.message?.includes('bad file')) {
          reject(new Error('Le fichier semble corrompu ou n\'est pas un fichier Excel valide'));
        } else if (err.message?.includes('Password')) {
          reject(new Error('Le fichier est protégé par un mot de passe'));
        } else {
          reject(err);
        }
      }
    };

    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsArrayBuffer(file);
  });
}
