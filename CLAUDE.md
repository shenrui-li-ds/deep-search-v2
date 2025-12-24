# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeepSearch is an AI-powered search application that uses Tavily for web search and OpenAI GPT-4o for summarizing results. It provides a Perplexity-like search experience with streamed, cited summaries.

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
- `OPENAI_API_KEY` - OpenAI API key for GPT-4o summarization
- `TAVILY_API_KEY` - Tavily API key for web search

## Architecture

### Search Flow

1. User submits query → `/api/search` calls Tavily API
2. Search results returned → `/api/summarize` streams GPT-4o response with citations
3. Frontend handles SSE streaming and renders markdown with react-markdown

### API Routes (`src/app/api/`)

- `search/route.ts` - Wraps Tavily search API, converts results to internal Source/SearchImage formats
- `summarize/route.ts` - Streams GPT-4o summary with inline citations using SSE
- `refine/route.ts` - Optional query refinement before search

### Core Library (`src/lib/`)

- `api-utils.ts` - API helpers for OpenAI and Tavily, includes `streamOpenAIResponse` generator for SSE parsing
- `prompts.ts` - XML-structured prompts for query refinement and summarization
- `types.ts` - TypeScript interfaces (Source, SearchImage, TavilySearchResult, etc.)

### Key Components (`src/components/`)

- `SearchResult.tsx` - Main result display with markdown rendering
- `SourcesList.tsx` / `SourceItem.tsx` - Source citation UI
- `SearchBox.tsx` - Search input component

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json)

## Tech Stack

- Next.js 15.2 with App Router and Turbopack
- React 19
- Tailwind CSS 4
- react-markdown with remark-gfm for GFM support
