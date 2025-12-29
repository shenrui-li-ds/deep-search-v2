# Athenius

An AI-powered search and research tool that provides intelligent, cited answers from the web.

![Next.js](https://img.shields.io/badge/Next.js-15.2-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### Search Modes

- **Web Search** - Quick answers with cited sources from Tavily-powered web search
- **Research** - Multi-angle deep research with synthesis across multiple search queries
- **Brainstorm** - Creative ideation using lateral thinking and cross-domain inspiration

### Multi-Provider LLM Support

Choose from multiple AI providers:
- DeepSeek (default, cost-effective)
- OpenAI GPT-4o mini
- Grok (x.ai)
- Claude Haiku 4.5
- Gemini 2.5 Flash

### Key Capabilities

- Real-time streaming responses
- Source citations with numbered references
- Related search suggestions
- Search history (with Supabase)
- Usage tracking and limits
- Dark/light theme support
- LaTeX math rendering

## Tech Stack

- **Framework**: Next.js 15.2 with App Router and Turbopack
- **UI**: React 19, Tailwind CSS 4, shadcn/ui
- **Search**: Tavily API
- **Auth & Database**: Supabase
- **Markdown**: react-markdown with remark-gfm, KaTeX

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- API keys (see below)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/athenius.git
cd athenius/deep-search

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### Environment Variables

Create `.env.local` with the following:

```bash
# Required: Tavily API for web search
TAVILY_API_KEY=tvly-your-key-here

# At least one LLM provider (DeepSeek recommended for cost)
DEEPSEEK_API_KEY=sk-your-deepseek-key
OPENAI_API_KEY=sk-your-openai-key
GROK_API_KEY=xai-your-grok-key
ANTHROPIC_API_KEY=sk-ant-your-claude-key
GEMINI_API_KEY=your-gemini-key

# Supabase (optional, for auth and history)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Development (optional)
SKIP_AUTH=true  # Skip auth in development
```

Get API keys from:
- [Tavily](https://tavily.com/) - Web search API
- [DeepSeek](https://platform.deepseek.com/) - DeepSeek API
- [OpenAI](https://platform.openai.com/) - OpenAI API
- [x.ai](https://console.x.ai/) - Grok API
- [Anthropic](https://console.anthropic.com/) - Claude API
- [Google AI](https://aistudio.google.com/) - Gemini API
- [Supabase](https://supabase.com/) - Auth & Database

### Running the App

```bash
# Development server (with Turbopack)
npm run dev

# Production build
npm run build
npm run start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

The app runs at http://localhost:3000

## Project Structure

```
deep-search/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes
│   │   │   ├── search/             # Tavily search
│   │   │   ├── refine/             # Query refinement
│   │   │   ├── summarize/          # LLM summarization
│   │   │   ├── proofread/          # Content proofreading
│   │   │   ├── related-searches/   # Related query generation
│   │   │   ├── research/           # Research mode (plan, synthesize)
│   │   │   └── brainstorm/         # Brainstorm mode (reframe, synthesize)
│   │   ├── auth/                   # Auth pages (login, signup)
│   │   ├── search/                 # Search results page
│   │   └── page.tsx                # Home page
│   ├── components/                 # React components
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── SearchBox.tsx           # Main search input
│   │   ├── SearchResult.tsx        # Results display
│   │   ├── Sidebar.tsx             # Navigation sidebar
│   │   └── MainLayout.tsx          # Layout wrapper
│   └── lib/
│       ├── api-utils.ts            # LLM provider utilities
│       ├── prompts.ts              # LLM prompts
│       ├── types.ts                # TypeScript types
│       └── supabase/               # Supabase integration
├── public/                         # Static assets
├── supabase/
│   └── schema.sql                  # Database schema
└── __tests__/                      # Unit tests
```

## Search Pipeline

### Web Search Mode
1. Query refinement (optional LLM pass)
2. Tavily web search
3. Streaming LLM summarization with citations

### Research Mode
1. Query → Research planning (generates 2-4 search angles)
2. Parallel searches for each angle
3. Multi-source synthesis (600-800 words)
4. Proofreading pass

### Brainstorm Mode
1. Query → Creative reframing (lateral thinking)
2. Cross-domain exploration
3. Idea synthesis with actionable experiments
4. Proofreading pass

## Database Setup (Optional)

For auth and search history, set up Supabase:

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Enable pg_cron extension for automatic usage resets:

```sql
-- Schedule daily usage reset at midnight UTC
SELECT cron.schedule('reset-daily-limits', '0 0 * * *', $$SELECT public.reset_daily_limits()$$);

-- Schedule monthly usage reset on 1st of each month
SELECT cron.schedule('reset-monthly-limits', '0 0 1 * *', $$SELECT public.reset_monthly_limits()$$);
```

## Development

### Adding a New LLM Provider

1. Add API URL constant in `src/lib/api-utils.ts`
2. Create `call{Provider}` function
3. Add stream parser if format differs from OpenAI
4. Update `LLMProvider` type
5. Update `callLLMForProvider` switch
6. Update `isProviderAvailable` and `getLLMProvider`
7. Update `SearchBox.tsx` model selector

### Modifying Prompts

Edit `src/lib/prompts.ts`. Prompts use XML-structured format for clarity.

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
