/**
 * Shared auth helper for monitoring API routes
 * Verifies the request is from an authenticated owner
 */
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface AuthResult {
  authorized: boolean;
  userId?: string;
  error?: string;
  status?: number;
}

/**
 * Verify the request has a valid owner session.
 * Returns { authorized: false, error, status } on failure.
 */
export async function verifyOwnerAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { authorized: false, error: 'Unauthorized', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return { authorized: false, error: 'Unauthorized', status: 401 };
  }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'owner') {
    return { authorized: false, error: 'Forbidden', status: 403 };
  }

  return { authorized: true, userId: user.id };
}
