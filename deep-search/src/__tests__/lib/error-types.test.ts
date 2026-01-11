/**
 * Tests for error-types.ts - Standardized error handling
 */

import {
  ErrorType,
  errorMessages,
  detectErrorType,
  createApiError,
} from '@/lib/error-types';

describe('error-types', () => {
  describe('errorMessages', () => {
    it('should have all required error types', () => {
      const expectedTypes: ErrorType[] = [
        'credits_insufficient',
        'rate_limited',
        'provider_unavailable',
        'search_failed',
        'synthesis_failed',
        'network_error',
        'stream_interrupted',
        'timeout',
        'invalid_query',
        'no_results',
        'auth_required',
        'unknown',
      ];

      expectedTypes.forEach((type) => {
        expect(errorMessages[type]).toBeDefined();
        expect(errorMessages[type].title).toBeTruthy();
        expect(errorMessages[type].message).toBeTruthy();
        expect(typeof errorMessages[type].canRetry).toBe('boolean');
      });
    });

    it('should mark non-retryable errors correctly', () => {
      expect(errorMessages.credits_insufficient.canRetry).toBe(false);
      expect(errorMessages.invalid_query.canRetry).toBe(false);
      expect(errorMessages.no_results.canRetry).toBe(false);
      expect(errorMessages.auth_required.canRetry).toBe(false);
    });

    it('should mark retryable errors correctly', () => {
      expect(errorMessages.rate_limited.canRetry).toBe(true);
      expect(errorMessages.provider_unavailable.canRetry).toBe(true);
      expect(errorMessages.search_failed.canRetry).toBe(true);
      expect(errorMessages.synthesis_failed.canRetry).toBe(true);
      expect(errorMessages.network_error.canRetry).toBe(true);
      expect(errorMessages.stream_interrupted.canRetry).toBe(true);
      expect(errorMessages.timeout.canRetry).toBe(true);
      expect(errorMessages.unknown.canRetry).toBe(true);
    });
  });

  describe('detectErrorType', () => {
    it('should detect timeout errors', () => {
      expect(detectErrorType(new Error('Request timeout'))).toBe('timeout');
      expect(detectErrorType(new Error('Connection timed out'))).toBe('timeout');

      const timeoutError = new Error('timeout');
      timeoutError.name = 'TimeoutError';
      expect(detectErrorType(timeoutError)).toBe('timeout');
    });

    it('should detect network errors', () => {
      expect(detectErrorType(new Error('Network error'))).toBe('network_error');
      expect(detectErrorType(new Error('Failed to fetch'))).toBe('network_error');
      expect(detectErrorType(new Error('Connection refused'))).toBe('network_error');

      const typeError = new TypeError('Failed to fetch');
      expect(detectErrorType(typeError)).toBe('network_error');
    });

    it('should return unknown for abort errors', () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      expect(detectErrorType(abortError)).toBe('unknown');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(detectErrorType(new Error('Some random error'))).toBe('unknown');
      expect(detectErrorType('string error')).toBe('unknown');
      expect(detectErrorType(null)).toBe('unknown');
      expect(detectErrorType(undefined)).toBe('unknown');
      expect(detectErrorType({ message: 'object error' })).toBe('unknown');
    });
  });

  describe('createApiError', () => {
    it('should create error with default message', () => {
      const error = createApiError('network_error');
      expect(error.error).toBe(errorMessages.network_error.message);
      expect(error.errorType).toBe('network_error');
      expect(error.details).toBeUndefined();
      expect(error.retryAfter).toBeUndefined();
    });

    it('should allow custom message', () => {
      const customMessage = 'Custom error message';
      const error = createApiError('timeout', customMessage);
      expect(error.error).toBe(customMessage);
      expect(error.errorType).toBe('timeout');
    });

    it('should include details when provided', () => {
      const error = createApiError('search_failed', undefined, 'Tavily API returned 500');
      expect(error.error).toBe(errorMessages.search_failed.message);
      expect(error.details).toBe('Tavily API returned 500');
    });

    it('should include retryAfter when provided', () => {
      const error = createApiError('rate_limited', undefined, undefined, 60);
      expect(error.errorType).toBe('rate_limited');
      expect(error.retryAfter).toBe(60);
    });

    it('should include all optional fields when provided', () => {
      const error = createApiError(
        'rate_limited',
        'Too many requests, slow down',
        'Rate limit: 100/min',
        30
      );
      expect(error.error).toBe('Too many requests, slow down');
      expect(error.errorType).toBe('rate_limited');
      expect(error.details).toBe('Rate limit: 100/min');
      expect(error.retryAfter).toBe(30);
    });
  });
});
