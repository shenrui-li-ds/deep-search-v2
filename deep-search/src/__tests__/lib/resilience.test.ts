/**
 * Tests for resilience patterns: retry, circuit breaker, timeout
 */

import {
  withRetry,
  withTimeout,
  CircuitBreaker,
  resilientCall,
  isRetryableError,
  TimeoutError,
  circuitBreakerRegistry,
} from '@/lib/resilience';

describe('isRetryableError', () => {
  it('should return true for network errors', () => {
    expect(isRetryableError(new Error('Network error'))).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });

  it('should return true for rate limiting errors', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('should return true for server errors (5xx)', () => {
    expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
    expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
  });

  it('should return true for timeout errors', () => {
    expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    expect(isRetryableError(new Error('Operation timed out'))).toBe(true);
  });

  it('should return false for client errors (4xx except 429)', () => {
    expect(isRetryableError(new Error('400 Bad Request'))).toBe(false);
    expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
    expect(isRetryableError(new Error('403 Forbidden'))).toBe(false);
    expect(isRetryableError(new Error('404 Not Found'))).toBe(false);
  });

  it('should return true for unknown errors (fail-safe)', () => {
    expect(isRetryableError(new Error('Something unexpected happened'))).toBe(true);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 100,
      jitterFactor: 0, // Disable jitter for predictable tests
    });

    // Advance timers for retries
    await jest.advanceTimersByTimeAsync(100); // First retry delay
    await jest.advanceTimersByTimeAsync(200); // Second retry delay (exponential)

    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries exhausted', async () => {
    jest.useRealTimers(); // Use real timers for this test

    const fn = jest.fn().mockRejectedValue(new Error('Persistent error'));

    await expect(withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10, // Short delays for fast test
      maxDelayMs: 50,
      jitterFactor: 0,
    })).rejects.toThrow('Persistent error');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries

    jest.useFakeTimers(); // Restore fake timers
  });

  it('should not retry non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('400 Bad Request'));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('400 Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const onRetry = jest.fn();

    const resultPromise = withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 100,
      jitterFactor: 0,
      onRetry,
    });

    await jest.advanceTimersByTimeAsync(100);

    await resultPromise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });

  it('should respect custom isRetryable function', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Custom error'));
    const isRetryable = jest.fn().mockReturnValue(false);

    await expect(withRetry(fn, { maxRetries: 3, isRetryable })).rejects.toThrow('Custom error');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable).toHaveBeenCalled();
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return result if promise resolves before timeout', async () => {
    const promise = Promise.resolve('success');

    const result = await withTimeout(promise, 1000);

    expect(result).toBe('success');
  });

  it('should throw TimeoutError if promise takes too long', async () => {
    const promise = new Promise(resolve => setTimeout(resolve, 2000));

    const resultPromise = withTimeout(promise, 1000);

    jest.advanceTimersByTime(1001);

    await expect(resultPromise).rejects.toThrow(TimeoutError);
    await expect(resultPromise).rejects.toThrow('Request timed out after 1000ms');
  });

  it('should use custom timeout message', async () => {
    const promise = new Promise(resolve => setTimeout(resolve, 2000));

    const resultPromise = withTimeout(promise, 1000, 'Custom timeout message');

    jest.advanceTimersByTime(1001);

    await expect(resultPromise).rejects.toThrow('Custom timeout message');
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
    });
  });

  it('should start in closed state', () => {
    expect(breaker.getStats().state).toBe('closed');
    expect(breaker.isAllowed()).toBe(true);
  });

  it('should open after failure threshold', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('fail');
    }

    expect(breaker.getStats().state).toBe('open');
    expect(breaker.isAllowed()).toBe(false);
  });

  it('should reject requests when open', async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure();
    }

    expect(breaker.getStats().state).toBe('open');

    await expect(breaker.execute(() => Promise.resolve('success')))
      .rejects.toThrow('Circuit breaker is open');
  });

  it('should transition to half-open after reset timeout', async () => {
    jest.useFakeTimers();

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure();
    }

    expect(breaker.getStats().state).toBe('open');

    // Wait for reset timeout
    jest.advanceTimersByTime(1001);

    // Should now be half-open (isAllowed triggers transition)
    expect(breaker.isAllowed()).toBe(true);
    expect(breaker.getStats().state).toBe('half-open');

    jest.useRealTimers();
  });

  it('should close after success threshold in half-open', async () => {
    jest.useFakeTimers();

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure();
    }

    // Wait for reset timeout
    jest.advanceTimersByTime(1001);
    breaker.isAllowed(); // Trigger transition to half-open

    // Succeed twice
    await breaker.execute(() => Promise.resolve('success'));
    await breaker.execute(() => Promise.resolve('success'));

    expect(breaker.getStats().state).toBe('closed');

    jest.useRealTimers();
  });

  it('should reopen on failure in half-open', async () => {
    jest.useFakeTimers();

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure();
    }

    // Wait for reset timeout
    jest.advanceTimersByTime(1001);
    breaker.isAllowed(); // Trigger transition to half-open

    // Fail once
    await expect(breaker.execute(() => Promise.reject(new Error('fail'))))
      .rejects.toThrow('fail');

    expect(breaker.getStats().state).toBe('open');

    jest.useRealTimers();
  });

  it('should call onStateChange callback', () => {
    const onStateChange = jest.fn();

    const breakerWithCallback = new CircuitBreaker({
      failureThreshold: 2,
      onStateChange,
    });

    breakerWithCallback.recordFailure();
    breakerWithCallback.recordFailure();

    expect(onStateChange).toHaveBeenCalledWith('open', 'closed');
  });

  it('should reset failure count on success in closed state', () => {
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getStats().failures).toBe(2);

    breaker.recordSuccess();

    expect(breaker.getStats().failures).toBe(0);
  });

  it('should track total statistics', async () => {
    await breaker.execute(() => Promise.resolve('success'));
    await breaker.execute(() => Promise.resolve('success'));
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    const stats = breaker.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.totalSuccesses).toBe(2);
    expect(stats.totalFailures).toBe(1);
  });

  it('should manually trip and reset', () => {
    expect(breaker.getStats().state).toBe('closed');

    breaker.trip();
    expect(breaker.getStats().state).toBe('open');

    breaker.reset();
    expect(breaker.getStats().state).toBe('closed');
  });
});

describe('resilientCall', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    circuitBreakerRegistry.resetAll();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should combine timeout, retry, and circuit breaker', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const breaker = new CircuitBreaker();

    const result = await resilientCall(fn, {
      name: 'test',
      timeoutMs: 5000,
      maxRetries: 2,
      circuitBreaker: breaker,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on timeout', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise(resolve => setTimeout(resolve, 10000));
      }
      return Promise.resolve('success');
    });

    const resultPromise = resilientCall(fn, {
      name: 'test',
      timeoutMs: 100,
      maxRetries: 2,
      initialDelayMs: 50,
      jitterFactor: 0,
    });

    // First call times out
    await jest.advanceTimersByTimeAsync(101);
    // Retry delay
    await jest.advanceTimersByTimeAsync(50);

    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should fail when circuit breaker is open', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.trip(); // Force open

    await expect(resilientCall(
      () => Promise.resolve('success'),
      { circuitBreaker: breaker }
    )).rejects.toThrow('Circuit breaker is open');
  });
});

describe('CircuitBreakerRegistry', () => {
  beforeEach(() => {
    circuitBreakerRegistry.resetAll();
  });

  it('should create and return the same breaker for same name', () => {
    const breaker1 = circuitBreakerRegistry.getBreaker('test-service');
    const breaker2 = circuitBreakerRegistry.getBreaker('test-service');

    expect(breaker1).toBe(breaker2);
  });

  it('should create different breakers for different names', () => {
    const breaker1 = circuitBreakerRegistry.getBreaker('service-a');
    const breaker2 = circuitBreakerRegistry.getBreaker('service-b');

    expect(breaker1).not.toBe(breaker2);
  });

  it('should return stats for all breakers', () => {
    circuitBreakerRegistry.getBreaker('service-a');
    circuitBreakerRegistry.getBreaker('service-b');

    const stats = circuitBreakerRegistry.getAllStats();

    expect(stats).toHaveProperty('service-a');
    expect(stats).toHaveProperty('service-b');
  });

  it('should reset specific breaker', () => {
    const breaker = circuitBreakerRegistry.getBreaker('test-service');
    breaker.trip();

    expect(breaker.getStats().state).toBe('open');

    circuitBreakerRegistry.resetBreaker('test-service');

    expect(breaker.getStats().state).toBe('closed');
  });

  it('should reset all breakers', () => {
    const breaker1 = circuitBreakerRegistry.getBreaker('service-a');
    const breaker2 = circuitBreakerRegistry.getBreaker('service-b');

    breaker1.trip();
    breaker2.trip();

    circuitBreakerRegistry.resetAll();

    expect(breaker1.getStats().state).toBe('closed');
    expect(breaker2.getStats().state).toBe('closed');
  });
});

describe('Per-tier Circuit Breakers', () => {
  beforeEach(() => {
    circuitBreakerRegistry.resetAll();
  });

  it('should create separate breakers for different tiers', () => {
    const freeBreaker = circuitBreakerRegistry.getTieredBreaker('tavily', 'free');
    const proBreaker = circuitBreakerRegistry.getTieredBreaker('tavily', 'pro');
    const adminBreaker = circuitBreakerRegistry.getTieredBreaker('tavily', 'admin');

    expect(freeBreaker).not.toBe(proBreaker);
    expect(proBreaker).not.toBe(adminBreaker);
    expect(freeBreaker).not.toBe(adminBreaker);
  });

  it('should return same breaker for same tier', () => {
    const breaker1 = circuitBreakerRegistry.getTieredBreaker('tavily', 'free');
    const breaker2 = circuitBreakerRegistry.getTieredBreaker('tavily', 'free');

    expect(breaker1).toBe(breaker2);
  });

  it('should isolate failures between tiers', async () => {
    // Use a unique service name to ensure fresh breakers with specific options
    const freeBreaker = circuitBreakerRegistry.getTieredBreaker('isolation-test', 'free', {
      failureThreshold: 2,
    });
    const proBreaker = circuitBreakerRegistry.getTieredBreaker('isolation-test', 'pro', {
      failureThreshold: 2,
    });

    // Fail the free tier breaker
    freeBreaker.recordFailure();
    freeBreaker.recordFailure();

    expect(freeBreaker.getStats().state).toBe('open');
    expect(proBreaker.getStats().state).toBe('closed');
    expect(proBreaker.isAllowed()).toBe(true);
  });

  it('should default to free tier when tier not specified', () => {
    const defaultBreaker = circuitBreakerRegistry.getTieredBreaker('tavily');
    const freeBreaker = circuitBreakerRegistry.getTieredBreaker('tavily', 'free');

    expect(defaultBreaker).toBe(freeBreaker);
  });

  it('should get stats for a specific service across all tiers', () => {
    circuitBreakerRegistry.getTieredBreaker('tavily', 'free');
    circuitBreakerRegistry.getTieredBreaker('tavily', 'pro');
    circuitBreakerRegistry.getTieredBreaker('tavily', 'admin');

    const stats = circuitBreakerRegistry.getServiceStats('tavily');

    expect(stats).toHaveProperty('tavily:free');
    expect(stats).toHaveProperty('tavily:pro');
    expect(stats).toHaveProperty('tavily:admin');
  });

  it('should reset all breakers for a specific service', () => {
    const freeBreaker = circuitBreakerRegistry.getTieredBreaker('tavily', 'free');
    const proBreaker = circuitBreakerRegistry.getTieredBreaker('tavily', 'pro');
    const otherBreaker = circuitBreakerRegistry.getBreaker('other-service');

    freeBreaker.trip();
    proBreaker.trip();
    otherBreaker.trip();

    expect(freeBreaker.getStats().state).toBe('open');
    expect(proBreaker.getStats().state).toBe('open');
    expect(otherBreaker.getStats().state).toBe('open');

    circuitBreakerRegistry.resetService('tavily');

    expect(freeBreaker.getStats().state).toBe('closed');
    expect(proBreaker.getStats().state).toBe('closed');
    expect(otherBreaker.getStats().state).toBe('open');
  });
});
