# Library

Core utilities, types, and helpers.

## Files

### `api-utils.ts` - API Utilities

**LLM Provider Support:**
```typescript
type LLMProvider = 'openai' | 'deepseek' | 'grok' | 'claude' | 'gemini' | 'vercel-gateway';
```

**ModelId Type (for grouped model selection):**
```typescript
// Uses provider-based naming for future compatibility
type ModelId =
  | 'gemini'          // Google Gemini Flash (latest fast model)
  | 'gemini-pro'      // Google Gemini Pro (latest pro model)
  | 'openai'          // OpenAI flagship (latest)
  | 'openai-mini'     // OpenAI mini series (latest)
  | 'deepseek'        // DeepSeek Chat
  | 'grok'            // xAI Grok
  | 'claude'          // Anthropic Claude
  | 'vercel-gateway'; // Vercel AI Gateway
```

**MODEL_CONFIG:**
Maps ModelId to provider and actual model string. Update model strings here when new versions release:
| ModelId | Provider | Model String | Label |
|---------|----------|--------------|-------|
| `gemini` | gemini | `gemini-3-flash-preview` | Gemini Flash |
| `gemini-pro` | gemini | `gemini-3-pro-preview` | Gemini Pro |
| `openai` | openai | `gpt-5.2-2025-12-11` | GPT-5.2 |
| `openai-mini` | openai | `gpt-5-mini-2025-08-07` | GPT-5 mini |
| `deepseek` | deepseek | `deepseek-chat` | DeepSeek Chat |
| `grok` | grok | `grok-4-1-fast` | Grok 4.1 Fast |
| `claude` | claude | `claude-haiku-4-5` | Claude Haiku 4.5 |
| `vercel-gateway` | vercel-gateway | `alibaba/qwen3-max` | Qwen 3 Max |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `callLLM(messages, temp, stream, provider?)` | Unified LLM call - routes to appropriate provider |
| `callLLMWithFallback(messages, temp, stream, provider?)` | LLM call with automatic fallback chain (uses Vercel Gateway as last resort) |
| `callLLMWithModelId(messages, temp, stream, modelId)` | Call LLM with a specific ModelId |
| `getProviderFromModelId(modelId)` | Get LLMProvider from ModelId |
| `getModelFromModelId(modelId)` | Get actual model string from ModelId |
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

**Resilience Patterns:**

All provider calls (LLM and Tavily) are wrapped with resilience patterns:
- **Retry with exponential backoff**: Transient failures are retried automatically
- **Circuit breaker**: Prevents cascading failures when a provider is down
- **Configurable timeouts**: Prevents hung requests from blocking resources

| Function | Description |
|----------|-------------|
| `getCircuitBreakerStats()` | Get health status of all circuit breakers |
| `resetAllCircuitBreakers()` | Reset all circuit breakers (after maintenance) |
| `resetCircuitBreaker(name)` | Reset a specific circuit breaker |

**Timeout Configuration:**
| Type | Timeout | Use Case |
|------|---------|----------|
| `llm` | 60s | Non-streaming LLM calls |
| `llmStreaming` | 120s | Streaming LLM calls |
| `search` | 15s | Tavily search calls |

**Retry Configuration:**
| Type | Max Retries | Initial Delay | Max Delay |
|------|-------------|---------------|-----------|
| `llm` | 2 | 1000ms | 5000ms |
| `search` | 2 | 500ms | 3000ms |

**Circuit Breaker Configuration:**
| Type | Failure Threshold | Reset Timeout | Success Threshold |
|------|-------------------|---------------|-------------------|
| `llm` | 5 failures | 30 seconds | 2 successes |
| `search` | 3 failures | 20 seconds | 1 success |

**Retryable Errors:**
- Network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT)
- Rate limiting (429)
- Server errors (5xx)
- Timeouts

**Non-Retryable Errors:**
- Client errors (400, 401, 403, 404)

### `resilience.ts` - Resilience Patterns

Provides retry, circuit breaker, and timeout utilities for external API calls.

**Key Exports:**

| Export | Description |
|--------|-------------|
| `withRetry(fn, options)` | Wrap function with retry logic |
| `withTimeout(promise, ms)` | Wrap promise with timeout |
| `CircuitBreaker` | Circuit breaker class |
| `resilientCall(fn, options)` | Combined resilience wrapper |
| `circuitBreakerRegistry` | Global registry for circuit breakers |
| `isRetryableError(error)` | Check if error should trigger retry |
| `TimeoutError` | Error class for timeouts |

**Usage:**
```typescript
import { resilientCall, CircuitBreaker, circuitBreakerRegistry } from '@/lib/resilience';

// Simple retry with timeout
const result = await resilientCall(
  () => fetch('https://api.example.com'),
  {
    name: 'api-call',
    timeoutMs: 10000,
    maxRetries: 3,
  }
);

// With shared circuit breaker
const breaker = circuitBreakerRegistry.getBreaker('my-service');
const result = await resilientCall(
  () => fetch('https://api.example.com'),
  {
    name: 'api-call',
    timeoutMs: 10000,
    maxRetries: 3,
    circuitBreaker: breaker,
  }
);

// Monitor circuit breaker health
const stats = circuitBreakerRegistry.getAllStats();
// { 'my-service': { state: 'closed', failures: 0, ... } }
```

### `prompts.ts` - LLM Prompts

XML-structured prompts for consistent LLM behavior.

**Web Search Prompts:**

| Prompt | Purpose |
|--------|---------|
| `refineSearchQueryPrompt(query, date)` | Optimize search query and generate search intent (returns JSON with `intent` and `query` fields) |
| `summarizeSearchResultsPrompt(query, date)` | Generate cited summary (concise, 2-3 sentences per paragraph) |
| `proofreadContentPrompt()` | Full content proofreading |
| `proofreadParagraphPrompt()` | Light paragraph cleanup |
| `generateRelatedSearchesPrompt(query, topics)` | Generate related queries |

**Research Pipeline Prompts:**

| Prompt | Purpose |
|--------|---------|
| `researchRouterPrompt(query)` | Classify query type for specialized planning |
| `researchPlannerPrompt(query, date)` | General fallback: 3-4 research angles |
| `researchPlannerShoppingPrompt(query, date)` | Shopping: product discovery → reviews → comparison |
| `researchPlannerTravelPrompt(query, date)` | Travel: attractions → activities → accommodations → tips |
| `researchPlannerTechnicalPrompt(query, date)` | Technical: specs → expert analysis → comparisons |
| `researchPlannerAcademicPrompt(query, date)` | Academic: foundations → findings → methodology → debates |
| `researchPlannerExplanatoryPrompt(query, date)` | Explanatory: definition → mechanism → examples → misconceptions |
| `researchPlannerFinancePrompt(query, date)` | Finance: fundamentals → metrics → analyst views → risks |
| `aspectExtractorPrompt(aspect, query)` | Extract structured knowledge (claims, stats, opinions, contradictions) |
| `researchSynthesizerPrompt(query, date)` | Synthesize extracted data into 800-1000 word document with collapsible sections |
| `deepResearchSynthesizerPrompt(query, date, lang, gapDescriptions)` | Deep mode: Synthesize multi-round data into 1000-1200 word document |
| `gapAnalyzerPrompt(query, extractedSummary, lang)` | Analyze research for knowledge gaps (returns JSON array of gaps) |
| `researchProofreadPrompt()` | Research-specific proofreading (preserves depth, improves flow) |

**Query Type Classification:**

The router classifies queries into specialized categories for optimized research planning:

| Type | Description | Example |
|------|-------------|---------|
| `shopping` | Product recommendations, buying guides, gear comparisons | "best hiking camera bag 30L" |
| `travel` | Destinations, itineraries, things to do, hotels | "things to do in Cozumel" |
| `technical` | Specifications, technical comparisons, detailed specs | "hiking watches under 45mm with offline maps" |
| `academic` | Scientific research, studies, papers, theoretical concepts | "quantum entanglement research" |
| `explanatory` | How something works, concepts explained, tutorials | "how does HTTPS work" |
| `finance` | Stocks, investments, market analysis, financial metrics | "NVIDIA stock analysis" |
| `general` | Everything else (fallback) | "what happened at CES 2025" |

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
| Output | 200-300 words | 800-1000 words |
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
| `summary` | 48 hours | Web search LLM summaries |
| `research-synthesis` | 48 hours | Research mode synthesis |
| `brainstorm-synthesis` | 48 hours | Brainstorm mode synthesis |
| `round1-extractions` | 24 hours | Deep research Round 1 data (for retry optimization) |
| `round2-data` | 24 hours | Deep research Round 2 data (gaps + R2 extractions) |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `md5(input)` | Generate MD5 hash (exported for cache key generation) |
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
- `/api/summarize` - Web search summaries (synthesis caching)
- `/api/research/synthesize` - Research synthesis (synthesis caching)
- `/api/brainstorm/synthesize` - Brainstorm synthesis (synthesis caching)
- `/api/research/cache-round1` - Deep research Round 1 state
- `/api/research/cache-round2` - Deep research Round 2 state (gap analysis + R2 extractions)

**Synthesis Caching:**
Synthesis results are cached after the LLM stream completes. If a user disconnects mid-stream and retries the same query (with same sources), they get the cached result instantly. Cache key includes query + source URLs + provider to ensure exact match.

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
