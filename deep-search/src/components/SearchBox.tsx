"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import MobileBottomSheet from './MobileBottomSheet';
import { useTranslations } from 'next-intl';

interface SearchBoxProps {
  large?: boolean;
  initialValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  defaultProvider?: ModelId;
  defaultMode?: SearchMode;
}

type SearchMode = 'web' | 'pro' | 'brainstorm';
type ModelId = 'gemini' | 'gemini-pro' | 'openai' | 'openai-mini' | 'deepseek' | 'grok' | 'claude' | 'vercel-gateway';

// Search mode icons - labels come from translations
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

// Provider groups structure - labels come from translations
type ProviderKey = 'google' | 'anthropic' | 'deepseek' | 'openai' | 'xai' | 'vercel';

interface ProviderGroupConfig {
  key: ProviderKey;
  models: ModelId[];
  experimental?: boolean;
}

const providerGroupConfigs: ProviderGroupConfig[] = [
  { key: 'google', models: ['gemini', 'gemini-pro'] },
  { key: 'anthropic', models: ['claude'] },
  { key: 'deepseek', models: ['deepseek'] },
  { key: 'openai', models: ['openai-mini', 'openai'] },
  { key: 'xai', models: ['grok'] },
  { key: 'vercel', models: ['vercel-gateway'], experimental: true },
];

// Map model IDs to translation keys
const modelTranslationKeys: Record<ModelId, string> = {
  'gemini': 'gemini',
  'gemini-pro': 'geminiPro',
  'openai': 'openai',
  'openai-mini': 'openaiMini',
  'deepseek': 'deepseek',
  'grok': 'grok',
  'claude': 'claude',
  'vercel-gateway': 'vercelGateway',
};

// Quick action keys for translation lookup
const quickActionKeys = [
  { icon: '⚖️', labelKey: 'iphoneVsAndroid', queryKey: 'iphoneVsAndroidQuery' },
  { icon: '🧠', labelKey: 'aiExplained', queryKey: 'aiExplainedQuery' },
  { icon: '🚀', labelKey: 'startupIdeas', queryKey: 'startupIdeasQuery' },
  { icon: '📈', labelKey: 'learnInvesting', queryKey: 'learnInvestingQuery' },
];

const SearchBox: React.FC<SearchBoxProps> = ({
  large = false,
  initialValue = '',
  placeholder,
  autoFocus = false,
  defaultProvider = 'gemini',
  defaultMode = 'web'
}) => {
  const [query, setQuery] = useState(initialValue);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>(defaultMode);
  const [selectedModel, setSelectedModel] = useState<ModelId>(defaultProvider);
  const [deepMode, setDeepMode] = useState(false);
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false);
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false);
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Translations
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const tProviders = useTranslations('providers');
  const tProviderGroups = useTranslations('providerGroups');

  // Get translated labels
  const getModeLabel = (modeId: SearchMode) => t(`modes.${modeId}`);
  const getModeDescription = (modeId: SearchMode) => t(`modeDescriptions.${modeId}`);
  const getModelLabel = (modelId: ModelId) => tProviders(modelTranslationKeys[modelId]);
  const getProviderLabel = (providerKey: ProviderKey) => tProviderGroups(providerKey);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = large ? 200 : 120; // Max height in pixels
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [large]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [query, adjustTextareaHeight]);

  // Update state when default props change (async preference loading)
  useEffect(() => {
    setSelectedModel(defaultProvider);
  }, [defaultProvider]);

  useEffect(() => {
    setSearchMode(defaultMode);
  }, [defaultMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter without Shift: submit search
      if (query.trim()) {
        performSearch();
      }
      e.preventDefault();
    }
    // Shift+Enter: allow newline (default textarea behavior)
  };

  const performSearch = async () => {
    if (isSearching || !query.trim()) return;

    // Navigate immediately - refine will happen on search page for web mode
    // Research and Brainstorm modes skip refine (plan/reframe handles query optimization)
    setIsSearching(true);

    const searchParams = new URLSearchParams({
      q: query.trim(),
      provider: selectedModel,
      mode: searchMode
    });
    // Add deep param only when enabled for Research mode
    if (searchMode === 'pro' && deepMode) {
      searchParams.set('deep', 'true');
    }
    router.push(`/search?${searchParams.toString()}`);

    // Reset after a short delay to handle back navigation
    setTimeout(() => setIsSearching(false), 500);
  };

  // Get current mode icon
  const currentModeIcon = searchModeIcons[searchMode];

  const buildSearchUrl = (queryText: string) => {
    const params = new URLSearchParams({
      q: queryText,
      provider: selectedModel,
      mode: searchMode
    });
    // Add deep param only when enabled for Research mode
    if (searchMode === 'pro' && deepMode) {
      params.set('deep', 'true');
    }
    return `/search?${params.toString()}`;
  };

  return (
    <TooltipProvider>
      <div className={`flex flex-col ${large ? 'w-full max-w-2xl' : 'w-full'}`}>
        <div
          className={`relative flex flex-col bg-[var(--background)] border rounded-2xl transition-all duration-200 ${
            isFocused ? 'border-[var(--accent)] shadow-lg' : 'border-[var(--border)] shadow-sm'
          } ${large ? 'p-4' : 'p-3'}`}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            className={`w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none p-0 resize-none overflow-y-auto scrollbar-thin ${
              large ? 'text-base min-h-[24px]' : 'text-sm min-h-[20px]'
            }`}
            placeholder={placeholder || t('placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isSearching}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
            {/* Left side - Search Mode Toggle */}
            {/* Desktop: Icon-only toggle buttons with tooltips */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center bg-[var(--card)] rounded-lg p-0.5 gap-0.5">
                {searchModeIds.map((modeId) => (
                  <Tooltip key={modeId}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setSearchMode(modeId)}
                        className={`flex items-center justify-center w-8 h-8 rounded-md transition-all ${
                          searchMode === modeId
                            ? 'bg-[var(--background)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {searchModeIcons[modeId]}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">{getModeLabel(modeId)}</p>
                      <p className="text-xs text-[var(--text-muted)]">{getModeDescription(modeId)}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Deep Research toggle - only visible when Research mode is selected */}
              {searchMode === 'pro' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeepMode(!deepMode)}
                      className="flex items-center gap-2 h-9 bg-[var(--card)] rounded-lg px-2.5 pr-1.5 transition-all"
                    >
                      {/* Deep Mode text */}
                      <span className={`text-xs font-medium transition-colors ${
                        deepMode ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}>
                        {t('deepMode.label')}
                      </span>
                      {/* Toggle switch */}
                      <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${
                        deepMode ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                      }`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                          deepMode ? 'translate-x-3' : 'translate-x-0'
                        }`} />
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p className="font-medium">{t('deepMode.title')}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('deepMode.description')}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Mobile: Separate mode and model selector buttons */}
            <div className="sm:hidden flex items-center gap-2">
              {/* Mode selector button - styled like model selector */}
              <button
                onClick={() => setIsModeSheetOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--card)] rounded-lg text-sm text-[var(--text-muted)]"
              >
                {currentModeIcon}
                <span className="text-xs font-medium">{getModeLabel(searchMode)}</span>
                {/* Show deep indicator when Research + Deep mode is enabled */}
                {searchMode === 'pro' && deepMode && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                )}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Model selector button */}
              <button
                onClick={() => setIsModelSheetOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--card)] rounded-lg text-sm text-[var(--text-muted)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium">{getModelLabel(selectedModel)}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Right side - Model selector and actions */}
            <div className="flex items-center gap-1">
              {/* Model Selector - Desktop */}
              <div className="hidden sm:block">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs font-medium">{getModelLabel(selectedModel)}</span>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="bottom" className="w-64 max-h-[320px] overflow-y-auto">
                    <DropdownMenuLabel>{t('selectModel')}</DropdownMenuLabel>
                    {providerGroupConfigs.map((group, groupIndex) => (
                      <div key={group.key}>
                        {groupIndex > 0 && <DropdownMenuSeparator />}
                        <div className={`px-2 py-1.5 text-xs font-semibold tracking-wider uppercase ${group.experimental ? 'text-[var(--text-muted)]/60' : 'text-[var(--text-muted)]'}`}>
                          {getProviderLabel(group.key)}
                        </div>
                        {group.models.map((modelId) => (
                          <DropdownMenuItem
                            key={modelId}
                            onClick={() => setSelectedModel(modelId)}
                            className={`flex items-center justify-between ml-2 ${
                              selectedModel === modelId ? 'bg-[var(--card)]' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium flex items-center gap-1.5 ${group.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                                {getModelLabel(modelId)}
                              </div>
                            </div>
                            {selectedModel === modelId && (
                              <svg className={`w-4 h-4 flex-shrink-0 ml-2 ${group.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Attachment button - both desktop and mobile */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-muted)] opacity-50 cursor-not-allowed">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('actions.attachFiles')}</TooltipContent>
              </Tooltip>

              {/* Submit button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={performSearch}
                    disabled={isSearching || !query.trim()}
                    size="icon"
                    className={`h-8 w-8 ${
                      query.trim()
                        ? ''
                        : 'bg-[var(--card)] text-[var(--text-muted)] hover:bg-[var(--card)]'
                    }`}
                    variant={query.trim() ? 'default' : 'secondary'}
                  >
                    {isSearching ? (
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('search')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Quick Action Tags - only show on large (home page) variant */}
        {large && (
          <div className="mt-8">
            <p className="text-center text-sm text-[var(--text-muted)] mb-3">
              ✨ {t('quickActions.hint')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickActionKeys.map((action) => (
                <a
                  key={action.labelKey}
                  href={buildSearchUrl(t(`quickActions.${action.queryKey}`))}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-full text-sm text-[var(--text-secondary)] hover:bg-[var(--card)] hover:border-[var(--accent)] hover:scale-105 transition-all cursor-pointer"
                >
                  <span>{action.icon}</span>
                  <span>{t(`quickActions.${action.labelKey}`)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheet for Mode Selection */}
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
                setSearchMode(modeId);
                // Don't close sheet if selecting Research - allow user to toggle deep mode
                if (modeId !== 'pro') {
                  setIsModeSheetOpen(false);
                }
              }}
              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-lg transition-colors ${
                searchMode === modeId
                  ? 'bg-[var(--accent)]/10 border-2 border-[var(--accent)]'
                  : 'bg-[var(--card)] border-2 border-transparent'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                searchMode === modeId ? 'bg-[var(--accent)] text-white' : 'bg-[var(--background)] text-[var(--text-muted)]'
              }`}>
                {searchModeIcons[modeId]}
              </div>
              <div className="flex-1 text-left">
                <div className={`font-medium ${searchMode === modeId ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                  {getModeLabel(modeId)}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{getModeDescription(modeId)}</div>
              </div>
              {searchMode === modeId && (
                <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}

          {/* Deep Research toggle - shown when Research mode is selected */}
          {searchMode === 'pro' && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <button
                onClick={() => {
                  setDeepMode(!deepMode);
                }}
                className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
                  deepMode
                    ? 'bg-[var(--accent)]/10 border-2 border-[var(--accent)]'
                    : 'bg-[var(--card)] border-2 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${
                    deepMode ? 'bg-[var(--accent)] text-white' : 'bg-[var(--background)] text-[var(--text-muted)]'
                  }`}>
                    {/* Brain icon for deep thinking (filled) */}
                    <svg className="w-4 h-4" viewBox="0 -960 960 960" fill="currentColor">
                      <path d="M390-120q-51 0-88-35.5T260-241q-60-8-100-53t-40-106q0-21 5.5-41.5T142-480q-11-18-16.5-38t-5.5-42q0-61 40-105.5t99-52.5q3-51 41-86.5t90-35.5q26 0 48.5 10t41.5 27q18-17 41-27t49-10q52 0 89.5 35t40.5 86q59 8 99.5 53T840-560q0 22-5.5 42T818-480q11 18 16.5 38.5T840-400q0 62-40.5 106.5T699-241q-5 50-41.5 85.5T570-120q-25 0-48.5-9.5T480-156q-19 17-42 26.5t-48 9.5Zm130-590v460q0 21 14.5 35.5T570-200q20 0 34.5-16t15.5-36q-21-8-38.5-21.5T550-306q-10-14-7.5-30t16.5-26q14-10 30-7.5t26 16.5q11 16 28 24.5t37 8.5q33 0 56.5-23.5T760-400q0-5-.5-10t-2.5-10q-17 10-36.5 15t-40.5 5q-17 0-28.5-11.5T640-440q0-17 11.5-28.5T680-480q33 0 56.5-23.5T760-560q0-33-23.5-56T680-640q-11 18-28.5 31.5T613-587q-16 6-31-1t-20-23q-5-16 1.5-31t22.5-20q15-5 24.5-18t9.5-30q0-21-14.5-35.5T570-760q-21 0-35.5 14.5T520-710Zm-80 460v-460q0-21-14.5-35.5T390-760q-21 0-35.5 14.5T340-710q0 16 9 29.5t24 18.5q16 5 23 20t2 31q-6 16-21 23t-31 1q-21-8-38.5-21.5T279-640q-32 1-55.5 24.5T200-560q0 33 23.5 56.5T280-480q17 0 28.5 11.5T320-440q0 17-11.5 28.5T280-400q-21 0-40.5-5T203-420q-2 5-2.5 10t-.5 10q0 33 23.5 56.5T280-320q20 0 37-8.5t28-24.5q10-14 26-16.5t30 7.5q14 10 16.5 26t-7.5 30q-14 19-32 33t-39 22q1 20 16 35.5t35 15.5q21 0 35.5-14.5T440-250Zm40-230Z" />
                    </svg>
                  </div>
                  <div className="text-left min-w-0">
                    <p className={`font-medium ${deepMode ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      {t('deepMode.title')}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">{t('deepMode.description')}</p>
                  </div>
                </div>
                {/* Toggle switch - fixed size, never shrink */}
                <div className={`relative flex-shrink-0 w-[44px] h-[24px] rounded-full transition-colors ${
                  deepMode ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}>
                  <div className={`absolute top-[2px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    deepMode ? 'translate-x-[18px]' : 'translate-x-0'
                  }`}></div>
                </div>
              </button>
              <button
                onClick={() => setIsModeSheetOpen(false)}
                className="w-full mt-3 py-2.5 rounded-lg bg-[var(--accent)] text-white font-medium"
              >
                {tCommon('confirm')}
              </button>
            </div>
          )}
        </div>
      </MobileBottomSheet>

      {/* Mobile Bottom Sheet for Model Selection */}
      <MobileBottomSheet
        isOpen={isModelSheetOpen}
        onClose={() => setIsModelSheetOpen(false)}
        title={t('selectModel')}
      >
        <div className="space-y-4">
          {providerGroupConfigs.map((group) => (
            <div key={group.key}>
              <div className={`text-xs font-semibold tracking-wider uppercase mb-2 ${group.experimental ? 'text-[var(--text-muted)]/60' : 'text-[var(--text-muted)]'}`}>
                {getProviderLabel(group.key)}
              </div>
              <div className="space-y-1.5">
                {group.models.map((modelId) => {
                  const isSelected = selectedModel === modelId;
                  const borderColor = group.experimental
                    ? (isSelected ? 'border-[var(--text-muted)]/50' : 'border-transparent')
                    : (isSelected ? 'border-[var(--accent)]' : 'border-transparent');
                  const bgColor = group.experimental
                    ? (isSelected ? 'bg-[var(--text-muted)]/5' : 'bg-[var(--card)]')
                    : (isSelected ? 'bg-[var(--accent)]/10' : 'bg-[var(--card)]');
                  const textColor = group.experimental
                    ? 'text-[var(--text-muted)]'
                    : (isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]');

                  return (
                    <button
                      key={modelId}
                      onClick={() => {
                        setSelectedModel(modelId);
                        setIsModelSheetOpen(false);
                      }}
                      className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${bgColor} border-2 ${borderColor}`}
                    >
                      <div className="text-left">
                        <div className={`font-medium flex items-center gap-1.5 ${textColor}`}>
                          {getModelLabel(modelId)}
                        </div>
                      </div>
                      {isSelected && (
                        <svg className={`w-5 h-5 ${group.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </MobileBottomSheet>
    </TooltipProvider>
  );
};

export default SearchBox;
