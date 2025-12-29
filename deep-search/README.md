# Athenius

An AI-powered search application that provides a Perplexity-like search experience with multi-provider LLM support, comprehensive research capabilities, and creative brainstorming features.

## Features

- **Multi-Provider LLM Support**: DeepSeek, OpenAI, Grok, Claude, Gemini
- **Three Search Modes**:
  - **Web Search**: Quick answers with cited sources
  - **Research**: Multi-angle deep research with 700-900 word synthesis
  - **Brainstorm**: Creative ideation using cross-domain inspiration
- **Streaming Responses**: Real-time content generation with smooth UI updates
- **Two-Tier Caching**: In-memory LRU + Supabase persistent cache for cost reduction
- **User Authentication**: Supabase Auth with usage limits and search history

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project (for auth and database)
- API keys for Tavily and at least one LLM provider

### Installation

```bash
cd deep-search
npm install
```

### Environment Variables

Create `deep-search/.env.local`:

```env
# Required
TAVILY_API_KEY=your_tavily_key

# At least one LLM provider
DEEPSEEK_API_KEY=your_deepseek_key
OPENAI_API_KEY=your_openai_key
GROK_API_KEY=your_grok_key
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup

Run the SQL schema in your Supabase SQL Editor:
- `supabase/schema.sql` - Full schema for new projects
- `supabase/add-cache-table.sql` - Add caching (if upgrading)
- `supabase/add-extended-limits.sql` - Add extended limits (if upgrading)

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm run start
```

## Tech Stack

- **Framework**: Next.js 15.5 with App Router and Turbopack
- **UI**: React 19, Tailwind CSS 4, shadcn/ui
- **Markdown**: react-markdown with remark-gfm, remark-math, rehype-katex
- **Auth & DB**: Supabase (PostgreSQL + Auth)
- **Search**: Tavily API
- **LLMs**: Multi-provider support with streaming

## Architecture

### Search Pipelines

**Web Search:**
```
Navigate → Refine + Limit Check (parallel) → Search → Summarize (stream)
```

**Research Mode:**
```
Navigate → Plan + Limit Check (parallel) → Multi-Search (parallel) → Synthesize (stream) → Proofread
```

**Brainstorm Mode:**
```
Navigate → Reframe + Limit Check (parallel) → Multi-Search (parallel) → Ideate (stream) → Proofread
```

### Caching

Two-tier caching reduces API costs:
- **Tier 1**: In-memory LRU cache (15 min TTL, 500 entries)
- **Tier 2**: Supabase persistent cache (48 hour TTL)

Cached endpoints: `/api/search`, `/api/refine`, `/api/related-searches`, `/api/research/plan`

### User Limits

| Limit | Default | Reset |
|-------|---------|-------|
| Daily searches | 50 | Midnight |
| Daily tokens | 100,000 | Midnight |
| Monthly searches | 1,000 | 1st of month |
| Monthly tokens | 500,000 | 1st of month |

## Deployment

### Vercel

1. Connect your GitHub repository
2. Set **Root Directory** to `deep-search`
3. Add environment variables
4. Deploy

### Supabase Auth

Add your deployment URL to Supabase → Authentication → URL Configuration → Redirect URLs:
```
https://your-domain.com/auth/callback
```

## License

Private project.
