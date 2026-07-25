/**
 * API route for pushing approved staging questions to the real questions table
 * POST: Push all approved questions from a batch
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
} from '@/lib/security/api-utils';
import { PREDEFINED_MODULES } from '@/lib/predefined-modules';

export async function POST(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const startTime = Date.now();
  const LOG_SOURCE = 'api/import/batches/[batchId]/push/POST';

  let claimedStatus: string | null = null;

  const releaseClaim = async () => {
    if (claimedStatus) {
      await supabaseAdmin
        .from('import_batches')
        .update({ status: claimedStatus })
        .eq('id', params.batchId);
      claimedStatus = null;
    }
  };

  try {
    const rateLimitResult = await applyRateLimit(request, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    // Verify batch access
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('import_batches')
      .select('*')
      .eq('id', params.batchId)
      .single();

    if (batchError || !batch) {
      return errorResponse('Batch not found', 404, rateLimitResult.headers);
    }

    if (batch.uploaded_by !== authResult.user.id) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', authResult.user.id)
        .single();

      if (userData?.role !== 'owner') {
        return errorResponse('Access denied', 403, rateLimitResult.headers);
      }
    }

    // Block push on already-completed batches
    if (batch.status === 'completed') {
      return errorResponse('Batch already fully pushed — no approved questions remaining', 400, rateLimitResult.headers);
    }

    // Atomically claim the batch — only from non-processing states
    if (batch.status === 'processing') {
      return errorResponse('Batch is being processed by another request — try again', 409, rateLimitResult.headers);
    }

    const { data: claimedBatch, error: claimError } = await supabaseAdmin
      .from('import_batches')
      .update({ status: 'processing' })
      .eq('id', params.batchId)
      .eq('status', batch.status)
      .select()
      .single();

    if (claimError || !claimedBatch) {
      return errorResponse('Batch is being processed by another request — try again', 409, rateLimitResult.headers);
    }

    claimedStatus = batch.status;

    // Get all approved staging questions
    const { data: approvedQuestions, error: fetchError } = await supabaseAdmin
      .from('question_staging')
      .select('*')
      .eq('batch_id', params.batchId)
      .eq('status', 'approved')
      .order('row_index', { ascending: true });

    if (fetchError) {
      await releaseClaim();
      throw fetchError;
    }

    if (!approvedQuestions || approvedQuestions.length === 0) {
      await releaseClaim();
      return errorResponse('No approved questions to push', 400, rateLimitResult.headers);
    }

    // Pre-check courses
    const allCourseNames = new Set<string>();
    for (const q of approvedQuestions) {
      if (q.cours && Array.isArray(q.cours)) {
        for (const c of q.cours) {
          if (c) allCourseNames.add(c);
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

    // Pre-check duplicates
    const uniqueCombos = new Map<string, Set<number>>();
    for (const q of approvedQuestions) {
      const key = `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}`;
      if (!uniqueCombos.has(key)) uniqueCombos.set(key, new Set());
      uniqueCombos.get(key)!.add(q.number!);
    }

    const dbDuplicateMap = new Map<string, Set<number>>();
    for (const [keyStr, numbers] of uniqueCombos) {
      const [year, module_name, sub_discipline, exam_type, exam_year] = keyStr.split('|');
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
        dbDuplicateMap.set(keyStr, new Set(existing.map((q: any) => q.number)));
      }
    }

    // Insert questions
    const results: {
      stagingId: string;
      status: 'saved' | 'error';
      questionId?: string;
      error?: string;
    }[] = [];

    let saved = 0;
    let failed = 0;

    for (const sq of approvedQuestions) {
      // Check missing courses
      if (sq.cours && Array.isArray(sq.cours)) {
        const qMissing = sq.cours.filter((c: string) => missingCourses.includes(c));
        if (qMissing.length > 0) {
          await supabaseAdmin
            .from('question_staging')
            .update({ status: 'error', errors: [`Cours non trouvés: ${qMissing.join(', ')}`] })
            .eq('id', sq.id);
          results.push({ stagingId: sq.id, status: 'error', error: `Cours non trouvés: ${qMissing.join(', ')}` });
          failed++;
          continue;
        }
      }

      // Check duplicates
      const comboKey = `${sq.year}|${sq.module_name}|${sq.sub_discipline || ''}|${sq.exam_type}|${sq.exam_year}`;
      const dbNums = dbDuplicateMap.get(comboKey);
      if (dbNums && dbNums.has(sq.number!)) {
        await supabaseAdmin
          .from('question_staging')
          .update({ status: 'error', errors: [`Question #${sq.number} already exists in database`] })
          .eq('id', sq.id);
        results.push({ stagingId: sq.id, status: 'error', error: `Question #${sq.number} already exists` });
        failed++;
        continue;
      }

      // Get module type
      const mod = PREDEFINED_MODULES.find((m) => m.name === sq.module_name && m.year === sq.year);

      try {
        const questionData = {
          year: sq.year,
          module_name: sq.module_name,
          sub_discipline: sq.sub_discipline || null,
          exam_type: sq.exam_type,
          exam_year: sq.exam_year,
          number: sq.number,
          question_text: sq.question_text,
          speciality: sq.speciality || 'Médecine',
          cours: sq.cours || null,
          module_type: mod?.type || null,
          unity_name: mod?.type === 'uei' ? sq.module_name : null,
          faculty_source: sq.faculty_source || null,
          explanation: sq.explanation || null,
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
        const answersToInsert = (sq.answers || []).map((a: any) => ({
          question_id: newQuestion.id,
          option_label: a.option_label,
          answer_text: a.answer_text,
          is_correct: a.is_correct,
          display_order: a.display_order,
        }));

        if (answersToInsert.length > 0) {
          const { error: answersError } = await supabaseAdmin.from('answers').insert(answersToInsert);
          if (answersError) {
            await supabaseAdmin.from('questions').delete().eq('id', newQuestion.id);
            throw answersError;
          }
        }

        // Update staging row
        await supabaseAdmin
          .from('question_staging')
          .update({ status: 'saved', reviewed_by: authResult.user.id, reviewed_at: new Date().toISOString() })
          .eq('id', sq.id);

        // Track in duplicate map
        if (!dbDuplicateMap.has(comboKey)) dbDuplicateMap.set(comboKey, new Set());
        dbDuplicateMap.get(comboKey)!.add(sq.number!);

        results.push({ stagingId: sq.id, status: 'saved', questionId: newQuestion.id });
        saved++;
      } catch (err: any) {
        await supabaseAdmin
          .from('question_staging')
          .update({ status: 'error', errors: [sanitizeError(err)] })
          .eq('id', sq.id);
        results.push({ stagingId: sq.id, status: 'error', error: sanitizeError(err) });
        failed++;
      }
    }

    // Update batch status (claim stays — don't release)
    const batchStatus = failed === 0 ? 'completed' : 'partial';
    await supabaseAdmin
      .from('import_batches')
      .update({ status: batchStatus })
      .eq('id', params.batchId);

    claimedStatus = null; // Success — don't release

    const durationMs = Date.now() - startTime;

    logger.info('Batch push completed', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { batchId: params.batchId, saved, failed, durationMs },
    });

    return successResponse(
      { total: approvedQuestions.length, saved, failed, results },
      rateLimitResult.headers
    );
  } catch (error) {
    await releaseClaim();
    const durationMs = Date.now() - startTime;
    logger.error('Batch push failed', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error', durationMs },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
