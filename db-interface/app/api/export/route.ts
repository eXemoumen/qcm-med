/**
 * API route to export questions from database to JSON and upload to Supabase Storage
 * Secured with owner-only access and rate limiting
 *
 * Phase 1 hardening:
 * - Data validation: skips questions with <2 answers, no correct answer, or empty text
 * - Complete field mapping: exports speciality, unity_name, module_type, faculty_source, answer IDs
 * - Performance: push() instead of spread operator for pagination
 * - Observability: structured logger instead of console.log, duration tracking
 * - Versioning: auto-increment patch version from previous version.json
 * - GET: recursive subdirectory listing
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  requireAuthenticatedOwner,
  applyRateLimit,
  sanitizeError,
  successResponse,
  errorResponse,
} from '@/lib/security/api-utils';
import { logger } from '@/lib/logger';

/**
 * Normalize string for file path - remove accented characters and special chars
 * Converts: génétique → genetique, Système → systeme, etc.
 * IMPORTANT: Must stay in sync with react-native-med-app/src/lib/offline-content.ts
 */
function normalizeForFilePath(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')                    // Decompose accented chars (é → e + ́)
    .replace(/[\u0300-\u036f]/g, '')     // Remove diacritical marks
    .replace(/[^a-z0-9_-]/g, '_')        // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_')                 // Collapse multiple underscores
    .replace(/^_|_$/g, '');              // Trim leading/trailing underscores
}

interface ModuleQuestions {
  [key: string]: QuestionWithAnswers[];
}

interface QuestionWithAnswers {
  id: string;
  year: number;
  module_name: string;
  sub_discipline: string | null;
  exam_type: string;
  exam_year: number | null;
  number: number;
  question_text: string;
  explanation: string | null;
  image_url: string | null;
  cours: string[] | null;
  speciality: string | null;
  unity_name: string | null;
  module_type: string | null;
  faculty_source: string | null;
  answers: Array<{
    id: string;
    option_label: string;
    answer_text: string;
    is_correct: boolean;
    display_order: number;
  }>;
}

/**
 * Validate a question for export readiness.
 * Returns null if valid, or a warning string if the question should be skipped.
 */
function validateQuestion(q: QuestionWithAnswers): string | null {
  if (!q.question_text || q.question_text.trim().length === 0) {
    return `Question ${q.id} (${q.module_name} #${q.number}): empty question_text`;
  }
  if (!q.answers || q.answers.length < 2) {
    return `Question ${q.id} (${q.module_name} #${q.number}): has ${q.answers?.length ?? 0} answers (need ≥2)`;
  }
  if (!q.answers.some((a) => a.is_correct)) {
    return `Question ${q.id} (${q.module_name} #${q.number}): no correct answer`;
  }
  return null;
}

/**
 * Parse a semver string and return its components.
 * Falls back to 1.0.0 if parsing fails.
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { major: 1, minor: 0, patch: 0 };
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Try to read the current version.json from storage.
 * Returns null if it doesn't exist or can't be parsed.
 */
async function getCurrentVersion(): Promise<{ version: string; [key: string]: unknown } | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from('questions')
      .download('version.json');
    if (error || !data) return null;
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// POST /api/export - Export all questions to JSON and upload to Supabase Storage
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const LOG_SOURCE = 'api/export/POST';

  try {
    // Apply rate limiting for export operations (more restrictive)
    const rateLimitResult = await applyRateLimit(request, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Require authenticated owner
    const authResult = await requireAuthenticatedOwner(request);
    if (authResult.error) return authResult.error;

    logger.info('Export started', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
    });

    // ── Step 1: Fetch all questions with answers (paginated) ──────────────
    const PAGE_SIZE = 1000;
    const allQuestions: QuestionWithAnswers[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: questions, error: questionsError } = await supabaseAdmin
        .from('questions')
        .select(`
          id, year, module_name, sub_discipline, exam_type, exam_year,
          number, question_text, explanation, image_url, cours,
          speciality, unity_name, module_type, faculty_source,
          answers (id, option_label, answer_text, is_correct, display_order)
        `)
        .order('year', { ascending: true })
        .order('module_name', { ascending: true })
        .order('number', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (questionsError) throw questionsError;

      if (questions && questions.length > 0) {
        allQuestions.push(...(questions as QuestionWithAnswers[]));
        hasMore = questions.length === PAGE_SIZE;
        page++;
        logger.info(`Fetched page ${page}: ${questions.length} questions (total: ${allQuestions.length})`, {
          source: LOG_SOURCE,
          userId: authResult.user.id,
          metadata: { page, pageSize: questions.length, totalSoFar: allQuestions.length },
        });
      } else {
        hasMore = false;
      }
    }

    if (allQuestions.length === 0) {
      return errorResponse('No questions found in database', 404, rateLimitResult.headers);
    }

    // ── Step 2: Validate questions and filter out invalid ones ────────────
    const validQuestions: QuestionWithAnswers[] = [];
    const validationWarnings: string[] = [];

    for (const question of allQuestions) {
      const warning = validateQuestion(question);
      if (warning) {
        validationWarnings.push(warning);
      } else {
        validQuestions.push(question);
      }
    }

    if (validationWarnings.length > 0) {
      logger.warn(`Export validation: ${validationWarnings.length} questions skipped`, {
        source: LOG_SOURCE,
        userId: authResult.user.id,
        metadata: {
          skippedCount: validationWarnings.length,
          warnings: validationWarnings.slice(0, 20), // Log first 20 warnings
        },
      });
    }

    logger.info(`Validated: ${validQuestions.length} valid, ${validationWarnings.length} skipped`, {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { validCount: validQuestions.length, skippedCount: validationWarnings.length },
    });

    // ── Step 3: Get modules metadata ─────────────────────────────────────
    const { data: allModules, error: modulesError } = await supabaseAdmin
      .from('modules')
      .select('*');

    if (modulesError) throw modulesError;

    // ── Step 4: Group valid questions by year and module ──────────────────
    const groupedQuestions: { [key: string]: ModuleQuestions } = {};

    for (const question of validQuestions) {
      const year = question.year;
      const moduleName = normalizeForFilePath(question.module_name);
      const key = `year${year}`;

      if (!groupedQuestions[key]) {
        groupedQuestions[key] = {};
      }

      if (!groupedQuestions[key][moduleName]) {
        groupedQuestions[key][moduleName] = [];
      }

      groupedQuestions[key][moduleName].push(question);
    }

    logger.info('Grouped questions by modules', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { yearGroups: Object.keys(groupedQuestions).length },
    });

    // ── Step 5: Resolve version number ───────────────────────────────────
    const existingVersion = await getCurrentVersion();
    const previousVersion = parseVersion(existingVersion?.version as string || '1.0.0');
    const newVersion = `${previousVersion.major}.${previousVersion.minor}.${previousVersion.patch + 1}`;

    // ── Step 6: Export each module to JSON and upload ─────────────────────
    const uploadedModules: Record<string, {
      version: string;
      size: number;
      questions_count: number;
      last_updated: string;
      path: string;
    }> = {};
    let totalUploaded = 0;
    const exportTimestamp = new Date().toISOString();

    for (const [yearKey, modules] of Object.entries(groupedQuestions)) {
      for (const [moduleName, moduleQuestions] of Object.entries(modules)) {
        const moduleData = {
          version: newVersion,
          module: moduleQuestions[0].module_name,
          study_year: moduleQuestions[0].year,
          exam_types: [...new Set(moduleQuestions.map((q) => q.exam_type))],
          last_updated: exportTimestamp,
          questions_count: moduleQuestions.length,
          questions: moduleQuestions.map((q) => ({
            id: q.id,
            legacy_id: `${q.year}_${q.module_name}_${q.number}`,
            year: q.year,
            study_year: q.year,
            module: q.module_name,
            module_name: q.module_name,
            cours: q.cours || [],
            sub_discipline: q.sub_discipline,
            exam_type: q.exam_type,
            exam_year: q.exam_year || null,
            number: q.number,
            question_text: q.question_text,
            explanation: q.explanation,
            image_url: q.image_url || null,
            speciality: q.speciality || null,
            unity_name: q.unity_name || null,
            module_type: q.module_type || null,
            faculty_source: q.faculty_source || null,
            answers: q.answers
              .sort((a, b) => a.display_order - b.display_order)
              .map((a) => ({
                id: a.id,
                label: a.option_label,
                text: a.answer_text,
                is_correct: a.is_correct,
                display_order: a.display_order,
              })),
          })),
        };

        // Convert to JSON
        const jsonContent = JSON.stringify(moduleData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });

        // Upload to Supabase Storage
        const filePath = `${yearKey}/${moduleName}.json`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('questions')
          .upload(filePath, blob, {
            contentType: 'application/json',
            upsert: true,
          });

        if (uploadError) {
          logger.error(`Failed to upload ${filePath}`, {
            source: LOG_SOURCE,
            userId: authResult.user.id,
            metadata: { filePath, error: uploadError.message },
          });
          throw uploadError;
        }

        logger.info(`Uploaded ${filePath} (${moduleQuestions.length} questions)`, {
          source: LOG_SOURCE,
          userId: authResult.user.id,
          metadata: { filePath, questionsCount: moduleQuestions.length },
        });

        // Track uploaded module
        const moduleKey = `${yearKey}_${moduleName}`;
        uploadedModules[moduleKey] = {
          version: newVersion,
          size: blob.size,
          questions_count: moduleQuestions.length,
          last_updated: exportTimestamp,
          path: filePath,
        };

        totalUploaded++;
      }
    }

    // ── Step 7: Create and upload version.json ───────────────────────────
    // Compute question counts per module for enhanced metadata
    const moduleQuestionCounts: Record<string, number> = {};
    for (const question of validQuestions) {
      const moduleName = question.module_name;
      moduleQuestionCounts[moduleName] = (moduleQuestionCounts[moduleName] || 0) + 1;
    }

    // Enhance module_metadata with question counts for offline display
    const enhancedModuleMetadata = (allModules || []).map((m: any) => ({
      ...m,
      question_count: moduleQuestionCounts[m.name] || 0
    }));

    logger.info(`Enhanced ${enhancedModuleMetadata.length} modules with question counts`, {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { modulesEnhanced: enhancedModuleMetadata.length },
    });

    const versionData = {
      version: newVersion,
      last_updated: exportTimestamp,
      total_questions: validQuestions.length,
      total_modules: totalUploaded,
      modules: uploadedModules,
      module_metadata: enhancedModuleMetadata,
      changelog: [
        {
          version: newVersion,
          date: exportTimestamp.split('T')[0],
          changes: `Exported ${validQuestions.length} questions across ${totalUploaded} modules` +
            (validationWarnings.length > 0 ? ` (${validationWarnings.length} skipped)` : ''),
        },
      ],
    };

    const versionBlob = new Blob([JSON.stringify(versionData, null, 2)], {
      type: 'application/json',
    });

    const { error: versionError } = await supabaseAdmin.storage
      .from('questions')
      .upload('version.json', versionBlob, {
        contentType: 'application/json',
        upsert: true,
      });

    if (versionError) throw versionError;

    const durationMs = Date.now() - startTime;

    logger.info('Export completed successfully', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: {
        version: newVersion,
        totalQuestions: validQuestions.length,
        totalModules: totalUploaded,
        skippedQuestions: validationWarnings.length,
        durationMs,
      },
    });

    return successResponse(
      {
        total_questions: validQuestions.length,
        total_modules: totalUploaded,
        modules: Object.keys(uploadedModules),
        version: versionData.version,
        skipped_questions: validationWarnings.length,
        validation_warnings: validationWarnings.slice(0, 10), // Return first 10 to UI
        duration_ms: durationMs,
      },
      rateLimitResult.headers
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Export failed', {
      source: LOG_SOURCE,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}

// GET /api/export/status - Check export status and list uploaded files
export async function GET(request: NextRequest) {
  const LOG_SOURCE = 'api/export/GET';

  try {
    // Apply rate limiting
    const rateLimitResult = await applyRateLimit(request);
    if (rateLimitResult.error) return rateLimitResult.error;

    // Require authenticated owner for status check
    const authResult = await requireAuthenticatedOwner(request);
    if (authResult.error) return authResult.error;

    // List all files in questions bucket (including subdirectories)
    const { data: rootFiles, error } = await supabaseAdmin.storage
      .from('questions')
      .list();

    if (error) throw error;

    // Recursively list files in subdirectories (year1/, year2/, year3/)
    const allFiles: Array<{ name: string; size?: number; updated?: string }> = [];

    for (const item of rootFiles || []) {
      if (item.name.includes('.')) {
        // It's a file (has extension)
        allFiles.push({
          name: item.name,
          size: item.metadata?.size,
          updated: item.updated_at,
        });
      } else {
        // It's a directory — list its contents
        const { data: subFiles, error: subError } = await supabaseAdmin.storage
          .from('questions')
          .list(item.name);

        if (!subError && subFiles) {
          for (const subFile of subFiles) {
            allFiles.push({
              name: `${item.name}/${subFile.name}`,
              size: subFile.metadata?.size,
              updated: subFile.updated_at,
            });
          }
        }
      }
    }

    // Get version.json
    const version = await getCurrentVersion();

    return successResponse(
      {
        files: allFiles,
        version: version,
        storage_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/questions/`,
      },
      rateLimitResult.headers
    );
  } catch (error) {
    logger.error('Export status check failed', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
