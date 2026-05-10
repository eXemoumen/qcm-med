// ============================================================================
// QCM Calc — Grading Engine
// Ported from QCMcalc/app/ConstantineExams/examForm.tsx
// ============================================================================

export type TestType = 'QCSs' | 'allOrNothing' | 'partiallyPositive' | 'partiallyNegative';

export type CorrectAnswerValue = string[] | string[][];
export type CorrectAnswersMap = Record<string, CorrectAnswerValue>;

export type SectionType = 'théorique' | 'clinique';

export interface ExamSection {
  type: SectionType;
  from: number;
  to: number;
  label?: string;
}

export interface SectionScore {
  type: SectionType;
  label: string;
  from: number;
  to: number;
  totalScore: number;
  countedQuestions: number;
  grade: number;
  percentage: number;
}

export interface GradeResult {
  totalScore: number;
  grade: number;
  countedQuestions: number;
  percentage: number;
  sectionScores: SectionScore[];
}

/**
 * Parse a correct answer value into an array of valid answer sets.
 * Handles both flat arrays (["A","B"]) and nested arrays ([["A","B"],["A","C"]]).
 */
export function getAnswerSets(value: CorrectAnswerValue | undefined): string[][] {
  if (!value || !Array.isArray(value) || value.length === 0) return [];

  // If first element is an array, it's already nested: [["A","B"], ["A","C"]]
  if (Array.isArray(value[0])) {
    return value as string[][];
  }

  // Flat array: ["A","B"] → single answer set
  return [value as string[]];
}

/**
 * Check if two answer sets are equal (order-independent).
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Calculate the grade for a QCM exam.
 *
 * @param numQuestions  - Total number of questions
 * @param testType      - Grading mode
 * @param correctAnswers - Map of question number → correct answer(s)
 * @param userAnswers    - Map of question number → user's selected answer(s)
 */
export function calculateQcmGrade(
  numQuestions: number,
  testType: TestType,
  correctAnswers: CorrectAnswersMap,
  userAnswers: Record<number, string[]>,
  sections?: ExamSection[],
): GradeResult {
  let totalScore = 0;
  let countedQuestions = 0;

  for (let i = 1; i <= numQuestions; i++) {
    const correctValue = correctAnswers[String(i)];
    const answerSets = getAnswerSets(correctValue);

    // Skip questions with no correct answers defined (annulled)
    if (answerSets.length === 0) continue;

    countedQuestions++;
    const userAnswer = userAnswers[i] || [];

    // If user didn't answer, score is 0 for this question
    if (userAnswer.length === 0) continue;

    switch (testType) {
      case 'QCSs': {
        // Simple: any single correct answer in any set = 1 point
        let found = false;
        for (const set of answerSets) {
          for (const answer of userAnswer) {
            if (set.includes(answer)) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) totalScore += 1;
        break;
      }

      case 'allOrNothing': {
        // User must exactly match one of the answer sets
        let exactMatch = false;
        for (const set of answerSets) {
          if (arraysEqual(userAnswer, set)) {
            exactMatch = true;
            break;
          }
        }
        if (exactMatch) totalScore += 1;
        break;
      }

      case 'partiallyPositive': {
        // Partial credit: correct/total - wrong/total per set, take max, floor at 0
        let bestScore = 0;
        for (const set of answerSets) {
          const totalInSet = set.length;
          let correctCount = 0;
          let wrongCount = 0;

          for (const answer of userAnswer) {
            if (set.includes(answer)) {
              correctCount++;
            } else {
              wrongCount++;
            }
          }

          const score = Math.max(0, (correctCount - wrongCount) / totalInSet);
          bestScore = Math.max(bestScore, score);
        }
        totalScore += bestScore;
        break;
      }

      case 'partiallyNegative': {
        // Partial credit, but any wrong answer → 0 for that question
        let bestScore = 0;
        for (const set of answerSets) {
          const totalInSet = set.length;
          let correctCount = 0;
          let hasWrong = false;

          for (const answer of userAnswer) {
            if (set.includes(answer)) {
              correctCount++;
            } else {
              hasWrong = true;
              break;
            }
          }

          if (!hasWrong) {
            const score = correctCount / totalInSet;
            bestScore = Math.max(bestScore, score);
          }
        }
        totalScore += bestScore;
        break;
      }
    }
  }

  const grade = countedQuestions > 0 ? (totalScore / countedQuestions) * 20 : 0;
  const percentage = countedQuestions > 0 ? (totalScore / countedQuestions) * 100 : 0;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    grade: Math.round(grade * 100) / 100,
    countedQuestions,
    percentage: Math.round(percentage * 100) / 100,
    sectionScores: computeSectionScores(numQuestions, testType, correctAnswers, userAnswers, sections),
  };
}

/** Compute per-section scores */
function computeSectionScores(
  _numQuestions: number,
  testType: TestType,
  correctAnswers: CorrectAnswersMap,
  userAnswers: Record<number, string[]>,
  sections?: ExamSection[],
): SectionScore[] {
  if (!sections || sections.length === 0) return [];

  return sections.map(section => {
    // Re-use the same grading logic but scoped to this section's range
    const sectionLength = section.to - section.from + 1;
    const subResult = calculateQcmGrade(
      sectionLength,
      testType,
      // Remap keys: Q(section.from) → key "1", etc.
      Object.fromEntries(
        Array.from({ length: sectionLength }, (_, i) => {
          const origKey = String(section.from + i);
          return [String(i + 1), correctAnswers[origKey]];
        }).filter(([, v]) => v !== undefined)
      ),
      // Remap user answers similarly
      Object.fromEntries(
        Array.from({ length: sectionLength }, (_, i) => {
          const origKey = section.from + i;
          return [i + 1, userAnswers[origKey] || []];
        })
      ),
      undefined, // no sub-sections
    );

    return {
      type: section.type,
      label: section.label || SECTION_TYPE_LABELS[section.type],
      from: section.from,
      to: section.to,
      totalScore: subResult.totalScore,
      countedQuestions: subResult.countedQuestions,
      grade: subResult.grade,
      percentage: subResult.percentage,
    };
  });
}

/** Section type display labels */
export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  théorique: 'Théorique',
  clinique: 'Cas Clinique',
};

/** Test type display labels (French) */
export const TEST_TYPE_LABELS: Record<TestType, string> = {
  QCSs: 'QCS — Un seul choix',
  allOrNothing: 'QCM — Multiple choix possible (Tout ou Rien)',
  partiallyPositive: 'QCM — Multiple choix possible (Partiellement Positive)',
  partiallyNegative: 'QCM — Multiple choix possible (Partiellement Négative)',
};

/** Test type explanations for students */
export const TEST_TYPE_DESCRIPTIONS: Record<TestType, string> = {
  QCSs: 'Chaque bonne réponse cochée vaut 1 point.',
  allOrNothing: 'Toutes les bonnes réponses doivent être cochées. Sinon, 0 point.',
  partiallyPositive: 'Crédit partiel: +1 par bonne réponse, -1 par mauvaise. Minimum 0.',
  partiallyNegative: 'Crédit partiel, mais une seule mauvaise réponse = 0 pour la question.',
};
