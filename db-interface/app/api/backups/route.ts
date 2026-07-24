/**
 * API route for listing database backups
 * Secured with owner access and rate limiting
 */
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  requireAuthenticatedOwner,
  applyRateLimit,
  sanitizeError,
  errorResponse,
  successResponse,
} from '@/lib/security/api-utils';

// GET: List all backup files
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(req, 'export');
    if (rateLimitResult.error) return rateLimitResult.error;

    // Authentication - owner only (backups contain sensitive data)
    const authResult = await requireAuthenticatedOwner(req);
    if (authResult.error) return authResult.error;

    const backupDir = path.join(process.cwd(), '..', 'backups');

    if (!fs.existsSync(backupDir)) {
      return successResponse({ backups: [] }, rateLimitResult.headers);
    }

    const files = fs.readdirSync(backupDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return successResponse({ backups: sqlFiles }, rateLimitResult.headers);
  } catch (error) {
    return errorResponse(sanitizeError(error), 500);
  }
}
