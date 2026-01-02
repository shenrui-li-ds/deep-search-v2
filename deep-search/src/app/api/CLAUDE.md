# API Routes

This directory contains Next.js API routes that handle the search pipeline.

## Routes Overview

### `/api/search` - Web Search
Wraps the Tavily search API.

**Request:**
```json
{
  "query": "search query",
  "searchDepth": "basic" | "advanced",
  "maxResults": 10
}
```

**Response:**
```json
{
  "sources": [{ "id", "title", "url", "iconUrl", "snippet" }],
  "images": [{ "url", "alt", "sourceId" }],
  "rawResults": { "results": [...] }
}
```

### `/api/refine` - Query Refinement
Optionally refines the user's query before search.

**Request:**
```json
{
  "query": "user query",
  "provider": "deepseek" | "openai" | "grok" | "claude" | "gemini"
}
```

**Response:**
```json
{
  "refinedQuery": "improved query"
}
```

### `/api/summarize` - LLM Summarization
Streams an LLM-generated summary of search results.

**Request:**
```json
{
  "query": "search query",
  "results": [...],
  "stream": true,
  "provider": "deepseek"
}
```

**Response:** Server-Sent Events (SSE)
```
data: {"data": "chunk of text"}
data: {"data": "more text"}
data: {"done": true}
```

### `/api/proofread` - Content Proofreading
Cleans up and polishes content. Used in Pro Search mode.

**Request:**
```json
{
  "content": "markdown content",
  "mode": "quick" | "paragraph" | "full",
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "proofread": "cleaned content",
  "mode": "full"
}
```

**Modes:**
- `quick`: Regex-based cleanup only (no LLM)
- `paragraph`: Light LLM pass on single paragraph
- `full`: Full LLM proofreading (used by web search with pro features)
- `research`: Research-specific proofreading (preserves depth, improves flow)

### `/api/research/plan` - Research Planning
Generates a multi-angle research plan for comprehensive topic coverage.

**Request:**
```json
{
  "query": "research topic",
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "originalQuery": "research topic",
  "plan": [
    { "aspect": "fundamentals", "query": "topic basics explained" },
    { "aspect": "applications", "query": "topic real world uses" },
    { "aspect": "comparison", "query": "topic vs alternatives" },
    { "aspect": "current state", "query": "topic latest developments 2024" }
  ]
}
```

**Features:**
- Generates 2-4 distinct research angles
- Preserves original query language
- Falls back to single query on parse errors
- Limits to 4 queries maximum

### `/api/research/synthesize` - Research Synthesis
Synthesizes multiple search results into a comprehensive research document.

**Request:**
```json
{
  "query": "original research topic",
  "aspectResults": [
    {
      "aspect": "fundamentals",
      "query": "search query used",
      "results": [{ "title", "url", "content" }]
    }
  ],
  "stream": true,
  "provider": "deepseek"
}
```

**Response:** Server-Sent Events (SSE) when `stream=true`
```
data: {"data": "## Research Summary\n\n"}
data: {"data": "Quantum computing..."}
data: {"done": true}
```

**Features:**
- Integrates results from multiple research angles
- Assigns consistent global source indices across all aspects
- Targets 700-900 words for comprehensive coverage
- Includes Key Takeaways section
- Supports both streaming and non-streaming modes

### `/api/brainstorm/reframe` - Creative Angle Generation
Generates creative search angles using lateral thinking and cross-domain inspiration.

**Request:**
```json
{
  "query": "topic to brainstorm about",
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "originalQuery": "topic to brainstorm about",
  "angles": [
    { "angle": "nature", "query": "how ants collaborate efficiently" },
    { "angle": "games", "query": "game mechanics for engagement motivation" },
    { "angle": "contrarian", "query": "why traditional approach fails" },
    { "angle": "theater", "query": "theater improvisation techniques energy" }
  ]
}
```

**Features:**
- Generates 4-6 unexpected creative angles
- Draws from diverse domains: nature, games, art, sports, history, etc.
- Uses higher temperature (0.8) for creativity
- Preserves original query language
- Falls back to direct search on parse errors

### `/api/brainstorm/synthesize` - Creative Idea Synthesis
Synthesizes cross-domain inspiration into actionable ideas.

**Request:**
```json
{
  "query": "original brainstorm topic",
  "angleResults": [
    {
      "angle": "nature",
      "query": "how ants collaborate efficiently",
      "results": [{ "title", "url", "content" }]
    }
  ],
  "stream": true,
  "provider": "deepseek"
}
```

**Response:** Server-Sent Events (SSE) when `stream=true`
```
data: {"data": "### The Ant Colony Approach\n\n"}
data: {"data": "**Inspiration**: Ants use pheromone trails... [1]"}
data: {"done": true}
```

**Output Structure:**
- **Idea Cards** (3-5): Each with Inspiration, The Insight, Try This
- **Unexpected Connections**: Cross-domain links between angles
- **Experiments to Try**: Actionable checklist items

**Features:**
- Higher temperature (0.8) for creative output
- Focus on actionable experiments
- Cross-domain synthesis
- Targets 700-900 words

### `/api/related-searches` - Related Search Suggestions
Generates related search queries based on the original query and content.

**Request:**
```json
{
  "query": "original query",
  "content": "summary content (optional, first 1000 chars used)",
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "relatedSearches": ["query 1", "query 2", "query 3", ...]
}
```

**Features:**
- Generates 5-6 diverse related queries
- Preserves original query language (Chinese → Chinese suggestions)
- Uses `generateRelatedSearchesPrompt` for structured output
- Handles markdown code blocks in LLM response
- Limits output to 6 queries max

### `/api/check-limit` - Credit Reservation
Reserves credits before a search. Uses reserve→finalize pattern for fair billing based on actual usage.

**Request:**
```json
{
  "mode": "web" | "pro" | "brainstorm"
}
```

**Response (allowed):**
```json
{
  "allowed": true,
  "reservationId": "uuid",
  "maxCredits": 4,
  "remainingAfterReserve": 996
}
```

**When insufficient credits:**
```json
{
  "allowed": false,
  "reason": "You need 4 credits but only have 2. Purchase more credits to continue.",
  "creditsNeeded": 4,
  "creditsAvailable": 2,
  "isCreditsError": true
}
```

The `isCreditsError` flag allows the frontend to distinguish credit errors from other failures and show appropriate UI (e.g., "Purchase Credits" button instead of generic retry).

**Max Credits Reserved (1 credit = 1 Tavily query):**
| Mode | Max Credits | Actual Usage |
|------|-------------|--------------|
| web | 1 | 1 query |
| pro | 4 | 3-4 queries |
| brainstorm | 6 | 4-6 queries |

**Features:**
- **Reserve→Finalize Pattern**: Reserves max credits, charges actual usage after search
- **Optimized Path**: Single `reserve_credits` RPC call
- **Legacy Fallback**: Falls back to `check_and_authorize_search` if reserve function unavailable
- **Deep Fallback**: Falls back to `check_and_use_credits` if combined function unavailable
- Fail-open on errors (allows search, logs error)
- Runs server-side to avoid React Strict Mode double-invocation
- Called in parallel with first API call (no added latency)

### `/api/finalize-credits` - Credit Finalization
Finalizes a credit reservation after search completes. Charges actual credits and refunds unused.

**POST Request (Finalize):**
```json
{
  "reservationId": "uuid from check-limit",
  "actualCredits": 3
}
```

**Response:**
```json
{
  "success": true,
  "charged": 3,
  "refunded": 1
}
```

**DELETE Request (Cancel):**
```json
{
  "reservationId": "uuid from check-limit"
}
```

**Response:**
```json
{
  "success": true,
  "refunded": 4
}
```

**Features:**
- **Fire-and-forget**: Called non-blocking after search completes (zero perceived latency)
- **Full refund on cancel**: Used when search fails or is aborted
- **Automatic expiry**: Unfinalised reservations expire after 5 minutes (credits refunded)

## Provider Handling

All LLM-powered routes accept a `provider` parameter:
- Routes call `callLLM(messages, temperature, stream, provider)`
- If provider is unavailable, falls back to auto-detection based on available API keys
- Provider priority: DeepSeek > OpenAI > Grok > Claude > Gemini

## Error Handling

All routes return appropriate HTTP status codes:
- `200` - Success
- `400` - Bad request (missing/invalid params)
- `500` - Internal error (API failures)

Errors are logged to console with context for debugging.
