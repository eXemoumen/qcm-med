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

    // Parse pagination parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100); // Max 100 per page
    const status = searchParams.get('status'); // Filter by status
    const offset = (page - 1) * limit;

    // Build query for total count
    let countQuery = supabaseAdmin
      .from('question_staging')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', params.batchId);

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    const { count: total, error: countError } = await countQuery;

    if (countError) throw countError;

    // Get paginated staging questions
    let query = supabaseAdmin
      .from('question_staging')
      .select('*')
      .eq('batch_id', params.batchId)
      .order('row_index', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: questions, error: questionsError } = await query;

    if (questionsError) throw questionsError;

    // Get status counts for summary
    const { data: allQuestions } = await supabaseAdmin
      .from('question_staging')
      .select('status')
      .eq('batch_id', params.batchId);

    const statusCounts = (allQuestions || []).reduce((acc: Record<string, number>, q: any) => {
      acc[q.status] = (acc[q.status] || 0) + 1;
      return acc;
    }, {});

    return successResponse(
      {
        batch,
        questions: questions || [],
        statusCounts,
        pagination: {
          total: total || 0,
          page,
          limit,
          totalPages: Math.ceil((total || 0) / limit),
        }
      },
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
