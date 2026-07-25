/**
 * API route for import batches
 * GET: List batches (manager sees own, owner sees all)
 * POST: Create batch + insert staging rows
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

export async function GET(request: NextRequest) {
  const LOG_SOURCE = 'api/import/batches/GET';

  try {
    const rateLimitResult = await applyRateLimit(request);
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    // Check if owner
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', authResult.user.id)
      .single();

    const isOwner = userData?.role === 'owner';

    let query = supabaseAdmin
      .from('import_batches')
      .select('*')
      .order('created_at', { ascending: false });

    // Managers only see their own batches
    if (!isOwner) {
      query = query.eq('uploaded_by', authResult.user.id);
    }

    const { data: batches, error } = await query;

    if (error) throw error;

    return successResponse(batches || [], rateLimitResult.headers);
  } catch (error) {
    logger.error('Failed to list import batches', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  const LOG_SOURCE = 'api/import/batches/POST';

  try {
    const rateLimitResult = await applyRateLimit(request, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const { fileName, fileType, questions } = body;

    if (!fileName || !fileType || !questions || !Array.isArray(questions)) {
      return errorResponse('Missing required fields: fileName, fileType, questions', 400, rateLimitResult.headers);
    }

    // Create batch record
    const validCount = questions.filter((q: any) => q.status === 'valid').length;
    const warningCount = questions.filter((q: any) => q.status === 'warning').length;
    const errorCount = questions.filter((q: any) => q.status === 'error').length;

    const { data: batch, error: batchError } = await supabaseAdmin
      .from('import_batches')
      .insert({
        uploaded_by: authResult.user.id,
        file_name: fileName,
        file_type: fileType,
        status: 'pending',
        total_rows: questions.length,
        valid_count: validCount,
        warning_count: warningCount,
        error_count: errorCount,
        approved_count: 0,
        rejected_count: 0,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // Insert staging rows
    const stagingRows = questions.map((q: any, i: number) => ({
      batch_id: batch.id,
      row_index: i,
      year: q.year || null,
      module_name: q.module_name || null,
      sub_discipline: q.sub_discipline || null,
      exam_type: q.exam_type || null,
      exam_year: q.exam_year || null,
      number: q.number || null,
      question_text: q.question_text || null,
      speciality: q.speciality || null,
      cours: q.cours || null,
      faculty_source: q.faculty_source || null,
      explanation: q.explanation || null,
      answers: q.answers || [],
      status: q.status || 'pending',
      errors: q.errors || [],
      warnings: q.warnings || [],
    }));

    const { error: insertError } = await supabaseAdmin
      .from('question_staging')
      .insert(stagingRows);

    if (insertError) {
      // Rollback batch if staging insert fails
      const { error: rollbackError } = await supabaseAdmin
        .from('import_batches')
        .delete()
        .eq('id', batch.id);

      if (rollbackError) {
        logger.error('Batch rollback failed after staging insert error', {
          source: LOG_SOURCE,
          metadata: { batchId: batch.id, rollbackError: rollbackError.message, originalError: insertError.message },
        });
      }

      throw insertError;
    }

    logger.info('Import batch created', {
      source: LOG_SOURCE,
      userId: authResult.user.id,
      metadata: { batchId: batch.id, totalRows: questions.length },
    });

    return successResponse(batch, rateLimitResult.headers);
  } catch (error) {
    logger.error('Failed to create import batch', {
      source: LOG_SOURCE,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return errorResponse(sanitizeError(error), 500);
  }
}
