"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import SearchLoading from './SearchLoading';
import MobileBottomSheet from './MobileBottomSheet';
import type { QueryType, ResearchPlanItem } from '@/app/api/research/plan/route';
import type { ResearchGap } from '@/app/api/research/analyze-gaps/route';
import { useTranslations } from 'next-intl';

type SearchMode = 'web' | 'pro' | 'brainstorm';

// Query type labels are now handled via translations (search.queryTypes.*)

// Search mode icons only - labels come from translations
const searchModeIcons: Record<SearchMode, React.ReactNode> = {
  web: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  pro: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  brainstorm: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
};

const searchModeIds: SearchMode[] = ['web', 'pro', 'brainstorm'];

interface Source {
  id: string;
  title: string;
  url: string;
  iconUrl: string;
  author?: string;
  timeAgo?: string;
  readTime?: string;
  snippet?: string;
}

type LoadingStage = 'refining' | 'searching' | 'summarizing' | 'proofreading' | 'complete' | 'planning' | 'researching' | 'extracting' | 'synthesizing' | 'reframing' | 'exploring' | 'ideating' | 'analyzing_gaps' | 'deepening';

interface SearchResultProps {
  query: string;
  result: {
    content: string;
    sources: Source[];
    images?: {
      url: string;
      alt: string;
      sourceId: string;
    }[];
  };
  relatedSearches?: string[];
  provider?: string;
  mode?: string;
  deep?: boolean;
  loadingStage?: LoadingStage;
  isLoading?: boolean;
  isSearching?: boolean;
  isStreaming?: boolean;
  isPolishing?: boolean;
  isTransitioning?: boolean;
  historyEntryId?: string | null;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  // Research thinking state
  queryType?: QueryType | null;
  researchPlan?: ResearchPlanItem[] | null;
  suggestedDepth?: 'standard' | 'deep' | null;
  researchGaps?: ResearchGap[] | null;
  // Brainstorm thinking state
  brainstormAngles?: { angle: string; query: string }[] | null;
  // Web search thinking state
  searchIntent?: string | null;
  refinedQuery?: string | null;
  // Stream completion state
  streamCompleted?: boolean;
}

const SearchResult: React.FC<SearchResultProps> = ({ query, result, relatedSearches = [], provider = 'deepseek', mode = 'web', deep = false, loadingStage = 'complete', isLoading = false, isSearching = false, isStreaming = false, isPolishing = false, isTransitioning = false, historyEntryId = null, isBookmarked = false, onToggleBookmark, queryType = null, researchPlan = null, suggestedDepth = null, researchGaps = null, brainstormAngles = null, searchIntent = null, refinedQuery = null, streamCompleted = false }) => {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [followUpMode, setFollowUpMode] = useState<SearchMode>(mode as SearchMode);
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Auto-resize follow-up textarea
  const adjustFollowUpHeight = useCallback(() => {
    const textarea = followUpTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 80; // Max height in pixels for follow-up input
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, []);

  useEffect(() => {
    adjustFollowUpHeight();
  }, [followUpQuery, adjustFollowUpHeight]);

  // Get translated mode label
  const getModeLabel = (modeId: SearchMode) => t(`modes.${modeId}`);
  const currentFollowUpModeIcon = searchModeIcons[followUpMode];

  // Copy just the answer content (for Copy button in action bar)
  const handleCopyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.content);
      setCopyFeedback('copied');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [result.content]);

  // Copy formatted text with query, answer, sources, and URL
  const handleCopyFormatted = useCallback(async () => {
    const sourcesText = result.sources
      .map((s, i) => `${i + 1}. ${s.title} - ${s.url}`)
      .join('\n');

    const formattedText = `🔍 Query: ${query}

📝 Answer:
${result.content}

📚 Sources:
${sourcesText}

🔗 ${typeof window !== 'undefined' ? window.location.href : ''}`;

    try {
      await navigator.clipboard.writeText(formattedText);
      setCopyFeedback('formatted');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [query, result.content, result.sources]);

  // Copy just the URL
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyFeedback('link');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Download as PDF using browser print dialog
  const handleDownloadPDF = useCallback(() => {
    window.print();
  }, []);

  const handleFollowUp = useCallback(() => {
    const trimmedQuery = followUpQuery.trim();
    if (!trimmedQuery) return;

    const params = new URLSearchParams({
      q: trimmedQuery,
      provider: provider,
      mode: followUpMode
    });
    router.push(`/search?${params.toString()}`);
  }, [followUpQuery, provider, followUpMode, router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter without Shift: submit follow-up
      e.preventDefault();
      handleFollowUp();
    }
    // Shift+Enter: allow newline (default textarea behavior)
  }, [handleFollowUp]);

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const processContent = (content: string) => {
    // Step 1: Escape currency dollar signs to prevent LaTeX interpretation
    // Matches patterns like $100, $10.99, $1,000, $1,000.00, $1.5B, $2M
    // Also handles negative currency like -$100
    // Uses \$ to escape the dollar sign for LaTeX
    // Note: In JS regex replacement, $$ produces a literal $, so \\$$$ produces \$
    const processed = content.replace(
      /(-?)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?[BMKbmk]?|\d+(?:\.\d{1,2})?[BMKbmk]?)/g,
      '$1\\$$$2'
    );

    // Step 2: Convert citations to superscript
    // Matches [1], [2], [1, 2], [1, 2, 3], etc.
    // Also handles legacy [1][2] format by first converting to [1, 2]
    return processed
      // First, convert adjacent brackets [1][2] to comma-separated [1, 2]
      .replace(/\](\s*)\[(\d+)/g, ', $2')
      // Then convert all citations to superscript
      .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '<sup>$1</sup>');
  };

  if (isLoading) {
    return <SearchLoading query={query} />;
  }

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Status Banner - only rendered during loading */}
        {(isSearching || isStreaming || isPolishing) && (
          <div className="mb-4 p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-lg flex items-center gap-3">
            <svg className="animate-spin w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-medium text-[var(--accent)]">
              {loadingStage === 'refining' ? t('status.refining') :
               loadingStage === 'searching' ? t('status.searching') :
               loadingStage === 'planning' ? t('status.planning') :
               loadingStage === 'researching' ? t('status.researching') :
               loadingStage === 'extracting' ? t('status.extracting') :
               loadingStage === 'analyzing_gaps' ? t('status.analyzingGaps') :
               loadingStage === 'deepening' ? t('status.deepening') :
               loadingStage === 'synthesizing' ? t('status.synthesizing') :
               loadingStage === 'reframing' ? t('status.reframing') :
               loadingStage === 'exploring' ? t('status.exploring') :
               loadingStage === 'ideating' ? t('status.ideating') :
               loadingStage === 'proofreading' ? t('status.proofreading') :
               loadingStage === 'summarizing' ? t('status.summarizing') :
               isSearching ? t('status.searching') :
               isPolishing ? t('status.proofreading') : t('status.summarizing')}
            </span>
          </div>
        )}

        {/* Incomplete Stream Warning - shows when content exists but stream didn't complete */}
        {loadingStage === 'complete' && result.content && !streamCompleted && !isStreaming && !isPolishing && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('incomplete.title')}</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80">{t('incomplete.description')}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-md transition-colors"
            >
              {t('incomplete.retry')}
            </button>
          </div>
        )}

        {/* Web Search Thinking Panel - shows search intent and refined query */}
        {mode === 'web' && (searchIntent || refinedQuery) && (
          <details className="mb-4 border border-[var(--border)] rounded-lg bg-[var(--card)] overflow-hidden" open={loadingStage !== 'complete'}>
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors flex items-center gap-2 select-none">
              <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {t('thinking.searchStrategy')}
            </summary>
            <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)]">
              <div className="space-y-2">
                {searchIntent && (
                  <p className="text-sm text-[var(--text-secondary)]">{searchIntent}</p>
                )}
                {refinedQuery && refinedQuery !== query && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 text-[var(--text-muted)] text-xs">{t('thinking.searchQuery')}:</span>
                    <span className="text-[var(--text-secondary)] font-mono text-xs bg-[var(--card)] px-2 py-1 rounded">{refinedQuery}</span>
                  </div>
                )}
              </div>
            </div>
          </details>
        )}

        {/* Research Thinking Panel - shows query type, depth, and research plan for Research mode */}
        {mode === 'pro' && (queryType || researchPlan) && (
          <details className="mb-4 border border-[var(--border)] rounded-lg bg-[var(--card)] overflow-hidden" open={loadingStage !== 'complete'}>
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors flex items-center gap-2 select-none">
              <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {t('thinking.researchApproach')}
              {queryType && (
                <Badge variant="secondary" className="ml-2 text-xs font-normal">
                  {t(`queryTypes.${queryType}`)}
                </Badge>
              )}
              {deep && (
                <Badge variant="secondary" className="text-xs font-normal bg-[var(--accent)]/15 text-[var(--accent)]">
                  {/* Brain icon for deep thinking (filled) */}
                  <svg className="w-3 h-3 mr-1" viewBox="0 -960 960 960" fill="currentColor">
                    <path d="M390-120q-51 0-88-35.5T260-241q-60-8-100-53t-40-106q0-21 5.5-41.5T142-480q-11-18-16.5-38t-5.5-42q0-61 40-105.5t99-52.5q3-51 41-86.5t90-35.5q26 0 48.5 10t41.5 27q18-17 41-27t49-10q52 0 89.5 35t40.5 86q59 8 99.5 53T840-560q0 22-5.5 42T818-480q11 18 16.5 38.5T840-400q0 62-40.5 106.5T699-241q-5 50-41.5 85.5T570-120q-25 0-48.5-9.5T480-156q-19 17-42 26.5t-48 9.5Zm130-590v460q0 21 14.5 35.5T570-200q20 0 34.5-16t15.5-36q-21-8-38.5-21.5T550-306q-10-14-7.5-30t16.5-26q14-10 30-7.5t26 16.5q11 16 28 24.5t37 8.5q33 0 56.5-23.5T760-400q0-5-.5-10t-2.5-10q-17 10-36.5 15t-40.5 5q-17 0-28.5-11.5T640-440q0-17 11.5-28.5T680-480q33 0 56.5-23.5T760-560q0-33-23.5-56T680-640q-11 18-28.5 31.5T613-587q-16 6-31-1t-20-23q-5-16 1.5-31t22.5-20q15-5 24.5-18t9.5-30q0-21-14.5-35.5T570-760q-21 0-35.5 14.5T520-710Zm-80 460v-460q0-21-14.5-35.5T390-760q-21 0-35.5 14.5T340-710q0 16 9 29.5t24 18.5q16 5 23 20t2 31q-6 16-21 23t-31 1q-21-8-38.5-21.5T279-640q-32 1-55.5 24.5T200-560q0 33 23.5 56.5T280-480q17 0 28.5 11.5T320-440q0 17-11.5 28.5T280-400q-21 0-40.5-5T203-420q-2 5-2.5 10t-.5 10q0 33 23.5 56.5T280-320q20 0 37-8.5t28-24.5q10-14 26-16.5t30 7.5q14 10 16.5 26t-7.5 30q-14 19-32 33t-39 22q1 20 16 35.5t35 15.5q21 0 35.5-14.5T440-250Zm40-230Z" />
                  </svg>
                  {t('thinking.deep')}
                </Badge>
              )}
            </summary>
            <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)]">
              {/* Show AI suggestion if it differs from current mode */}
              {suggestedDepth && suggestedDepth !== (deep ? 'deep' : 'standard') && (
                <div className="mb-3 text-xs text-[var(--text-muted)] flex items-center gap-1.5 px-2 py-1.5 bg-[var(--card)] rounded-md">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {suggestedDepth === 'deep' ? t('thinking.aiSuggestedDeep') : t('thinking.aiSuggestedStandard')}
                </div>
              )}
              {researchPlan && researchPlan.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)] mb-2">{t('thinking.researchPlan')}:</p>
                  <ul className="space-y-1.5">
                    {researchPlan.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-xs flex items-center justify-center font-medium">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[var(--text-muted)] text-xs">{item.aspect}:</span>
                          <span className="ml-1 text-[var(--text-secondary)]">{item.query}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Deep Research: Show identified gaps */}
              {researchGaps && researchGaps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-2">
                  <p className="text-xs text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" viewBox="0 -960 960 960" fill="currentColor">
                      <path d="M390-120q-51 0-88-35.5T260-241q-60-8-100-53t-40-106q0-21 5.5-41.5T142-480q-11-18-16.5-38t-5.5-42q0-61 40-105.5t99-52.5q3-51 41-86.5t90-35.5q26 0 48.5 10t41.5 27q18-17 41-27t49-10q52 0 89.5 35t40.5 86q59 8 99.5 53T840-560q0 22-5.5 42T818-480q11 18 16.5 38.5T840-400q0 62-40.5 106.5T699-241q-5 50-41.5 85.5T570-120q-25 0-48.5-9.5T480-156q-19 17-42 26.5t-48 9.5Zm130-590v460q0 21 14.5 35.5T570-200q20 0 34.5-16t15.5-36q-21-8-38.5-21.5T550-306q-10-14-7.5-30t16.5-26q14-10 30-7.5t26 16.5q11 16 28 24.5t37 8.5q33 0 56.5-23.5T760-400q0-5-.5-10t-2.5-10q-17 10-36.5 15t-40.5 5q-17 0-28.5-11.5T640-440q0-17 11.5-28.5T680-480q33 0 56.5-23.5T760-560q0-33-23.5-56T680-640q-11 18-28.5 31.5T613-587q-16 6-31-1t-20-23q-5-16 1.5-31t22.5-20q15-5 24.5-18t9.5-30q0-21-14.5-35.5T570-760q-21 0-35.5 14.5T520-710Zm-80 460v-460q0-21-14.5-35.5T390-760q-21 0-35.5 14.5T340-710q0 16 9 29.5t24 18.5q16 5 23 20t2 31q-6 16-21 23t-31 1q-21-8-38.5-21.5T279-640q-32 1-55.5 24.5T200-560q0 33 23.5 56.5T280-480q17 0 28.5 11.5T320-440q0 17-11.5 28.5T280-400q-21 0-40.5-5T203-420q-2 5-2.5 10t-.5 10q0 33 23.5 56.5T280-320q20 0 37-8.5t28-24.5q10-14 26-16.5t30 7.5q14 10 16.5 26t-7.5 30q-14 19-32 33t-39 22q1 20 16 35.5t35 15.5q21 0 35.5-14.5T440-250Zm40-230Z" />
                    </svg>
                    {t('thinking.deepeningGaps')}
                  </p>
                  <ul className="space-y-1.5">
                    {researchGaps.map((gap, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-amber-500/10 text-amber-600 text-xs flex items-center justify-center font-medium">
                          +
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[var(--text-muted)] text-xs">{gap.gap}</span>
                          <span className="ml-1 text-[var(--text-secondary)] block text-xs mt-0.5 font-mono bg-[var(--card)] px-1.5 py-0.5 rounded">{gap.query}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Brainstorm Thinking Panel - shows creative angles for Brainstorm mode */}
        {mode === 'brainstorm' && brainstormAngles && brainstormAngles.length > 0 && (
          <details className="mb-4 border border-[var(--border)] rounded-lg bg-[var(--card)] overflow-hidden" open={loadingStage !== 'complete'}>
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors flex items-center gap-2 select-none">
              <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {t('thinking.creativeApproach')}
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {brainstormAngles.length} {t('thinking.angles')}
              </Badge>
            </summary>
            <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)]">
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)] mb-2">{t('thinking.exploringFrom')}</p>
                <ul className="space-y-1.5">
                  {brainstormAngles.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <span className="flex-shrink-0 w-5 h-5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[var(--text-muted)] text-xs capitalize">{item.angle}:</span>
                        <span className="ml-1 text-[var(--text-secondary)]">{item.query}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        )}

        {/* Tabs */}
        <Tabs defaultValue="answer" className="w-full">
          <div className="flex items-center justify-between border-b border-[var(--border)]">
            <TabsList>
              <TabsTrigger value="answer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('results.answer')}
              </TabsTrigger>
              <TabsTrigger value="links">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {t('results.links')}
              </TabsTrigger>
            </TabsList>

            {/* Bookmark and Share buttons - aligned with tabs */}
            <div className="flex items-center gap-1 pb-3 -mb-px">
              {/* Bookmark button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 ${
                      isBookmarked
                        ? 'text-amber-500 hover:text-amber-600'
                        : historyEntryId
                          ? 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                    }`}
                    onClick={onToggleBookmark}
                    disabled={!historyEntryId}
                  >
                    <svg
                      className="w-4 h-4 mr-1.5"
                      fill={isBookmarked ? "currentColor" : "none"}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    {isBookmarked ? t('actions.saved') : t('actions.save')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {!historyEntryId
                    ? t('actions.saving')
                    : isBookmarked
                      ? t('actions.removeFromFavorites')
                      : t('actions.saveToFavorites')}
                </TooltipContent>
              </Tooltip>

              {/* Share dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    {copyFeedback === 'formatted' || copyFeedback === 'link' ? tCommon('copied') : tCommon('share')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleCopyFormatted} className="cursor-pointer">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t('actions.copyText')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    {t('actions.copyLink')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDownloadPDF} className="cursor-pointer">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t('actions.downloadPdf')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <TabsContent value="answer">
            {/* Query Title */}
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-4">{query}</h1>

            {/* Sources Pills */}
            <div className="mb-6">
              <button
                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <span>{t('results.reviewedSources', { count: result.sources.length })}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${sourcesExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {sourcesExpanded && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.sources.slice(0, 10).map((source, index) => (
                    <Tooltip key={source.id}>
                      <TooltipTrigger asChild>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors"
                        >
                          <Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {index + 1}
                          </Badge>
                          <img
                            src={source.iconUrl || `https://www.google.com/s2/favicons?domain=${getDomain(source.url)}&sz=16`}
                            alt=""
                            className="w-4 h-4 rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span className="truncate max-w-[150px]">{getDomain(source.url)}</span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="font-medium text-sm">{source.title}</p>
                        {source.snippet && (
                          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{source.snippet}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>

            {/* Answer Content */}
            <div
              ref={contentRef}
              className="markdown-content transition-opacity duration-200"
              style={{ opacity: isTransitioning ? 0 : 1 }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
                components={{
                  h1: ({children, ...props}) => <h1 className="text-xl font-semibold mb-4 mt-8 text-[var(--text-primary)] first:mt-0" {...props}>{children}</h1>,
                  h2: ({children, ...props}) => <h2 className="text-lg font-semibold mb-3 mt-6 text-[var(--text-primary)] first:mt-0" {...props}>{children}</h2>,
                  h3: ({children, ...props}) => <h3 className="text-base font-semibold mb-2 mt-5 text-[var(--text-primary)]" {...props}>{children}</h3>,
                  p: ({children, ...props}) => <p className="mb-4 text-[var(--text-secondary)] leading-relaxed" {...props}>{children}</p>,
                  ul: ({children, ...props}) => <ul className="list-disc ml-5 mb-4 text-[var(--text-secondary)] space-y-1" {...props}>{children}</ul>,
                  ol: ({children, ...props}) => <ol className="list-decimal ml-5 mb-4 text-[var(--text-secondary)] space-y-1" {...props}>{children}</ol>,
                  li: ({children, ...props}) => <li className="leading-relaxed" {...props}>{children}</li>,
                  a: ({children, href, ...props}) => (
                    <a
                      className="text-[var(--accent)] hover:underline"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                  blockquote: ({children, ...props}) => (
                    <blockquote className="border-l-3 border-[var(--border)] pl-4 text-[var(--text-muted)] my-5" {...props}>
                      {children}
                    </blockquote>
                  ),
                  code: (props: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
                    const {inline, className, children, ...rest} = props;
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <pre className="bg-[var(--card)] text-[var(--text-primary)] p-4 rounded-lg overflow-x-auto mb-5 text-sm border border-[var(--border)]">
                        <code className={`language-${match[1]}`} {...rest}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className="bg-[var(--card)] text-[var(--text-primary)] px-1.5 py-0.5 rounded text-sm" {...rest}>
                        {children}
                      </code>
                    );
                  },
                  strong: ({children, ...props}) => <strong className="font-semibold text-[var(--text-primary)]" {...props}>{children}</strong>,
                  table: ({children, ...props}) => (
                    <div className="overflow-x-auto mb-4 -mx-1 px-1 scrollbar-thin">
                      <table className="min-w-full border-collapse text-sm" {...props}>{children}</table>
                    </div>
                  ),
                  thead: ({children, ...props}) => <thead className="bg-[var(--card)]" {...props}>{children}</thead>,
                  tbody: ({children, ...props}) => <tbody className="divide-y divide-[var(--border)]" {...props}>{children}</tbody>,
                  tr: ({children, ...props}) => <tr className="border-b border-[var(--border)]" {...props}>{children}</tr>,
                  th: ({children, ...props}) => <th className="px-3 py-2 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap" {...props}>{children}</th>,
                  td: ({children, ...props}) => <td className="px-3 py-2 text-[var(--text-secondary)]" {...props}>{children}</td>,
                }}
              >
                {processContent(result.content)}
              </ReactMarkdown>

              {/* Streaming cursor */}
              {isStreaming && !isPolishing && (
                <span className="inline-block w-2 h-5 bg-[var(--accent)] animate-pulse rounded-sm ml-1"></span>
              )}
            </div>

            {/* Bottom Action Bar */}
            <div className="mt-8 pt-4 border-t border-[var(--border)] flex items-center gap-2 print:hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`transition-colors ${copyFeedback === 'copied' ? 'text-green-500' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                    onClick={handleCopyContent}
                  >
                    {copyFeedback === 'copied' ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copyFeedback === 'copied' ? tCommon('copied') : tCommon('copy')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] opacity-50 cursor-not-allowed">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('actions.like')} {t('actions.comingSoon')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] opacity-50 cursor-not-allowed">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('actions.dislike')} {t('actions.comingSoon')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] opacity-50 cursor-not-allowed">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('actions.rewrite')} {t('actions.comingSoon')}</TooltipContent>
              </Tooltip>

              <div className="ml-auto flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>{t('results.sourcesCount', { count: result.sources.length })}</span>
              </div>
            </div>

            {/* Related Searches */}
            {relatedSearches.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">{t('results.relatedSearches')}</h3>
                <div className="flex flex-wrap gap-2">
                  {relatedSearches.map((search, index) => (
                    <a
                      key={index}
                      href={`/search?q=${encodeURIComponent(search)}&provider=${provider}&mode=${mode}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--text-secondary)] bg-[var(--card)] border border-[var(--border)] rounded-full hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {search}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Spacer for floating follow-up */}
            <div className="h-24" />
          </TabsContent>

          <TabsContent value="links">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">{t('results.sources')}</h2>
            <div className="space-y-4">
              {result.sources.map((source, index) => (
                <Card
                  key={source.id}
                  className="p-4 hover:border-[var(--accent)] hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => window.open(source.url, '_blank')}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[var(--card)] rounded-lg">
                      <img
                        src={source.iconUrl || `https://www.google.com/s2/favicons?domain=${getDomain(source.url)}&sz=32`}
                        alt=""
                        className="w-5 h-5 rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239ca3af"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-[var(--text-muted)]">{getDomain(source.url)}</span>
                        <span className="w-1 h-1 bg-[var(--border)] rounded-full"></span>
                        <Badge variant="secondary" className="text-xs">{t('results.sourceNumber', { number: index + 1 })}</Badge>
                      </div>
                      <h3 className="font-medium text-[var(--text-primary)] mb-1 line-clamp-2">{source.title}</h3>
                      {source.snippet && (
                        <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{source.snippet}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Spacer for floating follow-up */}
            <div className="h-24" />
          </TabsContent>

        </Tabs>

        {/* Source Hover Card - Deprecated in favor of Tooltip */}
      </div>

      {/* Gradient fade above follow-up input */}
      <div className="fixed bottom-[52px] left-0 right-0 h-12 bg-gradient-to-t from-[var(--background)] to-transparent pointer-events-none z-30 md:ml-[72px] print:hidden" />

      {/* Floating Follow-up Input (both mobile and desktop) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--background)] border-t border-[var(--border)] py-2 px-3 md:pl-[calc(72px+12px)] print:hidden">
        <div className="flex items-center gap-2 py-2 px-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-4xl mx-auto">
          {/* Mode selector - Mobile: button opens bottom sheet */}
          <button
            onClick={() => setIsModeSheetOpen(true)}
            className="md:hidden flex items-center gap-1 px-2 py-1 bg-[var(--background)] rounded-lg text-[var(--text-muted)] flex-shrink-0"
          >
            {currentFollowUpModeIcon}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Mode selector - Desktop: dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-[var(--background)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex-shrink-0">
                {currentFollowUpModeIcon}
                <span className="text-xs font-medium">{getModeLabel(followUpMode)}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {searchModeIds.map((modeId) => (
                <DropdownMenuItem
                  key={modeId}
                  onClick={() => setFollowUpMode(modeId)}
                  className={`flex items-center gap-2 ${followUpMode === modeId ? 'bg-[var(--card)]' : ''}`}
                >
                  {searchModeIcons[modeId]}
                  <span>{getModeLabel(modeId)}</span>
                  {followUpMode === modeId && (
                    <svg className="w-4 h-4 ml-auto text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <textarea
            ref={followUpTextareaRef}
            rows={1}
            placeholder={t('followUp')}
            value={followUpQuery}
            onChange={(e) => setFollowUpQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none text-sm resize-none overflow-y-auto scrollbar-thin min-h-[20px]"
          />
          <Button
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleFollowUp}
            disabled={!followUpQuery.trim()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Button>
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)] md:hidden" />
      </div>

      {/* Mobile Bottom Sheet for Follow-up Mode Selection */}
      <MobileBottomSheet
        isOpen={isModeSheetOpen}
        onClose={() => setIsModeSheetOpen(false)}
        title={t('searchMode')}
      >
        <div className="space-y-1.5">
          {searchModeIds.map((modeId) => (
            <button
              key={modeId}
              onClick={() => {
                setFollowUpMode(modeId);
                setIsModeSheetOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-lg transition-colors ${
                followUpMode === modeId
                  ? 'bg-[var(--accent)]/10 border-2 border-[var(--accent)]'
                  : 'bg-[var(--card)] border-2 border-transparent'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                followUpMode === modeId ? 'bg-[var(--accent)] text-white' : 'bg-[var(--background)] text-[var(--text-muted)]'
              }`}>
                {searchModeIcons[modeId]}
              </div>
              <div className="flex-1 text-left">
                <div className={`font-medium ${followUpMode === modeId ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                  {getModeLabel(modeId)}
                </div>
              </div>
              {followUpMode === modeId && (
                <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </MobileBottomSheet>
    </TooltipProvider>
  );
};

export default SearchResult;
