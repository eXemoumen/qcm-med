/**
 * Payment Status API
 *
 * Check the status of a payment.
 * Secured with authentication and rate limiting.
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
import { getSecurityHeaders } from '@/lib/security/payment-security';

// Validation schema
const checkoutIdSchema = z.object({
  checkout_id: z.string().min(1, 'checkout_id is required'),
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(request);
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - admin only
    const authResult = await requireAuthenticatedAdmin(request);
    if (authResult.error) return authResult.error;

    const searchParams = request.nextUrl.searchParams;
    const checkoutId = searchParams.get('checkout_id');

    // Validate checkout_id
    const validation = checkoutIdSchema.safeParse({ checkout_id: checkoutId });
    if (!validation.success) {
      return errorResponse('checkout_id is required', 400, rateLimitResult.headers);
    }

    const { data: payment, error } = await supabaseAdmin
      .from('online_payments')
      .select(`
        *,
        activation_key:activation_keys!online_payments_activation_key_id_fkey(key_code)
      `)
      .eq('checkout_id', checkoutId)
      .single();

    if (error || !payment) {
      return errorResponse('Payment not found', 404, rateLimitResult.headers);
    }

    return successResponse({
      status: payment.status,
      customerEmail: payment.customer_email,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: payment.paid_at,
    }, { ...rateLimitResult.headers, ...getSecurityHeaders() });
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
