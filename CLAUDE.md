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

## Environment Variables

Required in `deep-search/.env.local`:
- `TAVILY_API_KEY` - Tavily API key for web search (required)

At least one LLM provider key:
- `DEEPSEEK_API_KEY` - DeepSeek Chat (preferred, cost-effective)
- `OPENAI_API_KEY` - OpenAI GPT-4o mini
- `GROK_API_KEY` - xAI Grok 4.1 Fast
- `ANTHROPIC_API_KEY` - Anthropic Claude Haiku 4.5
- `GEMINI_API_KEY` - Google Gemini 2.5 Flash

Supabase (for auth and database):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key

## Architecture

### Search Flow

1. User submits query → `/api/refine` optionally refines query
2. Refined query → `/api/search` calls Tavily API
3. Search results → `/api/summarize` streams LLM response with citations
4. (Pro mode only) → `/api/proofread` polishes the final response
5. Frontend renders streamed markdown with react-markdown

### Search Modes

- **Web**: Standard search with streaming summary (single search → summarize)
- **Brainstorm**: Creative ideation using lateral thinking and cross-domain inspiration
- **Research** (Pro mode): Multi-angle research pipeline with comprehensive synthesis

### Research Pipeline (Pro/Research Mode)

The Research mode uses a sophisticated agentic pipeline for in-depth research:

```
User Query
    ↓
1. Planning: /api/research/plan
   → Generates 2-4 research angles (fundamentals, applications, comparison, current state)
    ↓
2. Parallel Search: /api/search × 2-4
   → Executes multiple searches concurrently (10 results each)
    ↓
3. Synthesis: /api/research/synthesize (streaming)
   → Combines all search results into 600-800 word research document
    ↓
4. Proofreading: /api/proofread (mode='research')
   → Research-specific polish (preserves depth, improves flow)
    ↓
5. Display
```

**Key Differences from Web Search:**
- Multi-angle research instead of single query
- Longer, more comprehensive output (600-800 words vs 200-300)
- Synthesizes from 30-40 sources vs 10-15
- Research-specific proofreading that preserves depth

### Brainstorm Pipeline

The Brainstorm mode uses lateral thinking and cross-domain inspiration to generate creative ideas:

```
User Topic
    ↓
1. Reframe: /api/brainstorm/reframe
   → Generates 4-5 creative angles from unexpected domains
   → Examples: nature analogies, game mechanics, contrarian views
    ↓
2. Parallel Search: /api/search × 4-5
   → Searches for inspiration in each cross-domain angle (8 results each)
    ↓
3. Ideation: /api/brainstorm/synthesize (streaming)
   → Synthesizes cross-domain inspiration into actionable ideas
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
- `page.tsx` - User account info and sign-out

## Tech Stack

- Next.js 15.2 with App Router and Turbopack
- React 19
- Tailwind CSS 4
- react-markdown with remark-gfm for GFM support
- shadcn/ui components
- Supabase (Auth + PostgreSQL database)

## Authentication

Uses Supabase Auth with email/password authentication.

### Auth Flow
1. User visits protected route → middleware redirects to `/auth/login`
2. User signs up → email confirmation sent → clicks link → `/auth/callback`
3. Session stored in cookies, managed by Supabase SSR

### Route Protection
- Middleware (`src/middleware.ts`) checks auth on every request
- Public routes: `/auth/*`
- All other routes require authentication

### Database (Supabase)
- `search_history` - User search history with RLS
- `api_usage` - Token usage tracking per request
- `user_limits` - Per-user quotas (daily searches, monthly tokens)

### Row Level Security (RLS)
Each user can only see/modify their own data. Policies enforce `auth.uid() = user_id`.

### Usage Limits (Guard Rails)
- 50 searches per day (resets at midnight)
- 500,000 tokens per month (resets on 1st)
- Limits checked client-side before search and server-side in API routes

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
1. Add API endpoint constant in `src/lib/api-utils.ts`
2. Create `call{Provider}` function following existing patterns
3. Add to `LLMProvider` type
4. Update `callLLMForProvider` switch statement
5. Add env var check in `isProviderAvailable`

### Modifying prompts
Edit `src/lib/prompts.ts`. Prompts use XML-structured format for clarity.

### Changing streaming behavior
Edit `src/app/search/search-client.tsx`. Key areas:
- `scheduleContentUpdate` - batching logic
- `performSearch` - main search orchestration
