# Library

Core utilities, types, and helpers.

## Files

### `api-utils.ts` - API Utilities

**LLM Provider Support:**
```typescript
type LLMProvider = 'openai' | 'deepseek' | 'qwen' | 'claude' | 'gemini';
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `callLLM(messages, temp, stream, provider?)` | Unified LLM call - routes to appropriate provider |
| `callDeepSeek(messages, model, temp, stream)` | DeepSeek API (OpenAI-compatible) |
| `callOpenAI(messages, model, temp, stream)` | OpenAI API |
| `callQwen(messages, model, temp, stream)` | Qwen/DashScope API (OpenAI-compatible) |
| `callClaude(messages, model, temp, stream)` | Anthropic Claude API |
| `callGemini(messages, model, temp, stream)` | Google Gemini API |
| `callTavily(query, includeImages, depth, max)` | Tavily search API |
| `getLLMProvider()` | Auto-detect available provider from env |
| `isProviderAvailable(provider)` | Check if provider has API key |
| `streamOpenAIResponse(response)` | Generator for OpenAI-format SSE |
| `streamClaudeResponse(response)` | Generator for Anthropic-format SSE |
| `streamGeminiResponse(response)` | Generator for Gemini-format streaming |
| `getStreamParser(provider)` | Get appropriate stream parser |

**API Endpoints:**
```typescript
OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
TAVILY_API_URL = 'https://api.tavily.com/search'
```

### `prompts.ts` - LLM Prompts

XML-structured prompts for consistent LLM behavior.

**Web Search Prompts:**

| Prompt | Purpose |
|--------|---------|
| `refineSearchQueryPrompt(query, date)` | Optimize search query |
| `summarizeSearchResultsPrompt(query, date)` | Generate cited summary (concise, 2-3 sentences per paragraph) |
| `proofreadContentPrompt()` | Full content proofreading |
| `proofreadParagraphPrompt()` | Light paragraph cleanup |
| `generateRelatedSearchesPrompt(query, topics)` | Generate related queries |

**Research Pipeline Prompts:**

| Prompt | Purpose |
|--------|---------|
| `researchPlannerPrompt(query, date)` | Generate 2-4 research angles for comprehensive topic coverage |
| `researchSynthesizerPrompt(query, date)` | Synthesize multi-source research into 600-800 word document |
| `researchProofreadPrompt()` | Research-specific proofreading (preserves depth, improves flow) |

**Key Differences: Summarize vs Synthesize**

| Aspect | summarizeSearchResultsPrompt | researchSynthesizerPrompt |
|--------|------------------------------|---------------------------|
| Length | 2-3 sentences per paragraph | 4-6 sentences allowed |
| Output | 200-300 words | 600-800 words |
| Input | Single search result set | Multiple aspect-based result sets |
| Depth | Quick scannable answer | Comprehensive research document |
| Structure | Direct answer + sections | Executive summary + sections + Key Takeaways |

**Prompt Design Principles:**
- Use XML tags for structure (`<description>`, `<rules>`, etc.)
- Include examples where helpful
- Specify output format explicitly
- Include quality checks

### `types.ts` - TypeScript Types

**Core Types:**
```typescript
interface Source {
  id: string;
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
  snippet?: string;
}

interface SearchImage {
  url: string;
  alt: string;
  sourceId?: string;
}

interface SearchResult {
  query: string;
  content: string;
  sources: Source[];
  images?: SearchImage[];
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### `text-cleanup.ts` - Content Cleanup

Client-side text cleanup utilities.

| Function | Purpose |
|----------|---------|
| `cleanupFinalContent(content)` | Main cleanup function |

**Cleanup Operations:**
- Remove gibberish patterns (random alphanumeric in brackets)
- Fix broken markdown (unclosed bold/italic)
- Remove raw URLs from text
- Fix header spacing
- Normalize whitespace

### `utils.ts` - General Utilities

Shared utility functions (e.g., `cn()` for className merging).

## Adding a New Provider

1. Add API URL constant
2. Create `call{Provider}` function:
   - Handle message format conversion if needed (Claude uses different format)
   - Support both streaming and non-streaming
   - Return Response for streaming, string for non-streaming
3. Add stream parser if format differs from OpenAI
4. Update `LLMProvider` type
5. Update `callLLMForProvider` switch
6. Update `isProviderAvailable`
7. Update `getLLMProvider` priority order

## Modifying Prompts

When editing prompts:
1. Keep XML structure for clarity
2. Test with multiple providers (behavior varies)
3. Include explicit output format instructions
4. Add examples for complex formatting requirements
5. Consider token limits for longer prompts
