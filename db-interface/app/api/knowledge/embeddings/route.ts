/**
 * API route for knowledge base embedding regeneration
 * Secured with owner access (expensive operation)
 */
import { NextRequest } from 'next/server';
import { updateAllEmbeddings } from '@/lib/rag';
import {
  requireAuthenticatedOwner,
  applyRateLimit,
  sanitizeError,
  errorResponse,
  successResponse,
} from '@/lib/security/api-utils';

// POST: Regenerate all embeddings
export async function POST(req: NextRequest) {
  try {
    // Rate limiting - expensive operation
    const rateLimitResult = await applyRateLimit(req, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - owner only (embedding regeneration is expensive)
    const authResult = await requireAuthenticatedOwner(req);
    if (authResult.error) return authResult.error;

    const result = await updateAllEmbeddings();

    return successResponse({
      updated: result.updated,
      errors: result.errors,
    }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
