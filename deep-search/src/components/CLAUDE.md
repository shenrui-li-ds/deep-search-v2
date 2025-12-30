# Components

React components for the Athenius UI.

## Layout Components

### `MainLayout.tsx`
Main application layout wrapper.
- Renders fixed `Sidebar` and main content area
- Main content has `ml-16` to account for sidebar width

### `Sidebar.tsx`
Fixed navigation sidebar.
- Position: `fixed left-0 top-0 z-50 h-screen`
- Contains: Logo, navigation links, theme toggle, account button
- Width: `w-16` (64px)

## Search Components

### `SearchBox.tsx`
Main search input component on the landing page.
- Model selector dropdown (DeepSeek, OpenAI, Grok, Claude, Gemini)
- Search mode toggle (Web Search, Research, Brainstorm)
- Handles query refinement before navigation
- Passes provider and mode via URL params

### `SearchResult.tsx`
Main result display component.

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
  loadingStage?: LoadingStage;  // Current stage in pipeline
  isLoading?: boolean;
  isSearching?: boolean;   // True for: searching, planning, researching
  isStreaming?: boolean;   // True for: summarizing, synthesizing
  isPolishing?: boolean;   // True for: proofreading
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
- Source pills with tooltips
- Related searches section (LLM-generated, clickable, preserves provider/mode)
- Follow-up input (functional, navigates to new search with provider/mode preserved)
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

**Performance Optimizations:**
- Landing page navigates immediately (no blocking API calls)
- Web mode: Query refinement happens on search page
- Research/Brainstorm modes: Skip refinement (plan/reframe handles it)
- Limit checks run in parallel with first API call

**Transition:**
- `isTransitioning=true`: Fades content during proofreading transition

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

### Markdown Rendering
`SearchResult.tsx` customizes ReactMarkdown components:
- Headers: Increased spacing (`mt-6`, `mt-8`)
- Paragraphs: `mb-4`, `leading-relaxed`
- Lists: `space-y-1` for breathing room
- First headers: `first:mt-0` to remove top margin

## Component Hierarchy

```
MainLayout
├── Sidebar (fixed)
└── main content
    └── SearchClient (in /search)
        └── SearchResult (all stages after landing)
            ├── Status Banner (searching/streaming/polishing)
            ├── Tabs
            │   ├── Answer (markdown + sources)
            │   └── Links (source cards)
            ├── Action Bar
            ├── Follow-up Input
            └── Related Searches (LLM-generated pills)
```
