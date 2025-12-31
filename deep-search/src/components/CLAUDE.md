# Components

React components for the Athenius UI.

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
- Slides up from bottom with animation
- Used for mode/model selection in SearchBox
- Includes iOS safe area padding
- Prevents body scroll when open

## Search Components

### `SearchBox.tsx`
Main search input component with responsive design.

**Desktop:**
- Inline mode toggle buttons (Web Search, Research, Brainstorm)
- Model selector dropdown
- Attachment button (disabled, coming soon)

**Mobile:**
- Separate mode and model selector buttons (each opens own `MobileBottomSheet`)
- Mode selector: Shows current mode icon + short label
- Model selector: Shows AI icon + provider name
- Attachment button (disabled, coming soon)

**Props:**
```typescript
{
  large?: boolean;      // Large variant for home page
  initialValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}
```

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
}

type LoadingStage = 'searching' | 'summarizing' | 'proofreading' | 'complete'
                  | 'planning' | 'researching' | 'synthesizing'
                  | 'reframing' | 'exploring' | 'ideating';
```

**Features:**
- Status banner (shown during all loading stages)
- Tabbed interface (Answer, Links) with Share dropdown
- Markdown rendering with custom component styling
- **Superscript citations**: `[1]` → `<sup>1</sup>`, `[1, 2]` → `<sup>1, 2</sup>`
- Source pills with tooltips
- Related searches section (LLM-generated, clickable, preserves provider/mode)
- Floating follow-up input with mode selector (both desktop and mobile)
- Copy/Share functionality
- Print-to-PDF support via browser print dialog

**Action Bar Buttons:**

| Button | Status | Function |
|--------|--------|----------|
| Copy | Active | Copies answer content to clipboard |
| Like | Coming soon | User feedback (not implemented) |
| Dislike | Coming soon | User feedback (not implemented) |
| Rewrite | Coming soon | Regenerate response (not implemented) |

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
Defined in `globals.css`:
- `animate-slide-up` - Bottom sheet entrance
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

## Component Hierarchy

### Desktop
```
MainLayout
├── Sidebar (fixed left)
└── main content (ml-[72px])
    └── SearchClient (in /search)
        └── SearchResult
            ├── Status Banner
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
            ├── Tabs (Answer, Links)
            ├── Action Bar
            ├── Related Searches
            └── Floating Follow-up (fixed bottom)
```
