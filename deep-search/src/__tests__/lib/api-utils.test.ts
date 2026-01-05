import {
  OPENAI_API_URL,
  TAVILY_API_URL,
  callOpenAI,
  callTavily,
  formatSearchResultsForSummarization,
  getCurrentDate,
  detectLanguage,
  ChatMessage,
} from '@/lib/api-utils';

// Mock fetch globally
global.fetch = jest.fn();

describe('API Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.TAVILY_API_KEY = 'test-tavily-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  describe('Constants', () => {
    it('has correct OpenAI API URL', () => {
      expect(OPENAI_API_URL).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('has correct Tavily API URL', () => {
      expect(TAVILY_API_URL).toBe('https://api.tavily.com/search');
    });
  });

  describe('callOpenAI', () => {
    const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    it('makes request with correct headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await callOpenAI(mockMessages);

      expect(global.fetch).toHaveBeenCalledWith(
        OPENAI_API_URL,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-openai-key',
          },
        })
      );
    });

    it('uses default model and temperature', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await callOpenAI(mockMessages);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe('gpt-5.1-2025-11-13');
      // GPT-5 family models are reasoning models and don't support custom temperature
      expect(body.temperature).toBeUndefined();
      expect(body.stream).toBe(false);
    });

    it('allows custom model and temperature for supported models', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      // Use gpt-4o which supports temperature
      await callOpenAI(mockMessages, 'gpt-4o', 0.5);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe('gpt-4o');
      expect(body.temperature).toBe(0.5);
    });

    it('returns response content for non-streaming requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Test response' } }],
        }),
      });

      const result = await callOpenAI(mockMessages);

      expect(result).toBe('Test response');
    });

    it('returns raw response for streaming requests', async () => {
      const mockResponse = { ok: true, body: {} };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await callOpenAI(mockMessages, 'gpt-5.1-2025-11-13', 0.7, true);

      expect(result).toBe(mockResponse);
    });

    it('throws error on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' },
        }),
      });

      await expect(callOpenAI(mockMessages)).rejects.toThrow('OpenAI API error: Invalid API key');
    });

    it('handles unknown error format', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(callOpenAI(mockMessages)).rejects.toThrow('OpenAI API error: Unknown error');
    });
  });

  describe('callTavily', () => {
    it('makes request with correct body', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await callTavily('test query');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.api_key).toBe('test-tavily-key');
      expect(body.query).toBe('test query');
      expect(body.include_images).toBe(true);
      expect(body.search_depth).toBe('basic');
      expect(body.max_results).toBe(10);
    });

    it('allows custom search options', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await callTavily('test query', false, 'advanced', 20);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.include_images).toBe(false);
      expect(body.search_depth).toBe('advanced');
      expect(body.max_results).toBe(20);
    });

    it('returns search results', async () => {
      const mockResults = {
        results: [{ title: 'Test', url: 'https://test.com' }],
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await callTavily('test query');

      expect(result).toEqual(mockResults);
    });

    it('throws error when API key is missing', async () => {
      delete process.env.TAVILY_API_KEY;

      await expect(callTavily('test query')).rejects.toThrow(
        'TAVILY_API_KEY is not defined in environment variables'
      );
    });

    it('throws error on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid query' }),
      });

      await expect(callTavily('test query')).rejects.toThrow('Tavily API error: Invalid query');
    });

    it('handles JSON parse error in error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Parse error')),
      });

      await expect(callTavily('test query')).rejects.toThrow(
        'Tavily API error: Error parsing error response: Internal Server Error'
      );
    });
  });

  describe('formatSearchResultsForSummarization', () => {
    it('formats search results as XML', () => {
      const searchResults = [
        { title: 'Result 1', url: 'https://example1.com', content: 'Content 1' },
        { title: 'Result 2', url: 'https://example2.com', content: 'Content 2' },
      ];

      const result = formatSearchResultsForSummarization(searchResults);

      expect(result).toContain('<result index="1">');
      expect(result).toContain('<title>Result 1</title>');
      expect(result).toContain('<url>https://example1.com</url>');
      expect(result).toContain('<content>Content 1</content>');
      expect(result).toContain('<result index="2">');
    });

    it('handles empty array', () => {
      const result = formatSearchResultsForSummarization([]);
      expect(result).toBe('');
    });

    it('handles single result', () => {
      const searchResults = [
        { title: 'Only Result', url: 'https://only.com', content: 'Only content' },
      ];

      const result = formatSearchResultsForSummarization(searchResults);

      expect(result).toContain('<result index="1">');
      expect(result).not.toContain('<result index="2">');
    });
  });

  describe('getCurrentDate', () => {
    it('returns formatted date string', () => {
      const result = getCurrentDate();

      // Should contain day of week, month, day number, and year
      expect(result).toMatch(/\w+day, \w+ \d+, \d{4}/);
    });

    it('returns current date', () => {
      const result = getCurrentDate();
      const now = new Date();

      expect(result).toContain(now.getFullYear().toString());
    });
  });

  describe('detectLanguage', () => {
    describe('defaults and edge cases', () => {
      it('returns English for empty string', () => {
        expect(detectLanguage('')).toBe('English');
      });

      it('returns English for whitespace only', () => {
        expect(detectLanguage('   ')).toBe('English');
      });

      it('returns English for null/undefined input', () => {
        expect(detectLanguage(null as unknown as string)).toBe('English');
        expect(detectLanguage(undefined as unknown as string)).toBe('English');
      });
    });

    describe('Chinese detection', () => {
      it('detects Chinese text', () => {
        expect(detectLanguage('什么是量子计算')).toBe('Chinese');
      });

      it('detects Chinese with mixed English words', () => {
        expect(detectLanguage('Python编程入门教程')).toBe('Chinese');
      });

      it('detects simplified Chinese', () => {
        expect(detectLanguage('今天天气很好')).toBe('Chinese');
      });

      it('detects traditional Chinese characters', () => {
        expect(detectLanguage('學習機器學習')).toBe('Chinese');
      });
    });

    describe('Japanese detection', () => {
      it('detects Japanese hiragana', () => {
        expect(detectLanguage('こんにちは')).toBe('Japanese');
      });

      it('detects Japanese katakana', () => {
        expect(detectLanguage('コンピューター')).toBe('Japanese');
      });

      it('detects mixed Japanese text', () => {
        expect(detectLanguage('プログラミングを学ぶ')).toBe('Japanese');
      });
    });

    describe('Korean detection', () => {
      it('detects Korean text', () => {
        expect(detectLanguage('안녕하세요')).toBe('Korean');
      });

      it('detects Korean with English', () => {
        expect(detectLanguage('Python 프로그래밍')).toBe('Korean');
      });
    });

    describe('European language detection', () => {
      it('detects Spanish text', () => {
        expect(detectLanguage('¿Cómo está el tiempo hoy?')).toBe('Spanish');
      });

      it('detects French text with accents', () => {
        expect(detectLanguage('Où est la bibliothèque?')).toBe('French');
      });

      it('detects German text with umlauts', () => {
        expect(detectLanguage('Ich möchte ein Bier für das Frühstück')).toBe('German');
      });
    });

    describe('English detection', () => {
      it('detects English text', () => {
        expect(detectLanguage('What is quantum computing?')).toBe('English');
      });

      it('detects English with numbers', () => {
        expect(detectLanguage('Top 10 programming languages 2024')).toBe('English');
      });

      it('defaults to English for plain ASCII without markers', () => {
        expect(detectLanguage('hello world')).toBe('English');
      });
    });
  });
});
