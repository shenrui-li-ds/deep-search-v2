# Library

Core utilities, types, and helpers.

## Files

### `api-utils.ts` - API Utilities

**LLM Provider Support:**
```typescript
type LLMProvider = 'openai' | 'deepseek' | 'grok' | 'claude' | 'gemini' | 'vercel-gateway';
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `callLLM(messages, temp, stream, provider?)` | Unified LLM call - routes to appropriate provider |
| `callLLMWithFallback(messages, temp, stream, provider?)` | LLM call with automatic fallback chain (uses Vercel Gateway as last resort) |
| `callDeepSeek(messages, model, temp, stream)` | DeepSeek API (OpenAI-compatible) |
| `callOpenAI(messages, model, temp, stream)` | OpenAI API |
| `callGrok(messages, model, temp, stream)` | Grok API (OpenAI-compatible, x.ai) |
| `callClaude(messages, model, temp, stream)` | Anthropic Claude API |
| `callGemini(messages, model, temp, stream)` | Google Gemini API |
| `callVercelGateway(messages, model, temp, stream)` | Vercel AI Gateway (unified API for 100+ models) |
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
GROK_API_URL = 'https://api.x.ai/v1/chat/completions'
CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
VERCEL_GATEWAY_API_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions'
TAVILY_API_URL = 'https://api.tavily.com/search'
```

**Fallback Chain (`callLLMWithFallback`):**
```
1. Specified provider (if available)
       ↓ (on failure)
2. Other primary providers: deepseek → openai → grok → claude → gemini
       ↓ (on failure)
3. Vercel AI Gateway (last resort, uses alibaba/qwen3-max)
```

Usage:
```typescript
const { response, usedProvider } = await callLLMWithFallback(messages, 0.7, true, 'deepseek');
// usedProvider tells you which provider actually succeeded
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
| `researchPlannerPrompt(query, date)` | Generate 3-4 research angles for comprehensive topic coverage |
| `aspectExtractorPrompt(aspect, query)` | Extract structured knowledge (claims, stats, opinions, contradictions) |
| `researchSynthesizerPrompt(query, date)` | Synthesize extracted data into 700-900 word document with collapsible sections |
| `researchProofreadPrompt()` | Research-specific proofreading (preserves depth, improves flow) |

**Collapsible Content Rules (Content-Type Based):**

The synthesizer uses deterministic rules based on content type:

| Content Type | Visibility | Rationale |
|--------------|------------|-----------|
| Claims | Always visible | Core narrative answering the query |
| Definitions | Always visible | Needed to understand main content |
| Statistics (3+) | Collapsible `📊 Key Statistics` | Data tables can be long |
| Expert Opinions (2+) | Collapsible `💬 Expert Perspectives` | Supporting detail |
| Contradictions | Collapsible `⚖️ Points of Debate` | Nuance for interested readers |
| Tables (3+ rows) | Collapsible | Take up significant screen space |
| Key Takeaways | Always visible | Summary must be scannable |

**Brainstorm Pipeline Prompts:**

| Prompt | Purpose |
|--------|---------|
| `brainstormReframePrompt(query, date)` | Generate 4-6 creative angles from unexpected domains (lateral thinking) |
| `brainstormSynthesizerPrompt(query, date, lang)` | Synthesize cross-domain inspiration into idea cards and experiments |

**Key Differences: Research vs Brainstorm**

| Aspect | researchSynthesizerPrompt | brainstormSynthesizerPrompt |
|--------|---------------------------|----------------------------|
| Focus | Depth and comprehensiveness | Breadth and creativity |
| Input | Direct research on topic | Cross-domain inspiration |
| Output | Structured research document | Idea cards + experiments |
| Temperature | 0.7 (balanced) | 0.8 (more creative) |
| Approach | "What does the research say?" | "What can we learn from X?" |
| Structure | Overview → Sections → Key Takeaways | Idea Cards → Unexpected Connections → Experiments |

**Key Differences: Summarize vs Synthesize**

| Aspect | summarizeSearchResultsPrompt | researchSynthesizerPrompt |
|--------|------------------------------|---------------------------|
| Length | 2-3 sentences per paragraph | 4-6 sentences allowed |
| Output | 200-300 words | 700-900 words |
| Input | Single search result set | Multiple aspect-based result sets |
| Depth | Quick scannable answer | Comprehensive research document |
| Structure | Direct answer + sections | Executive summary + sections + Key Takeaways |

**Citation Format:**
- Single citation: `[1]`
- Multiple citations: `[1, 2]` (comma-separated, NOT `[1][2]`)
- Frontend converts to superscript: `[1, 2]` → `<sup>1, 2</sup>`

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

### `cache.ts` - Two-Tier Caching System

Reduces API costs by caching responses at two levels.

**Architecture:**
```
Request → Memory Cache (15 min) → Supabase Cache (48 hrs) → API Call
```

**Cache Types & TTLs:**

| Type | TTL | What's Cached |
|------|-----|---------------|
| `search` | 48 hours | Tavily search results |
| `refine` | 48 hours | Query refinements |
| `related` | 48 hours | Related search suggestions |
| `plan` | 48 hours | Research plans |
| `summary` | 48 hours | LLM summaries (future) |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `generateCacheKey(type, params)` | Generate cache key from type and parameters |
| `getFromCache<T>(key, supabase?)` | Get from memory, then Supabase |
| `setToCache(key, type, query, data, provider?, supabase?)` | Set to both tiers |
| `deleteFromCache(key, supabase?)` | Remove from both tiers |
| `getCacheStats()` | Get memory cache statistics |

**Usage in API Routes:**
```typescript
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';

// In POST handler:
const cacheKey = generateCacheKey('search', { query, depth, maxResults });
const supabase = await createClient();

const { data, source } = await getFromCache<ResponseType>(cacheKey, supabase);
if (data) {
  return NextResponse.json({ ...data, cached: true });
}

// ... make API call ...

await setToCache(cacheKey, 'search', query, response, provider, supabase);
```

**Cached Endpoints:**
- `/api/search` - Tavily results
- `/api/refine` - Query refinement
- `/api/related-searches` - Related queries
- `/api/research/plan` - Research plans

### `supabase/` - Supabase Integration

See `supabase/CLAUDE.md` for detailed documentation.

| File | Purpose |
|------|---------|
| `client.ts` | Browser-side Supabase client |
| `server.ts` | Server-side Supabase client (API routes, server components) |
| `middleware.ts` | Auth session refresh + route protection |
| `auth-context.tsx` | React context for auth state (`useAuth` hook) |
| `database.ts` | Database operations (search history, limits) |
| `usage-tracking.ts` | Server-side API usage tracking |

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
