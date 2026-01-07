/**
 * Structured Logger for Athenius
 *
 * Outputs JSON logs that can be queried in Vercel logs or exported to log aggregation services.
 *
 * Features:
 * - Structured JSON output
 * - Log levels (debug, info, warn, error)
 * - Request context (correlation ID, user ID)
 * - Automatic metadata (timestamp, environment)
 * - Performance timing helpers
 * - Sentry integration for error tracking
 */

import * as Sentry from '@sentry/nextjs';

// ============================================
// TYPES
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Unique request/correlation ID for tracing */
  requestId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Search query being processed */
  query?: string;
  /** LLM provider being used */
  provider?: string;
  /** Search mode (web, pro, brainstorm) */
  mode?: string;
  /** Whether this is a cache hit */
  cached?: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Any additional metadata */
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  environment: string;
  service: string;
}

// ============================================
// CONFIGURATION
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const SERVICE_NAME = 'athenius';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// ============================================
// LOGGER IMPLEMENTATION
// ============================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context ? cleanContext(context) : undefined,
    error: formatError(error),
    environment: ENVIRONMENT,
    service: SERVICE_NAME,
  };
}

/**
 * Remove undefined values and sensitive data from context
 */
function cleanContext(context: LogContext): LogContext {
  const cleaned: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    // Skip undefined/null values
    if (value === undefined || value === null) continue;

    // Truncate long strings (e.g., query content)
    if (typeof value === 'string' && value.length > 500) {
      cleaned[key] = value.substring(0, 500) + '...[truncated]';
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function output(entry: LogEntry): void {
  const json = JSON.stringify(entry);

  switch (entry.level) {
    case 'error':
      console.error(json);
      break;
    case 'warn':
      console.warn(json);
      break;
    case 'debug':
      console.debug(json);
      break;
    default:
      console.log(json);
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Create a logger instance with preset context.
 * Useful for adding request-scoped context to all logs.
 *
 * @example
 * ```typescript
 * const log = createLogger({ requestId: crypto.randomUUID(), userId: user.id });
 * log.info('Processing search', { query: 'test' });
 * log.error('Search failed', { provider: 'openai' }, error);
 * ```
 */
export function createLogger(baseContext?: LogContext) {
  return {
    debug: (message: string, context?: LogContext) => {
      if (shouldLog('debug')) {
        output(createLogEntry('debug', message, { ...baseContext, ...context }));
      }
    },

    info: (message: string, context?: LogContext) => {
      if (shouldLog('info')) {
        output(createLogEntry('info', message, { ...baseContext, ...context }));
      }
    },

    warn: (message: string, context?: LogContext, error?: unknown) => {
      if (shouldLog('warn')) {
        output(createLogEntry('warn', message, { ...baseContext, ...context }, error));
      }
    },

    error: (message: string, context?: LogContext, error?: unknown) => {
      if (shouldLog('error')) {
        output(createLogEntry('error', message, { ...baseContext, ...context }, error));
      }
      // Report to Sentry with context
      if (error) {
        Sentry.withScope((scope) => {
          const fullContext = { ...baseContext, ...context };
          scope.setTags({
            route: fullContext.route as string | undefined,
            provider: fullContext.provider as string | undefined,
            mode: fullContext.mode as string | undefined,
          });
          scope.setExtras(fullContext);
          if (fullContext.requestId) {
            scope.setTag('requestId', fullContext.requestId as string);
          }
          if (fullContext.userId) {
            scope.setUser({ id: fullContext.userId as string });
          }
          Sentry.captureException(error);
        });
      }
    },

    /**
     * Create a child logger with additional context
     */
    child: (additionalContext: LogContext) => {
      return createLogger({ ...baseContext, ...additionalContext });
    },
  };
}

// Default logger instance
export const logger = createLogger();

// ============================================
// SENTRY HELPERS
// ============================================

/**
 * Capture an error to Sentry with context.
 * Use this for errors that you want to track but not log.
 *
 * @example
 * ```typescript
 * captureError(error, { route: 'search', query: 'test' });
 * ```
 */
export function captureError(error: unknown, context?: LogContext): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setTags({
        route: context.route as string | undefined,
        provider: context.provider as string | undefined,
        mode: context.mode as string | undefined,
      });
      scope.setExtras(context);
      if (context.requestId) {
        scope.setTag('requestId', context.requestId as string);
      }
      if (context.userId) {
        scope.setUser({ id: context.userId as string });
      }
    }
    Sentry.captureException(error);
  });
}

/**
 * Add breadcrumb for debugging (shows in Sentry error timeline).
 *
 * @example
 * ```typescript
 * addBreadcrumb('API call', { provider: 'openai', success: true });
 * ```
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category = 'app'
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}

// ============================================
// TIMING HELPERS
// ============================================

/**
 * Measure execution time and log the result.
 *
 * @example
 * ```typescript
 * const result = await withTiming(
 *   'LLM call',
 *   () => callLLM(messages),
 *   { provider: 'openai' }
 * );
 * // Logs: {"level":"info","message":"LLM call completed","context":{"provider":"openai","durationMs":1234}}
 * ```
 */
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    const durationMs = Date.now() - start;

    logger.info(`${operation} completed`, { ...context, durationMs });

    return result;
  } catch (error) {
    const durationMs = Date.now() - start;

    logger.error(`${operation} failed`, { ...context, durationMs }, error);

    throw error;
  }
}

/**
 * Create a timer for manual timing control.
 *
 * @example
 * ```typescript
 * const timer = createTimer();
 * // ... do work ...
 * logger.info('Work done', { durationMs: timer.elapsed() });
 * ```
 */
export function createTimer() {
  const start = Date.now();

  return {
    elapsed: () => Date.now() - start,
    elapsedSeconds: () => (Date.now() - start) / 1000,
  };
}

// ============================================
// REQUEST ID HELPERS
// ============================================

/**
 * Generate a unique request ID for tracing.
 * Uses a short format for readability in logs.
 */
export function generateRequestId(): string {
  // Short format: timestamp-random (e.g., "1704067200-a1b2c3")
  const timestamp = Math.floor(Date.now() / 1000).toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// ============================================
// API ROUTE HELPER
// ============================================

/**
 * Create a logger for an API route with automatic request ID.
 *
 * @example
 * ```typescript
 * export async function POST(request: Request) {
 *   const log = createApiLogger('search');
 *
 *   log.info('Search started', { query });
 *
 *   try {
 *     const result = await performSearch(query);
 *     log.info('Search completed', { sourcesCount: result.sources.length });
 *     return Response.json(result);
 *   } catch (error) {
 *     log.error('Search failed', {}, error);
 *     return Response.json({ error: 'Search failed' }, { status: 500 });
 *   }
 * }
 * ```
 */
export function createApiLogger(routeName: string, userId?: string) {
  return createLogger({
    requestId: generateRequestId(),
    route: routeName,
    userId,
  });
}

// ============================================
// LOG AGGREGATION HELPERS
// ============================================

/**
 * Standard log messages for consistent querying.
 * Use these constants instead of ad-hoc strings.
 */
export const LogMessages = {
  // Search flow
  SEARCH_STARTED: 'Search started',
  SEARCH_COMPLETED: 'Search completed',
  SEARCH_FAILED: 'Search failed',
  SEARCH_CACHE_HIT: 'Search cache hit',
  SEARCH_CACHE_MISS: 'Search cache miss',

  // LLM operations
  LLM_CALL_STARTED: 'LLM call started',
  LLM_CALL_COMPLETED: 'LLM call completed',
  LLM_CALL_FAILED: 'LLM call failed',
  LLM_FALLBACK_TRIGGERED: 'LLM fallback triggered',

  // Research pipeline
  RESEARCH_PLAN_STARTED: 'Research plan started',
  RESEARCH_PLAN_COMPLETED: 'Research plan completed',
  RESEARCH_EXTRACT_STARTED: 'Research extract started',
  RESEARCH_EXTRACT_COMPLETED: 'Research extract completed',
  RESEARCH_SYNTHESIS_STARTED: 'Research synthesis started',
  RESEARCH_SYNTHESIS_COMPLETED: 'Research synthesis completed',

  // Circuit breaker
  CIRCUIT_BREAKER_OPENED: 'Circuit breaker opened',
  CIRCUIT_BREAKER_CLOSED: 'Circuit breaker closed',
  CIRCUIT_BREAKER_HALF_OPEN: 'Circuit breaker half-open',

  // Credits
  CREDITS_RESERVED: 'Credits reserved',
  CREDITS_FINALIZED: 'Credits finalized',
  CREDITS_INSUFFICIENT: 'Insufficient credits',

  // Auth
  AUTH_LOGIN_SUCCESS: 'Login successful',
  AUTH_LOGIN_FAILED: 'Login failed',
  AUTH_SIGNUP_SUCCESS: 'Signup successful',
  AUTH_LOCKOUT_TRIGGERED: 'Account lockout triggered',
} as const;

/**
 * Standard context keys for consistent querying.
 */
export const LogContextKeys = {
  REQUEST_ID: 'requestId',
  USER_ID: 'userId',
  QUERY: 'query',
  PROVIDER: 'provider',
  MODE: 'mode',
  CACHED: 'cached',
  DURATION_MS: 'durationMs',
  SOURCES_COUNT: 'sourcesCount',
  ERROR_CODE: 'errorCode',
  CREDITS_USED: 'creditsUsed',
  CIRCUIT_STATE: 'circuitState',
} as const;
