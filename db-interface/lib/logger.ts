/**
 * Centralized Application Logger
 *
 * Provides structured logging with persistent storage via the app_logs table.
 * - Server-side: writes directly to DB via supabaseAdmin
 * - Client-side: sends logs to /api/logs endpoint
 * - Always logs to console in development
 * - Fire-and-forget: never crashes the app if logging fails
 *
 * ## Safe fields checklist for reviewers
 * These fields are safe to include in metadata:
 *   - IDs: questionId, batchId, webhookId, requestId
 *   - Performance: duration, retries, timeout, memory, uptime
 *   - Context: endpoint, method, table, query (SELECT only), userAgent
 *   - Error info: error message, stack trace, status codes
 *
 * ## Sensitive fields (auto-redacted)
 * Keys matching SENSITIVE_KEYS below are replaced with '[REDACTED]'
 * to prevent accidental PII/secret leakage into persistent logs.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  source: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

const IS_SERVER = typeof window === 'undefined';
const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Keys whose values should be replaced with '[REDACTED]' in metadata.
 * Uses case-insensitive substring matching on key names.
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'auth',
  'secret',
  'apikey',
  'api_key',
  'ssn',
  'creditcard',
  'credit_card',
  'cvv',
  'authorization',
] as const;

const REDACTED = '[REDACTED]';

/**
 * Recursively sanitize a metadata object by redacting values
 * for keys that match known sensitive patterns.
 */
function sanitizeMetadata(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sk) => keyLower.includes(sk));

    if (isSensitive) {
      result[key] = REDACTED;
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Scan a log message for obvious token-like patterns and mask them.
 * Targets Bearer tokens, JWTs (three base64 segments), and hex API keys.
 */
function sanitizeMessage(message: string): string {
  return message
    // Bearer tokens
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    // JWT-like patterns (three dot-separated base64 segments)
    .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    // Long hex strings (32+ chars, likely API keys)
    .replace(/\b[0-9a-f]{32,}\b/gi, '[KEY_REDACTED]');
}

/**
 * Server-side: insert directly into app_logs via supabaseAdmin
 */
async function persistLogServer(
  level: LogLevel,
  message: string,
  entry: LogEntry
): Promise<void> {
  try {
    // Dynamic import to avoid bundling server code on client
    const { supabaseAdmin } = await import('@/lib/supabase-admin');

    await supabaseAdmin.from('app_logs').insert({
      level,
      source: entry.source,
      message,
      metadata: entry.metadata ?? {},
      user_id: entry.userId ?? null,
    });
  } catch (err) {
    // Fail silently — logging should never break the app
    if (IS_DEV) {
      console.warn('[logger] Failed to persist log (server):', err);
    }
  }
}

/**
 * Client-side: send log to /api/logs endpoint
 */
async function persistLogClient(
  level: LogLevel,
  message: string,
  entry: LogEntry
): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        source: entry.source,
        message,
        metadata: entry.metadata ?? {},
        userId: entry.userId,
      }),
    });
  } catch (err) {
    // Fail silently — logging should never break the app
    if (IS_DEV) {
      console.warn('[logger] Failed to persist log (client):', err);
    }
  }
}

/**
 * Core log function — routes to console + persistent storage.
 * Sanitizes metadata and message before any persistence.
 */
function log(level: LogLevel, message: string, entry: LogEntry): void {
  // Sanitize before anything else
  const cleanMessage = sanitizeMessage(message);
  const cleanMeta = entry.metadata
    ? sanitizeMetadata(entry.metadata)
    : undefined;
  const cleanEntry: LogEntry = { ...entry, metadata: cleanMeta };

  // Always log to console in dev, or for errors/fatals in production
  const shouldConsoleLog = IS_DEV || level === 'error' || level === 'fatal';

  if (shouldConsoleLog) {
    const prefix = `[${level.toUpperCase()}] [${entry.source}]`;
    const consoleFn =
      level === 'error' || level === 'fatal'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;

    consoleFn(prefix, cleanMessage, cleanMeta ?? '');
  }

  // Fire-and-forget persistence — don't await
  const persistFn = IS_SERVER ? persistLogServer : persistLogClient;
  persistFn(level, cleanMessage, cleanEntry).catch(() => {
    // Swallow any unhandled rejections from persistence
  });
}

/**
 * Public Logger API
 *
 * @example
 * logger.error('Failed to create question', {
 *   source: 'api/questions/POST',
 *   userId: user.id,
 *   metadata: { error: err.message, stack: err.stack }
 * });
 *
 * logger.info('Question deleted', {
 *   source: 'api/questions/DELETE',
 *   userId: user.id,
 *   metadata: { questionId: id }
 * });
 */
export const logger = {
  info: (message: string, entry: LogEntry) => log('info', message, entry),
  warn: (message: string, entry: LogEntry) => log('warn', message, entry),
  error: (message: string, entry: LogEntry) => log('error', message, entry),
  fatal: (message: string, entry: LogEntry) => log('fatal', message, entry),
};
