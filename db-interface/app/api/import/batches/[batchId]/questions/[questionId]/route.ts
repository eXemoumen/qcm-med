/**
 * API route for editing individual staging questions
 * PATCH: Update question data, re-validate, and save
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { batchId: string; questionId: string } }
) {
  const LOG_SOURCE = 'api/import/batches/[batchId]/questions/[questionId]/PATCH';

  try {
    const rateLimitResult = await applyRateLimit(request, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    // Verify batch exists and user has access
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('import_batches')
      .select('*')
      .eq('id', params.batchId)
      .single();

    if (batchError || !batch) {
      return errorResponse('Batch not found', 404, rateLimitResult.headers);
    }

    // Check access: owner or batch uploader
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

    // Block edit on completed batches
    if (batch.status === 'completed') {
      return errorResponse('Batch already completed — no further edits allowed', 400, rateLimitResult.headers);
    }

    // Verify question exists in this batch
    const { data: existingQuestion, error: qError } = await supabaseAdmin
      .from('question_staging')
      .select('id, status')
      .eq('id', params.questionId)
      .eq('batch_id', params.batchId)
      .single();

    if (qError || !existingQuestion) {
      return errorResponse('Staging question not found', 404, rateLimitResult.headers);
    }

    // Don't allow editing saved questions
    if (existingQuestion.status === 'saved') {
      return errorResponse('Question already saved to production — cannot edit', 400, rateLimitResult.headers);
    }

    const body = await request.json();

    // Update the staging question with new data
    const updateData: Record<string, any> = {};

    // Update question fields
    if (body.year !== undefined) updateData.year = body.year;
    if (body.module_name !== undefined) updateData.module_name = body.module_name;
    if (body.sub_discipline !== undefined) updateData.sub_discipline = body.sub_discipline || null;
    if (body.exam_type !== undefined) updateData.exam_type = body.exam_type;
    if (body.exam_year !== undefined) updateData.exam_year = body.exam_year;
    if (body.number !== undefined) updateData.number = body.number;
    if (body.question_text !== undefined) updateData.question_text = body.question_text;
    if (body.speciality !== undefined) updateData.speciality = body.speciality || null;
    if (body.cours !== undefined) updateData.cours = body.cours;
    if (body.faculty_source !== undefined) updateData.faculty_source = body.faculty_source || null;
    if (body.explanation !== undefined) updateData.explanation = body.explanation || null;
    if (body.answers !== undefined) updateData.answers = body.answers;

    // Update validation results
    if (body.status !== undefined) updateData.status = body.status;
    if (body.errors !== undefined) updateData.errors = body.errors;
    if (body.warnings !== undefined) updateData.warnings = body.warnings;

    // Audit trail
    updateData.reviewed_by = authResult.user.id;
    updateData.reviewed_at = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('question_staging')
      .update(updateData)
      .eq('id', params.questionId)
      .eq('batch_id', params.batchId);

    if (updateError) throw updateError;

    // Recalculate batch counts
    const { data: counts } = await supabaseAdmin
      .from('question_staging')
      .select('status')
      .eq('batch_id', params.batchId);

    if (counts) {
      const statusCounts = counts.reduce((acc: Record<string, number>, q: any) => {
        acc[q.status] = (acc[q.status] || 0) + 1;
        return acc;
      }, {});

      await supabaseAdmin
        .from('import_batches')
        .update({
          approved_count: statusCounts['approved'] || 0,
          rejected_count: statusCounts['rejected'] || 0,
          valid_count: statusCounts['valid'] || 0,
          warning_count: statusCounts['warning'] || 0,
          error_count: statusCounts['error'] || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.batchId);
    }

    logger.info('Staging question edited', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: {
        batchId: params.batchId,
        questionId: params.questionId,
        newStatus: body.status,
      },
    });

    return successResponse(
      { updated: true, questionId: params.questionId, status: body.status },
      rateLimitResult.headers
    );
  } catch (error) {
    logger.error('Failed to edit staging question', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
