/**
 * Centralized Application Logger
 *
 * Provides structured logging with persistent storage via the app_logs table.
 * - Server-side: writes directly to DB via supabaseAdmin
 * - Client-side: sends logs to /api/logs endpoint
 * - Always logs to console in development
 * - Fire-and-forget: never crashes the app if logging fails
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
 * Core log function — routes to console + persistent storage
 */
function log(level: LogLevel, message: string, entry: LogEntry): void {
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

    consoleFn(prefix, message, entry.metadata ?? '');
  }

  // Fire-and-forget persistence — don't await
  const persistFn = IS_SERVER ? persistLogServer : persistLogClient;
  persistFn(level, message, entry).catch(() => {
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
