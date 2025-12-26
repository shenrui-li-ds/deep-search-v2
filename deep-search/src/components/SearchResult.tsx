"use client";

import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SearchLoading from './SearchLoading';

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
  isLoading?: boolean;
  isSearching?: boolean;
  isStreaming?: boolean;
  isPolishing?: boolean;
  isTransitioning?: boolean;
}

const SearchResult: React.FC<SearchResultProps> = ({ query, result, relatedSearches = [], isLoading = false, isSearching = false, isStreaming = false, isPolishing = false, isTransitioning = false }) => {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const processContent = (content: string) => {
    return content;
  };

  if (isLoading) {
    return <SearchLoading query={query} />;
  }

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Status Banner - always rendered to prevent layout shift, visibility controlled by opacity */}
        <div
          className={`mb-4 p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-lg flex items-center gap-3 transition-opacity duration-200 ${
            (isSearching || isStreaming || isPolishing) ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 p-0 mb-0 overflow-hidden'
          }`}
        >
          <svg className="animate-spin w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm font-medium text-[var(--accent)]">
            {isSearching ? 'Searching the web...' : isPolishing ? 'Polishing response...' : 'Generating response...'}
          </span>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="answer" className="w-full">
          <div className="flex items-center justify-between mb-6 border-b border-[var(--border)]">
            <TabsList className="bg-transparent h-auto p-0 gap-6">
              <TabsTrigger
                value="answer"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-0 text-sm font-medium transition-colors relative rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Answer
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="links"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-0 text-sm font-medium transition-colors relative rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Links
                </span>
              </TabsTrigger>
            </TabsList>

            {/* Share button */}
            <Button variant="ghost" size="sm" className="h-8 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </Button>
          </div>

          <TabsContent value="answer" className="mt-0">
            {/* Query Title */}
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-4">{query}</h1>

            {/* Sources Pills */}
            <div className="mb-6">
              <button
                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <span>Reviewed {result.sources.length} sources</span>
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
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
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
            <div className="mt-8 pt-4 border-t border-[var(--border)] flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Like</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dislike</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rewrite</TooltipContent>
              </Tooltip>

              <div className="ml-auto flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>{result.sources.length} sources</span>
              </div>
            </div>

            {/* Follow-up Input */}
            <div className="mt-8 pt-6 border-t border-[var(--border)]">
              <div className="flex items-center gap-3 p-3 bg-[var(--background)] border border-[var(--border)] rounded-2xl">
                <Input
                  type="text"
                  placeholder="Ask a follow-up"
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-muted)]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-muted)]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </Button>
                  <Button size="icon" className="h-8 w-8">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>

            {/* Related Searches */}
            {relatedSearches.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Related searches</h3>
                <div className="flex flex-wrap gap-2">
                  {relatedSearches.map((search, index) => (
                    <a
                      key={index}
                      href={`/search?q=${encodeURIComponent(search)}`}
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
          </TabsContent>

          <TabsContent value="links" className="mt-0">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Sources</h2>
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
                        <Badge variant="secondary" className="text-xs">Source {index + 1}</Badge>
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
          </TabsContent>

        </Tabs>

        {/* Source Hover Card - Deprecated in favor of Tooltip */}
      </div>
    </TooltipProvider>
  );
};

export default SearchResult;
