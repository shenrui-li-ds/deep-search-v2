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
Refines the user's query before search and generates a search intent description.

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
  "refinedQuery": "improved query",
  "searchIntent": "Natural language description of what's being searched for"
}
```

**Features:**
- Generates a human-readable search intent for the thinking UI
- Optimizes query for better search results
- Preserves original language (Chinese → Chinese, English → English)
- Results are cached (48 hours)
- Falls back to original query if parsing fails

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

**Features:**
- **Synthesis Caching**: Results are cached after stream completes (48 hours TTL)
- Cache key: `summary:{query_hash}:{sources_hash}:{provider}`
- Cache hit returns full content in single SSE chunk with `cached: true`
- Enables retry without re-calling LLM if user disconnects mid-stream

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
Generates a multi-angle research plan with intelligent query routing for specialized strategies.

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
  "queryType": "shopping",
  "plan": [
    { "aspect": "product_discovery", "query": "best products matching criteria 2024" },
    { "aspect": "feature_comparison", "query": "product comparison features specs" },
    { "aspect": "expert_reviews", "query": "brand product expert reviews" },
    { "aspect": "user_experiences", "query": "product reddit user reviews long term" }
  ]
}
```

**Query Types:**
| Type | Strategy | Example Query |
|------|----------|--------------|
| `shopping` | Product discovery → Reviews → Comparison | "best hiking camera bag 30L" |
| `travel` | Attractions → Activities → Accommodations → Tips | "things to do in Cozumel" |
| `technical` | Specs → Expert analysis → Comparisons → Real-world | "hiking watches under 45mm" |
| `academic` | Foundations → Key findings → Methodology → Debates | "quantum entanglement research" |
| `explanatory` | Definition → Mechanism → Examples → Misconceptions | "how does HTTPS work" |
| `finance` | Fundamentals → Metrics → Analyst views → Risks | "NVIDIA stock analysis" |
| `general` | Fundamentals → Applications → Comparison → Current state | fallback for unclassified |

**Features:**
- **Query Router**: Classifies query into specialized category for optimized planning
- Generates 3-4 distinct research angles tailored to query type
- Uses user's selected provider for both routing and planning
- Preserves original query language
- Falls back to `general` on classification errors
- Falls back to single query on parse errors
- Limits to 4 queries maximum
- Results are cached (48 hours)

### `/api/research/extract` - Knowledge Extraction
Extracts structured knowledge from search results for one aspect. Called in parallel for each research aspect.

**Request:**
```json
{
  "query": "original research topic",
  "aspectResult": {
    "aspect": "fundamentals",
    "query": "search query used",
    "results": [{ "title": "...", "url": "...", "content": "..." }]
  },
  "globalSourceIndex": { "https://example.com": 1 },
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "extraction": {
    "aspect": "fundamentals",
    "claims": [
      { "statement": "...", "sources": [1, 2], "confidence": "established" }
    ],
    "statistics": [
      { "metric": "...", "value": "...", "source": 1, "year": "2024" }
    ],
    "definitions": [
      { "term": "...", "definition": "...", "source": 1 }
    ],
    "expertOpinions": [
      { "expert": "...", "opinion": "...", "source": 1 }
    ],
    "contradictions": [
      { "claim1": "...", "claim2": "...", "sources": [1, 3] }
    ],
    "keyInsight": "One sentence summary"
  },
  "updatedSourceIndex": { "https://example.com": 1 }
}
```

**Features:**
- Extracts structured claims, statistics, definitions, expert opinions
- Identifies contradictions between sources
- Uses low temperature (0.3) for factual extraction
- Maintains global source index for consistent citations
- Falls back to minimal extraction on parse errors

**Confidence Levels:**
- `established`: Multiple sources agree, well-documented
- `emerging`: Recent research, fewer sources
- `contested`: Sources disagree

### `/api/research/synthesize` - Research Synthesis
Synthesizes extracted knowledge or raw search results into a comprehensive research document.

**Request (with extracted data - preferred):**
```json
{
  "query": "original research topic",
  "extractedData": [
    {
      "aspect": "fundamentals",
      "claims": [...],
      "statistics": [...],
      "keyInsight": "..."
    }
  ],
  "stream": true,
  "provider": "deepseek"
}
```

**Request (legacy - raw results):**
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
- Targets 800-1000 words for comprehensive coverage (1000-1200 for deep mode)
- Includes Key Takeaways section
- Supports both streaming and non-streaming modes
- **Synthesis Caching**: Results cached after stream completes (48 hours TTL)
- Cache key: `research-synth:{query_hash}:{aspect_urls_hash}:{provider}:{depth_mode}`

**Deep Mode Parameters:**
```json
{
  "deep": true,
  "gapDescriptions": ["Missing practical examples", "Need expert opinions"]
}
```

When `deep=true`:
- Uses `deepResearchSynthesizerPrompt` with gap context
- Targets 1000-1200 words
- System prompt includes multi-round integration strategy

### `/api/research/analyze-gaps` - Gap Analysis
Analyzes extracted research data to identify knowledge gaps for Round 2 searches.

**Request:**
```json
{
  "query": "original research topic",
  "extractedData": [
    {
      "aspect": "fundamentals",
      "keyInsight": "Summary of findings",
      "claims": [{ "statement": "..." }]
    }
  ],
  "language": "English",
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "gaps": [
    {
      "type": "missing_practical",
      "gap": "No real-world implementation examples found",
      "query": "quantum computing practical implementations 2024",
      "importance": "high"
    }
  ],
  "hasGaps": true
}
```

**Gap Types:**
| Type | Description |
|------|-------------|
| `missing_perspective` | Only one viewpoint represented |
| `needs_verification` | Conflicting claims need resolution |
| `missing_practical` | Lacks real-world examples |
| `needs_recency` | Information may be outdated |
| `missing_comparison` | Lacks alternatives comparison |
| `missing_expert` | No expert opinions cited |

**Features:**
- Returns 0-3 gaps maximum (prioritizes high-importance)
- Uses low temperature (0.4) for analytical task
- Fail-safe: Returns empty gaps on error (doesn't block pipeline)
- Generates optimized search queries for each gap

### `/api/research/cache-round1` - Round 1 Cache
Caches Round 1 research data for retry optimization. When retrying deep research, Round 1 results are reused and only Round 2 (gap filling) is executed.

**GET Request (Check cache):**
```
GET /api/research/cache-round1?query=quantum%20computing&provider=deepseek
```

**GET Response (Cache hit):**
```json
{
  "cached": true,
  "data": {
    "plan": [...],
    "queryType": "technical",
    "suggestedDepth": "deep",
    "extractions": [...],
    "sources": [...],
    "images": [],
    "globalSourceIndex": { "https://example.com": 1 },
    "tavilyQueryCount": 3
  },
  "source": "supabase"
}
```

**GET Response (Cache miss):**
```json
{
  "cached": false
}
```

**POST Request (Save to cache):**
```json
{
  "query": "quantum computing",
  "provider": "deepseek",
  "data": {
    "plan": [...],
    "extractions": [...],
    ...
  }
}
```

**POST Response:**
```json
{
  "success": true
}
```

**Features:**
- TTL: 24 hours (shorter than other caches since source data may change)
- Cache key: `round1:{query_hash}:{provider}`
- Stores complete Round 1 state: plan, extractions, sources, images, globalSourceIndex
- Used by search-client.tsx to skip Round 1 on retry

### `/api/research/cache-round2` - Round 2 Cache
Caches Round 2 research data (gap analysis + R2 extractions) for retry optimization. When both R1 and R2 caches hit, the entire deep research pipeline can be skipped and only synthesis runs.

**GET Request (Check cache):**
```
GET /api/research/cache-round2?query=quantum%20computing&provider=deepseek&round1ExtractionsHash=abc12345
```

**GET Response (Cache hit):**
```json
{
  "cached": true,
  "data": {
    "gaps": [
      { "type": "missing_practical", "gap": "No real-world examples", "query": "...", "importance": "high" }
    ],
    "extractions": [...],
    "sources": [...],
    "images": [],
    "tavilyQueryCount": 2
  },
  "source": "supabase"
}
```

**GET Response (Cache miss):**
```json
{
  "cached": false
}
```

**POST Request (Save to cache):**
```json
{
  "query": "quantum computing",
  "provider": "deepseek",
  "round1ExtractionsHash": "abc12345",
  "data": {
    "gaps": [...],
    "extractions": [...],
    "sources": [...],
    "images": [],
    "tavilyQueryCount": 2
  }
}
```

**POST Response:**
```json
{
  "success": true
}
```

**Features:**
- TTL: 24 hours
- Cache key: `round2:{query_hash}:{round1ExtractionsHash}:{provider}`
- Uses R1 extractions hash to ensure R2 cache is invalidated when R1 changes
- Stores R2-only data: gaps, R2 extractions, R2 sources, R2 images
- Used by search-client.tsx to skip gap analysis and R2 searches on retry

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
- Targets 800-1000 words
- **Synthesis Caching**: Results cached after stream completes (48 hours TTL)
- Cache key: `brainstorm-synth:{query_hash}:{angle_urls_hash}:{provider}`

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

**Response (temporary error):**
```json
{
  "allowed": false,
  "reason": "Unable to verify credits. Please try again in a moment.",
  "isTemporaryError": true
}
```

**Features:**
- **Reserve→Finalize Pattern**: Reserves max credits, charges actual usage after search
- **Optimized Path**: Single `reserve_credits` RPC call
- **Legacy Fallback**: Falls back to `check_and_authorize_search` if reserve function unavailable
- **Deep Fallback**: Falls back to `check_and_use_credits` if combined function unavailable
- **Fail-closed on errors**: Returns `allowed: false` with `isTemporaryError: true` on database errors (prevents unlimited free searches)
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

### `/api/auth/check-whitelist` - Email Whitelist Check
Checks if an email is in the CAPTCHA bypass whitelist. Called first on form submit for fast path.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (whitelisted):**
```json
{
  "whitelisted": true
}
```

**Response (not whitelisted):**
```json
{
  "whitelisted": false
}
```

**Features:**
- Lightweight check (reads from env var, no external API calls)
- Case-insensitive email matching
- Returns false if env var not set (fail-safe)
- Reads from `CAPTCHA_WHITELIST_EMAILS` env var (comma-separated)

### `/api/auth/verify-turnstile` - Turnstile Token Verification
Validates Cloudflare Turnstile CAPTCHA tokens server-side.

**Request:**
```json
{
  "token": "turnstile-token",
  "email": "user@example.com"  // Optional, for whitelist check
}
```

**Response (success):**
```json
{
  "success": true
}
```

**Response (whitelisted bypass):**
```json
{
  "success": true,
  "bypassed": true
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": "Verification failed"
}
```

**Response (Cloudflare unavailable):**
```json
{
  "success": false,
  "error": "Verification service unavailable"
}
```
Status: 503

**Features:**
- Validates token with Cloudflare's siteverify API
- Checks email whitelist before token validation
- Forwards client IP for enhanced validation
- Returns 400 for invalid tokens, 503 for Cloudflare API errors, 500 for server errors
- Includes `response.ok` check before parsing Cloudflare response (prevents JSON parse errors on 5xx)

### `/api/auth/verify-hcaptcha` - hCaptcha Token Verification (Legacy)
Validates hCaptcha tokens server-side. **No longer used by auth pages** - replaced by Email OTP.
Kept for backward compatibility.

### `/api/auth/send-otp` - Send Email OTP
Generates and sends a 6-digit OTP code via email for verification.

**Request:**
```json
{
  "email": "user@example.com",
  "purpose": "signup" | "login" | "reset"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Verification code sent",
  "expires_in": 600
}
```

**Response (rate limited):**
```json
{
  "success": false,
  "error": "Rate limited",
  "retry_after": 300
}
```

**Features:**
- Generates 6-digit numeric code via `generate_email_otp` database function
- Sends code via Resend API with branded HTML template
- Rate limiting: 3 requests per email per 10 min, 10 per IP per hour
- Code expires in 10 minutes
- Lowercases email for consistent lookup

**Environment Variables Required:**
- `RESEND_API_KEY` - Resend API key for sending emails
- `RESEND_FROM_EMAIL` - From email (default: `noreply@athenius.io`)

### `/api/auth/verify-otp` - Verify Email OTP
Validates a 6-digit OTP code entered by the user.

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "purpose": "signup" | "login" | "reset"
}
```

**Response (success):**
```json
{
  "success": true,
  "verified_at": "2024-01-15T10:30:00Z"
}
```

**Response (invalid code):**
```json
{
  "success": false,
  "error": "Invalid or expired code",
  "attempts_remaining": 4
}
```

**Features:**
- Validates code via `verify_email_otp` database function
- Maximum 5 attempts per code before invalidation
- Returns attempts remaining on failure
- Lowercases email for consistent lookup
- Returns 400 for invalid format (must be 6 digits)

**Email Whitelist:**
All CAPTCHA endpoints read from `CAPTCHA_WHITELIST_EMAILS` env var (comma-separated):
```bash
CAPTCHA_WHITELIST_EMAILS=user1@example.com,user2@example.com
```

## File Management Routes

Routes for managing user-uploaded documents via the Athenius Docs API. Files can be attached to searches to include document content in results.

### `/api/files` - List & Upload Files

**GET - List Files:**
```
GET /api/files
GET /api/files?status=ready
GET /api/files?status=processing&limit=10&offset=0
```

**Response:**
```json
{
  "files": [
    {
      "id": "uuid",
      "filename": "doc_abc123.txt",
      "original_filename": "document.txt",
      "file_type": "txt",
      "file_size": 1024,
      "status": "ready",
      "chunk_count": 5,
      "created_at": "2024-01-15T10:00:00Z",
      "expires_at": "2024-01-16T10:00:00Z",
      "entities_enabled": false,
      "entities_status": null,
      "entities_progress": null
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

**POST - Upload File:**
```
POST /api/files
Content-Type: multipart/form-data

file: <binary>
```

**Response:**
```json
{
  "fileId": "uuid",
  "filename": "doc_xyz789.pdf",
  "originalFilename": "report.pdf",
  "fileType": "pdf",
  "fileSize": 2048,
  "status": "pending",
  "message": "File uploaded successfully"
}
```

**File Type Validation:**
- Allowed types: PDF, TXT, MD
- Max size: 10MB
- MIME types: `application/pdf`, `text/plain`, `text/markdown`

**File Status:**
| Status | Description |
|--------|-------------|
| `pending` | File uploaded, waiting for processing |
| `processing` | File being chunked and indexed |
| `ready` | File ready for queries |
| `error` | Processing failed |

### `/api/files/[id]` - Get & Delete File

**GET - File Details:**
```
GET /api/files/{fileId}
```

**Response:**
```json
{
  "file": {
    "id": "uuid",
    "filename": "doc_abc123.txt",
    "original_filename": "document.txt",
    "file_type": "txt",
    "file_size": 1024,
    "status": "ready",
    "chunk_count": 5,
    "created_at": "2024-01-15T10:00:00Z",
    "expires_at": "2024-01-16T10:00:00Z",
    "entities_enabled": false,
    "entities_status": null,
    "entities_progress": null
  }
}
```

**DELETE - Remove File:**
```
DELETE /api/files/{fileId}
```

**Response:**
```json
{
  "success": true,
  "message": "File deleted"
}
```

### `/api/files/[id]/entities` - Entity Extraction

**GET - Entity Status:**
```
GET /api/files/{fileId}/entities
```

**Response:**
```json
{
  "fileId": "uuid",
  "entitiesEnabled": true,
  "entitiesStatus": "ready",
  "entitiesProgress": 100,
  "stats": {
    "entityCount": 25,
    "relationshipCount": 15,
    "entityTypes": { "Person": 10, "Organization": 15 }
  }
}
```

**POST - Enable Entity Extraction:**
```
POST /api/files/{fileId}/entities
```

**Response:**
```json
{
  "success": true,
  "message": "Entity extraction started",
  "status": "pending"
}
```

**DELETE - Disable Entity Extraction:**
```
DELETE /api/files/{fileId}/entities
```

**Response:**
```json
{
  "success": true,
  "message": "Entity extraction disabled"
}
```

### `/api/files/query` - Query Documents

**POST - Query Files:**
```json
{
  "query": "What is the main topic?",
  "fileIds": ["file-id-1", "file-id-2"],
  "mode": "simple",
  "stream": false
}
```

**Query Modes:**
| Mode | Description |
|------|-------------|
| `simple` | Quick answer from relevant chunks |
| `detailed` | More comprehensive answer with more context |
| `deep` | Full analysis with entity relationships |

**Response (non-streaming):**
```json
{
  "content": "Based on the documents...",
  "sources": [
    {
      "id": "chunk-uuid",
      "title": "document.txt - Section 1",
      "url": "",
      "snippet": "Relevant excerpt...",
      "content": "Full content of the chunk..."
    }
  ]
}
```

**Response (streaming):**
Server-Sent Events (SSE) format:
```
data: {"data": "Based on "}
data: {"data": "the documents..."}
data: {"done": true, "sources": [...]}
```

**Features:**
- Queries multiple files simultaneously
- Returns relevant chunks with source attribution
- Supports streaming for real-time responses
- Document sources are merged with web search results in SearchClient

**Integration with Search:**
When files are attached to a search:
1. SearchBox passes `files` param (comma-separated IDs) to search URL
2. SearchClient queries `/api/files/query` in parallel with web search
3. Document sources are prepended to web sources (marked with 📄)
4. Document content is included in LLM summarization

**Environment Variables Required:**
- `DOCS_API_URL` - Athenius Docs API base URL (e.g., `http://localhost:3001`)
- `ATHENIUS_API_KEY` - API key for Docs API authentication

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
