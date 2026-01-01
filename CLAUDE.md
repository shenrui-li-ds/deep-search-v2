# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

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
- `OPENAI_API_KEY` - OpenAI GPT-4.1 mini
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
   → Generates 2-4 research angles (fundamentals, applications, comparison, current state)
    ↓
2. Parallel Search: /api/search × 2-4
   → Executes multiple searches concurrently (10 results each)
    ↓
3. Synthesis: /api/research/synthesize (streaming)
   → Combines all search results into 700-900 word research document
    ↓
4. Proofreading: /api/proofread (mode='quick')
   → Quick regex-based cleanup to preserve synthesized content
    ↓
5. Display
```

**Key Differences from Web Search:**
- Multi-angle research instead of single query
- Longer, more comprehensive output (700-900 words vs 200-300)
- Synthesizes from 30-40 sources vs 10-15
- Skips refine step (plan already optimizes queries)

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
   → Synthesizes cross-domain inspiration into 700-900 word document
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
  - **Profile tab**: User info, security (change password), sign out
  - **Preferences tab**: Default provider and search mode selection
  - **Usage tab**: Daily search and monthly token usage with progress bars

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

### Usage Limits
Limits checked in parallel with first API call (no added latency). See `src/lib/supabase/CLAUDE.md` for defaults and database schema.

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
