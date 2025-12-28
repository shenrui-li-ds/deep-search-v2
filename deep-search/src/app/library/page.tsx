'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import {
  getSearchHistory,
  searchHistory as searchHistoryFn,
  deleteSearchFromHistory,
  clearSearchHistory,
  getSearchHistoryCount,
  type SearchHistoryEntry
} from '@/lib/supabase/database';

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'pro': return 'Research';
    case 'brainstorm': return 'Brainstorm';
    default: return 'Web';
  }
}

function getModeColor(mode: string): string {
  switch (mode) {
    case 'pro': return 'bg-purple-500/10 text-purple-500';
    case 'brainstorm': return 'bg-orange-500/10 text-orange-500';
    default: return 'bg-blue-500/10 text-blue-500';
  }
}

interface HistoryItemProps {
  entry: SearchHistoryEntry;
  onDelete: (id: string) => void;
}

function HistoryItem({ entry, onDelete }: HistoryItemProps) {
  const [showDelete, setShowDelete] = useState(false);

  const searchUrl = `/search?q=${encodeURIComponent(entry.query)}&provider=${entry.provider}&mode=${entry.mode}`;

  return (
    <div
      className="group relative flex items-start gap-3 p-4 rounded-lg hover:bg-[var(--card)] transition-colors"
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-full bg-[var(--card)] flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Link href={searchUrl} className="block">
          <h3 className="text-[var(--text-primary)] font-medium truncate hover:text-[var(--accent)] transition-colors">
            {entry.query}
          </h3>
        </Link>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full ${getModeColor(entry.mode)}`}>
            {getModeLabel(entry.mode)}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {entry.sources_count} sources
          </span>
          <span className="text-xs text-[var(--text-muted)]">•</span>
          <span className="text-xs text-[var(--text-muted)]">
            {entry.created_at ? formatTimeAgo(entry.created_at) : ''}
          </span>
        </div>
      </div>

      {/* Delete button */}
      {showDelete && entry.id && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(entry.id!);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Delete"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [history, setHistory] = useState<SearchHistoryEntry[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (searchTerm) {
        const results = await searchHistoryFn(searchTerm, 100);
        setHistory(results);
      } else {
        const [results, count] = await Promise.all([
          getSearchHistory(100),
          getSearchHistoryCount()
        ]);
        setHistory(results);
        setTotalCount(count);
      }
    } catch (err) {
      console.error('Error loading history:', err);
      setError('Failed to load search history. Please try again.');
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSearchFromHistory(id);
      // Refresh the list
      loadHistory();
    } catch (err) {
      console.error('Error deleting entry:', err);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all search history? This cannot be undone.')) {
      try {
        await clearSearchHistory();
        setHistory([]);
        setTotalCount(0);
      } catch (err) {
        console.error('Error clearing history:', err);
      }
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Library</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {totalCount} {totalCount === 1 ? 'search' : 'searches'} in history
            </p>
          </div>
          {totalCount > 0 && (
            <button
              onClick={handleClearAll}
              className="text-sm text-[var(--text-muted)] hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Search input */}
        <div className="relative mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search your history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
            {error}
          </div>
        )}

        {/* History list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          </div>
        ) : history && history.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--card)] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {searchTerm ? 'No matches found' : 'No search history yet'}
            </h3>
            <p className="text-[var(--text-muted)] mb-6">
              {searchTerm
                ? 'Try a different search term'
                : 'Your search history will appear here'
              }
            </p>
            {!searchTerm && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Start searching
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {history?.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
