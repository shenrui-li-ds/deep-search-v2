import Dexie, { type EntityTable } from 'dexie';

// Search history entry type
export interface SearchHistoryEntry {
  id?: number;
  query: string;
  refinedQuery?: string;
  provider: string;
  mode: 'web' | 'pro' | 'brainstorm';
  sourcesCount: number;
  createdAt: Date;
}

// Database class
class DeepSearchDB extends Dexie {
  searchHistory!: EntityTable<SearchHistoryEntry, 'id'>;

  constructor() {
    super('DeepSearchDB');

    this.version(1).stores({
      // id is auto-incremented, index by createdAt for sorting
      searchHistory: '++id, query, provider, mode, createdAt',
    });
  }
}

// Create singleton instance
export const db = new DeepSearchDB();

// Helper functions for search history
export async function addSearchToHistory(entry: Omit<SearchHistoryEntry, 'id'>): Promise<number> {
  return await db.searchHistory.add(entry);
}

export async function getSearchHistory(limit: number = 50): Promise<SearchHistoryEntry[]> {
  return await db.searchHistory
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray();
}

export async function deleteSearchHistoryEntry(id: number): Promise<void> {
  await db.searchHistory.delete(id);
}

export async function clearSearchHistory(): Promise<void> {
  await db.searchHistory.clear();
}

export async function getSearchHistoryCount(): Promise<number> {
  return await db.searchHistory.count();
}

// Search within history
export async function searchInHistory(searchTerm: string, limit: number = 20): Promise<SearchHistoryEntry[]> {
  const lowerTerm = searchTerm.toLowerCase();
  return await db.searchHistory
    .orderBy('createdAt')
    .reverse()
    .filter(entry => entry.query.toLowerCase().includes(lowerTerm))
    .limit(limit)
    .toArray();
}
