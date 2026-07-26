/**
 * API route for pushing all valid questions from a batch
 * POST: Push all valid + warning questions (not just approved)
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

let claimedStatus: string | null = null;

const releaseClaim = async (batchId: string) => {
  if (claimedStatus) {
    await supabaseAdmin
      .from('import_batches')
      .update({ status: claimedStatus })
      .eq('id', batchId);
    claimedStatus = null;
  }
};

export async function POST(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const startTime = Date.now();
  const LOG_SOURCE = 'api/import/batches/[batchId]/push-valid/POST';

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
      return errorResponse('Batch already fully pushed — no questions remaining', 400, rateLimitResult.headers);
    }

    // Block push on processing batches
    if (batch.status === 'processing') {
      return errorResponse('Batch is being processed — try again', 409, rateLimitResult.headers);
    }

    // Atomically claim the batch
    const { data: claimedBatch, error: claimError } = await supabaseAdmin
      .from('import_batches')
      .update({ status: 'processing' })
      .eq('id', params.batchId)
      .eq('status', batch.status)
      .select()
      .single();

    if (claimError || !claimedBatch) {
      return errorResponse('Batch is being processed — try again', 409, rateLimitResult.headers);
    }

    claimedStatus = batch.status;

    // Get all valid + warning staging questions
    const { data: validQuestions, error: fetchError } = await supabaseAdmin
      .from('question_staging')
      .select('*')
      .eq('batch_id', params.batchId)
      .in('status', ['valid', 'warning'])
      .order('row_index', { ascending: true });

    if (fetchError) {
      await releaseClaim(params.batchId);
      throw fetchError;
    }

    if (!validQuestions || validQuestions.length === 0) {
      await releaseClaim(params.batchId);
      return errorResponse('No valid questions to push', 400, rateLimitResult.headers);
    }

    // Pre-check courses
    const allCourseNames = new Set<string>();
    for (const q of validQuestions) {
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

    // Pre-check: fetch existing numbers per combo from DB
    const existingNumbersByCombo = new Map<string, Set<number>>();
    const maxNumberByCombo = new Map<string, number>();

    const uniqueCombos = new Map<string, Set<number>>();
    for (const q of validQuestions) {
      const key = `${q.year}|${q.module_name}|${q.sub_discipline || ''}|${q.exam_type}|${q.exam_year}`;
      if (!uniqueCombos.has(key)) uniqueCombos.set(key, new Set());
      uniqueCombos.get(key)!.add(q.number!);
    }

    for (const [keyStr] of uniqueCombos) {
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
        const nums = new Set(existing.map((q: any) => q.number));
        existingNumbersByCombo.set(keyStr, nums);
        maxNumberByCombo.set(keyStr, Math.max(...Array.from(nums)));
      } else {
        existingNumbersByCombo.set(keyStr, new Set());
        maxNumberByCombo.set(keyStr, 0);
      }
    }

    // Track numbers assigned during this push to avoid in-batch conflicts
    const assignedNumbersByCombo = new Map<string, Set<number>>();

    // Helper: find next available number for a combo
    function getNextAvailableNumber(comboKey: string): number {
      const existing = existingNumbersByCombo.get(comboKey) || new Set();
      const assigned = assignedNumbersByCombo.get(comboKey) || new Set();
      let candidate = (maxNumberByCombo.get(comboKey) || 0) + 1;
      while (existing.has(candidate) || assigned.has(candidate)) {
        candidate++;
      }
      return candidate;
    }

    // Insert questions in batches
    const BATCH_SIZE = 100;
    const results: {
      stagingId: string;
      status: 'saved' | 'error';
      questionId?: string;
      originalNumber?: number;
      newNumber?: number;
      error?: string;
    }[] = [];

    let saved = 0;
    let failed = 0;
    let renumbered = 0;

    for (let i = 0; i < validQuestions.length; i += BATCH_SIZE) {
      const batchChunk = validQuestions.slice(i, i + BATCH_SIZE);

      for (const sq of batchChunk) {
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

        // Auto-renumber: check if number is taken, if so assign next available
        const comboKey = `${sq.year}|${sq.module_name}|${sq.sub_discipline || ''}|${sq.exam_type}|${sq.exam_year}`;
        const existing = existingNumbersByCombo.get(comboKey) || new Set();
        const assigned = assignedNumbersByCombo.get(comboKey) || new Set();
        let finalNumber = sq.number!;

        if (existing.has(finalNumber) || assigned.has(finalNumber)) {
          finalNumber = getNextAvailableNumber(comboKey);
          renumbered++;
        }

        // Track this number as assigned
        if (!assignedNumbersByCombo.has(comboKey)) assignedNumbersByCombo.set(comboKey, new Set());
        assignedNumbersByCombo.get(comboKey)!.add(finalNumber);

        // Get module type
        const mod = PREDEFINED_MODULES.find((m) => m.name === sq.module_name && m.year === sq.year);

        try {
          const questionData = {
            year: sq.year,
            module_name: sq.module_name,
            sub_discipline: sq.sub_discipline || null,
            exam_type: sq.exam_type,
            exam_year: sq.exam_year,
            number: finalNumber,
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

          // Update staging row with final number and status
          await supabaseAdmin
            .from('question_staging')
            .update({
              status: 'saved',
              number: finalNumber,
              reviewed_by: authResult.user.id,
              reviewed_at: new Date().toISOString(),
              warnings: finalNumber !== sq.number
                ? [...(sq.warnings || []), `Numéro renuméroté: ${sq.number} → ${finalNumber}`]
                : sq.warnings || [],
            })
            .eq('id', sq.id);

          results.push({
            stagingId: sq.id,
            status: 'saved',
            questionId: newQuestion.id,
            originalNumber: sq.number !== finalNumber ? sq.number : undefined,
            newNumber: sq.number !== finalNumber ? finalNumber : undefined,
          });
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
    }

    // Update batch status
    const batchStatus = failed === 0 ? 'completed' : 'partial';
    await supabaseAdmin
      .from('import_batches')
      .update({
        status: batchStatus,
        approved_count: saved,
      })
      .eq('id', params.batchId);

    claimedStatus = null; // Success — don't release

    const durationMs = Date.now() - startTime;

    logger.info('Push valid questions completed', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { batchId: params.batchId, saved, failed, renumbered, total: validQuestions.length, durationMs },
    });

    return successResponse(
      { total: validQuestions.length, saved, failed, renumbered, results },
      rateLimitResult.headers
    );
  } catch (error) {
    await releaseClaim(params.batchId);
    const durationMs = Date.now() - startTime;
    logger.error('Push valid questions failed', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error', durationMs },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
