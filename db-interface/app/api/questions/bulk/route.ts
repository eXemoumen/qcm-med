/**
 * API route for bulk question import
 * Authenticates once, loops through questions server-side
 * Returns per-question status report with partial success model
 */
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import {
  applyRateLimit,
  requireAuthenticatedAdmin,
  sanitizeError,
  successResponse,
  errorResponse,
  validateBody,
} from '@/lib/security/api-utils';
import { bulkQuestionsSchema } from '@/lib/security/validation';
import { PREDEFINED_MODULES } from '@/lib/predefined-modules';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const LOG_SOURCE = 'api/questions/bulk/POST';

  try {
    // Apply rate limiting for export operations (10/min)
    const rateLimitResult = await applyRateLimit(request, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Require authenticated admin (auth once)
    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    // Validate request body
    const bodyResult = await validateBody(request, bulkQuestionsSchema);
    if (bodyResult.error) return bodyResult.error;

    const { questions } = bodyResult.data;

    logger.info('Bulk import started', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { questionCount: questions.length },
    });

    // ── Pre-flight: Validate courses exist ──────────────────────────────
    const allCourseNames = new Set<string>();
    for (const q of questions) {
      if (q.cours) {
        for (const c of q.cours) {
          allCourseNames.add(c);
        }
      }
    }

    let missingCourses: string[] = [];
    if (allCourseNames.size > 0) {
      const { data: existingCourses } = await supabaseAdmin
        .from('courses')
        .select('name')
        .in('name', Array.from(allCourseNames));

      const existingNames = new Set((existingCourses || []).map((c: any) => c.name));
      missingCourses = Array.from(allCourseNames).filter((name) => !existingNames.has(name));
    }

    // ── Pre-flight: Check duplicate question numbers ────────────────────
    const uniqueCombos = new Map<string, Set<number>>();
    for (const q of questions) {
      const key = `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}`;
      if (!uniqueCombos.has(key)) {
        uniqueCombos.set(key, new Set());
      }
      uniqueCombos.get(key)!.add(q.number);
    }

    const duplicateNumbersMap = new Map<string, number[]>();
    for (const [key, numbers] of uniqueCombos) {
      const [year, module_name, sub_discipline, exam_type, exam_year] = key.split('|');
      let query = supabaseAdmin
        .from('questions')
        .select('number')
        .eq('year', year)
        .eq('module_name', module_name)
        .eq('exam_type', exam_type)
        .eq('exam_year', parseInt(exam_year));

      if (sub_discipline) {
        query = query.eq('sub_discipline', sub_discipline);
      } else {
        query = query.is('sub_discipline', null);
      }

      const { data: existing } = await query;
      if (existing && existing.length > 0) {
        duplicateNumbersMap.set(key, existing.map((q: any) => q.number));
      }
    }

    // ── Insert questions ────────────────────────────────────────────────
    const results: {
      index: number;
      status: 'saved' | 'error' | 'skipped';
      questionId?: string;
      error?: string;
    }[] = [];

    let saved = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Check missing courses — reject, don't skip silently
      if (q.cours && q.cours.length > 0) {
        const qMissing = q.cours.filter((c) => missingCourses.includes(c));
        if (qMissing.length > 0) {
          results.push({
            index: i,
            status: 'error',
            error: `Cours non trouvés: ${qMissing.join(', ')}`,
          });
          failed++;
          continue;
        }
      }

      // Check duplicate number — reject
      const comboKey = `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}`;
      const existingNumbers = duplicateNumbersMap.get(comboKey) || [];
      if (existingNumbers.includes(q.number)) {
        results.push({
          index: i,
          status: 'error',
          error: `Question #${q.number} already exists for this module/exam`,
        });
        failed++;
        continue;
      }

      // Get module_type from PREDEFINED_MODULES
      const mod = PREDEFINED_MODULES.find(
        (m) => m.name === q.module_name && m.year === q.year
      );
      const moduleType = mod?.type || null;

      try {
        // Insert question
        const questionData = {
          year: q.year,
          module_name: q.module_name,
          sub_discipline: q.sub_discipline || null,
          exam_type: q.exam_type,
          exam_year: q.exam_year,
          number: q.number,
          question_text: q.question_text,
          speciality: q.speciality || 'Médecine',
          cours: q.cours || null,
          module_type: moduleType,
          unity_name: mod?.type === 'uei' ? q.module_name : null,
          faculty_source: q.faculty_source || null,
          explanation: q.explanation || null,
          created_by: authResult.user.id,
        };

        const { data: newQuestion, error: questionError } = await supabaseAdmin
          .from('questions')
          .insert(questionData)
          .select()
          .single();

        if (questionError) throw questionError;
        if (!newQuestion) throw new Error('Failed to create question');

        // Insert answers
        const answersToInsert = q.answers.map((answer) => ({
          question_id: newQuestion.id,
          option_label: answer.option_label,
          answer_text: answer.answer_text,
          is_correct: answer.is_correct,
          display_order: answer.display_order,
        }));

        const { error: answersError } = await supabaseAdmin
          .from('answers')
          .insert(answersToInsert);

        if (answersError) {
          // Rollback: delete question if answers fail
          await supabaseAdmin.from('questions').delete().eq('id', newQuestion.id);
          throw answersError;
        }

        // Add to duplicate tracking so subsequent questions in same batch detect it
        if (!duplicateNumbersMap.has(comboKey)) {
          duplicateNumbersMap.set(comboKey, []);
        }
        duplicateNumbersMap.get(comboKey)!.push(q.number);

        results.push({
          index: i,
          status: 'saved',
          questionId: newQuestion.id,
        });
        saved++;
      } catch (err: any) {
        const errorMsg = sanitizeError(err);
        results.push({
          index: i,
          status: 'error',
          error: errorMsg,
        });
        failed++;
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info('Bulk import completed', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: {
        total: questions.length,
        saved,
        failed,
        skipped,
        durationMs,
      },
    });

    return successResponse(
      {
        total: questions.length,
        saved,
        failed,
        skipped,
        missingCourses: missingCourses.length > 0 ? missingCourses : undefined,
        results,
      },
      rateLimitResult.headers
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Bulk import failed', {
      source: LOG_SOURCE,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
