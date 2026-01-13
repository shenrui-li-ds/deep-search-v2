# Components

React components for the Athenius UI.

## Error Handling Components

### `ErrorBoundary.tsx`
React error boundary to catch rendering errors and prevent white screen crashes.

**Props:**
```typescript
{
  children: ReactNode;
  fallback?: ReactNode;           // Custom fallback UI (optional)
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;  // Error callback
}
```

**Features:**
- Catches errors in child component tree
- Shows user-friendly error message with "Try Again" button
- Shows stack trace in development mode only
- Supports custom fallback UI via `fallback` prop
- Calls `onError` callback for logging/monitoring

**Usage:**
```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

<ErrorBoundary>
  <SearchClient {...props} />
</ErrorBoundary>
```

**Used in:**
- `/search` page - Wraps SearchClient to prevent crashes from rendering errors

## Layout Components

### `MainLayout.tsx`
Main application layout wrapper with responsive behavior.

**Props:**
```typescript
{
  children: React.ReactNode;
  pageTitle?: string;    // Title shown in mobile header
  hideHeader?: boolean;  // Hide mobile header (for home page)
}
```

**Behavior:**
- Desktop: Renders fixed `Sidebar` with `ml-[72px]` margin for main content
- Mobile: Renders `MobileHeader` + `MobileSidebar` (hamburger menu)
- Mobile header adds `pt-14` padding for content

### `Sidebar.tsx`
Fixed navigation sidebar (desktop only).
- Position: `fixed left-0 top-0 z-50 h-screen`
- Hidden on mobile: `hidden md:flex`
- Contains: Logo, navigation links, theme toggle, account button
- Width: `w-[72px]`

### `MobileHeader.tsx`
Fixed top header for mobile devices.
- Position: `fixed top-0 left-0 right-0 z-40`
- Height: `h-14` (56px)
- Contains: Hamburger menu, title/logo, new search button
- Hidden on desktop: `md:hidden`

### `MobileSidebar.tsx`
Slide-out navigation drawer for mobile.
- Width: `w-56` (224px) - compact width
- Opens from left with slide-in animation
- Closes with slide-out animation (backdrop fades)
- Contains: Logo, navigation (Home, Library, Account), theme toggle, sign out
- Includes backdrop overlay
- **Swipe-to-close**: Swipe left to dismiss (80px threshold)
- Closes on: backdrop click, close button, Escape key, swipe left

### `MobileBottomSheet.tsx`
Reusable bottom sheet component for mobile.
- Slides up from bottom with animation (0.15s)
- Slides down on close with animation (0.15s)
- Used for mode/model selection in SearchBox, history item options in Library
- **Swipe-to-close**: Swipe down to dismiss (80px threshold)
- **X close button**: Displayed next to title
- Closes on: backdrop click, X button, Escape key, swipe down
- Includes iOS safe area padding
- Prevents body scroll when open

## Search Components

### `SearchBox.tsx`
Main search input component with responsive design.

**Desktop:**
- Inline mode toggle buttons (Web Search, Research, Brainstorm)
- Grouped model selector dropdown (models grouped by provider)
- File attachment button with dropdown (paperclip icon)

**Mobile:**
- Separate mode and model selector buttons (each opens own `MobileBottomSheet`)
- Mode selector: Shows current mode icon + short label
- Model selector: Shows AI icon + model name, opens grouped selection sheet
- File attachment button opens `MobileBottomSheet` for file selection

**Props:**
```typescript
{
  large?: boolean;        // Large variant for home page
  initialValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  defaultProvider?: ModelId;  // Default model to use
  defaultMode?: SearchMode;   // Default search mode
  initialFiles?: AttachedFile[];  // Pre-attached files (from URL params)
}
```

**File Attachment:**
```typescript
interface AttachedFile {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string;
}
```

**File Attachment UI:**
- Paperclip button shows file count badge when files attached
- Desktop: Dropdown menu lists available files with checkboxes
- Mobile: Bottom sheet with file list and confirm button
- Files fetched from `/api/files?status=ready` when dropdown opens
- Selected files shown as removable chips below textarea
- File IDs passed to search via `files` URL param (comma-separated)

**File Attachment Flow:**
1. User clicks paperclip button → dropdown/sheet opens
2. `fetchAvailableFiles()` called → fetches ready files from `/api/files?status=ready`
3. User toggles files → updates `attachedFiles` state
4. On search submit → file IDs appended to URL as `?files=id1,id2`
5. SearchClient receives `fileIds` prop → queries docs API in parallel with web search

**ModelId Type:**
```typescript
// Provider-based naming for future compatibility
type ModelId =
  | 'gemini'          // Google Gemini Flash (Recommended)
  | 'gemini-pro'      // Google Gemini Pro
  | 'openai'          // OpenAI GPT-5.2 (Reference)
  | 'openai-mini'     // OpenAI GPT-5 mini
  | 'deepseek'        // DeepSeek Chat
  | 'grok'            // xAI Grok 4.1 Fast
  | 'claude'          // Anthropic Claude Haiku 4.5
  | 'vercel-gateway'; // Vercel Gateway (Experimental)
```

**Grouped Model Selector:**
Models are grouped by provider in the dropdown/bottom sheet:
- **Google**: Gemini Flash (Recommended), Gemini Pro
- **Anthropic**: Claude Haiku 4.5
- **DeepSeek**: DeepSeek Chat
- **OpenAI**: GPT-5 mini, GPT-5.2 (Reference)
- **xAI**: Grok 4.1 Fast
- **Vercel Gateway**: Qwen 3 Max (Experimental)

### `SearchResult.tsx`
Main result display component with floating follow-up input.

**Follow-up Input (both desktop and mobile):**
- Fixed at bottom of viewport
- Includes mode selector (dropdown on desktop, bottom sheet on mobile)
- Desktop: Offset by sidebar width (`md:ml-[72px]`)
- Content has `h-24` spacer at bottom to prevent overlap

**Props:**
```typescript
{
  query: string;
  result: {
    content: string;
    sources: Source[];
  };
  relatedSearches?: string[];
  provider?: string;  // LLM provider (deepseek, openai, grok, claude, gemini)
  mode?: string;      // Search mode (web, pro, brainstorm)
  loadingStage?: LoadingStage;
  isLoading?: boolean;
  isSearching?: boolean;
  isStreaming?: boolean;
  isPolishing?: boolean;
  isTransitioning?: boolean;
  historyEntryId?: string | null;  // ID of the search history entry (enables bookmark button)
  isBookmarked?: boolean;           // Whether this search is bookmarked
  historySaveFailed?: boolean;      // Whether history save failed after retries
  onToggleBookmark?: () => void;    // Callback to toggle bookmark status
  queryType?: QueryType | null;     // Research query classification (pro mode only)
  researchPlan?: ResearchPlanItem[] | null;  // Research plan aspects (pro mode only)
  brainstormAngles?: { angle: string; query: string }[] | null;  // Creative angles (brainstorm mode only)
  searchIntent?: string | null;     // Search intent description (web mode only)
  refinedQuery?: string | null;     // Refined search query (web mode only)
}

type LoadingStage = 'searching' | 'summarizing' | 'proofreading' | 'complete'
                  | 'planning' | 'researching' | 'extracting' | 'synthesizing'
                  | 'reframing' | 'exploring' | 'ideating';
```

**Features:**
- Status banner (shown during all loading stages)
- **Web Search Thinking Panel** (web mode only, collapsible)
- **Research Thinking Panel** (pro mode only, collapsible)
- **Brainstorm Thinking Panel** (brainstorm mode only, collapsible)
- Tabbed interface (Answer, Links) with Share dropdown
- Markdown rendering with custom component styling
- **Superscript citations**: `[1]` → `<sup>1</sup>`, `[1, 2]` → `<sup>1, 2</sup>`
- Source pills with tooltips
- Related searches section (LLM-generated, clickable, preserves provider/mode)
- Floating follow-up input with mode selector (both desktop and mobile)
- Copy/Share functionality
- Print-to-PDF support via browser print dialog

**Web Search Thinking Panel (Web Mode):**

Collapsible `<details>` section shown in Web Search mode that displays the search intent and refined query.

**Content:**
- **Search Intent**: Natural language description of what's being searched for
- **Refined Query**: The optimized search query (shown only if different from original)

**Behavior:**
- Opens automatically during search (while `loadingStage !== 'complete'`)
- Collapses automatically when search completes
- Shows search intent as main text
- Shows refined query in monospace font if it differs from original
- Can be manually toggled open/closed by user

**Research Thinking Panel (Pro Mode):**

Collapsible `<details>` section shown in Research mode that displays the query classification and research plan.

| Query Type | Label | Strategy |
|------------|-------|----------|
| `shopping` | Shopping Research | Product discovery → Reviews → Comparison |
| `travel` | Travel Guide | Attractions → Activities → Accommodations → Tips |
| `technical` | Technical Analysis | Specs → Expert analysis → Comparisons |
| `academic` | Academic Research | Foundations → Findings → Methodology → Debates |
| `explanatory` | Concept Explanation | Definition → Mechanism → Examples → Misconceptions |
| `finance` | Financial Analysis | Fundamentals → Metrics → Analyst views → Risks |
| `general` | General Research | Fundamentals → Applications → Comparison → Current state |

**Behavior:**
- Opens automatically during research (while `loadingStage !== 'complete'`)
- Collapses automatically when research completes
- Shows query type badge (e.g., "Shopping Research")
- Lists research plan aspects with their search queries
- Can be manually toggled open/closed by user

**Brainstorm Thinking Panel (Brainstorm Mode):**

Collapsible `<details>` section shown in Brainstorm mode that displays the creative angles being explored.

**Creative Angle Domains:**
The reframe API generates 4-6 unexpected angles from diverse domains:
- Nature (biomimicry, natural patterns)
- Games (game mechanics, player engagement)
- Art/Theater (creative techniques, performance)
- Sports (team dynamics, training methods)
- History (historical parallels, past solutions)
- Contrarian (opposite approaches, why traditional fails)

**Behavior:**
- Opens automatically during brainstorming (while `loadingStage !== 'complete'`)
- Collapses automatically when ideation completes
- Shows angle count badge (e.g., "5 angles")
- Lists creative angles with their search queries
- Angle names are capitalized for readability
- Can be manually toggled open/closed by user

**Action Bar Buttons:**

| Button | Status | Function |
|--------|--------|----------|
| Copy | Active | Copies answer content to clipboard |
| Like | Coming soon | User feedback (not implemented) |
| Dislike | Coming soon | User feedback (not implemented) |
| Rewrite | Coming soon | Regenerate response (not implemented) |

**Save/Bookmark Button (in Tabs area):**
- Shows "Save" when not bookmarked, "Saved" when bookmarked
- Disabled (grayed out) until `historyEntryId` is set (history entry created)
- Tooltip shows "Saving..." while save in progress, "Save failed" if all retries fail
- History save retries 3 times with 1s/2s backoff before failing
- Amber color when bookmarked
- Calls `onToggleBookmark` callback when clicked

**Share Dropdown (in Tabs area):**

| Option | Function |
|--------|----------|
| Copy as text | Copies formatted text with query, answer, sources, and URL |
| Copy link | Copies current page URL |
| Download PDF | Opens browser print dialog (Save as PDF) |

**Loading States by Mode:**

*Web Search Mode:*
- `refining`: "Refining query..."
- `searching`: "Searching the web..."
- `summarizing`: "Generating response..." + cursor
- `complete`: No banner

*Research Mode:*
- `planning`: "Planning research approach..."
- `researching`: "Searching multiple sources..."
- `extracting`: "Extracting key insights..."
- `synthesizing`: "Synthesizing findings..." + cursor
- `proofreading`: "Polishing response..."
- `complete`: No banner

*Brainstorm Mode:*
- `reframing`: "Finding creative angles..."
- `exploring`: "Exploring cross-domain inspiration..."
- `ideating`: "Generating ideas..." + cursor
- `proofreading`: "Polishing response..."
- `complete`: No banner

### `SearchLoading.tsx`
Loading skeleton for search results.

## UI Components (`ui/`)

shadcn/ui components. Do not modify directly - regenerate using shadcn CLI if needed.

- `button.tsx` - Button variants
- `card.tsx` - Card container
- `input.tsx` - Text input
- `badge.tsx` - Badge/chip
- `tabs.tsx` - Tab navigation
- `tooltip.tsx` - Hover tooltips
- `dropdown-menu.tsx` - Dropdown menus

## Account Components

### Profile Avatar (in `/account` page)
User profile photo display and upload system.

**Avatar Display:**
- Shows GitHub avatar from `user.user_metadata.avatar_url` if available (OAuth users)
- Shows custom uploaded avatar from Supabase Storage if set
- Falls back to letter initial (first letter of email, uppercase)
- Avatar has edit overlay button on hover/tap

**ChangeAvatarModal:**
Modal dialog for uploading or removing profile photos.

**Features:**
- Client-side image compression using Canvas API
- Crops to square (center crop)
- Resizes to 256x256 pixels
- Compresses to JPEG with adaptive quality (targets under 300KB)
- Supports JPEG, PNG, WebP, GIF uploads
- Uploads to Supabase Storage `avatars` bucket
- Path format: `avatars/{user_id}/{timestamp}.jpg`
- Remove button to delete custom avatar

**Props (internal state):**
```typescript
{
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string | null;
  onAvatarChange: (url: string | null) => void;
}
```

**Flow:**
1. User clicks edit overlay on avatar
2. Modal opens showing current avatar or placeholder
3. User clicks "Choose Photo" → file picker opens
4. Image is compressed and previewed
5. User clicks "Save Photo" → uploads to Supabase Storage
6. User metadata updated with new avatar URL
7. Or user clicks "Remove Photo" → deletes from storage

## Auth Components

### `Turnstile.tsx`
Cloudflare Turnstile bot protection widget for auth forms (primary CAPTCHA).

**Props:**
```typescript
{
  siteKey: string;              // Cloudflare Turnstile site key
  onVerify: (token: string) => void;  // Called when verification succeeds
  onError?: () => void;         // Called when verification fails
  onExpire?: () => void;        // Called when token expires
  theme?: 'light' | 'dark' | 'auto';  // Widget theme (default: 'auto')
  className?: string;           // Additional CSS classes
}
```

**Usage:**
```tsx
import Turnstile from '@/components/Turnstile';

<Turnstile
  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
  onVerify={(token) => setTurnstileToken(token)}
  onError={() => setTurnstileToken(null)}
  onExpire={() => setTurnstileToken(null)}
  theme="auto"
/>
```

**Features:**
- Dynamically loads Cloudflare Turnstile script
- Renders "Managed" widget (auto-detects if challenge needed)
- Cleans up widget on unmount
- Supports theme switching via `theme` prop
- Widget auto-refreshes before token expiration

**Integration Flow:**
1. Widget renders and generates token automatically
2. Token passed to parent via `onVerify` callback
3. Before form submit, validate token via `/api/auth/verify-turnstile`
4. Reset widget on error using key prop: `<Turnstile key={resetKey} .../>`

**Environment Variables Required:**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Public site key (client-side)
- `TURNSTILE_SECRET_KEY` - Secret key (server-side only)

**Used in:**
- `/auth/login` - Login form
- `/auth/signup` - Signup form
- `/auth/forgot-password` - Password reset request form

### `EmailOTPFallback.tsx`
Email OTP verification component (fallback for regions where Turnstile is blocked, e.g., China).

**Props:**
```typescript
{
  email: string;                      // User's email address
  purpose: 'signup' | 'login' | 'reset';  // OTP purpose
  onVerified: () => void;             // Called when verification succeeds
  className?: string;                 // Additional CSS classes
}
```

**Usage:**
```tsx
import EmailOTPFallback from '@/components/EmailOTPFallback';

<EmailOTPFallback
  email={email}
  purpose="login"
  onVerified={() => setEmailOtpVerified(true)}
/>
```

**Features:**
- Three-step flow: initial → code-sent → verified
- 6-digit input with auto-advance and paste support
- Countdown timers for resend (60s) and expiry (10min)
- Rate limiting: 3 requests per email per 10 min
- Works reliably in China (email always works)

**API Endpoints Used:**
- `POST /api/auth/send-otp` - Send verification code
- `POST /api/auth/verify-otp` - Verify entered code

**Used in:**
- `/auth/login` - Login form (fallback)
- `/auth/signup` - Signup form (fallback)
- `/auth/forgot-password` - Password reset form (fallback)

### `HCaptcha.tsx` (Legacy)
hCaptcha bot protection widget. **No longer used in auth pages** - replaced by Email OTP fallback.
Kept for backward compatibility if needed for other use cases.

### CAPTCHA + Email OTP System (Auth Pages)

Auth pages implement a fallback system for users in regions where Cloudflare Turnstile is blocked:

**Fallback Chain:**
```
Turnstile (15s timeout) → Email OTP Verification
```

**Implementation Details:**
1. **Turnstile (Primary)**: Shown first, waits 15s for verification
2. **Email OTP (Fallback)**: If Turnstile times out, shows email verification option
3. **Email Whitelist**: Whitelisted emails bypass all verification

**User Flow (China):**
1. User visits auth page
2. Turnstile attempts to load (blocked by GFW)
3. After 15s timeout, Email OTP component appears
4. User clicks "Send verification code"
5. 6-digit code sent to user's email via Resend
6. User enters code → verified → can proceed with auth

**Visual Feedback:**
- Progress indicator: "Verifying your identity... (Xs)" during Turnstile loading
- Email OTP UI with code input and resend button

**Email Whitelist Config:**
Environment variable: `CAPTCHA_WHITELIST_EMAILS` (comma-separated)
```bash
CAPTCHA_WHITELIST_EMAILS=user1@example.com,user2@example.com
```

**Environment Variables Required:**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Turnstile public site key
- `TURNSTILE_SECRET_KEY` - Turnstile secret key
- `RESEND_API_KEY` - Resend API key for sending OTP emails
- `RESEND_FROM_EMAIL` - From email (default: `noreply@athenius.io`)

## Styling Patterns

### CSS Variables
Components use CSS variables for theming:
- `--background`, `--foreground`
- `--card`, `--card-hover`
- `--border`
- `--accent`
- `--text-primary`, `--text-secondary`, `--text-muted`

### Responsive Breakpoints
Mobile-first design with `md:` (768px) breakpoint:
- `md:hidden` - Hide on desktop
- `hidden md:flex` - Show only on desktop
- `md:ml-[72px]` - Desktop sidebar margin

### Mobile Animations
Defined in `globals.css` (all 0.15s duration):
- `animate-slide-up` - Bottom sheet entrance
- `animate-slide-down` - Bottom sheet exit
- `animate-slide-in-left` - Sidebar entrance
- `animate-slide-out-left` - Sidebar exit
- `animate-fade-in` - Backdrop fade in
- `animate-fade-out` - Backdrop fade out

### Markdown Rendering
`SearchResult.tsx` customizes ReactMarkdown components:
- Headers: Increased spacing (`mt-6`, `mt-8`)
- Paragraphs: `mb-4`, `leading-relaxed`
- Lists: `space-y-1` for breathing room
- First headers: `first:mt-0` to remove top margin

**LaTeX Support:**
- Uses `remark-math` and `rehype-katex` for math rendering
- Inline math: `$E = mc^2$`
- Block math: `$$\frac{a}{b}$$`
- KaTeX CSS imported for proper styling

**Currency Escaping:**
- Dollar signs followed by numbers are auto-escaped to prevent LaTeX misinterpretation
- Patterns escaped: `$100`, `$10.99`, `$1,000`, `$1.5B`, `-$50`
- Uses regex pre-processing before markdown parsing

**Collapsible Sections:**
- HTML `<details>/<summary>` elements are supported via `rehype-raw`
- Custom styling in `globals.css` for theme-aware collapsible UI
- Chevron rotates on open/close

## Component Hierarchy

### Desktop
```
MainLayout
├── Sidebar (fixed left)
└── main content (ml-[72px])
    └── SearchClient (in /search)
        └── SearchResult
            ├── Status Banner
            ├── Web Search Thinking Panel (web mode, collapsible)
            ├── Research Thinking Panel (pro mode, collapsible)
            ├── Brainstorm Thinking Panel (brainstorm mode, collapsible)
            ├── Tabs (Answer, Links)
            ├── Action Bar
            ├── Related Searches
            └── Floating Follow-up (fixed bottom, ml-[72px])
```

### Mobile
```
MainLayout
├── MobileHeader (fixed top)
├── MobileSidebar (slide-out drawer, swipe-to-close)
└── main content (pt-14)
    └── SearchClient (in /search)
        └── SearchResult
            ├── Status Banner
            ├── Web Search Thinking Panel (web mode, collapsible)
            ├── Research Thinking Panel (pro mode, collapsible)
            ├── Brainstorm Thinking Panel (brainstorm mode, collapsible)
            ├── Tabs (Answer, Links)
            ├── Action Bar
            ├── Related Searches
            └── Floating Follow-up (fixed bottom)
```
