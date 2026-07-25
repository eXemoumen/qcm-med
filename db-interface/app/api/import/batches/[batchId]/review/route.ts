/**
 * API route for reviewing staging questions
 * POST: Approve or reject individual questions
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

export async function POST(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const LOG_SOURCE = 'api/import/batches/[batchId]/review/POST';

  try {
    const rateLimitResult = await applyRateLimit(request, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const { questionIds, action } = body;

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return errorResponse('questionIds array is required', 400, rateLimitResult.headers);
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return errorResponse('action must be "approve" or "reject"', 400, rateLimitResult.headers);
    }

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

    // Block review on completed batches
    if (batch.status === 'completed') {
      return errorResponse('Batch already completed — no further reviews allowed', 400, rateLimitResult.headers);
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update staging questions
    const { error: updateError } = await supabaseAdmin
      .from('question_staging')
      .update({
        status: newStatus,
        reviewed_by: authResult.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', questionIds)
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
          status: 'processing',
        })
        .eq('id', params.batchId);
    }

    logger.info('Batch questions reviewed', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { batchId: params.batchId, action, count: questionIds.length },
    });

    return successResponse(
      { updated: questionIds.length, action },
      rateLimitResult.headers
    );
  } catch (error) {
    logger.error('Failed to review batch questions', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
