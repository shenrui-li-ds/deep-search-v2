/**
 * @jest-environment node
 */
import { generateCacheKey } from '@/lib/cache';

describe('cache', () => {
  describe('generateCacheKey', () => {
    it('generates search cache key with query, depth, and maxResults', () => {
      const key = generateCacheKey('search', {
        query: 'quantum computing',
        depth: 'advanced',
        maxResults: 20,
      });

      expect(key).toMatch(/^search:[a-f0-9]{32}:advanced:20$/);
    });

    it('normalizes query case for search cache key', () => {
      const key1 = generateCacheKey('search', {
        query: 'Quantum Computing',
        depth: 'basic',
        maxResults: 10,
      });

      const key2 = generateCacheKey('search', {
        query: 'quantum computing',
        depth: 'basic',
        maxResults: 10,
      });

      expect(key1).toBe(key2);
    });

    it('trims whitespace from query', () => {
      const key1 = generateCacheKey('search', {
        query: '  quantum computing  ',
        depth: 'basic',
        maxResults: 10,
      });

      const key2 = generateCacheKey('search', {
        query: 'quantum computing',
        depth: 'basic',
        maxResults: 10,
      });

      expect(key1).toBe(key2);
    });

    it('generates refine cache key with query and provider', () => {
      const key = generateCacheKey('refine', {
        query: 'best restaurants',
        provider: 'openai',
      });

      expect(key).toMatch(/^refine:[a-f0-9]{32}:openai$/);
    });

    it('uses default provider when not specified for refine', () => {
      const key = generateCacheKey('refine', {
        query: 'best restaurants',
      });

      expect(key).toMatch(/^refine:[a-f0-9]{32}:default$/);
    });

    it('generates summary cache key with query, sources, and provider', () => {
      const key = generateCacheKey('summary', {
        query: 'climate change',
        provider: 'gemini',
        sources: ['https://example.com/1', 'https://example.com/2'],
      });

      expect(key).toMatch(/^summary:[a-f0-9]{32}:[a-f0-9]{32}:gemini$/);
    });

    it('generates consistent summary cache key regardless of source order', () => {
      const key1 = generateCacheKey('summary', {
        query: 'climate change',
        provider: 'gemini',
        sources: ['https://example.com/1', 'https://example.com/2'],
      });

      const key2 = generateCacheKey('summary', {
        query: 'climate change',
        provider: 'gemini',
        sources: ['https://example.com/2', 'https://example.com/1'],
      });

      expect(key1).toBe(key2);
    });

    it('generates related cache key with query and content hash', () => {
      const key = generateCacheKey('related', {
        query: 'machine learning',
        content: 'Some content about ML...',
      });

      expect(key).toMatch(/^related:[a-f0-9]{32}:[a-f0-9]{32}$/);
    });

    it('generates plan cache key with query and provider', () => {
      const key = generateCacheKey('plan', {
        query: 'quantum computing research',
        provider: 'claude',
      });

      expect(key).toMatch(/^plan:[a-f0-9]{32}:claude$/);
    });

    it('generates research-synthesis cache key with aspectResults', () => {
      const key = generateCacheKey('research-synthesis', {
        query: 'quantum computing',
        provider: 'deepseek',
        aspectResults: [
          {
            aspect: 'fundamentals',
            query: 'what is quantum computing',
            results: [
              { url: 'https://example.com/1' },
              { url: 'https://example.com/2' },
            ],
          },
          {
            aspect: 'applications',
            query: 'quantum computing applications',
            results: [{ url: 'https://example.com/3' }],
          },
        ],
      });

      expect(key).toMatch(/^research-synth:[a-f0-9]{32}:[a-f0-9]{32}:deepseek$/);
    });

    it('generates consistent research-synthesis key regardless of URL order within aspect', () => {
      const key1 = generateCacheKey('research-synthesis', {
        query: 'quantum computing',
        provider: 'deepseek',
        aspectResults: [
          {
            aspect: 'fundamentals',
            query: 'what is quantum computing',
            results: [
              { url: 'https://example.com/1' },
              { url: 'https://example.com/2' },
            ],
          },
        ],
      });

      const key2 = generateCacheKey('research-synthesis', {
        query: 'quantum computing',
        provider: 'deepseek',
        aspectResults: [
          {
            aspect: 'fundamentals',
            query: 'what is quantum computing',
            results: [
              { url: 'https://example.com/2' },
              { url: 'https://example.com/1' },
            ],
          },
        ],
      });

      expect(key1).toBe(key2);
    });

    it('generates brainstorm-synthesis cache key with angleResults', () => {
      const key = generateCacheKey('brainstorm-synthesis', {
        query: 'creative startup ideas',
        provider: 'grok',
        angleResults: [
          {
            angle: 'nature',
            query: 'biomimicry examples',
            results: [{ url: 'https://nature.com/1' }],
          },
          {
            angle: 'games',
            query: 'game mechanics engagement',
            results: [{ url: 'https://games.com/1' }],
          },
        ],
      });

      expect(key).toMatch(/^brainstorm-synth:[a-f0-9]{32}:[a-f0-9]{32}:grok$/);
    });

    it('generates consistent brainstorm-synthesis key regardless of URL order', () => {
      const key1 = generateCacheKey('brainstorm-synthesis', {
        query: 'creative ideas',
        provider: 'grok',
        angleResults: [
          {
            angle: 'nature',
            query: 'test',
            results: [
              { url: 'https://a.com' },
              { url: 'https://b.com' },
            ],
          },
        ],
      });

      const key2 = generateCacheKey('brainstorm-synthesis', {
        query: 'creative ideas',
        provider: 'grok',
        angleResults: [
          {
            angle: 'nature',
            query: 'test',
            results: [
              { url: 'https://b.com' },
              { url: 'https://a.com' },
            ],
          },
        ],
      });

      expect(key1).toBe(key2);
    });

    it('generates different keys for different queries', () => {
      const key1 = generateCacheKey('search', {
        query: 'quantum computing',
        depth: 'basic',
        maxResults: 10,
      });

      const key2 = generateCacheKey('search', {
        query: 'machine learning',
        depth: 'basic',
        maxResults: 10,
      });

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different providers', () => {
      const key1 = generateCacheKey('summary', {
        query: 'test query',
        provider: 'openai',
        sources: ['https://example.com'],
      });

      const key2 = generateCacheKey('summary', {
        query: 'test query',
        provider: 'gemini',
        sources: ['https://example.com'],
      });

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different source sets', () => {
      const key1 = generateCacheKey('summary', {
        query: 'test query',
        provider: 'openai',
        sources: ['https://example.com/1'],
      });

      const key2 = generateCacheKey('summary', {
        query: 'test query',
        provider: 'openai',
        sources: ['https://example.com/2'],
      });

      expect(key1).not.toBe(key2);
    });

    it('handles unknown cache type gracefully', () => {
      const key = generateCacheKey('unknown' as 'search', {
        query: 'test query',
      });

      expect(key).toMatch(/^unknown:[a-f0-9]{32}$/);
    });
  });
});
