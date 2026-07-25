import { PREDEFINED_MODULES, PREDEFINED_SUBDISCIPLINES } from '@/lib/predefined-modules';
import { EXAM_TYPES_BY_MODULE_TYPE } from '@/lib/constants';
import type { CreateQuestionData } from '@/lib/api/questions';

const VALID_FACULTY_SOURCES = [
  'fac_mere',
  'annexe_biskra',
  'annexe_oum_el_bouaghi',
  'annexe_khenchela',
  'annexe_souk_ahras',
] as const;

const VALID_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const MAX_QUESTION_TEXT_LENGTH = 10000;
const MAX_ANSWER_TEXT_LENGTH = 10000;

// ── Fuzzy match: Levenshtein distance for module name suggestions ──
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function suggestModuleName(name: string, year: string): string | null {
  const yearModules = PREDEFINED_MODULES.filter((m) => m.year === year);
  let bestMatch: string | null = null;
  let bestDist = Infinity;
  for (const mod of yearModules) {
    const dist = levenshtein(name.toLowerCase(), mod.name.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      bestMatch = mod.name;
    }
  }
  return bestMatch;
}

// ── Module validation ──
interface ModuleValidation {
  valid: boolean;
  moduleType?: string;
  hasSubDisciplines?: boolean;
  error?: string;
}

export function validateModuleName(
  name: string,
  year: string
): ModuleValidation {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Nom du module manquant' };
  }
  const trimmed = name.trim();
  const mod = PREDEFINED_MODULES.find(
    (m) => m.name === trimmed && m.year === year
  );
  if (!mod) {
    const yearModules = PREDEFINED_MODULES.filter((m) => m.year === year);
    const suggestion = suggestModuleName(trimmed, year);
    const suggestionText = suggestion ? ` — Vouliez-vous dire "${suggestion}" ?` : '';
    return {
      valid: false,
      error: `Module "${trimmed}" introuvable pour l'année ${year}. Disponibles : ${yearModules.map((m) => m.name).join(', ')}${suggestionText}`,
    };
  }
  return {
    valid: true,
    moduleType: mod.type,
    hasSubDisciplines: mod.hasSubDisciplines,
  };
}

// ── Exam type validation ──
export function validateExamType(
  examType: string,
  moduleType: string
): { valid: boolean; error?: string } {
  if (!examType || !examType.trim()) {
    return { valid: false, error: 'Type d\'examen manquant' };
  }
  const allowed = EXAM_TYPES_BY_MODULE_TYPE[moduleType as keyof typeof EXAM_TYPES_BY_MODULE_TYPE];
  if (!allowed) {
    return { valid: false, error: `Type de module inconnu : ${moduleType}` };
  }
  if (!allowed.includes(examType.trim() as any)) {
    return {
      valid: false,
      error: `Type d'examen "${examType}" non valide pour les modules ${moduleType}. Autorisés : ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

// ── Sub-discipline validation ──
export function validateSubDiscipline(
  subDisc: string | undefined | null,
  moduleName: string,
  hasSubDisciplines: boolean
): { valid: boolean; error?: string } {
  if (!hasSubDisciplines) {
    return { valid: true };
  }
  // UEI module — sub_discipline is required
  if (!subDisc || !subDisc.trim()) {
    return {
      valid: false,
      error: `La sous-discipline est requise pour le module UEI "${moduleName}"`,
    };
  }
  const allowed = PREDEFINED_SUBDISCIPLINES[moduleName];
  if (allowed && !allowed.includes(subDisc.trim())) {
    return {
      valid: false,
      error: `Sous-discipline "${subDisc}" non valide pour "${moduleName}". Autorisées : ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

// ── Deep answer validation ──
export function validateAnswers(
  answers: CreateQuestionData['answers']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!answers || !Array.isArray(answers)) {
    errors.push('Le champ "answers" est manquant ou invalide');
    return { errors, warnings };
  }

  if (answers.length < 2) {
    errors.push(`Minimum 2 réponses requises (trouvé : ${answers.length})`);
    return { errors, warnings };
  }

  if (answers.length > 5) {
    errors.push(`Maximum 5 réponses autorisées (trouvé : ${answers.length})`);
  }

  // ── Check: at least one correct answer ──
  const hasCorrect = answers.some((a) => a.is_correct === true);
  if (!hasCorrect) {
    errors.push('Au moins une réponse correcte est requise');
  }

  // ── Check each answer individually ──
  const seenLabels = new Set<string>();
  const seenOrders = new Set<number>();
  const labelsWithText = new Set<string>();

  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const pos = `Réponse ${i + 1}`;

    // option_label check
    if (!a.option_label || !String(a.option_label).trim()) {
      errors.push(`${pos}: option_label est vide ou manquant`);
    } else if (!VALID_OPTION_LABELS.includes(a.option_label as any)) {
      errors.push(`${pos}: option_label "${a.option_label}" invalide. Doit être A, B, C, D ou E`);
    } else if (seenLabels.has(a.option_label)) {
      errors.push(`${pos}: option_label "${a.option_label}" en double`);
    } else {
      seenLabels.add(a.option_label);
    }

    // answer_text check
    if (!a.answer_text || !String(a.answer_text).trim()) {
      errors.push(`${pos} (${a.option_label || '?'}): le texte de la réponse est vide`);
    } else {
      const text = String(a.answer_text).trim();
      if (text.length > MAX_ANSWER_TEXT_LENGTH) {
        errors.push(`${pos} (${a.option_label}): texte trop long (${text.length} > ${MAX_ANSWER_TEXT_LENGTH})`);
      }
      if (a.option_label) labelsWithText.add(a.option_label);
    }

    // display_order check
    if (a.display_order === undefined || a.display_order === null) {
      warnings.push(`${pos} (${a.option_label || '?'}): display_order manquant`);
    } else if (a.display_order < 1 || a.display_order > 5) {
      errors.push(`${pos} (${a.option_label || '?'}): display_order ${a.display_order} invalide (1-5)`);
    } else if (seenOrders.has(a.display_order)) {
      warnings.push(`${pos} (${a.option_label || '?'}): display_order ${a.display_order} en double`);
    } else {
      seenOrders.add(a.display_order);
    }

    // is_correct type check
    if (a.is_correct !== true && a.is_correct !== false) {
      warnings.push(`${pos} (${a.option_label || '?'}): is_correct devrait être true ou false`);
    }
  }

  // ── Cross-check: correct answers reference options with text ──
  const correctLabels = answers.filter((a) => a.is_correct).map((a) => a.option_label);
  for (const label of correctLabels) {
    if (!labelsWithText.has(label)) {
      errors.push(`Réponse ${label} marquée correcte mais son texte est vide ou manquante`);
    }
  }

  return { errors, warnings };
}

// ── Full question validation ──
export function validateFullQuestion(
  data: CreateQuestionData
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Empty row detection ──
  const isEmptyRow =
    (!data.year || !String(data.year).trim()) &&
    (!data.module_name || !String(data.module_name).trim()) &&
    (!data.question_text || !String(data.question_text).trim()) &&
    (!data.answers || data.answers.length === 0);

  if (isEmptyRow) {
    errors.push('Ligne vide : tous les champs obligatoires sont manquants');
    return { errors, warnings };
  }

  // ── Year ──
  const year = String(data.year || '').trim();
  if (!year) {
    errors.push('Année manquante (champ obligatoire)');
  } else if (!['1', '2', '3'].includes(year)) {
    errors.push(`Année invalide : "${data.year}". Doit être 1, 2 ou 3`);
    // Check if it looks like a common mistake
    if (/^[0-9]+$/.test(year)) {
      const num = parseInt(year);
      if (num >= 4 && num <= 10) {
        warnings.push(`L'année "${year}" existe-t-elle ? Les années valides sont 1, 2, 3`);
      }
    }
  }

  // ── Module name ──
  const moduleName = String(data.module_name || '').trim();
  if (!moduleName) {
    errors.push('Nom du module manquant (champ obligatoire)');
  } else if (moduleName.length > 200) {
    errors.push(`Nom du module trop long (${moduleName.length} > 200 caractères)`);
  }

  // ── Exam type ──
  const examType = String(data.exam_type || '').trim();
  if (!examType) {
    errors.push('Type d\'examen manquant (champ obligatoire)');
  } else if (!['EMD', 'EMD1', 'EMD2', 'Rattrapage'].includes(examType)) {
    errors.push(`Type d'examen invalide : "${data.exam_type}". Autorisés : EMD, EMD1, EMD2, Rattrapage`);
    // Check common mistakes
    const upper = examType.toUpperCase();
    if (upper === 'EMD3') {
      warnings.push('EMD3 n\'existe pas. Vouliez-vous dire EMD1 ou EMD2 ?');
    }
  }

  // ── Exam year (promo) ──
  const examYear = Number(data.exam_year);
  if (!data.exam_year || examYear === 0 || isNaN(examYear)) {
    errors.push('Année de l\'examen (promo) manquante (champ obligatoire)');
  } else if (!Number.isInteger(examYear)) {
    errors.push(`Année de l'examen doit être un entier (trouvé : ${data.exam_year})`);
  } else if (examYear < 2000 || examYear > 2100) {
    errors.push(`Année de l'examen invalide : ${examYear}. Doit être entre 2000 et 2100`);
  } else {
    const currentYear = new Date().getFullYear();
    if (examYear > currentYear + 2) {
      warnings.push(`Année de l'examen ${examYear} est dans le futur lointain`);
    }
    if (examYear < 2010) {
      warnings.push(`Année de l'examen ${examYear} est très ancienne`);
    }
  }

  // ── Question number ──
  const number = Number(data.number);
  if (!data.number || number === 0 || isNaN(number)) {
    errors.push('Numéro de question manquant ou égal à 0');
  } else if (!Number.isInteger(number)) {
    errors.push(`Numéro de question doit être un entier (trouvé : ${data.number})`);
  } else if (number < 1 || number > 500) {
    errors.push(`Numéro de question invalide : ${number}. Doit être entre 1 et 500`);
  }

  // ── Question text ──
  const questionText = String(data.question_text || '').trim();
  if (!questionText) {
    errors.push('Texte de la question manquant (champ obligatoire)');
  } else {
    if (questionText.length < 10) {
      warnings.push(`Texte de la question très court (${questionText.length} caractères). Vérifiez le contenu.`);
    }
    if (questionText.length > MAX_QUESTION_TEXT_LENGTH) {
      errors.push(`Texte de la question trop long (${questionText.length} > ${MAX_QUESTION_TEXT_LENGTH})`);
    }
    // Check for garbled text (common in bad CSV encoding)
    if (/[^\x20-\x7EÀ-ɏ؀-ۿЀ-ӿ\s\n\r.,;:!?()\-'"éèêëàâäùûüôöîïçœæ]/.test(questionText)) {
      warnings.push('Le texte contient des caractères inhabituels — vérifiez l\'encodage du fichier');
    }
  }

  // ── Cross-validation: Module + Year + Exam type + Sub-discipline ──
  if (year && moduleName && ['1', '2', '3'].includes(year)) {
    const moduleVal = validateModuleName(moduleName, year);
    if (!moduleVal.valid) {
      errors.push(moduleVal.error!);
    } else {
      // Exam type ↔ module type cross-check
      if (examType && ['EMD', 'EMD1', 'EMD2', 'Rattrapage'].includes(examType)) {
        const examVal = validateExamType(examType, moduleVal.moduleType!);
        if (!examVal.valid) {
          errors.push(examVal.error!);
        }
      }

      // Sub-discipline check for UEI modules
      const subVal = validateSubDiscipline(
        data.sub_discipline,
        moduleName,
        moduleVal.hasSubDisciplines!
      );
      if (!subVal.valid) {
        errors.push(subVal.error!);
      }
    }
  }

  // ── Speciality ──
  const speciality = String(data.speciality || '').trim();
  if (speciality && !['Médecine', 'Pharmacie', 'Dentaire'].includes(speciality)) {
    warnings.push(`Spécialité "${speciality}" non reconnue. Valeurs attendues : Médecine, Pharmacie, Dentaire`);
  }

  // ── Faculty source ──
  const facultySource = String(data.faculty_source || '').trim();
  if (facultySource) {
    if (!(VALID_FACULTY_SOURCES as readonly string[]).includes(facultySource as any)) {
      errors.push(`Source invalide : "${facultySource}". Autorisées : ${VALID_FACULTY_SOURCES.join(', ')}`);
    }
  }

  // ── Cours validation ──
  if (data.cours && Array.isArray(data.cours)) {
    for (const c of data.cours) {
      const coursName = String(c || '').trim();
      if (!coursName) {
        warnings.push('Un nom de cours vide détecté dans la liste des cours');
      } else if (coursName.length > 200) {
        errors.push(`Nom de cours trop long : "${coursName.substring(0, 50)}..." (${coursName.length} > 200)`);
      }
    }
    // Check for duplicates in cours list
    const uniqueCours = new Set(data.cours.map((c) => String(c || '').trim().toLowerCase()));
    if (uniqueCours.size < data.cours.length) {
      warnings.push('Doublons détectés dans la liste des cours');
    }
  }

  // ── Answers (deep validation) ──
  const answersValidation = validateAnswers(data.answers);
  errors.push(...answersValidation.errors);
  warnings.push(...answersValidation.warnings);

  // ── Soft warnings for missing optional fields ──
  if (!data.explanation || !String(data.explanation).trim()) {
    warnings.push('Pas d\'explication fournie (recommandé)');
  }
  if (!data.faculty_source || !facultySource) {
    warnings.push('Source de la question non spécifiée');
  }

  return { errors, warnings };
}

// ── Duplicate key generation ──
export function getDuplicateKey(q: CreateQuestionData): string {
  return `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}|${q.number}`;
}

// ── Fuzzy module name suggestion (exported for use in parse-excel) ──
export { suggestModuleName };
