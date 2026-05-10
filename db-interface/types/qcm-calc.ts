// ============================================================================
// QCM Calc Feature — TypeScript Types
// ============================================================================

export type TestType = 'QCSs' | 'allOrNothing' | 'partiallyPositive' | 'partiallyNegative';
export type ExamSession = 'EMD' | 'Rattrapage';
export type ExamKind = 'Théorique' | 'Clinique';
export type SectionType = 'théorique' | 'clinique';

/** Defines a contiguous range of questions of a specific type within an exam */
export interface ExamSection {
  type: SectionType;
  from: number;
  to: number;
  label?: string; // optional custom label, e.g. "Cas Clinique 1"
}

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  théorique: 'Théorique',
  clinique: 'Cas Clinique',
};

// Correct answers format:
// Single correct: ["A"]
// Multiple correct (all required): ["A", "C"]
// Alternative sets (any valid): [["A","B"], ["A","C"]]
export type CorrectAnswerValue = string[] | string[][];
export type CorrectAnswersMap = Record<string, CorrectAnswerValue>;

/** Row type from qcm_exams table */
export interface QcmExam {
  id: string;
  name: string;
  description: string;
  speciality: string;
  grade: string;
  year: string;
  subject: string;
  num_questions: number;
  test_type: TestType;
  correct_answers: CorrectAnswersMap;
  session: ExamSession;
  rotation: string | null;
  exam_type: ExamKind;
  sections: ExamSection[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Form data used by the admin create/edit form */
export interface QcmExamFormData {
  name: string;
  description: string;
  speciality: string;
  grade: string;
  year: string;
  subject: string;
  num_questions: number;
  test_type: TestType;
  correct_answers: Record<number, string[] | string[][]>;
  session: ExamSession;
  rotation: string;
  exam_type: ExamKind;
  sections: ExamSection[];
}

/** Filter options used in list views */
export interface QcmExamFilters {
  speciality?: string;
  grade?: string;
  year?: string;
  subject?: string;
  session?: string;
}

// Test type display labels (French)
export const TEST_TYPE_LABELS: Record<TestType, string> = {
  QCSs: 'QCS — Un seul choix',
  allOrNothing: 'QCM — Multiple choix possible (Tout ou Rien)',
  partiallyPositive: 'QCM — Multiple choix possible (Partiellement Positive)',
  partiallyNegative: 'QCM — Multiple choix possible (Partiellement Négative)',
};

export const TEST_TYPE_OPTIONS: { value: TestType; label: string }[] = [
  { value: 'QCSs', label: 'QCS — Un seul choix' },
  { value: 'allOrNothing', label: 'QCM — Tout ou Rien' },
  { value: 'partiallyPositive', label: 'QCM — Partiellement Positive' },
  { value: 'partiallyNegative', label: 'QCM — Partiellement Négative' },
];

export const SESSION_OPTIONS: { value: ExamSession; label: string }[] = [
  { value: 'EMD', label: 'EMD' },
  { value: 'Rattrapage', label: 'Rattrapage' },
];

export const EXAM_KIND_OPTIONS: { value: ExamKind; label: string }[] = [
  { value: 'Théorique', label: 'Théorique' },
  { value: 'Clinique', label: 'Clinique' },
];

export const GRADE_OPTIONS = [
  '1ère année',
  '2ème année',
  '3ème année',
  '4ème année',
  '5ème année',
  '6ème année',
];

export const SPECIALITY_OPTIONS = [
  'Médecine',
  'Pharmacie',
  'Chirurgie Dentaire',
];
