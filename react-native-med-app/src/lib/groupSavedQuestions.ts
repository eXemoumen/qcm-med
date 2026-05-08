// ============================================================================
// Saved Questions Grouping Utility
// Groups a flat list of questions into a hierarchical folder structure:
//   Module → Sub-discipline → Year+ExamType → Questions
// ============================================================================

import { QuestionWithAnswers } from '@/types'

// ============================================================================
// Types
// ============================================================================

export interface FolderNode {
  /** Display name for the folder */
  name: string
  /** Total question count (recursive) */
  count: number
  /** Child folders keyed by name */
  children: Map<string, FolderNode>
  /** Questions at this leaf level */
  questions: QuestionWithAnswers[]
}

/** Breadcrumb segment for navigation */
export interface BreadcrumbSegment {
  label: string
  pathIndex: number
}

// ============================================================================
// Grouping Logic
// ============================================================================

/**
 * Groups saved questions into a nested folder tree.
 *
 * Hierarchy:
 *   Level 0: Module name
 *   Level 1: Sub-discipline (or "Général" if none)
 *   Level 2: "Year ExamType" (e.g., "2024 EMD1")
 *   Leaf:    Individual questions
 */
export function groupSavedQuestions(
  questions: QuestionWithAnswers[]
): FolderNode {
  const root: FolderNode = {
    name: 'Sauvegardées',
    count: questions.length,
    children: new Map(),
    questions: [],
  }

  for (const q of questions) {
    // Level 0 — Module
    const moduleName = q.module_name || 'Autre'
    if (!root.children.has(moduleName)) {
      root.children.set(moduleName, {
        name: moduleName,
        count: 0,
        children: new Map(),
        questions: [],
      })
    }
    const moduleFolder = root.children.get(moduleName)!
    moduleFolder.count++

    // Level 1 — Sub-discipline
    const subDisc = q.sub_discipline || 'Général'
    if (!moduleFolder.children.has(subDisc)) {
      moduleFolder.children.set(subDisc, {
        name: subDisc,
        count: 0,
        children: new Map(),
        questions: [],
      })
    }
    const subFolder = moduleFolder.children.get(subDisc)!
    subFolder.count++

    // Level 2 — Year + Exam Type
    const yearLabel = q.exam_year ? `${q.exam_year}` : 'Année inconnue'
    const examLabel = q.exam_type || ''
    const sessionKey = examLabel ? `${yearLabel} ${examLabel}` : yearLabel
    if (!subFolder.children.has(sessionKey)) {
      subFolder.children.set(sessionKey, {
        name: sessionKey,
        count: 0,
        children: new Map(),
        questions: [],
      })
    }
    const sessionFolder = subFolder.children.get(sessionKey)!
    sessionFolder.count++
    sessionFolder.questions.push(q)
  }

  return root
}

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Resolves the current folder node from a navigation path.
 * Returns null if the path is invalid.
 */
export function resolveFolder(
  root: FolderNode,
  path: string[]
): FolderNode | null {
  let current = root

  for (const segment of path) {
    const child = current.children.get(segment)
    if (!child) return null
    current = child
  }

  return current
}

/**
 * Builds breadcrumb segments from the current path.
 */
export function buildBreadcrumbs(path: string[]): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [
    { label: 'Sauvegardées', pathIndex: -1 },
  ]

  path.forEach((segment, i) => {
    crumbs.push({ label: segment, pathIndex: i })
  })

  return crumbs
}

/**
 * Returns sorted folder entries from a FolderNode's children.
 * Sorts alphabetically by name.
 */
export function getSortedChildren(folder: FolderNode): FolderNode[] {
  return Array.from(folder.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr')
  )
}
