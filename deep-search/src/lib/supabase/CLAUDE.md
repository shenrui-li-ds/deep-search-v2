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
- `/auth/forgot-password`
- `/auth/reset-password`

All other routes require authentication. Unauthenticated users are redirected to `/auth/login`.

**No-Redirect Routes (for logged-in users):**
- `/auth/callback` - OAuth callback
- `/auth/reset-password` - Password recovery flow (user has recovery session)

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
| `addSearchToHistory(entry)` | Save/upsert search to history (uses RPC for performance) |
| `getSearchHistory(limit, offset)` | Get paginated history (excludes soft-deleted) |
| `searchHistory(term, limit)` | Search within history (excludes soft-deleted) |
| `deleteSearchFromHistory(id)` | Soft delete entry (sets deleted_at, preserves for usage tracking) |
| `clearSearchHistory()` | Soft delete all user's history |
| `getSearchHistoryCount()` | Get total count (excludes soft-deleted) |
| `toggleBookmark(id)` | Toggle bookmark status, returns new status |
| `getBookmarkedSearches(limit, offset)` | Get bookmarked entries (excludes soft-deleted) |
| `getBookmarkedCount()` | Get total bookmarked count (excludes soft-deleted) |

**Soft Delete & Recovery:**

| Function | Description |
|----------|-------------|
| `getDeletedSearchHistory(limit, offset)` | Get soft-deleted entries |
| `getDeletedSearchCount()` | Get count of soft-deleted entries |
| `recoverSearchFromHistory(id)` | Recover soft-deleted entry (sets deleted_at to null) |
| `permanentlyDeleteSearch(id)` | Hard delete (for cleanup jobs only) |

**Usage Limits:**

| Function | Description |
|----------|-------------|
| `getUserLimits()` | Get user's current limits and usage (token tracking) |
| `checkSearchLimit(mode?)` | Check if user has credits available (deprecated, use /api/check-limit) |
| `canPerformSearch(mode?)` | Check if user can search based on credits (client-side preview) |

**User Preferences:**

| Function | Description |
|----------|-------------|
| `getUserPreferences()` | Get user's default provider and mode |
| `updateUserPreferences(prefs)` | Update default provider and/or mode |

**Credit System:**

| Function | Description |
|----------|-------------|
| `getUserCredits()` | Get current credit balances (free + purchased) |
| `checkAndUseCredits(mode)` | Check and deduct credits atomically |
| `hasEnoughCredits(mode)` | Preview credit check without deduction |
| `getPurchaseHistory(limit)` | Get user's credit purchase history |
| `MAX_CREDITS` | Max credits reserved per mode: web=1, pro=4, brainstorm=6 |
| `CREDIT_COSTS` | Alias for MAX_CREDITS (backwards compatibility) |

**User Tiers (monthly free credits):**
| Tier | Credits |
|------|---------|
| free | 500 |
| pro | 2,000 |
| admin | 10,000 |

**Admin Functions (SQL, service_role only):**
| Function | Description |
|----------|-------------|
| `set_user_tier(email, tier)` | Set user's tier ('free', 'pro', 'admin') |
| `grant_bonus_credits(email, credits)` | Grant one-time bonus credits |
| `admin_user_credits` view | View all users and their credit info |

**Usage Statistics:**

| Function | Description |
|----------|-------------|
| `getUsageStats(days)` | Get usage breakdown by mode, provider, daily activity, today's count, and this month's count |

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
  bookmarked?: boolean;
  created_at?: string;
  deleted_at?: string | null;  // Soft delete timestamp
}

interface UserLimits {
  user_id: string;
  // Daily limits
  daily_search_limit: number;      // Default: 50
  daily_searches_used: number;
  daily_token_limit: number;       // Default: 100,000
  daily_tokens_used: number;
  // Monthly limits
  monthly_search_limit: number;    // Default: 1,000
  monthly_searches_used: number;
  monthly_token_limit: number;     // Default: 500,000
  monthly_tokens_used: number;
  // Reset tracking
  last_daily_reset: string;
  last_monthly_reset: string;
}

// ModelId for grouped model selection
// Uses provider-based naming for future compatibility
type UserModelId =
  | 'gemini'          // Google Gemini Flash (default)
  | 'gemini-pro'      // Google Gemini Pro
  | 'openai'          // OpenAI flagship (latest)
  | 'openai-mini'     // OpenAI mini series
  | 'deepseek'        // DeepSeek Chat
  | 'grok'            // xAI Grok
  | 'claude'          // Anthropic Claude
  | 'vercel-gateway'; // Vercel AI Gateway

interface UserPreferences {
  user_id: string;
  default_provider: UserModelId;  // Uses ModelId for grouped model selection
  default_mode: 'web' | 'pro' | 'brainstorm';
  created_at?: string;
  updated_at?: string;
}

interface UserCredits {
  monthly_free_credits: number;     // Default: 500
  free_credits_used: number;
  free_credits_remaining: number;
  purchased_credits: number;
  total_available: number;
  days_until_reset: number;
}

interface CreditPurchase {
  id: string;
  user_id: string;
  pack_type: 'starter' | 'plus' | 'pro';
  credits: number;
  amount_cents: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
}

interface UsageStats {
  totalSearches: number;
  todaySearches: number;
  thisMonthSearches: number;
  byMode: { mode: string; count: number }[];
  byProvider: { provider: string; count: number }[];
  last30Days: { date: string; count: number }[];
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
| `checkServerUsageLimits()` | Server-side token limit check (search limits handled by credit system) |

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

**`user_preferences`**
- User's default provider and search mode
- Auto-created for new users via trigger

### Key Functions (PostgreSQL)

| Function | Description |
|----------|-------------|
| `upsert_search_history(...)` | Atomic upsert for search history (updates bookmarked entries, inserts new) |
| `upsert_user_preferences(...)` | Atomic upsert for user preferences |
| `check_and_increment_search()` | Atomically check and increment search count (returns BOOLEAN) |
| `check_and_increment_search_v2()` | Optimized version that returns JSON with all limit data (eliminates extra query) |
| `increment_token_usage(user_id, tokens)` | Add tokens to daily and monthly usage |
| `cleanup_old_history()` | Keep only last 100 entries per user |
| `reset_daily_limits()` | Reset daily counters (call via cron) |
| `reset_monthly_limits()` | Reset monthly counters (call via cron) |
| `soft_delete_search(p_search_id)` | Soft delete a search entry (sets deleted_at) |
| `recover_search(p_search_id)` | Recover a soft-deleted entry (clears deleted_at) |
| `soft_delete_all_searches()` | Soft delete all user's search history |
| `cleanup_deleted_searches(p_days_old)` | Permanently delete soft-deleted records older than N days (default: 365) |

### `upsert_search_history` Function

Optimizes the "add to history" flow by combining duplicate check + insert/update into a single database call.

**Migration file:** `supabase/add-upsert-search-history-function.sql`

**Behavior:**
1. If a BOOKMARKED entry with same `(user_id, query, provider, mode)` exists → updates it
2. Otherwise → inserts a new entry

**Why:** Eliminates one database round trip (from 3 to 2 calls), reducing latency by ~50-200ms.

**Usage in TypeScript:**
```typescript
const { data } = await supabase.rpc('upsert_search_history', {
  p_user_id: user.id,
  p_query: 'search query',
  p_provider: 'deepseek',
  p_mode: 'web',
  p_sources_count: 10,
  p_refined_query: 'refined query',
});
```

## Authentication Methods

### Email/Password
Standard email and password signup/login. Email confirmation required.

### Change Password

Users can change their password from the Account page (`/account`). The flow:

1. User enters current password (verified via `signInWithPassword`)
2. User enters new password with requirements:
   - Minimum 10 characters
   - At least one lowercase letter
   - At least one uppercase letter
   - At least one digit
3. Password updated via `updateUser({ password: newPassword })`

```typescript
// Verify current password
const { error: signInError } = await supabase.auth.signInWithPassword({
  email: userEmail,
  password: currentPassword,
});

// Update to new password
const { error: updateError } = await supabase.auth.updateUser({
  password: newPassword,
});
```

**UI Features:**
- Modal dialog with form validation
- Eye icon toggle to show/hide password in each field
- Real-time validation feedback
- Success confirmation before modal closes

### Forgot Password (Password Reset via Email)

Users who forget their password can request a reset link.

**Flow:**
1. User clicks "Forgot password?" on login page → `/auth/forgot-password`
2. User enters email address
3. Supabase sends reset email via `resetPasswordForEmail(email, { redirectTo })`
4. User clicks link in email → redirected to `/auth/reset-password`
5. User enters new password (same validation as Change Password)
6. Password updated via `updateUser({ password })`

**Pages:**
- `/auth/forgot-password` - Email input to request reset link
- `/auth/reset-password` - New password form (handles recovery session)

```typescript
// Request reset link
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/reset-password`,
});

// Set new password (on reset-password page)
const { error } = await supabase.auth.updateUser({
  password: newPassword,
});
```

**Reset Password Page States:**
- Loading: Verifying recovery session
- Invalid/Expired: Link no longer valid, offer to request new link
- Form: Password input with validation
- Success: Confirmation, then redirect to home

### Reset Password via Email (Account Page)

Logged-in users can request a password reset link from Account → Profile → Account Security.

```typescript
const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
  redirectTo: `${window.location.origin}/auth/reset-password`,
});
```

### Change Email

Users can update their email address from Account → Profile → Account Security.

**Flow:**
1. User clicks "Update" next to Email Address
2. User enters new email address
3. Supabase sends verification email via `updateUser({ email }, { emailRedirectTo })`
4. User clicks link in verification email
5. Email is updated after verification

```typescript
const { error } = await supabase.auth.updateUser(
  { email: newEmail },
  { emailRedirectTo: `${window.location.origin}/auth/callback` }
);
```

**Notes:**
- Email doesn't change until new address is verified
- Verification email sent to NEW address
- Uses Supabase's "Change Email" email template

### OAuth Providers
GitHub OAuth is supported. To add more providers:

1. Configure provider in Supabase Dashboard → Authentication → Providers
2. Add OAuth button to login/signup pages using:

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'github', // or 'google', 'azure', etc.
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

**Supported Providers:**
- GitHub (configured)
- Google, Microsoft, Apple, Discord, etc. (available on Supabase free tier)

**Redirect URLs:**
Configure in Supabase → Authentication → URL Configuration:
- Site URL: `https://your-domain.com`
- Redirect URLs:
  - `http://localhost:3000/auth/callback` (development)
  - `https://your-domain.com/auth/callback` (production)

## Email Templates

Custom email templates are stored in `supabase/email-templates/`:

| Template | File | Subject |
|----------|------|---------|
| Confirm signup | `confirm-signup.html` | Welcome to Athenius! Please confirm your email |
| Invite user | `invite-user.html` | You've been invited to join Athenius! |
| Magic Link | `magic-link.html` | Your magic link to sign in to Athenius |
| Change Email | `change-email.html` | Almost there! Confirm your new email address |
| Reset Password | `reset-password.html` | Let's get you back into Athenius |
| Reauthentication | `reauthentication.html` | Quick security check for Athenius |

To apply: Copy HTML content to Supabase → Authentication → Email Templates.

## Security Settings

### Function Search Path

All PostgreSQL functions should have explicit `search_path` to prevent SQL injection:

```sql
ALTER FUNCTION public.function_name() SET search_path = public;
```

This is especially important for `SECURITY DEFINER` functions.

### Leaked Password Protection

Enable in Supabase → Authentication → Settings to check passwords against HaveIBeenPwned database.

### Bot Protection (Dual CAPTCHA System)

All auth forms (login, signup, forgot-password) are protected by a dual CAPTCHA system with fallback for regions where Cloudflare is blocked (e.g., China).

**Environment Variables:**
```
# Primary: Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key
TURNSTILE_SECRET_KEY=your_turnstile_secret_key

# Fallback: hCaptcha (optional, for China users)
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_hcaptcha_site_key
HCAPTCHA_SECRET_KEY=your_hcaptcha_secret_key

# Email whitelist (optional, bypasses CAPTCHA)
CAPTCHA_WHITELIST_EMAILS=user1@example.com,user2@example.com
```

**Implementation Files:**
- `src/components/Turnstile.tsx` - Primary CAPTCHA widget
- `src/components/HCaptcha.tsx` - Fallback CAPTCHA widget
- `src/app/api/auth/verify-turnstile/route.ts` - Turnstile token validation
- `src/app/api/auth/verify-hcaptcha/route.ts` - hCaptcha token validation
- `src/app/api/auth/check-whitelist/route.ts` - Email whitelist check
- `src/__tests__/app/auth/captcha-fallback.test.ts` - Integration tests for fallback logic

**CAPTCHA Fallback Flow:**
```
Page Load
    ↓
Show Turnstile widget
    ↓ (15s timeout if blocked)
Show hCaptcha fallback (if configured)
    ↓ (15s timeout if also blocked)
Enable form submission (fail-open for UX)
```

**Button Disabled Logic:**
| Scenario | Button State |
|----------|--------------|
| Waiting for Turnstile | Disabled |
| Turnstile token received | Enabled |
| Turnstile timed out, hCaptcha configured | Disabled (waiting for hCaptcha) |
| Turnstile timed out, no hCaptcha configured | Enabled (timeout bypass) |
| Both CAPTCHAs timed out | Enabled (timeout bypass) |
| hCaptcha token received | Enabled |
| Whitelisted email | Enabled (immediate) |

**Form Submission Validation:**
```
Submit Clicked
    ↓
Check Whitelist → (if whitelisted) → Skip CAPTCHA → Auth
    ↓ (not whitelisted)
Check Turnstile token → (if valid) → Auth
    ↓ (no token, timed out)
Check hCaptcha token → (if valid) → Auth
    ↓ (no token, both timed out or no hCaptcha configured)
Timeout bypass (fail-open) → Auth
```

**China User Scenario:**
When only Turnstile is configured and blocked by GFW:
1. Turnstile widget fails to load (blocked by firewall)
2. After 15s timeout, button is enabled (fail-open)
3. User can submit form without CAPTCHA
4. If hCaptcha is also configured, it's shown as fallback before fail-open

**Visual Feedback:**
- "Trying alternative verification..." when switching to hCaptcha
- Amber warning box when fail-open bypass active
- Green shield icon when email is whitelisted

**Turnstile Setup:**
1. Go to Cloudflare Dashboard → Turnstile
2. Create a new site, select "Managed" widget mode
3. Add domains: `localhost`, production domain
4. Copy Site Key and Secret Key to `.env.local`

**hCaptcha Setup:**
1. Go to hCaptcha Dashboard (hcaptcha.com)
2. Create a new site
3. Add domains: `localhost`, production domain
4. Copy Site Key and Secret Key to `.env.local`

**Notes:**
- Widgets only shown when corresponding env vars are set
- Token validation is server-side (secret keys never exposed)
- Each token is single-use, widgets reset after validation
- Turnstile tokens expire after 300s (widget auto-refreshes)
- hCaptcha fallback designed for China users (Cloudflare blocked by GFW)
- Fail-open behavior prioritizes UX over strict bot protection
- Integration tests in `src/__tests__/app/auth/captcha-fallback.test.ts` cover all scenarios

### Account Lockout (Brute Force Protection)

Progressive account lockout after failed login attempts. Migration: `supabase/add-login-lockout.sql`

**Thresholds:**
- 5 failed attempts in 15 minutes → 5 minute lockout
- 10 failed attempts in 1 hour → 30 minute lockout
- 15+ failed attempts in 1 hour → 1 hour lockout

**Database Functions:**
| Function | Description |
|----------|-------------|
| `check_login_lockout(p_email)` | Check if account is locked (returns JSON with locked status, remaining_seconds) |
| `record_failed_login(p_email)` | Record failed attempt, apply lockout if threshold reached |
| `reset_login_attempts(p_email)` | Reset attempts on successful login |

**Login Page Integration:**
- Checks lockout before login attempt
- Records failed attempts and shows lockout countdown
- Resets attempts on successful login
- Button disabled during lockout with countdown display

### Session-Based Security Cooldown

15-minute cooldown after login before sensitive security actions (reset password, change email).

- Login page stores `session_start_time` in localStorage on successful login
- Account security modals check elapsed time before allowing action
- Shows countdown UI when cooldown is active

### Change Email Re-Authentication

Change Email modal requires password verification before sending email change request. This prevents account takeover via leaked credentials.

**Flow:**
1. User enters current password
2. Password verified via `signInWithPassword`
3. Only then `updateUser({ email })` is called
4. Verification email sent to new address

## Avatar Storage

User profile photos are stored in Supabase Storage.

**Bucket Configuration:**
- Bucket name: `avatars`
- Public: Yes (allows direct URL access without auth)
- File size limit: 300KB (307,200 bytes)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

**File Path Format:**
```
avatars/{user_id}/{timestamp}.jpg
```

**RLS Policies:**
| Policy | Operation | Rule |
|--------|-----------|------|
| Avatar upload | INSERT | `auth.uid()::text = (storage.foldername(name))[1]` |
| Avatar update | UPDATE | `auth.uid()::text = (storage.foldername(name))[1]` |
| Avatar delete | DELETE | `auth.uid()::text = (storage.foldername(name))[1]` |
| Public read | SELECT | `true` (public bucket) |

Users can only upload/modify/delete files in their own folder (matched by user ID).

**Migration File:** `supabase/add-avatar-storage.sql`

**Avatar Priority:**
1. Custom uploaded avatar (from Supabase Storage)
2. OAuth provider avatar (from `user.user_metadata.avatar_url`, e.g., GitHub)
3. Letter initial fallback (first letter of email)

**Client-Side Compression:**
Before upload, images are processed client-side:
- Cropped to square (center crop)
- Resized to 256x256 pixels
- Compressed to JPEG with adaptive quality
- Target size: under 300KB

## Setup

1. Create Supabase project at supabase.com
2. Run `supabase/schema.sql` in SQL Editor
3. Run `supabase/add-login-lockout.sql` for brute force protection
4. Run `supabase/add-soft-delete.sql` for soft delete support
5. Run `supabase/add-avatar-storage.sql` for avatar storage bucket
6. Add to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
7. Configure URL settings in Authentication → URL Configuration:
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://your-domain.com/auth/callback`
8. (Optional) Apply email templates from `supabase/email-templates/`
9. (Optional) Configure OAuth providers in Authentication → Providers
10. (Optional) Enable leaked password protection in Authentication → Settings
11. Fix function search paths (see Security Settings above)
