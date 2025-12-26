# Components

React components for the DeepSearch UI.

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
- Model selector dropdown (DeepSeek, OpenAI, Qwen, Claude)
- Search mode toggle (Web, Focus, Pro)
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
  isLoading?: boolean;
  isSearching?: boolean;
  isStreaming?: boolean;
  isPolishing?: boolean;
  isTransitioning?: boolean;
}
```

**Features:**
- Status banner (shown during searching/streaming/polishing)
- Tabbed interface (Answer, Links)
- Markdown rendering with custom component styling
- Source pills with tooltips
- Related searches section (LLM-generated, clickable)
- Follow-up input

**Loading states:**
- `isSearching=true`: Shows "Searching the web..." banner
- `isStreaming=true`: Shows "Generating response..." banner + cursor
- `isPolishing=true`: Shows "Polishing response..." banner
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
