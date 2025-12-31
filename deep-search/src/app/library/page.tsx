'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  isPendingDelete?: boolean;
}

function HistoryItem({ entry, onDelete, isPendingDelete }: HistoryItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const searchUrl = `/search?q=${encodeURIComponent(entry.query)}&provider=${entry.provider}&mode=${entry.mode}`;

  const handleMenuDelete = () => {
    if (entry.id) {
      onDelete(entry.id);
    }
    setIsMenuOpen(false);
  };

  // Menu content (shared between dropdown and bottom sheet)
  const menuItems = (
    <>
      <button
        onClick={handleMenuDelete}
        className="w-full flex items-center gap-3 py-2 px-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>Delete</span>
      </button>
      <button
        disabled
        className="w-full flex items-center gap-3 py-2 px-3 bg-[var(--card)] text-[var(--text-muted)] opacity-50 cursor-not-allowed rounded-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        <span>Bookmark</span>
        <span className="ml-auto text-xs">(Coming soon)</span>
      </button>
      <button
        disabled
        className="w-full flex items-center gap-3 py-2 px-3 bg-[var(--card)] text-[var(--text-muted)] opacity-50 cursor-not-allowed rounded-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span>Share</span>
        <span className="ml-auto text-xs">(Coming soon)</span>
      </button>
    </>
  );

  if (isPendingDelete) {
    return null; // Hidden while pending deletion
  }

  return (
    <>
      <div className="flex items-start gap-3 p-4 bg-[var(--background)] hover:bg-[var(--card)] transition-colors rounded-lg">
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

          {/* More options button - Desktop: Dropdown */}
          <div className="hidden md:block flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--card)] rounded-lg transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={handleMenuDelete}
                  className="text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Bookmark
                  <span className="ml-auto text-xs text-[var(--text-muted)]">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                  <span className="ml-auto text-xs text-[var(--text-muted)]">Soon</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* More options button - Mobile: Opens bottom sheet */}
        <button
          onClick={() => setIsMenuOpen(true)}
          className="md:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Mobile bottom sheet menu */}
      <MobileBottomSheet
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title="Options"
      >
        <div className="space-y-1.5">
          {menuItems}
        </div>
      </MobileBottomSheet>
    </>
  );
}

// Undo Toast Component
interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

function UndoToast({ message, onUndo, onDismiss, duration = 5000 }: UndoToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-[var(--foreground)] text-[var(--background)] px-4 py-3 rounded-lg shadow-lg flex items-center gap-4 min-w-[280px]">
        <span className="text-sm font-medium flex-1">{message}</span>
        <button
          onClick={onUndo}
          className="text-sm font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          Undo
        </button>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--foreground)] rounded-b-lg overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-50"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface PendingDeletion {
  id: string;
  entry: SearchHistoryEntry;
  timeoutId: NodeJS.Timeout;
}

export default function LibraryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [history, setHistory] = useState<SearchHistoryEntry[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);

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

  // Track pending deletion in a ref for cleanup
  const pendingDeletionRef = useRef<PendingDeletion | null>(null);
  useEffect(() => {
    pendingDeletionRef.current = pendingDeletion;
  }, [pendingDeletion]);

  // Execute pending deletion on unmount (navigation away)
  useEffect(() => {
    return () => {
      if (pendingDeletionRef.current) {
        clearTimeout(pendingDeletionRef.current.timeoutId);
        deleteSearchFromHistory(pendingDeletionRef.current.id).catch(console.error);
      }
    };
  }, []);

  // Soft delete with undo capability
  const handleDelete = useCallback((id: string) => {
    // Find the entry being deleted
    const entryToDelete = history?.find(e => e.id === id);
    if (!entryToDelete) return;

    // Cancel any existing pending deletion
    if (pendingDeletion) {
      clearTimeout(pendingDeletion.timeoutId);
      // Execute the previous pending deletion immediately
      deleteSearchFromHistory(pendingDeletion.id).catch(console.error);
    }

    // Set up new pending deletion with 5 second delay
    const timeoutId = setTimeout(async () => {
      try {
        await deleteSearchFromHistory(id);
        setPendingDeletion(null);
        // Update count
        setTotalCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Error deleting entry:', err);
        // Restore on error
        setPendingDeletion(null);
      }
    }, 5000);

    setPendingDeletion({ id, entry: entryToDelete, timeoutId });
  }, [history, pendingDeletion]);

  // Undo deletion
  const handleUndo = useCallback(() => {
    if (pendingDeletion) {
      clearTimeout(pendingDeletion.timeoutId);
      setPendingDeletion(null);
    }
  }, [pendingDeletion]);

  // Dismiss undo toast (execute deletion)
  const handleDismissUndo = useCallback(async () => {
    // Deletion already happened via timeout, just clear state
    setPendingDeletion(null);
  }, []);

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
                isPendingDelete={pendingDeletion?.id === entry.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Undo Toast */}
      {pendingDeletion && (
        <UndoToast
          message="Search deleted"
          onUndo={handleUndo}
          onDismiss={handleDismissUndo}
          duration={5000}
        />
      )}
    </MainLayout>
  );
}
