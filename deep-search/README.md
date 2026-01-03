# Athenius

An AI-powered search application that provides a Perplexity-like search experience with multi-provider LLM support, comprehensive research capabilities, and creative brainstorming features.

![Next.js](https://img.shields.io/badge/Next.js-15.5-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)

## Features

- **Multi-Provider LLM Support**: DeepSeek, OpenAI, Grok, Claude, Gemini
- **Three Search Modes**:
  - **Web Search**: Quick answers with cited sources
  - **Research**: Multi-angle deep research with 700-900 word synthesis
  - **Brainstorm**: Creative ideation using cross-domain inspiration
- **Streaming Responses**: Real-time content generation with smooth UI updates
- **Two-Tier Caching**: In-memory LRU + Supabase persistent cache for cost reduction
- **User Authentication**: Supabase Auth with email/password and GitHub OAuth
- **Credit System**: 1000 free credits/month with optional credit purchases
- **Usage Tracking**: Search mode and provider breakdowns with visual charts
- **Copy & Share**: Copy answers, share formatted text, export to PDF
- **Dark/Light Theme**: System-aware theme support
- **LaTeX Math Rendering**: KaTeX for mathematical expressions

## Tech Stack

- **Framework**: Next.js 15.5 with App Router and Turbopack
- **UI**: React 19, Tailwind CSS 4, shadcn/ui
- **Markdown**: react-markdown with remark-gfm, remark-math, rehype-katex
- **Auth & DB**: Supabase (PostgreSQL + Auth)
- **Search**: Tavily API
- **Email**: Resend (SMTP)
- **LLMs**: Multi-provider support with streaming

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

Create `.env.local`:

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

Get API keys from:
- [Tavily](https://tavily.com/) - Web search API
- [DeepSeek](https://platform.deepseek.com/) - DeepSeek API (recommended, cost-effective)
- [OpenAI](https://platform.openai.com/) - OpenAI API
- [x.ai](https://console.x.ai/) - Grok API
- [Anthropic](https://console.anthropic.com/) - Claude API
- [Google AI](https://aistudio.google.com/) - Gemini API
- [Supabase](https://supabase.com/) - Auth & Database

### Database Setup

Run the SQL schema in your Supabase SQL Editor:
- `supabase/schema.sql` - Full schema for new projects
- `supabase/add-cache-table.sql` - Add caching (if upgrading)
- `supabase/add-extended-limits.sql` - Add extended limits (if upgrading)
- `supabase/add-credit-system.sql` - Add credit-based billing (if upgrading)
- `supabase/add-combined-auth-check.sql` - Optimized auth check (if upgrading)
- `supabase/add-credit-reservation.sql` - Dynamic credit billing (if upgrading)
- `supabase/add-user-tiers.sql` - User tiers and admin functions (if upgrading)
- `supabase/migrate-vip-to-pro.sql` - Rename VIP tier to PRO (if upgrading from older version)

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
│   │   ├── account/                # Account settings (profile, billing, usage)
│   │   ├── search/                 # Search results page
│   │   ├── library/                # Search history page
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
│   ├── schema.sql                  # Database schema
│   └── email-templates/            # Custom email templates
└── __tests__/                      # Unit tests
```

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

### Credit System

Users get 1000 free credits per month. 1 credit = 1 Tavily search query. You're charged only for actual queries made:

| Search Mode | Credits (Actual Usage) |
|-------------|------------------------|
| Web Search | 1 credit |
| Research | 3-4 credits |
| Brainstorm | 4-6 credits |

The system uses a reserve→finalize approach for fair billing:
1. Credits are reserved at max before search starts
2. Actual credits charged after search completes (based on queries made)
3. Unused credits are refunded automatically

**User Tiers:**
| Tier | Monthly Free Credits |
|------|---------------------|
| free | 1,000 |
| pro | 2,000 |
| admin | 10,000 |

**Credit Packs** (coming soon):
| Pack | Credits | Price |
|------|---------|-------|
| Getting Started | 500 | $5 |
| I Like It | 2,000 | $15 (33% bonus) |
| Power User | 6,000 | $40 (50% bonus) |

Free credits reset on the 1st of each month. Purchased credits never expire.

### Legacy Usage Limits (for visualization)

| Limit | Default | Reset |
|-------|---------|-------|
| Daily searches | 50 | Midnight |
| Daily tokens | 100,000 | Midnight |
| Monthly searches | 1,000 | 1st of month |
| Monthly tokens | 500,000 | 1st of month |

## Development Guide

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
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

## Deployment

### Vercel

1. Connect your GitHub repository
2. Set **Root Directory** to `deep-search`
3. Add environment variables
4. Deploy

### Supabase Auth

1. Go to Supabase → Authentication → URL Configuration
2. Set **Site URL** to your production domain:
   ```
   https://your-domain.com
   ```
3. Add **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://your-domain.com/auth/callback
   ```

### GitHub OAuth (Optional)

1. Create OAuth App at GitHub → Settings → Developer Settings → OAuth Apps
2. Set Authorization callback URL to:
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   ```
3. Copy Client ID and Client Secret to Supabase → Authentication → Providers → GitHub

### Cloudflare Turnstile (Bot Protection)

Protect auth pages from bots with [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/):

1. **Create Widget** at Cloudflare Dashboard → Turnstile
   - Click "Add site"
   - Choose "Cloudflare dashboard" method
   - Enter site name (e.g., "Athenius Auth")
   - Add hostnames: `localhost`, `your-domain.com`, `*.vercel.app`
   - Select "Managed" widget mode
   - Skip pre-clearance (choose No)

2. **Add Environment Variables**
   ```env
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key
   TURNSTILE_SECRET_KEY=your_secret_key
   ```

3. **Add to Vercel** (for production)
   - Go to Vercel → Project → Settings → Environment Variables
   - Add both keys for Production/Preview environments

The widget automatically appears on login, signup, and forgot-password pages when keys are configured.

### Email with Resend

Supabase's default email has strict rate limits. Use [Resend](https://resend.com) for reliable email delivery:

1. **Create Resend Account**
   - Sign up at [resend.com](https://resend.com)
   - Verify your domain (or use the free `onboarding@resend.dev` for testing)

2. **Get API Key**
   - Go to Resend Dashboard → API Keys
   - Create a new API key with "Sending access"

3. **Configure Supabase SMTP**
   - Go to Supabase → Project Settings → Authentication → SMTP Settings
   - Enable "Custom SMTP"
   - Enter the following:
     ```
     Host: smtp.resend.com
     Port: 465
     Username: resend
     Password: <your-resend-api-key>
     Sender email: noreply@yourdomain.com
     Sender name: Athenius
     ```

4. **Apply Custom Email Templates**
   - Copy HTML from `supabase/email-templates/*.html` into Supabase → Authentication → Email Templates
   - See `supabase/email-templates/README.md` for subject lines and details

**Note:** Free Resend tier includes 3,000 emails/month. For production, verify your domain for better deliverability.

## License

Private project.
