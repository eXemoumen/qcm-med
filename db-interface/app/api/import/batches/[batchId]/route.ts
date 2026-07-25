/**
 * API route for a single import batch
 * GET: Get batch detail + all staging questions
 * DELETE: Delete batch (cascade to staging rows)
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

async function verifyBatchAccess(batchId: string, userId: string) {
  const { data: batch, error } = await supabaseAdmin
    .from('import_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (error || !batch) return { batch: null, error: 'Batch not found' };

  // Check ownership or owner role
  if (batch.uploaded_by === userId) return { batch, error: null };

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (userData?.role === 'owner') return { batch, error: null };

  return { batch: null, error: 'Access denied' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const LOG_SOURCE = 'api/import/batches/[batchId]/GET';

  try {
    const rateLimitResult = await applyRateLimit(request);
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    const { batch, error: accessError } = await verifyBatchAccess(params.batchId, authResult.user.id);
    if (accessError) return errorResponse(accessError, 404, rateLimitResult.headers);

    // Get staging questions
    const { data: questions, error: questionsError } = await supabaseAdmin
      .from('question_staging')
      .select('*')
      .eq('batch_id', params.batchId)
      .order('row_index', { ascending: true });

    if (questionsError) throw questionsError;

    return successResponse(
      { batch, questions: questions || [] },
      rateLimitResult.headers
    );
  } catch (error) {
    logger.error('Failed to get import batch', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const LOG_SOURCE = 'api/import/batches/[batchId]/DELETE';

  try {
    const rateLimitResult = await applyRateLimit(request, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    const { batch, error: accessError } = await verifyBatchAccess(params.batchId, authResult.user.id);
    if (accessError) return errorResponse(accessError, 404, rateLimitResult.headers);

    // Check if batch has already-pushed questions
    const { data: pushedQuestions } = await supabaseAdmin
      .from('question_staging')
      .select('id')
      .eq('batch_id', params.batchId)
      .eq('status', 'saved')
      .limit(1);

    if (pushedQuestions && pushedQuestions.length > 0) {
      return errorResponse(
        'Cannot delete batch with already-pushed questions. Contact owner for cleanup.',
        400,
        rateLimitResult.headers
      );
    }

    // Delete batch (cascades to staging rows)
    const { error: deleteError } = await supabaseAdmin
      .from('import_batches')
      .delete()
      .eq('id', params.batchId);

    if (deleteError) throw deleteError;

    logger.info('Import batch deleted', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { batchId: params.batchId },
    });

    return successResponse({ deleted: true }, rateLimitResult.headers);
  } catch (error) {
    logger.error('Failed to delete import batch', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
