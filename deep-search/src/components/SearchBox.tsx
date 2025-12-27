"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface SearchBoxProps {
  large?: boolean;
  initialValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

type SearchMode = 'web' | 'pro' | 'brainstorm';
type ModelProvider = 'openai' | 'deepseek' | 'qwen' | 'claude' | 'gemini';

const searchModes = [
  { id: 'web' as SearchMode, label: 'Web Search', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )},
  { id: 'pro' as SearchMode, label: 'Research', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )},
  { id: 'brainstorm' as SearchMode, label: 'Brainstorm', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )},
];

const modelProviders = [
  { id: 'deepseek' as ModelProvider, label: 'DeepSeek', description: 'DeepSeek Chat' },
  { id: 'openai' as ModelProvider, label: 'OpenAI', description: 'GPT-4o mini' },
  { id: 'qwen' as ModelProvider, label: 'Qwen', description: 'Qwen Plus' },
  { id: 'claude' as ModelProvider, label: 'Claude', description: 'Claude Haiku 4.5' },
  { id: 'gemini' as ModelProvider, label: 'Gemini', description: 'Gemini 2.5 Flash' },
];

const quickActions = [
  { icon: '⚖️', label: 'React vs Vue', query: 'Compare React and Vue for building a new web app in 2025' },
  { icon: '🧠', label: 'AI Explained', query: 'Explain how large language models work in simple terms' },
  { icon: '🚀', label: 'Startup Ideas', query: 'What are the most promising AI startup ideas for 2025?' },
  { icon: '📈', label: 'Learn Investing', query: 'How should a beginner start investing in index funds?' },
];

const SearchBox: React.FC<SearchBoxProps> = ({
  large = false,
  initialValue = '',
  placeholder = 'Ask anything...',
  autoFocus = false
}) => {
  const [query, setQuery] = useState(initialValue);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('web');
  const [selectedModel, setSelectedModel] = useState<ModelProvider>('deepseek');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (query.trim()) {
        performSearch();
      }
      e.preventDefault();
    }
  };

  const performSearch = async () => {
    if (isSearching || !query.trim()) return;

    try {
      setIsSearching(true);

      const refineResponse = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          provider: selectedModel  // Pass provider to refine API
        }),
      });

      if (!refineResponse.ok) {
        throw new Error('Failed to refine search query');
      }

      const refinedData = await refineResponse.json();
      const refinedQuery = refinedData.refinedQuery || query.trim();

      // Build URL with provider and mode parameters
      const searchParams = new URLSearchParams({
        q: refinedQuery,
        provider: selectedModel,
        mode: searchMode
      });
      router.push(`/search?${searchParams.toString()}`);
    } catch (error) {
      console.error('Search error:', error);
      // Fallback: still include provider and mode in URL
      const searchParams = new URLSearchParams({
        q: query.trim(),
        provider: selectedModel,
        mode: searchMode
      });
      router.push(`/search?${searchParams.toString()}`);
    } finally {
      setIsSearching(false);
    }
  };

  const currentModel = modelProviders.find(m => m.id === selectedModel);

  const buildSearchUrl = (queryText: string) => {
    const params = new URLSearchParams({
      q: queryText,
      provider: selectedModel,
      mode: searchMode
    });
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
          <Input
            ref={inputRef}
            type="text"
            className={`w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0 ${
              large ? 'text-base h-auto' : 'text-sm h-auto'
            }`}
            placeholder={placeholder}
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
            <div className="flex items-center bg-[var(--card)] rounded-lg p-0.5">
              {searchModes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setSearchMode(mode.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    searchMode === mode.id
                      ? 'bg-[var(--background)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {mode.icon}
                  <span className="hidden sm:inline">{mode.label}</span>
                </button>
              ))}
            </div>

            {/* Right side - Model selector and actions */}
            <div className="flex items-center gap-1">
              {/* Model Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-medium">{currentModel?.label}</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Select Model</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {modelProviders.map((provider) => (
                    <DropdownMenuItem
                      key={provider.id}
                      onClick={() => setSelectedModel(provider.id)}
                      className={`flex items-center justify-between ${
                        selectedModel === provider.id ? 'bg-[var(--card)]' : ''
                      }`}
                    >
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">{provider.label}</div>
                        <div className="text-xs text-[var(--text-muted)]">{provider.description}</div>
                      </div>
                      {selectedModel === provider.id && (
                        <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Attachment */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach File</TooltipContent>
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
                <TooltipContent>Search</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Quick Action Tags - only show on large (home page) variant */}
        {large && (
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {quickActions.map((action) => (
              <a
                key={action.label}
                href={buildSearchUrl(action.query)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-full text-sm text-[var(--text-secondary)] hover:bg-[var(--card)] hover:border-[var(--accent)] transition-colors"
              >
                <span>{action.icon}</span>
                <span>{action.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default SearchBox;
