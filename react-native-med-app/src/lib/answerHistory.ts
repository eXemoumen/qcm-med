// ============================================================================
// Question Answer History — Local Storage
// Tracks per-question answer results (correct/wrong) using AsyncStorage
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'question_answer_history'

// ============================================================================
// Types
// ============================================================================

export interface QuestionResult {
  /** The question ID (UUID) */
  questionId: string
  /** Whether the user answered correctly */
  isCorrect: boolean
  /** Timestamp of the last attempt */
  lastAttemptAt: string
  /** Number of times attempted */
  attemptCount: number
}

export type AnswerFilter = 'all' | 'correct' | 'wrong' | 'unanswered'

// ============================================================================
// Storage Operations
// ============================================================================

/**
 * Get the full answer history map from local storage.
 * Returns a map of questionId → QuestionResult.
 */
async function getHistoryMap(): Promise<Record<string, QuestionResult>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/**
 * Persist the history map to local storage.
 */
async function saveHistoryMap(
  map: Record<string, QuestionResult>
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (error) {
    if (__DEV__) {
      console.error('[AnswerHistory] Failed to save:', error)
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Record the results of a batch of answered questions (called after practice).
 * Updates existing entries (incrementing attempt count, updating correctness).
 */
export async function recordAnswerResults(
  results: { questionId: string; isCorrect: boolean }[]
): Promise<void> {
  const map = await getHistoryMap()
  const now = new Date().toISOString()

  for (const result of results) {
    const existing = map[result.questionId]
    map[result.questionId] = {
      questionId: result.questionId,
      isCorrect: result.isCorrect,
      lastAttemptAt: now,
      attemptCount: existing ? existing.attemptCount + 1 : 1,
    }
  }

  await saveHistoryMap(map)
}

/**
 * Get the answer result for a single question.
 * Returns null if the question has never been answered.
 */
export async function getQuestionResult(
  questionId: string
): Promise<QuestionResult | null> {
  const map = await getHistoryMap()
  return map[questionId] || null
}

/**
 * Get results for multiple question IDs at once.
 * Returns a map of questionId → QuestionResult (only for questions with history).
 */
export async function getQuestionResults(
  questionIds: string[]
): Promise<Record<string, QuestionResult>> {
  const map = await getHistoryMap()
  const results: Record<string, QuestionResult> = {}

  for (const id of questionIds) {
    if (map[id]) {
      results[id] = map[id]
    }
  }

  return results
}

/**
 * Filter question IDs based on answer history.
 */
export function filterByAnswerStatus(
  questionIds: string[],
  history: Record<string, QuestionResult>,
  filter: AnswerFilter
): string[] {
  switch (filter) {
    case 'all':
      return questionIds
    case 'correct':
      return questionIds.filter((id) => history[id]?.isCorrect === true)
    case 'wrong':
      return questionIds.filter((id) => history[id]?.isCorrect === false)
    case 'unanswered':
      return questionIds.filter((id) => !history[id])
    default:
      return questionIds
  }
}

/**
 * Get counts for each filter category.
 */
export function getFilterCounts(
  questionIds: string[],
  history: Record<string, QuestionResult>
): Record<AnswerFilter, number> {
  let correct = 0
  let wrong = 0
  let unanswered = 0

  for (const id of questionIds) {
    const result = history[id]
    if (!result) {
      unanswered++
    } else if (result.isCorrect) {
      correct++
    } else {
      wrong++
    }
  }

  return {
    all: questionIds.length,
    correct,
    wrong,
    unanswered,
  }
}

/**
 * Clear all answer history (useful for testing or account reset).
 */
export async function clearAnswerHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    if (__DEV__) {
      console.error('[AnswerHistory] Failed to clear:', error)
    }
  }
}
