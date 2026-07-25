import { PREDEFINED_MODULES, PREDEFINED_SUBDISCIPLINES } from '@/lib/predefined-modules';
import { EXAM_TYPES_BY_MODULE_TYPE } from '@/lib/constants';
import type { CreateQuestionData } from '@/lib/api/questions';

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
      error: `Module "${name}" not found for year ${year}. Available: ${yearModules.map((m) => m.name).join(', ')}`,
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
    return { valid: false, error: `Unknown module type: ${moduleType}` };
  }
  if (!allowed.includes(examType as any)) {
    return {
      valid: false,
      error: `Exam type "${examType}" not valid for ${moduleType} modules. Allowed: ${allowed.join(', ')}`,
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
      error: `Sub-discipline is required for UEI module "${moduleName}"`,
    };
  }
  const allowed = PREDEFINED_SUBDISCIPLINES[moduleName];
  if (allowed && !allowed.includes(subDisc)) {
    return {
      valid: false,
      error: `Sub-discipline "${subDisc}" not valid for "${moduleName}". Allowed: ${allowed.join(', ')}`,
    };
  }
  return { valid: true };
}

export function validateAnswers(
  answers: CreateQuestionData['answers']
): { valid: boolean; error?: string } {
  if (!answers || answers.length < 2) {
    return { valid: false, error: 'At least 2 answers required' };
  }
  if (answers.length > 5) {
    return { valid: false, error: 'Maximum 5 answers allowed' };
  }
  const hasCorrect = answers.some((a) => a.is_correct);
  if (!hasCorrect) {
    return { valid: false, error: 'At least one correct answer required' };
  }
  return { valid: true };
}

export function validateFullQuestion(
  data: CreateQuestionData
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Year
  if (!['1', '2', '3'].includes(data.year)) {
    errors.push(`Invalid year: "${data.year}". Must be 1, 2, or 3`);
  }

  // Module name
  if (!data.module_name || !data.module_name.trim()) {
    errors.push('Module name is required');
  }

  // Exam type
  if (!['EMD', 'EMD1', 'EMD2', 'Rattrapage'].includes(data.exam_type)) {
    errors.push(`Invalid exam type: "${data.exam_type}"`);
  }

  // Exam year
  if (!data.exam_year || data.exam_year < 2000 || data.exam_year > 2100) {
    errors.push(`Invalid exam year: ${data.exam_year}`);
  }

  // Number
  if (!data.number || data.number < 1 || data.number > 500) {
    errors.push(`Invalid question number: ${data.number}`);
  }

  // Question text
  if (!data.question_text || !data.question_text.trim()) {
    errors.push('Question text is required');
  }

  // Module validation (if we have enough data)
  if (data.year && data.module_name) {
    const moduleVal = validateModuleName(data.module_name, data.year);
    if (!moduleVal.valid) {
      errors.push(moduleVal.error!);
    } else {
      // Exam type check
      const examVal = validateExamType(data.exam_type, moduleVal.moduleType!);
      if (!examVal.valid) {
        errors.push(examVal.error!);
      }

      // Sub-discipline check
      const subVal = validateSubDiscipline(
        data.sub_discipline,
        data.module_name,
        moduleVal.hasSubDisciplines!
      );
      if (!subVal.valid) {
        errors.push(subVal.error!);
      }
    }
  }

  // Answers
  const answersVal = validateAnswers(data.answers);
  if (!answersVal.valid) {
    errors.push(answersVal.error!);
  }

  return { errors, warnings };
}

export function getDuplicateKey(q: CreateQuestionData): string {
  return `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}`;
}
