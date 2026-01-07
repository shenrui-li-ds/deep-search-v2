'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import MobileBottomSheet from '@/components/MobileBottomSheet';
import { useTranslations, useLocale } from 'next-intl';
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
  toggleBookmark,
  getBookmarkedSearches,
  getBookmarkedCount,
  getDeletedSearchHistory,
  getDeletedSearchCount,
  recoverSearchFromHistory,
  type SearchHistoryEntry
} from '@/lib/supabase/database';

// Raw time calculation - returns { type, count } for translation
function getTimeAgoData(dateString: string): { type: 'justNow' | 'minutesAgo' | 'hoursAgo' | 'daysAgo' | 'date', count?: number, date?: Date } {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return { type: 'justNow' };
  if (diffMins < 60) return { type: 'minutesAgo', count: diffMins };
  if (diffHours < 24) return { type: 'hoursAgo', count: diffHours };
  if (diffDays < 7) return { type: 'daysAgo', count: diffDays };

  return { type: 'date', date };
}

// Helper to format time with translation function
type TranslatorFn = (key: string, params?: Record<string, number>) => string;
function formatTimeAgoWithT(dateString: string, t: TranslatorFn, locale: string = 'en'): string {
  const data = getTimeAgoData(dateString);

  if (data.type === 'justNow') return t('justNow');
  if (data.type === 'minutesAgo') return t('minutesAgo', { count: data.count ?? 0 });
  if (data.type === 'hoursAgo') return t('hoursAgo', { count: data.count ?? 0 });
  if (data.type === 'daysAgo') return t('daysAgo', { count: data.count ?? 0 });

  // For dates older than 7 days, use localized date format
  const date = data.date!;
  const now = new Date();
  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function getModeColor(mode: string): string {
  switch (mode) {
    case 'pro': return 'bg-purple-500/10 text-purple-500';
    case 'brainstorm': return 'bg-orange-500/10 text-orange-500';
    default: return 'bg-blue-500/10 text-blue-500';
  }
}

function getModeIcon(mode: string): React.ReactNode {
  switch (mode) {
    case 'pro':
      return (
        <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'brainstorm':
      return (
        <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    default:
      return (
        <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
  }
}

interface HistoryItemProps {
  entry: SearchHistoryEntry;
  onDelete: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  isPendingDelete?: boolean;
}

function HistoryItem({ entry, onDelete, onToggleBookmark, isPendingDelete }: HistoryItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useTranslations('library');
  const tSearch = useTranslations('search');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  // Build search URL, including deep parameter if it was a deep research
  const searchUrl = `/search?q=${encodeURIComponent(entry.query)}&provider=${entry.provider}&mode=${entry.mode}${entry.deep ? '&deep=true' : ''}`;

  const handleMenuDelete = () => {
    if (entry.id) {
      onDelete(entry.id);
    }
    setIsMenuOpen(false);
  };

  const handleMenuBookmark = () => {
    if (entry.id) {
      onToggleBookmark(entry.id);
    }
    setIsMenuOpen(false);
  };

  const handleCopyQuery = async () => {
    try {
      await navigator.clipboard.writeText(entry.query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
    setIsMenuOpen(false);
  };

  // Menu content (shared between dropdown and bottom sheet)
  const menuItems = (
    <>
      <button
        onClick={handleMenuDelete}
        className="w-full flex items-center gap-3 py-2 px-3 bg-[var(--card)] text-rose-500 hover:bg-[var(--card-hover)] rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>{tCommon('delete')}</span>
      </button>
      <button
        onClick={handleMenuBookmark}
        className={`w-full flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
          entry.bookmarked
            ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
            : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={entry.bookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        <span>{entry.bookmarked ? t('removeBookmark') : t('bookmark')}</span>
      </button>
      <button
        onClick={handleCopyQuery}
        className={`w-full flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
          copied
            ? 'bg-green-500/10 text-green-500'
            : 'bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span>{copied ? tCommon('copied') : t('copyQuery')}</span>
      </button>
      <button
        disabled
        className="w-full flex items-center gap-3 py-2 px-3 bg-[var(--card)] text-[var(--text-muted)] opacity-50 cursor-not-allowed rounded-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span>{t('share')}</span>
        <span className="ml-auto text-xs">({t('comingSoon')})</span>
      </button>
    </>
  );

  if (isPendingDelete) {
    return null; // Hidden while pending deletion
  }

  return (
    <>
      <div className="flex items-start gap-3 p-4 bg-[var(--background)] hover:bg-[var(--card)] transition-colors rounded-lg">
          {/* Icon - changes based on search mode */}
          <div className="relative w-8 h-8 rounded-full bg-[var(--card)] flex items-center justify-center flex-shrink-0 mt-0.5">
            {getModeIcon(entry.mode)}
            {/* Bookmark indicator */}
            {entry.bookmarked && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
            )}
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
                {tSearch(`modes.${entry.mode || 'web'}`)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {entry.sources_count} {t('sources')}
              </span>
              <span className="text-xs text-[var(--text-muted)]">•</span>
              <span className="text-xs text-[var(--text-muted)]">
                {entry.created_at ? formatTimeAgoWithT(entry.created_at, t as TranslatorFn, locale) : ''}
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
                  className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {tCommon('delete')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleMenuBookmark}
                  className={`cursor-pointer ${entry.bookmarked ? 'text-amber-500 focus:text-amber-500 focus:bg-amber-500/10' : ''}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill={entry.bookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  {entry.bookmarked ? t('removeBookmark') : t('bookmark')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCopyQuery}
                  className={`cursor-pointer ${copied ? 'text-green-500 focus:text-green-500 focus:bg-green-500/10' : ''}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied ? tCommon('copied') : t('copyQuery')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  {t('share')}
                  <span className="ml-auto text-xs text-[var(--text-muted)]">{t('comingSoon')}</span>
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
        title={t('options')}
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
  undoLabel?: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

function UndoToast({ message, undoLabel = 'Undo', onUndo, onDismiss, duration = 3000 }: UndoToastProps) {
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
          {undoLabel}
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

type LibraryTab = 'history' | 'favorites' | 'deleted';

// Deleted History Item Component (with recover option)
interface DeletedHistoryItemProps {
  entry: SearchHistoryEntry;
  onRecover: (id: string) => void;
  isPendingRecover?: boolean;
}

function DeletedHistoryItem({ entry, onRecover, isPendingRecover }: DeletedHistoryItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const t = useTranslations('library');
  const tSearch = useTranslations('search');
  const locale = useLocale();

  const handleRecover = () => {
    if (entry.id) {
      onRecover(entry.id);
    }
    setIsMenuOpen(false);
  };

  // Format deleted time
  const deletedTimeAgo = entry.deleted_at ? formatTimeAgoWithT(entry.deleted_at, t as TranslatorFn, locale) : '';

  if (isPendingRecover) {
    return null;
  }

  // Menu content for deleted items
  const menuItems = (
    <>
      <button
        onClick={handleRecover}
        className="w-full flex items-center gap-3 py-2 px-3 bg-[var(--card)] text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{t('recover')}</span>
      </button>
    </>
  );

  return (
    <>
      <div className="flex items-start gap-3 p-4 bg-[var(--background)] hover:bg-[var(--card)] transition-colors rounded-lg opacity-70">
        {/* Icon */}
        <div className="relative w-8 h-8 rounded-full bg-[var(--card)] flex items-center justify-center flex-shrink-0 mt-0.5">
          {getModeIcon(entry.mode)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[var(--text-primary)] font-medium truncate">
            {entry.query}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getModeColor(entry.mode)}`}>
              {tSearch(`modes.${entry.mode || 'web'}`)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {t('deletedAgo', { time: deletedTimeAgo })}
            </span>
          </div>
        </div>

        {/* Recover button - Desktop */}
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
                onClick={handleRecover}
                className="text-emerald-500 focus:text-emerald-500 focus:bg-emerald-500/10 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('recover')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* More options button - Mobile */}
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
        title={t('options')}
      >
        <div className="space-y-1.5">
          {menuItems}
        </div>
      </MobileBottomSheet>
    </>
  );
}

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('history');
  const [searchTerm, setSearchTerm] = useState('');
  const [history, setHistory] = useState<SearchHistoryEntry[] | undefined>(undefined);
  const [favorites, setFavorites] = useState<SearchHistoryEntry[] | undefined>(undefined);
  const [deleted, setDeleted] = useState<SearchHistoryEntry[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const t = useTranslations('library');

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (searchTerm) {
        const results = await searchHistoryFn(searchTerm, 100);
        setHistory(results);
        // Filter favorites from search results
        setFavorites(results.filter(e => e.bookmarked));
        // Note: Search doesn't apply to deleted items
      } else {
        const [historyResults, historyCount, bookmarkedResults, bookmarkedCount, deletedResults, deletedCountResult] = await Promise.all([
          getSearchHistory(100),
          getSearchHistoryCount(),
          getBookmarkedSearches(100),
          getBookmarkedCount(),
          getDeletedSearchHistory(100),
          getDeletedSearchCount()
        ]);
        setHistory(historyResults);
        setTotalCount(historyCount);
        setFavorites(bookmarkedResults);
        setFavoritesCount(bookmarkedCount);
        setDeleted(deletedResults);
        setDeletedCount(deletedCountResult);
      }
    } catch (err) {
      console.error('Error loading history:', err);
      setError('Failed to load search history. Please try again.');
      setHistory([]);
      setFavorites([]);
      setDeleted([]);
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

    // Cancel any existing pending deletion and execute it immediately
    if (pendingDeletion) {
      clearTimeout(pendingDeletion.timeoutId);
      const previousEntry = pendingDeletion.entry;
      const previousId = pendingDeletion.id;
      // Execute the previous pending deletion immediately
      deleteSearchFromHistory(previousId).catch(console.error);
      // Also update local state to remove it from the list
      setHistory(prev => prev?.filter(e => e.id !== previousId));
      if (previousEntry.bookmarked) {
        setFavorites(prev => prev?.filter(e => e.id !== previousId));
        setFavoritesCount(prev => Math.max(0, prev - 1));
      }
      setTotalCount(prev => Math.max(0, prev - 1));
      // Add to deleted list
      const deletedEntry = { ...previousEntry, deleted_at: new Date().toISOString() };
      setDeleted(prev => [deletedEntry, ...(prev || [])]);
      setDeletedCount(prev => prev + 1);
    }

    // Set up new pending deletion with 3 second delay
    const timeoutId = setTimeout(async () => {
      try {
        await deleteSearchFromHistory(id);
        // Remove from history array BEFORE clearing pendingDeletion to prevent flash
        setHistory(prev => prev?.filter(e => e.id !== id));
        // Also update favorites if the deleted entry was bookmarked
        if (entryToDelete.bookmarked) {
          setFavorites(prev => prev?.filter(e => e.id !== id));
          setFavoritesCount(prev => Math.max(0, prev - 1));
        }
        // Update count and clear pending state
        setTotalCount(prev => Math.max(0, prev - 1));
        // Add to deleted list
        const deletedEntry = { ...entryToDelete, deleted_at: new Date().toISOString() };
        setDeleted(prev => [deletedEntry, ...(prev || [])]);
        setDeletedCount(prev => prev + 1);
        setPendingDeletion(null);
      } catch (err) {
        console.error('Error deleting entry:', err);
        // Restore on error
        setPendingDeletion(null);
      }
    }, 3000);

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
    if (window.confirm(t('clearAllConfirm'))) {
      try {
        // Move all history items to deleted list before clearing
        const deletedAt = new Date().toISOString();
        const itemsToDelete = (history || []).map(entry => ({ ...entry, deleted_at: deletedAt }));

        await clearSearchHistory();

        // Update deleted list with all cleared items
        setDeleted(prev => [...itemsToDelete, ...(prev || [])]);
        setDeletedCount(prev => prev + itemsToDelete.length);

        setHistory([]);
        setFavorites([]);
        setTotalCount(0);
        setFavoritesCount(0);
      } catch (err) {
        console.error('Error clearing history:', err);
      }
    }
  };

  const handleToggleBookmark = useCallback(async (id: string) => {
    try {
      const newBookmarkStatus = await toggleBookmark(id);

      // Update local state
      setHistory(prev => prev?.map(entry =>
        entry.id === id ? { ...entry, bookmarked: newBookmarkStatus } : entry
      ));

      // Update favorites list
      if (newBookmarkStatus) {
        // Add to favorites
        const entry = history?.find(e => e.id === id);
        if (entry) {
          setFavorites(prev => [{ ...entry, bookmarked: true }, ...(prev || [])]);
          setFavoritesCount(prev => prev + 1);
        }
      } else {
        // Remove from favorites
        setFavorites(prev => prev?.filter(e => e.id !== id));
        setFavoritesCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error toggling bookmark:', err);
    }
  }, [history]);

  // Recover a deleted search entry
  const handleRecover = useCallback(async (id: string) => {
    try {
      const entryToRecover = deleted?.find(e => e.id === id);
      if (!entryToRecover) return;

      await recoverSearchFromHistory(id);

      // Remove from deleted list
      setDeleted(prev => prev?.filter(e => e.id !== id));
      setDeletedCount(prev => Math.max(0, prev - 1));

      // Add back to history
      const recoveredEntry = { ...entryToRecover, deleted_at: null };
      setHistory(prev => [recoveredEntry, ...(prev || [])]);
      setTotalCount(prev => prev + 1);

      // If it was bookmarked, add back to favorites too
      if (recoveredEntry.bookmarked) {
        setFavorites(prev => [recoveredEntry, ...(prev || [])]);
        setFavoritesCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error recovering search:', err);
    }
  }, [deleted]);

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('title')}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {t('subtitle')}
            </p>
          </div>
          {totalCount > 0 && (
            <button
              onClick={handleClearAll}
              className="text-sm text-[var(--text-muted)] hover:text-rose-500 transition-colors"
            >
              {t('clearAll')}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mb-6 border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-sm font-medium transition-colors relative border-b-2 ${
              activeTab === 'history'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('history')}
              {totalCount > 0 && (
                <span className="text-xs text-[var(--text-muted)]">({totalCount})</span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`pb-3 text-sm font-medium transition-colors relative border-b-2 ${
              activeTab === 'favorites'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill={activeTab === 'favorites' ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              {t('favorites')}
              {favoritesCount > 0 && (
                <span className="text-xs text-[var(--text-muted)]">({favoritesCount})</span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('deleted')}
            className={`pb-3 text-sm font-medium transition-colors relative border-b-2 ${
              activeTab === 'deleted'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {t('deleted')}
              {deletedCount > 0 && (
                <span className="text-xs text-[var(--text-muted)]">({deletedCount})</span>
              )}
            </span>
          </button>
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
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500">
            {error}
          </div>
        )}

        {/* Content based on active tab */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          </div>
        ) : activeTab === 'history' ? (
          // History Tab Content
          history && history.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--card)] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {searchTerm ? t('noMatchesFound') : t('empty')}
              </h3>
              <p className="text-[var(--text-muted)] mb-6">
                {searchTerm
                  ? t('tryDifferentTerm')
                  : t('emptyDescription')
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
                  {t('startSearching')}
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
                  onToggleBookmark={handleToggleBookmark}
                  isPendingDelete={pendingDeletion?.id === entry.id}
                />
              ))}
            </div>
          )
        ) : activeTab === 'favorites' ? (
          // Favorites Tab Content
          favorites && favorites.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--card)] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {searchTerm ? t('noMatchingFavorites') : t('emptyBookmarks')}
              </h3>
              <p className="text-[var(--text-muted)] mb-6">
                {searchTerm
                  ? t('tryDifferentTerm')
                  : t('emptyBookmarksDescription')
                }
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {favorites?.map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  onDelete={handleDelete}
                  onToggleBookmark={handleToggleBookmark}
                  isPendingDelete={pendingDeletion?.id === entry.id}
                />
              ))}
            </div>
          )
        ) : (
          // Deleted Tab Content
          <>
            {/* Retention notice */}
            <p className="text-xs text-[var(--text-muted)] mb-4">
              {t('deletedRetention')}
            </p>
            {deleted && deleted.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--card)] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  {t('emptyDeleted')}
                </h3>
                <p className="text-[var(--text-muted)]">
                  {t('emptyDeletedDescription')}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {deleted?.map((entry) => (
                  <DeletedHistoryItem
                    key={entry.id}
                    entry={entry}
                    onRecover={handleRecover}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Undo Toast */}
      {pendingDeletion && (
        <UndoToast
          key={pendingDeletion.id}
          message={t('searchDeleted')}
          undoLabel={t('undo')}
          onUndo={handleUndo}
          onDismiss={handleDismissUndo}
          duration={3000}
        />
      )}
    </MainLayout>
  );
}
