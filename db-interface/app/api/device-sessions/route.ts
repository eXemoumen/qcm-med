/**
 * API route for device session management
 * Secured with admin access and rate limiting
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  requireAuthenticatedAdmin,
  applyRateLimit,
  sanitizeError,
  errorResponse,
  successResponse,
} from '@/lib/security/api-utils';

// Validation schemas
const userIdSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

const deviceSessionSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  fingerprint: z.string().optional(),
});

// GET: List device sessions for a user
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req);
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Validate userId
    const userIdValidation = userIdSchema.safeParse({ userId });
    if (!userIdValidation.success) {
      return errorResponse('Invalid user ID format', 400, rateLimitResult.headers);
    }

    const { data: sessions, error } = await supabaseAdmin
      .from('device_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false });

    if (error) throw error;

    return successResponse({ sessions }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}

// POST: Register or check device session
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'write');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(req);
    if (authResult.error) return authResult.error;

    // Validate input
    const validationResult = await (async () => {
      try {
        const body = await req.json();
        return deviceSessionSchema.safeParse(body);
      } catch {
        return { success: false, error: { issues: [{ message: 'Invalid JSON body' }] } } as const;
      }
    })();

    if (!validationResult.success) {
      return errorResponse('Invalid request body', 400, rateLimitResult.headers);
    }

    const { userId, fingerprint } = validationResult.data;

    // Get existing sessions for this user
    const { data: sessions, error } = await supabaseAdmin
      .from('device_sessions')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    // Look for similar device based on fingerprint characteristics
    let matchingDeviceId = null;

    if (fingerprint && sessions) {
      // Extract key characteristics from fingerprint
      const fpParts = fingerprint.split('|');
      const osName = fpParts[0];
      const screenRes = fpParts[1];

      // Look for existing sessions with similar characteristics
      for (const session of sessions) {
        const deviceId = session.device_id;

        // Skip sessions with null/undefined device_id
        if (!deviceId) continue;

        const deviceIdLower = deviceId.toLowerCase();

        // Check if this might be the same device accessed via different platform
        // Screen resolution is only evaluated as an additional condition when OS matches
        if (osName && deviceIdLower.includes(osName.toLowerCase())) {
          if (!screenRes || deviceId.includes(screenRes)) {
            matchingDeviceId = deviceId;
            break;
          }
        }
      }
    }

    return successResponse({ matchingDeviceId }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
