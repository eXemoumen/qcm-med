/**
 * API route for bulk question import
 * Authenticates once, batches inserts server-side
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

interface ComboKey {
  year: string;
  module_name: string;
  sub_discipline: string;
  exam_type: string;
  exam_year: number;
}

function comboKeyStr(k: ComboKey): string {
  return `${k.year}|${k.module_name}|${k.sub_discipline}|${k.exam_type}|${k.exam_year}`;
}

function comboKeyFromQ(q: { year: string; module_name: string; sub_discipline?: string | null; exam_type: string; exam_year: number }): ComboKey {
  return { year: q.year, module_name: q.module_name, sub_discipline: q.sub_discipline || '', exam_type: q.exam_type, exam_year: q.exam_year };
}

function questionNaturalKey(q: { year: string; module_name: string; sub_discipline?: string | null; exam_type: string; exam_year: number; number: number }): string {
  return `${comboKeyStr(comboKeyFromQ(q))}|${q.number}`;
}

const CHUNK_SIZE = 100;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const LOG_SOURCE = 'api/questions/bulk/POST';

  try {
    const rateLimitResult = await applyRateLimit(request, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    const bodyResult = await validateBody(request, bulkQuestionsSchema);
    if (bodyResult.error) return bodyResult.error;

    const { questions } = bodyResult.data;

    // Normalize answers: ensure display_order and is_correct are always set
    for (const q of questions) {
      q.answers = q.answers.map((a, i) => ({
        ...a,
        display_order: a.display_order || i + 1,
        is_correct: typeof a.is_correct === 'boolean' ? a.is_correct : false,
      }));
    }

    logger.info('Bulk import started', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { questionCount: questions.length },
    });

    // ── Pre-flight: courses ──
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
      const { data: existingCourses, error: coursesError } = await supabaseAdmin
        .from('courses')
        .select('name')
        .in('name', Array.from(allCourseNames));

      if (coursesError) {
        logger.error('Pre-flight courses query failed', {
          source: LOG_SOURCE,
          metadata: { error: coursesError.message },
        });
        return errorResponse('Failed to validate courses', 500, rateLimitResult.headers);
      }

      const existingNames = new Set((existingCourses || []).map((c: any) => c.name));
      missingCourses = Array.from(allCourseNames).filter((name) => !existingNames.has(name));
    }

    // ── Pre-flight: DB duplicates ──
    const uniqueCombos = new Map<string, { key: ComboKey; numbers: Set<number> }>();
    for (const q of questions) {
      const key = comboKeyFromQ(q);
      const keyStr = comboKeyStr(key);
      if (!uniqueCombos.has(keyStr)) {
        uniqueCombos.set(keyStr, { key, numbers: new Set() });
      }
      uniqueCombos.get(keyStr)!.numbers.add(q.number);
    }

    const dbDuplicateMap = new Map<string, Set<number>>();
    for (const [, { key, numbers }] of uniqueCombos) {
      let query = supabaseAdmin
        .from('questions')
        .select('number')
        .eq('year', key.year)
        .eq('module_name', key.module_name)
        .eq('exam_type', key.exam_type)
        .eq('exam_year', key.exam_year);

      if (key.sub_discipline) {
        query = query.eq('sub_discipline', key.sub_discipline);
      } else {
        query = query.is('sub_discipline', null);
      }

      const { data: existing, error: dupError } = await query;
      if (dupError) {
        logger.error('Pre-flight duplicate query failed', {
          source: LOG_SOURCE,
          metadata: { error: dupError.message, combo: key },
        });
        return errorResponse('Failed to check duplicate questions', 500, rateLimitResult.headers);
      }
      if (existing && existing.length > 0) {
        dbDuplicateMap.set(comboKeyStr(key), new Set(existing.map((q: any) => q.number)));
      }
    }

    // ── In-request duplicate tracking (updated as each question is validated) ──
    const seenNumbers = new Map<string, Set<number>>(); // comboKey → numbers seen so far

    const results: {
      index: number;
      status: 'saved' | 'error' | 'skipped';
      questionId?: string;
      error?: string;
    }[] = [];

    let saved = 0;
    let failed = 0;

    for (let chunkStart = 0; chunkStart < questions.length; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, questions.length);
      const chunk = questions.slice(chunkStart, chunkEnd);

      const validIndices: number[] = [];
      for (let ci = 0; ci < chunk.length; ci++) {
        const i = chunkStart + ci;
        const q = chunk[ci];

        // Check missing courses
        if (q.cours && q.cours.length > 0) {
          const qMissing = q.cours.filter((c) => missingCourses.includes(c));
          if (qMissing.length > 0) {
            results.push({ index: i, status: 'error', error: `Cours non trouvés: ${qMissing.join(', ')}` });
            failed++;
            continue;
          }
        }

        // Check DB duplicates
        const ck = comboKeyStr(comboKeyFromQ(q));
        const dbNums = dbDuplicateMap.get(ck);
        if (dbNums && dbNums.has(q.number)) {
          results.push({ index: i, status: 'error', error: `Question #${q.number} already exists in database` });
          failed++;
          continue;
        }

        // Check in-request duplicates (numbers seen during this request)
        const seenNums = seenNumbers.get(ck);
        if (seenNums && seenNums.has(q.number)) {
          results.push({ index: i, status: 'error', error: `Question #${q.number} is duplicated within this import` });
          failed++;
          continue;
        }

        // Track this number as seen BEFORE proceeding to insert
        if (!seenNumbers.has(ck)) seenNumbers.set(ck, new Set());
        seenNumbers.get(ck)!.add(q.number);

        validIndices.push(ci);
      }

      if (validIndices.length === 0) continue;

      const validQuestions = validIndices.map((ci) => {
        const q = chunk[ci];
        const mod = PREDEFINED_MODULES.find((m) => m.name === q.module_name && m.year === q.year);
        return {
          localIndex: ci,
          globalIndex: chunkStart + ci,
          data: q,
          moduleType: mod?.type || null,
          isUei: mod?.type === 'uei',
        };
      });

      const questionRows = validQuestions.map((vq) => ({
        year: vq.data.year,
        module_name: vq.data.module_name,
        sub_discipline: vq.data.sub_discipline || null,
        exam_type: vq.data.exam_type,
        exam_year: vq.data.exam_year,
        number: vq.data.number,
        question_text: vq.data.question_text,
        speciality: vq.data.speciality || 'Médecine',
        cours: vq.data.cours || null,
        module_type: vq.moduleType,
        unity_name: vq.isUei ? vq.data.module_name : null,
        faculty_source: vq.data.faculty_source || null,
        explanation: vq.data.explanation || null,
        created_by: authResult.user.id,
      }));

      const { data: insertedQuestions, error: batchQuestionError } = await supabaseAdmin
        .from('questions')
        .insert(questionRows)
        .select();

      if (batchQuestionError) {
        // Fallback: per-question inserts
        logger.warn('Batch question insert failed, falling back to per-question', {
          source: LOG_SOURCE,
          metadata: { error: batchQuestionError.message, chunkSize: validQuestions.length },
        });

        for (let vi = 0; vi < validQuestions.length; vi++) {
          const vq = validQuestions[vi];
          try {
            const { data: newQ, error: qErr } = await supabaseAdmin
              .from('questions')
              .insert(questionRows[vi])
              .select()
              .single();

            if (qErr) throw qErr;
            if (!newQ) throw new Error('Failed to create question');

            const answersToInsert = vq.data.answers.map((a) => ({
              question_id: newQ.id,
              option_label: a.option_label,
              answer_text: a.answer_text,
              is_correct: a.is_correct,
              display_order: a.display_order,
            }));

            const { error: ansErr } = await supabaseAdmin.from('answers').insert(answersToInsert);
            if (ansErr) {
              const { error: delErr } = await supabaseAdmin.from('questions').delete().eq('id', newQ.id);
              if (delErr) {
                logger.error('Rollback failed', {
                  source: LOG_SOURCE,
                  metadata: { questionId: newQ.id, rollbackError: delErr.message, originalError: ansErr.message },
                });
              }
              throw ansErr;
            }

            results.push({ index: vq.globalIndex, status: 'saved', questionId: newQ.id });
            saved++;
          } catch (err: any) {
            results.push({ index: vq.globalIndex, status: 'error', error: sanitizeError(err) });
            failed++;
          }
        }
        continue;
      }

      // Batch succeeded — match returned rows by natural key
      if (!insertedQuestions || insertedQuestions.length === 0) continue;

      // Build a map from natural key → returned question id
      const returnedByKey = new Map<string, string>();
      for (const rq of insertedQuestions) {
        const nk = `${rq.year}|${rq.module_name}|${rq.sub_discipline || ''}|${rq.exam_type}|${rq.exam_year}|${rq.number}`;
        returnedByKey.set(nk, rq.id);
      }

      // Associate answers with questions by natural key
      const allAnswers: { question_id: string; option_label: string; answer_text: string; is_correct: boolean; display_order: number }[] = [];
      const unresolvedQuestions: typeof validQuestions = [];

      for (const vq of validQuestions) {
        const nk = questionNaturalKey(vq.data);
        const qId = returnedByKey.get(nk);
        if (!qId) {
          unresolvedQuestions.push(vq);
          continue;
        }
        for (const a of vq.data.answers) {
          allAnswers.push({
            question_id: qId,
            option_label: a.option_label,
            answer_text: a.answer_text,
            is_correct: a.is_correct,
            display_order: a.display_order,
          });
        }
      }

      // Handle unresolved questions — mark as error
      for (const vq of unresolvedQuestions) {
        results.push({ index: vq.globalIndex, status: 'error', error: 'Question not found in batch response' });
        failed++;
      }

      const { error: batchAnswersError } = await supabaseAdmin.from('answers').insert(allAnswers);

      if (batchAnswersError) {
        const insertedIds = insertedQuestions.map((q) => q.id);
        const { error: rollbackError } = await supabaseAdmin
          .from('questions')
          .delete()
          .in('id', insertedIds);

        if (rollbackError) {
          logger.error('Batch rollback failed', {
            source: LOG_SOURCE,
            metadata: { questionIds: insertedIds, rollbackError: rollbackError.message, originalError: batchAnswersError.message },
          });
        }

        for (const vq of validQuestions) {
          results.push({ index: vq.globalIndex, status: 'error', error: sanitizeError(batchAnswersError) });
          failed++;
        }
        continue;
      }

      // All succeeded
      for (const vq of validQuestions) {
        const nk = questionNaturalKey(vq.data);
        const qId = returnedByKey.get(nk);
        if (!qId) continue; // already reported as error above
        results.push({ index: vq.globalIndex, status: 'saved', questionId: qId });
        saved++;
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info('Bulk import completed', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { total: questions.length, saved, failed, durationMs },
    });

    return successResponse(
      {
        total: questions.length,
        saved,
        failed,
        skipped: 0,
        missingCourses: missingCourses.length > 0 ? missingCourses : undefined,
        results,
      },
      rateLimitResult.headers
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Bulk import failed', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error', durationMs },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
