# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeepSearch is an AI-powered search application that provides a Perplexity-like search experience with:
- Multi-provider LLM support (DeepSeek, OpenAI, Qwen, Claude)
- Tavily-powered web search
- Streamed, cited summaries with markdown rendering
- Three search modes: Web, Focus, and Pro (with proofreading)

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
- `DEEPSEEK_API_KEY` - DeepSeek API (preferred, cost-effective)
- `OPENAI_API_KEY` - OpenAI API for GPT-4o
- `QWEN_API_KEY` - Alibaba Qwen API
- `ANTHROPIC_API_KEY` - Anthropic Claude API

## Architecture

### Search Flow

1. User submits query → `/api/refine` optionally refines query
2. Refined query → `/api/search` calls Tavily API
3. Search results → `/api/summarize` streams LLM response with citations
4. (Pro mode only) → `/api/proofread` polishes the final response
5. Frontend renders streamed markdown with react-markdown

### Search Modes

- **Web**: Standard search with streaming summary
- **Focus**: Same as Web (reserved for future features)
- **Pro**: Deep search (15 results vs 10) + LLM proofreading pass

### Provider Selection

The model selector in the UI controls which LLM provider is used for:
- Query refinement (`/api/refine`)
- Summarization (`/api/summarize`)
- Proofreading (`/api/proofread`)

Provider is passed via URL params and request body throughout the pipeline.

## Key Directories

### `src/app/api/` - API Routes
See `src/app/api/CLAUDE.md` for detailed API documentation.

### `src/components/` - React Components
See `src/components/CLAUDE.md` for component documentation.

### `src/lib/` - Core Library
See `src/lib/CLAUDE.md` for utility and type documentation.

### `src/app/search/` - Search Page
- `page.tsx` - Server component, reads URL params
- `search-client.tsx` - Client component, orchestrates search flow with streaming

## Tech Stack

- Next.js 15.2 with App Router and Turbopack
- React 19
- Tailwind CSS 4
- react-markdown with remark-gfm for GFM support
- shadcn/ui components

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
