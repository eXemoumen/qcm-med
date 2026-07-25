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
  const mod = PREDEFINED_MODULES.find(
    (m) => m.name === name && m.year === year
  );
  if (!mod) {
    const yearModules = PREDEFINED_MODULES.filter((m) => m.year === year);
    return {
      valid: false,
      error: `Module "${name}" introuvable pour l'année ${year}. Disponibles : ${yearModules.map((m) => m.name).join(', ')}`,
    };
  }
  return {
    valid: true,
    moduleType: mod.type,
    hasSubDisciplines: mod.hasSubDisciplines,
  };
}

export function validateExamType(
  examType: string,
  moduleType: string
): { valid: boolean; error?: string } {
  const allowed = EXAM_TYPES_BY_MODULE_TYPE[moduleType as keyof typeof EXAM_TYPES_BY_MODULE_TYPE];
  if (!allowed) {
    return { valid: false, error: `Type de module inconnu : ${moduleType}` };
  }
  if (!allowed.includes(examType as any)) {
    return {
      valid: false,
      error: `Type d'examen "${examType}" non valide pour les modules ${moduleType}. Autorisés : ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

export function validateSubDiscipline(
  subDisc: string | undefined | null,
  moduleName: string,
  hasSubDisciplines: boolean
): { valid: boolean; error?: string } {
  if (!hasSubDisciplines) {
    if (subDisc && subDisc.trim()) {
      return { valid: true }; // non-UEI module with sub_discipline is fine, just ignored
    }
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
  if (allowed && !allowed.includes(subDisc)) {
    return {
      valid: false,
      error: `Sous-discipline "${subDisc}" non valide pour "${moduleName}". Autorisées : ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

export function validateAnswers(
  answers: CreateQuestionData['answers']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Check: answers array exists and has minimum count ──
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
    errors.push('Au moins une réponse correcte est requise (aucune réponse marquée is_correct=true)');
  }

  // ── Check: each answer individually ──
  const seenLabels = new Set<string>();
  const seenOrders = new Set<number>();

  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const pos = `Réponse ${i + 1}`;

    // Check option_label exists and is valid
    if (!a.option_label || !a.option_label.trim()) {
      errors.push(`${pos}: option_label est vide ou manquant`);
    } else if (!VALID_OPTION_LABELS.includes(a.option_label as any)) {
      errors.push(`${pos}: option_label "${a.option_label}" invalide. Doit être A, B, C, D ou E`);
    } else if (seenLabels.has(a.option_label)) {
      errors.push(`${pos}: option_label "${a.option_label}" en double (déjà utilisé)`);
    } else {
      seenLabels.add(a.option_label);
    }

    // Check answer_text exists and is not empty/whitespace
    if (!a.answer_text || !a.answer_text.trim()) {
      errors.push(`${pos} (${a.option_label || '?'}): le texte de la réponse est vide ou manquant`);
    } else if (a.answer_text.trim().length < 1) {
      errors.push(`${pos} (${a.option_label || '?'}): le texte de la réponse est trop court`);
    }

    // Check display_order
    if (a.display_order === undefined || a.display_order === null) {
      warnings.push(`${pos} (${a.option_label || '?'}): display_order manquant, sera auto-assigné`);
    } else if (a.display_order < 1 || a.display_order > 5) {
      errors.push(`${pos} (${a.option_label || '?'}): display_order ${a.display_order} invalide (doit être 1-5)`);
    } else if (seenOrders.has(a.display_order)) {
      warnings.push(`${pos} (${a.option_label || '?'}): display_order ${a.display_order} en double`);
    } else {
      seenOrders.add(a.display_order);
    }

    // Check is_correct is a boolean
    if (a.is_correct !== true && a.is_correct !== false) {
      warnings.push(`${pos} (${a.option_label || '?'}): is_correct devrait être true ou false, trouvé : ${a.is_correct}`);
    }
  }

  return { errors, warnings };
}

/**
 * Validates a complete question row-by-row with all field checks.
 * Returns both errors (blocking) and warnings (non-blocking).
 */
export function validateFullQuestion(
  data: CreateQuestionData
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Check: completely empty row (all required fields missing) ──
  const isEmptyRow =
    (!data.year || !data.year.trim()) &&
    (!data.module_name || !data.module_name.trim()) &&
    (!data.question_text || !data.question_text.trim()) &&
    (!data.answers || data.answers.length === 0);

  if (isEmptyRow) {
    errors.push('Ligne vide : tous les champs obligatoires sont manquants');
    return { errors, warnings };
  }

  // ── Year ──
  if (!data.year || !data.year.trim()) {
    errors.push('Année manquante (champ obligatoire)');
  } else if (!['1', '2', '3'].includes(data.year.trim())) {
    errors.push(`Année invalide : "${data.year}". Doit être 1, 2 ou 3`);
  }

  // ── Module name ──
  if (!data.module_name || !data.module_name.trim()) {
    errors.push('Nom du module manquant (champ obligatoire)');
  }

  // ── Exam type ──
  if (!data.exam_type || !data.exam_type.trim()) {
    errors.push('Type d\'examen manquant (champ obligatoire)');
  } else if (!['EMD', 'EMD1', 'EMD2', 'Rattrapage'].includes(data.exam_type.trim())) {
    errors.push(`Type d'examen invalide : "${data.exam_type}". Autorisés : EMD, EMD1, EMD2, Rattrapage`);
  }

  // ── Exam year (promo) ──
  if (!data.exam_year || data.exam_year === 0) {
    errors.push('Année de l\'examen (promo) manquante (champ obligatoire)');
  } else if (data.exam_year < 2000 || data.exam_year > 2100) {
    errors.push(`Année de l'examen invalide : ${data.exam_year}. Doit être entre 2000 et 2100`);
  } else {
    const currentYear = new Date().getFullYear();
    if (data.exam_year > currentYear + 1) {
      warnings.push(`Année de l'examen ${data.exam_year} est dans le futur`);
    }
  }

  // ── Question number ──
  if (!data.number || data.number === 0) {
    errors.push('Numéro de question manquant ou égal à 0 (champ obligatoire)');
  } else if (data.number < 1 || data.number > 500) {
    errors.push(`Numéro de question invalide : ${data.number}. Doit être entre 1 et 500`);
  }

  // ── Question text ──
  if (!data.question_text || !data.question_text.trim()) {
    errors.push('Texte de la question manquant (champ obligatoire)');
  } else if (data.question_text.trim().length < 10) {
    warnings.push(`Texte de la question très court (${data.question_text.trim().length} caractères). Vérifiez le contenu.`);
  }

  // ── Cross-validation: Module + Year + Exam type + Sub-discipline ──
  if (data.year && data.module_name && data.year.trim() && data.module_name.trim()) {
    const moduleVal = validateModuleName(data.module_name.trim(), data.year.trim());
    if (!moduleVal.valid) {
      errors.push(moduleVal.error!);
    } else {
      // Exam type ↔ module type cross-check
      if (data.exam_type && data.exam_type.trim()) {
        const examVal = validateExamType(data.exam_type.trim(), moduleVal.moduleType!);
        if (!examVal.valid) {
          errors.push(examVal.error!);
        }
      }

      // Sub-discipline check for UEI modules
      const subVal = validateSubDiscipline(
        data.sub_discipline,
        data.module_name.trim(),
        moduleVal.hasSubDisciplines!
      );
      if (!subVal.valid) {
        errors.push(subVal.error!);
      }
    }
  }

  // ── Faculty source ──
  if (data.faculty_source && data.faculty_source.trim()) {
    if (!(VALID_FACULTY_SOURCES as readonly string[]).includes(data.faculty_source.trim())) {
      errors.push(`Source invalide : "${data.faculty_source}". Autorisées : ${VALID_FACULTY_SOURCES.join(', ')}`);
    }
  }

  // ── Answers (deep validation) ──
  const answersValidation = validateAnswers(data.answers);
  errors.push(...answersValidation.errors);
  warnings.push(...answersValidation.warnings);

  // ── Optional field warnings ──
  if (!data.explanation || !data.explanation.trim()) {
    warnings.push('Pas d\'explication fournie (recommandé)');
  }

  if (!data.faculty_source || !data.faculty_source.trim()) {
    warnings.push('Source de la question non spécifiée');
  }

  return { errors, warnings };
}

export function getDuplicateKey(q: CreateQuestionData): string {
  return `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}|${q.number}`;
}
