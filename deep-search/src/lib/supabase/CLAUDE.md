# Supabase Integration

Authentication and database layer using Supabase.

## Files

### `client.ts` - Browser Client

Creates a Supabase client for use in React components (client-side).

```typescript
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
```

### `server.ts` - Server Client

Creates a Supabase client for use in API routes and server components.

```typescript
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
}
```

### `middleware.ts` - Auth Middleware

Handles session refresh and route protection.

**Key Functions:**
- `updateSession(request)` - Refreshes auth session, redirects unauthenticated users

**Public Routes:**
- `/auth/login`
- `/auth/signup`
- `/auth/callback`
- `/auth/error`

**Dev Bypass:**
Set `SKIP_AUTH=true` in `.env.local` to skip auth in development mode.

### `auth-context.tsx` - React Auth Context

Provides auth state to React components.

```typescript
import { useAuth } from '@/lib/supabase/auth-context';

function MyComponent() {
  const { user, session, loading, signOut } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <LoginPrompt />;

  return <div>Welcome, {user.email}</div>;
}
```

**AuthContextType:**
```typescript
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
```

### `database.ts` - Database Operations

Client-side database operations for search history and usage limits.

**Search History:**

| Function | Description |
|----------|-------------|
| `addSearchToHistory(entry)` | Save a search to history |
| `getSearchHistory(limit, offset)` | Get paginated history |
| `searchHistory(term, limit)` | Search within history |
| `deleteSearchFromHistory(id)` | Delete single entry |
| `clearSearchHistory()` | Clear all user's history |
| `getSearchHistoryCount()` | Get total count |

**Usage Limits:**

| Function | Description |
|----------|-------------|
| `getUserLimits()` | Get user's current limits and usage |
| `checkSearchLimit()` | Check and increment search count |
| `canPerformSearch()` | Check if user can search (client-side) |

**Types:**
```typescript
interface SearchHistoryEntry {
  id?: string;
  user_id?: string;
  query: string;
  refined_query?: string;
  provider: string;
  mode: 'web' | 'pro' | 'brainstorm';
  sources_count: number;
  created_at?: string;
}

interface UserLimits {
  user_id: string;
  daily_search_limit: number;      // Default: 50
  daily_searches_used: number;
  monthly_token_limit: number;     // Default: 500,000
  monthly_tokens_used: number;
  last_reset_date: string;
}
```

### `usage-tracking.ts` - Server-Side Usage Tracking

Track API token usage from server-side API routes.

```typescript
import { trackServerApiUsage, estimateTokens, checkServerUsageLimits } from '@/lib/supabase/usage-tracking';

// In API route
const limitCheck = await checkServerUsageLimits();
if (!limitCheck.allowed) {
  return NextResponse.json({ error: limitCheck.reason }, { status: 429 });
}

// After LLM call
trackServerApiUsage({
  provider: 'deepseek',
  tokens_used: estimateTokens(input) + estimateTokens(output),
  request_type: 'summarize'
});
```

**Functions:**

| Function | Description |
|----------|-------------|
| `trackServerApiUsage(record)` | Record token usage |
| `estimateTokens(text)` | Estimate tokens (4 chars ≈ 1 token) |
| `checkServerUsageLimits()` | Server-side limit check |

## Database Schema

Located in `supabase/schema.sql`. Run this in Supabase SQL Editor.

### Tables

**`search_history`**
- Stores user search history
- RLS: Users can only access their own records

**`api_usage`**
- Tracks token usage per LLM request
- Used for billing/monitoring

**`user_limits`**
- Per-user quotas and current usage
- Auto-created for new users via trigger

### Key Functions (PostgreSQL)

| Function | Description |
|----------|-------------|
| `check_and_increment_search()` | Atomically check and increment daily search count |
| `increment_token_usage(user_id, tokens)` | Add tokens to monthly usage |
| `cleanup_old_history()` | Keep only last 100 entries per user |
| `reset_daily_limits()` | Reset daily counters (call via cron) |
| `reset_monthly_limits()` | Reset monthly counters (call via cron) |

## Setup

1. Create Supabase project at supabase.com
2. Run `supabase/schema.sql` in SQL Editor
3. Add to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. (Optional) Configure email templates in Authentication → Email Templates
