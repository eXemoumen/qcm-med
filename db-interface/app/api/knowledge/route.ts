/**
 * API route for knowledge base management
 * Secured with admin access and rate limiting
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { addKnowledge } from '@/lib/rag';
import {
  requireAuthenticatedAdmin,
  applyRateLimit,
  validateBody,
  sanitizeError,
  errorResponse,
  successResponse,
} from '@/lib/security/api-utils';

// Validation schemas
const knowledgeEntrySchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  content: z.string().min(1, 'Content is required').max(50000, 'Content too long'),
  category: z.string().max(100, 'Category too long').optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const knowledgeUpdateSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(50000).optional(),
  category: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const knowledgeIdSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// GET: List all knowledge entries
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req);
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    let query = supabaseAdmin
      .from('knowledge_base')
      .select('id, title, content, category, metadata, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    return successResponse({ knowledge: data }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}

// POST: Add new knowledge entry
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    // Validate input
    const validationResult = await validateBody(req, knowledgeEntrySchema);
    if (validationResult.error) return validationResult.error;

    const { title, content, category, metadata } = validationResult.data;

    const result = await addKnowledge(title, content, category || 'general', metadata || {});

    if (!result.success) {
      return errorResponse(result.error || 'Failed to add knowledge', 500, rateLimitResult.headers);
    }

    return successResponse({ id: result.id }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}

// PUT: Update knowledge entry
export async function PUT(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    // Validate input
    const validationResult = await validateBody(req, knowledgeUpdateSchema);
    if (validationResult.error) return validationResult.error;

    const { id, title, content, category, metadata } = validationResult.data;

    const { error } = await supabaseAdmin
      .from('knowledge_base')
      .update({
        title,
        content,
        category,
        metadata,
        updated_at: new Date().toISOString(),
        embedding: null, // Clear embedding so it gets regenerated
      })
      .eq('id', id);

    if (error) throw error;

    return successResponse({ success: true }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}

// DELETE: Remove knowledge entry
export async function DELETE(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    // Validate ID
    const idValidation = knowledgeIdSchema.safeParse({ id });
    if (!idValidation.success) {
      return errorResponse('Invalid ID format', 400, rateLimitResult.headers);
    }

    const { error } = await supabaseAdmin
      .from('knowledge_base')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return successResponse({ success: true }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
