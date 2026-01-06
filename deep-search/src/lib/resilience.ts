/**
 * Resilience patterns for external API calls
 *
 * Provides:
 * - Retry with exponential backoff
 * - Circuit breaker pattern
 * - Configurable timeouts
 */

// ============================================
// TYPES
// ============================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor 0-1 to add randomness to delays (default: 0.1) */
  jitterFactor?: number;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
  /** Called before each retry attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeoutMs?: number;
  /** Number of successful calls in half-open to close circuit (default: 2) */
  successThreshold?: number;
  /** Called when circuit state changes */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

// ============================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Determines if an error should trigger a retry.
 * Default: retry on network errors and 5xx server errors, not on 4xx client errors.
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors - always retry
  if (
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up')
  ) {
    return true;
  }

  // Rate limiting - retry after delay
  if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return true;
  }

  // Server errors (5xx) - retry
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return true;
  }

  // Timeout - retry
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // Client errors (4xx except 429) - don't retry
  if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
    return false;
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitterFactor: number
): number {
  // Exponential backoff: initialDelay * multiplier^attempt
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter: random variation to prevent thundering herd
  const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, onRetry: (err, attempt) => console.log(`Retry ${attempt}`) }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
    jitterFactor = DEFAULT_RETRY_OPTIONS.jitterFactor,
    isRetryable = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we've exhausted retries
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        throw lastError;
      }

      // Calculate delay for this retry
      const delayMs = calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier, jitterFactor);

      // Notify of retry
      if (onRetry) {
        onRetry(lastError, attempt + 1, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

// ============================================
// CIRCUIT BREAKER
// ============================================

const DEFAULT_CIRCUIT_OPTIONS: Required<Omit<CircuitBreakerOptions, 'onStateChange'>> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
};

/**
 * Circuit breaker implementation for preventing cascading failures.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF-OPEN: Testing if service has recovered
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 5 });
 *
 * try {
 *   const result = await breaker.execute(() => fetch('https://api.example.com'));
 * } catch (error) {
 *   if (error.message.includes('Circuit breaker is open')) {
 *     // Service is unavailable, fail fast
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly onStateChange?: (state: CircuitState, previousState: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_CIRCUIT_OPTIONS.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs ?? DEFAULT_CIRCUIT_OPTIONS.resetTimeoutMs;
    this.successThreshold = options.successThreshold ?? DEFAULT_CIRCUIT_OPTIONS.successThreshold;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowed(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Check if reset timeout has elapsed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transitionTo('half-open');
        return true;
      }
      return false;
    }

    // Half-open: allow limited requests to test recovery
    return true;
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    this.totalSuccesses++;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.reset();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open immediately opens circuit
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Force the circuit to open (useful for manual intervention)
   */
  trip(): void {
    this.transitionTo('open');
    this.lastFailureTime = Date.now();
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const previousState = this.state;
      this.state = newState;
      this.successes = 0;

      if (newState === 'closed') {
        this.failures = 0;
      }

      if (this.onStateChange) {
        this.onStateChange(newState, previousState);
      }
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (!this.isAllowed()) {
      const waitTime = this.lastFailureTime
        ? Math.max(0, this.resetTimeoutMs - (Date.now() - this.lastFailureTime))
        : this.resetTimeoutMs;
      throw new Error(
        `Circuit breaker is open. Service unavailable. Retry in ${Math.ceil(waitTime / 1000)}s`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}

// ============================================
// TIMEOUT WRAPPER
// ============================================

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout.
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetch('https://api.example.com'),
 *   5000 // 5 second timeout
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    if (error instanceof TimeoutError && timeoutMessage) {
      throw new Error(timeoutMessage);
    }
    throw error;
  }
}

// ============================================
// COMBINED RESILIENT CALL
// ============================================

export interface ResilientCallOptions extends RetryOptions {
  /** Timeout in ms for each attempt (default: 30000) */
  timeoutMs?: number;
  /** Circuit breaker instance (optional, for shared state across calls) */
  circuitBreaker?: CircuitBreaker;
  /** Name for logging purposes */
  name?: string;
}

/**
 * Execute a function with combined resilience patterns:
 * - Timeout per attempt
 * - Retry with exponential backoff
 * - Circuit breaker (if provided)
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker();
 *
 * const result = await resilientCall(
 *   () => fetch('https://api.example.com'),
 *   {
 *     name: 'api-call',
 *     timeoutMs: 10000,
 *     maxRetries: 3,
 *     circuitBreaker: breaker,
 *   }
 * );
 * ```
 */
export async function resilientCall<T>(
  fn: () => Promise<T>,
  options: ResilientCallOptions = {}
): Promise<T> {
  const {
    timeoutMs = 30000,
    circuitBreaker,
    name = 'resilient-call',
    ...retryOptions
  } = options;

  // Wrap function with timeout
  const withTimeoutFn = () => withTimeout(fn(), timeoutMs);

  // Add logging to retry callback
  const onRetry = (error: Error, attempt: number, delayMs: number) => {
    console.warn(`[${name}] Retry ${attempt} after ${delayMs}ms: ${error.message}`);
    if (options.onRetry) {
      options.onRetry(error, attempt, delayMs);
    }
  };

  // If circuit breaker is provided, use it
  if (circuitBreaker) {
    return circuitBreaker.execute(() =>
      withRetry(withTimeoutFn, { ...retryOptions, onRetry })
    );
  }

  // Otherwise just use retry with timeout
  return withRetry(withTimeoutFn, { ...retryOptions, onRetry });
}

// ============================================
// CIRCUIT BREAKER REGISTRY
// ============================================

/**
 * Global registry for circuit breakers.
 * Allows sharing circuit breaker state across multiple calls to the same service.
 */
class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker for a named service
   */
  getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker({
        ...options,
        onStateChange: (state, prev) => {
          console.log(`[CircuitBreaker:${name}] State changed: ${prev} -> ${state}`);
          if (options?.onStateChange) {
            options.onStateChange(state, prev);
          }
        },
      });
      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset a specific circuit breaker
   */
  resetBreaker(name: string): void {
    this.breakers.get(name)?.reset();
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Singleton instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// ============================================
// PROVIDER-SPECIFIC CONFIGURATIONS
// ============================================

export const PROVIDER_TIMEOUTS = {
  // LLM providers - longer timeout for generation
  llm: 60000, // 60 seconds for LLM calls
  llmStreaming: 120000, // 2 minutes for streaming (includes full generation time)

  // Search API - shorter timeout
  search: 15000, // 15 seconds for search

  // Default
  default: 30000,
} as const;

export const PROVIDER_RETRY_OPTIONS: Record<string, RetryOptions> = {
  llm: {
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  },
  search: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 3000,
    backoffMultiplier: 2,
  },
};

export const CIRCUIT_BREAKER_OPTIONS: Record<string, CircuitBreakerOptions> = {
  // LLM providers - more tolerant (expensive to fail)
  llm: {
    failureThreshold: 5,
    resetTimeoutMs: 30000, // 30 seconds
    successThreshold: 2,
  },
  // Search - less tolerant (faster to fail)
  search: {
    failureThreshold: 3,
    resetTimeoutMs: 20000, // 20 seconds
    successThreshold: 1,
  },
};
