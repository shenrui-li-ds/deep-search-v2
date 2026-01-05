# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Private Repository** - This is a private project, not open source.

Athenius is an AI-powered search application that provides a Perplexity-like search experience with:
- Multi-provider LLM support (DeepSeek, OpenAI, Grok, Claude, Gemini)
- Tavily-powered web search
- Streamed, cited summaries with markdown rendering
- Three search modes: Web, Pro (with proofreading), and Brainstorm

## Commands

All commands must be run from the `deep-search/` directory:

```bash
cd deep-search

# Install dependencies
npm install

# Development server (uses Turbopack)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint
npm run lint
```

The dev server runs at http://localhost:3000

**Important:** Stop the dev server before running `npm run build`. Running both simultaneously corrupts the `.next` directory and causes "Internal Server Error". If this happens, delete `.next` and restart the dev server.

## Environment Variables

Required in `deep-search/.env.local`:
- `TAVILY_API_KEY` - Tavily API key for web search (required)

At least one LLM provider key:
- `DEEPSEEK_API_KEY` - DeepSeek Chat (preferred, cost-effective)
- `OPENAI_API_KEY` - OpenAI GPT-5.1
- `GROK_API_KEY` - xAI Grok 4.1 Fast
- `ANTHROPIC_API_KEY` - Anthropic Claude Haiku 4.5
- `GEMINI_API_KEY` - Google Gemini 3 Flash

Optional fallback provider:
- `VERCEL_AI_GATEWAY_KEY` - Vercel AI Gateway (last-resort fallback, uses Qwen 3 235B)

Supabase (for auth and database):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key

## Architecture

### Search Flow

**Web Search Mode:**
1. User submits query → navigates immediately to search page
2. Search page: `/api/refine` + limit check run in parallel
3. Refined query → `/api/search` calls Tavily API
4. Search results → `/api/summarize` streams LLM response with citations
5. Frontend renders streamed markdown with react-markdown

**Research/Brainstorm Modes:**
- Skip `/api/refine` (plan/reframe already optimizes queries)
- Limit check runs in parallel with plan/reframe API call

This architecture ensures instant navigation from landing page with no blocking API calls.

### Search Modes

- **Web**: Standard search with streaming summary (single search → summarize)
- **Brainstorm**: Creative ideation using lateral thinking and cross-domain inspiration
- **Research** (Pro mode): Multi-angle research pipeline with comprehensive synthesis

### Research Pipeline (Pro/Research Mode)

The Research mode uses a sophisticated agentic pipeline for in-depth research:

```
User Query → Navigate Immediately
    ↓
1. Planning + Limit Check (parallel): /api/research/plan
   → Generates 3-4 research angles (fundamentals, applications, comparison, current state)
    ↓
2. Parallel Search: /api/search × 3-4
   → Executes multiple searches concurrently (10 results each)
    ↓
3. Synthesis: /api/research/synthesize (streaming)
   → Combines all search results into 800-1000 word research document
    ↓
4. Proofreading: /api/proofread (mode='quick')
   → Quick regex-based cleanup to preserve synthesized content
    ↓
5. Display
```

**Key Differences from Web Search:**
- Multi-angle research instead of single query
- Longer, more comprehensive output (800-1000 words vs 200-300)
- Synthesizes from 30-40 sources vs 10-15
- Skips refine step (plan already optimizes queries)

### Deep Research Mode (Adaptive Depth)

Deep Research extends the standard Research pipeline with automatic gap analysis and a second round of targeted searches. Enabled via the `deep=true` URL parameter.

```
Standard Research (Round 1)
    ↓
1. Planning: /api/research/plan
   → Generates 3-4 research aspects
    ↓
2. Parallel Search: /api/search × 3-4
   → 10 results per aspect
    ↓
3. Knowledge Extraction: /api/research/extract × 3-4
   → Extracts structured claims, statistics, definitions, expert opinions
    ↓
Gap Analysis + Round 2
    ↓
4. Gap Analysis: /api/research/analyze-gaps
   → Identifies missing perspectives, needs verification, missing practical info
   → Returns 0-3 high-priority gaps to fill
    ↓
5. Gap Search (if gaps found): /api/search × 1-3
   → Targeted searches for each identified gap
    ↓
6. Gap Extraction: /api/research/extract × 1-3
   → Extracts from gap-filling sources
    ↓
Synthesis
    ↓
7. Deep Synthesis: /api/research/synthesize (deep=true)
   → Integrates Round 1 + Round 2 data into 1000-1200 word document
   → Uses deepResearchSynthesizerPrompt with gap context
    ↓
8. Display
```

**Gap Types Identified:**
| Type | Description |
|------|-------------|
| `missing_perspective` | Only one viewpoint represented |
| `needs_verification` | Conflicting claims need resolution |
| `missing_practical` | Lacks real-world examples/implementations |
| `needs_recency` | Information may be outdated |
| `missing_comparison` | Lacks alternatives comparison |
| `missing_expert` | No expert opinions cited |

**Key Features:**
- **Round 1 Caching**: After first search, Round 1 data is cached. Retries only execute Round 2 (saves time and credits)
- **Timeout Handling**: Round 2 has a 60-second timeout. If exceeded, synthesis proceeds with Round 1 data only
- **Fail-Safe**: Gap analysis errors don't block the pipeline; proceeds with Round 1 data
- **Credit Tracking**: Both rounds count toward actual Tavily queries; unused reserved credits are refunded

**Credit Usage (Deep Mode):**
| Component | Max Credits | Typical Usage |
|-----------|-------------|---------------|
| Round 1 (3-4 aspects) | 4 | 3-4 queries |
| Round 2 (0-3 gaps) | 3 | 0-3 queries |
| **Total** | **7** | **3-7 queries** |

**API Routes:**
- `/api/research/analyze-gaps` - Identifies knowledge gaps from extractions
- `/api/research/cache-round1` - GET/POST for Round 1 data caching

### Brainstorm Pipeline

The Brainstorm mode uses lateral thinking and cross-domain inspiration to generate creative ideas:

```
User Topic → Navigate Immediately
    ↓
1. Reframe + Limit Check (parallel): /api/brainstorm/reframe
   → Generates 4-6 creative angles from unexpected domains
   → Examples: nature analogies, game mechanics, contrarian views
    ↓
2. Parallel Search: /api/search × 4-6
   → Searches for inspiration in each cross-domain angle (6 results each)
    ↓
3. Ideation: /api/brainstorm/synthesize (streaming)
   → Synthesizes cross-domain inspiration into 800-1000 word document
   → Output: Idea cards, Unexpected Connections, Experiments to Try
    ↓
4. Proofreading: /api/proofread (mode='quick')
   → Light cleanup while preserving creative energy
    ↓
5. Display
```

**Key Differences from Research Mode:**
- Breadth-focused instead of depth-focused
- Searches *around* the topic, not directly *about* it
- Output format: idea cards with actionable experiments
- Higher temperature (0.8) for more creative outputs
- Lateral thinking approach (nature, games, art, sports, etc.)
- Skips refine step (reframe already creates creative angles)

### Provider Selection

The model selector in the UI controls which LLM provider is used for:
- Query refinement (`/api/refine`)
- Summarization (`/api/summarize`)
- Research planning (`/api/research/plan`)
- Research synthesis (`/api/research/synthesize`)
- Brainstorm reframing (`/api/brainstorm/reframe`)
- Brainstorm synthesis (`/api/brainstorm/synthesize`)
- Proofreading (`/api/proofread`)

Provider is passed via URL params and request body throughout the pipeline.

## Key Directories

### `src/app/api/` - API Routes
See `src/app/api/CLAUDE.md` for detailed API documentation.

### `src/app/auth/` - Authentication Pages
- `login/page.tsx` - Email/password login
- `signup/page.tsx` - User registration with email confirmation
- `callback/route.ts` - Handles email verification redirect
- `error/page.tsx` - Authentication error display

### `src/components/` - React Components
See `src/components/CLAUDE.md` for component documentation.

### `src/lib/` - Core Library
See `src/lib/CLAUDE.md` for utility and type documentation.

### `src/lib/supabase/` - Supabase Integration
See `src/lib/supabase/CLAUDE.md` for auth and database documentation.

### `src/app/search/` - Search Page
- `page.tsx` - Server component, reads URL params
- `search-client.tsx` - Client component, orchestrates search flow with streaming

### `src/app/library/` - Search History
- `page.tsx` - Displays user's search history from Supabase

### `src/app/account/` - Account Management
- `page.tsx` - Account settings with tabbed interface
  - **Profile tab**: User info, security (change password, change email), sign out
  - **Preferences tab**: Default provider and search mode selection
  - **Billing tab**: Credit balance, purchase history, credit pack pricing (Stripe coming soon)
  - **Usage tab**: Search statistics, mode/provider breakdowns, daily/monthly usage bars

## Tech Stack

- Next.js 15.2 with App Router and Turbopack
- React 19
- Tailwind CSS 4
- react-markdown with remark-gfm for GFM support
- shadcn/ui components
- Supabase (Auth + PostgreSQL database)

## Authentication

Uses Supabase Auth with email/password and GitHub OAuth. See `src/lib/supabase/CLAUDE.md` for detailed documentation.

### Overview
- **Email/Password**: Standard signup with email confirmation
- **GitHub OAuth**: One-click sign in via GitHub
- **Forgot Password**: Reset via email link (`/auth/forgot-password` → `/auth/reset-password`)
- **Change Email**: Update with verification from Account page
- **Route Protection**: Middleware redirects unauthenticated users to `/auth/login`
- **Session**: Stored in cookies, managed by Supabase SSR

### Auth Pages
| Route | Description |
|-------|-------------|
| `/auth/login` | Email/password and OAuth login |
| `/auth/signup` | New user registration |
| `/auth/forgot-password` | Request password reset link |
| `/auth/reset-password` | Set new password (from email link) |
| `/auth/callback` | OAuth and email verification handler |
| `/auth/error` | Authentication error display |

### Credit System (Billing)

Users get 1000 free credits per month. 1 credit = 1 Tavily search query. Uses reserve→finalize for fair billing:

| Mode | Max Credits | Actual Usage |
|------|-------------|--------------|
| Web Search | 1 | 1 query |
| Research | 4 | 3-4 queries |
| Brainstorm | 6 | 4-6 queries |

**Reserve→Finalize Flow:**
1. Credits reserved at max before search starts (check-limit)
2. Search executes, counting actual Tavily queries
3. Actual credits charged, unused refunded (finalize-credits, fire-and-forget)

**Credit Packs** (Stripe integration TODO):
- Getting Started: 500 credits for $5 ($0.01/credit)
- I Like It: 2,000 credits for $15 ($0.0075/credit, 33% bonus)
- Power User: 6,000 credits for $40 ($0.0067/credit, 50% bonus)

**User Tiers:**
| Tier | Monthly Free Credits |
|------|---------------------|
| free | 1,000 |
| vip | 2,000 |
| admin | 10,000 |

**Database:**
- `user_limits` table stores credit balances, tier, and usage
- `credit_reservations` table tracks pending reservations
- `credit_purchases` table tracks purchase history
- `reserve_credits()` function reserves credits before search (tier-aware)
- `finalize_credits()` function charges actual usage, refunds unused
- `cancel_reservation()` function for full refund on search failure
- `cleanup_expired_reservations()` function expires stale reservations (5 min TTL)
- `get_user_credits()` function returns balance and tier info

**Admin Functions (service_role only):**
```sql
-- Set user tier by email
SELECT set_user_tier('user@example.com', 'vip');

-- Grant one-time bonus credits (added to purchased_credits)
SELECT grant_bonus_credits('user@example.com', 500);

-- View all users and their credits
SELECT * FROM admin_user_credits;
```

**Migration files:**
- `supabase/add-credit-system.sql` - Base credit system
- `supabase/add-credit-reservation.sql` - Reserve→finalize system
- `supabase/add-user-tiers.sql` - User tiers and admin functions
- Schema integrated in `supabase/schema.sql`

### Rate Limits (Security)
Daily/monthly search limits are enforced for abuse prevention, separate from billing:

| Limit | Default | Reset |
|-------|---------|-------|
| Daily searches | 50 | Midnight |
| Monthly searches | 1,000 | 1st of month |

These limits apply regardless of available credits. Prevents bad actors from abusing the system.

### Dual-Check Model
Every search request goes through a two-phase check in `/api/check-limit`:
1. **Rate Limits (Security)**: `check_and_increment_search_v2` - blocks if daily/monthly caps exceeded
2. **Credit Check (Billing)**: `check_and_use_credits` - deducts credits if allowed

Both checks must pass. Runs in parallel with first API call (no added latency). See `src/lib/supabase/CLAUDE.md` for database schema.

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json)

## UI/UX Patterns

### Streaming
- Content streams to UI with batched updates (50ms intervals) to prevent jerkiness
- Status banner at top shows "Generating response..." or "Polishing response..."
- Pulsing cursor shows active streaming position

### Layout
- Fixed sidebar (always visible, floats over content)
- Main content area has `ml-16` to account for sidebar width
- Responsive max-width containers (`max-w-4xl`)

## Common Tasks

### Adding a new LLM provider
See `src/lib/CLAUDE.md` for detailed 7-step guide.

### Modifying prompts
See `src/lib/CLAUDE.md` for prompt design guidelines.

### Changing streaming behavior
Edit `src/app/search/search-client.tsx`. Key areas:
- `scheduleContentUpdate` - batching logic
- `performSearch` - main search orchestration

## Caching

Two-tier caching system (Memory → Supabase → API) reduces costs. See `src/lib/CLAUDE.md` for detailed documentation including cache types, TTLs, and usage examples.

## Provider-Specific Notes

### Gemini
- `maxOutputTokens`: 8192 (increased from 4096 to prevent truncation in research mode)
- Finish reason logging: Logs warnings for `MAX_TOKENS` and `SAFETY` truncations
- Streaming uses SSE format with `alt=sse` parameter

### Claude
- Uses Anthropic message format (different from OpenAI)
- Requires `anthropic-version` header

### Grok
- OpenAI-compatible API at `api.x.ai`
- Model: `grok-4.1-fast`

### OpenAI
- Model: `gpt-5.1-2025-11-13` (labeled as "GPT-5.1 · Reference" in UI)
- GPT-5 family models are reasoning models and do not support custom temperature
- Temperature parameter is automatically omitted for models starting with `o1`, `o3`, or `gpt-5.1`

## Performance Optimizations

1. **Immediate Navigation**: Landing page navigates instantly (no blocking API calls)
2. **Parallel Operations**: Limit checks run in parallel with first API call
3. **Skip Redundant Calls**: Research/Brainstorm skip refine (plan/reframe handles it)
4. **Batched UI Updates**: 50ms intervals prevent jittery streaming
5. **Two-Tier Caching**: Reduces repeated API calls for same queries

## Deployment & External Services

### Vercel (Hosting)

1. Connect GitHub repository to Vercel
2. Set build settings:
   - Framework: Next.js
   - Root Directory: `deep-search`
   - Build Command: `npm run build`
   - Output Directory: `.next`
3. Add environment variables (same as `.env.local`)
4. Deploy

**Production URL**: Configure in Vercel → Settings → Domains

### Porkbun (Domain)

1. Purchase domain at porkbun.com
2. Add DNS records for Vercel:
   - Type: `CNAME`, Host: `@`, Answer: `cname.vercel-dns.com`
   - Type: `CNAME`, Host: `www`, Answer: `cname.vercel-dns.com`
3. In Vercel: Add domain → Settings → Domains → Add your domain
4. Wait for SSL certificate provisioning (automatic)

### Supabase (Auth + Database)

1. Create project at supabase.com
2. Run `supabase/schema.sql` in SQL Editor (includes all tables, functions, triggers)
3. Configure Authentication:
   - URL Configuration: Set Site URL and Redirect URLs
   - Email Templates: Copy from `supabase/email-templates/`
   - Providers: Enable GitHub OAuth (optional)
   - Settings: Enable "Leaked password protection"
4. Get credentials from Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. (Optional) Enable pg_cron for scheduled jobs:
   ```sql
   SELECT cron.schedule('reset-daily-limits', '0 0 * * *', $$SELECT public.reset_daily_limits()$$);
   SELECT cron.schedule('reset-monthly-limits', '0 0 1 * *', $$SELECT public.reset_monthly_limits()$$);
   SELECT cron.schedule('cleanup-cache', '0 3 * * *', $$SELECT public.cleanup_expired_cache()$$);
   ```

### Resend (Email Delivery)

Supabase uses its own SMTP by default, but for custom domain emails:

1. Create account at resend.com
2. Add and verify your domain (DNS records)
3. Create API key
4. In Supabase → Settings → Auth → SMTP Settings:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: Your Resend API key
   - Sender email: `noreply@yourdomain.com`

### Environment Variables Checklist

**Required for all environments:**
```
TAVILY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**At least one LLM provider:**
```
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
GROK_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

**For Vercel production:**
- Add all above via Vercel → Settings → Environment Variables
- Ensure variables are set for Production, Preview, and Development as needed
