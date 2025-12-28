/**
 * @jest-environment node
 */

import { estimateTokens } from '@/lib/supabase/usage-tracking';

describe('Usage Tracking Utilities', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens as ~4 characters per token', () => {
      // 20 characters should be ~5 tokens
      const result = estimateTokens('This is a test text');
      expect(result).toBe(5); // 19 chars / 4 = 4.75, ceil = 5
    });

    it('should return 0 for empty string', () => {
      const result = estimateTokens('');
      expect(result).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(1000);
      const result = estimateTokens(longText);
      expect(result).toBe(250); // 1000 / 4 = 250
    });

    it('should round up for partial tokens', () => {
      // 5 characters = 1.25 tokens, should round up to 2
      const result = estimateTokens('hello');
      expect(result).toBe(2);
    });

    it('should handle unicode characters', () => {
      // Unicode characters are still counted by string length
      const result = estimateTokens('你好世界'); // 4 Chinese characters
      expect(result).toBe(1); // 4 / 4 = 1
    });
  });
});

// Note: trackServerApiUsage and checkServerUsageLimits require server-side
// Supabase client which uses cookies. These are better tested via integration
// tests or with more complex mocking of the server module.
