'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SearchHistoryEntry } from './index';

/**
 * Hook to get search history with live updates
 * @param limit Maximum number of entries to return
 */
export function useSearchHistory(limit: number = 50) {
  const history = useLiveQuery(
    () => db.searchHistory
      .orderBy('createdAt')
      .reverse()
      .limit(limit)
      .toArray(),
    [limit]
  );

  return history;
}

/**
 * Hook to get search history count with live updates
 */
export function useSearchHistoryCount() {
  const count = useLiveQuery(() => db.searchHistory.count());
  return count ?? 0;
}

/**
 * Hook to search within history with live updates
 */
export function useSearchInHistory(searchTerm: string, limit: number = 20) {
  const results = useLiveQuery(
    () => {
      if (!searchTerm.trim()) {
        return db.searchHistory
          .orderBy('createdAt')
          .reverse()
          .limit(limit)
          .toArray();
      }

      const lowerTerm = searchTerm.toLowerCase();
      return db.searchHistory
        .orderBy('createdAt')
        .reverse()
        .filter(entry => entry.query.toLowerCase().includes(lowerTerm))
        .limit(limit)
        .toArray();
    },
    [searchTerm, limit]
  );

  return results;
}

/**
 * Hook to get a single search history entry by ID
 */
export function useSearchHistoryEntry(id: number | undefined) {
  const entry = useLiveQuery(
    () => id ? db.searchHistory.get(id) : undefined,
    [id]
  );
  return entry;
}

// Re-export types and functions for convenience
export type { SearchHistoryEntry };
export {
  addSearchToHistory,
  deleteSearchHistoryEntry,
  clearSearchHistory,
  getSearchHistory,
  getSearchHistoryCount,
  searchInHistory
} from './index';
