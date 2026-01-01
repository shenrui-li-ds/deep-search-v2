import { createClient } from './client';

// Types for database records
export interface SearchHistoryEntry {
  id?: string;
  user_id?: string;
  query: string;
  refined_query?: string;
  provider: string;
  mode: 'web' | 'pro' | 'brainstorm';
  sources_count: number;
  bookmarked?: boolean;
  created_at?: string;
}

export interface UserLimits {
  user_id: string;
  // Daily limits
  daily_search_limit: number;
  daily_searches_used: number;
  daily_token_limit: number;
  daily_tokens_used: number;
  // Monthly limits
  monthly_search_limit: number;
  monthly_searches_used: number;
  monthly_token_limit: number;
  monthly_tokens_used: number;
  // Tracking dates
  last_daily_reset: string;
  last_monthly_reset: string;
}

export interface ApiUsageEntry {
  id?: string;
  user_id?: string;
  provider: string;
  tokens_used: number;
  request_type: 'refine' | 'summarize' | 'proofread' | 'research';
  created_at?: string;
}

export interface UserPreferences {
  user_id: string;
  default_provider: 'deepseek' | 'openai' | 'grok' | 'claude' | 'gemini';
  default_mode: 'web' | 'pro' | 'brainstorm';
  created_at?: string;
  updated_at?: string;
}

// ============================================
// SEARCH HISTORY OPERATIONS
// ============================================

/**
 * Adds a search entry to history, or updates an existing bookmarked entry.
 *
 * Uses the `upsert_search_history` PostgreSQL function for optimal performance:
 * - Eliminates one database round trip by combining duplicate check + insert/update
 * - If a BOOKMARKED entry with same (query, provider, mode) exists, updates it
 * - Otherwise, inserts a new entry
 *
 * See: supabase/add-upsert-search-history-function.sql for the database function.
 */
export async function addSearchToHistory(entry: Omit<SearchHistoryEntry, 'id' | 'user_id' | 'created_at'>) {
  const supabase = createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('No user logged in, skipping history save');
    return null;
  }

  // Call the PostgreSQL function that handles upsert logic atomically
  // This combines duplicate check + insert/update into a single round trip
  const { data, error } = await supabase.rpc('upsert_search_history', {
    p_user_id: user.id,
    p_query: entry.query,
    p_provider: entry.provider,
    p_mode: entry.mode,
    p_sources_count: entry.sources_count,
    p_refined_query: entry.refined_query || null,
  });

  if (error) {
    console.error('Error saving search to history:', error);
    throw error;
  }

  // RPC returns an array, get the first (and only) result
  return Array.isArray(data) ? data[0] : data;
}

export async function getSearchHistory(limit = 50, offset = 0): Promise<SearchHistoryEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching search history:', error);
    throw error;
  }

  return data || [];
}

export async function searchHistory(searchTerm: string, limit = 50): Promise<SearchHistoryEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .or(`query.ilike.%${searchTerm}%,refined_query.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error searching history:', error);
    throw error;
  }

  return data || [];
}

export async function deleteSearchFromHistory(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting search from history:', error);
    throw error;
  }
}

export async function clearSearchHistory(): Promise<void> {
  const supabase = createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('Error clearing search history:', error);
    throw error;
  }
}

export async function getSearchHistoryCount(): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from('search_history')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error getting history count:', error);
    throw error;
  }

  return count || 0;
}

export async function toggleBookmark(id: string): Promise<boolean> {
  const supabase = createClient();

  // First get current bookmark status
  const { data: entry, error: fetchError } = await supabase
    .from('search_history')
    .select('bookmarked')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error('Error fetching entry:', fetchError);
    throw fetchError;
  }

  const newBookmarkStatus = !entry.bookmarked;

  // Update bookmark status
  const { error: updateError } = await supabase
    .from('search_history')
    .update({ bookmarked: newBookmarkStatus })
    .eq('id', id);

  if (updateError) {
    console.error('Error toggling bookmark:', updateError);
    throw updateError;
  }

  return newBookmarkStatus;
}

export async function getBookmarkedSearches(limit = 50, offset = 0): Promise<SearchHistoryEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .eq('bookmarked', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching bookmarked searches:', error);
    throw error;
  }

  return data || [];
}

export async function getBookmarkedCount(): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from('search_history')
    .select('*', { count: 'exact', head: true })
    .eq('bookmarked', true);

  if (error) {
    console.error('Error getting bookmarked count:', error);
    throw error;
  }

  return count || 0;
}

// ============================================
// USER LIMITS OPERATIONS
// ============================================

export async function getUserLimits(): Promise<UserLimits | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_limits')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) {
    // If no record exists, it might be a new user - the trigger should create it
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching user limits:', error);
    throw error;
  }

  return data;
}

export async function checkSearchLimit(): Promise<{ allowed: boolean; remaining: number; limit: number; reason?: string }> {
  const supabase = createClient();

  // Call the database function to check and increment
  const { data, error } = await supabase.rpc('check_and_increment_search');

  if (error) {
    console.error('Error checking search limit:', error);
    // On error, allow the search but log it
    return { allowed: true, remaining: -1, limit: -1 };
  }

  // Get updated limits
  const limits = await getUserLimits();
  const allowed = data === true;

  // Determine reason if not allowed
  let reason: string | undefined;
  if (!allowed && limits) {
    if (limits.daily_searches_used >= limits.daily_search_limit) {
      reason = `Daily search limit reached (${limits.daily_search_limit} searches). Resets at midnight.`;
    } else if (limits.monthly_searches_used >= limits.monthly_search_limit) {
      reason = `Monthly search limit reached (${limits.monthly_search_limit} searches). Resets on the 1st.`;
    }
  }

  return {
    allowed,
    remaining: limits ? limits.daily_search_limit - limits.daily_searches_used : 0,
    limit: limits?.daily_search_limit || 50,
    reason,
  };
}

// ============================================
// API USAGE TRACKING
// ============================================

export async function trackApiUsage(entry: Omit<ApiUsageEntry, 'id' | 'user_id' | 'created_at'>): Promise<void> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Insert usage record
  const { error: insertError } = await supabase
    .from('api_usage')
    .insert({
      ...entry,
      user_id: user.id,
    });

  if (insertError) {
    console.error('Error tracking API usage:', insertError);
  }

  // Update monthly token count
  const { error: updateError } = await supabase
    .from('user_limits')
    .update({
      monthly_tokens_used: supabase.rpc('increment', { x: entry.tokens_used }),
    })
    .eq('user_id', user.id);

  if (updateError) {
    console.error('Error updating token usage:', updateError);
  }
}

export async function getApiUsageStats(days = 30): Promise<{
  totalTokens: number;
  requestCount: number;
  byProvider: Record<string, number>;
  byType: Record<string, number>;
}> {
  const supabase = createClient();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('api_usage')
    .select('provider, tokens_used, request_type')
    .gte('created_at', startDate.toISOString());

  if (error) {
    console.error('Error fetching API usage stats:', error);
    throw error;
  }

  const stats = {
    totalTokens: 0,
    requestCount: data?.length || 0,
    byProvider: {} as Record<string, number>,
    byType: {} as Record<string, number>,
  };

  data?.forEach((record) => {
    stats.totalTokens += record.tokens_used;
    stats.byProvider[record.provider] = (stats.byProvider[record.provider] || 0) + record.tokens_used;
    stats.byType[record.request_type] = (stats.byType[record.request_type] || 0) + record.tokens_used;
  });

  return stats;
}

// ============================================
// GUARD RAILS - Check if user can perform actions
// ============================================

export async function canPerformSearch(): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getUserLimits();

  if (!limits) {
    // New user or limits not set up yet - allow
    return { allowed: true };
  }

  // Reset daily counter if needed (client-side check)
  const today = new Date().toISOString().split('T')[0];
  if (limits.last_daily_reset < today) {
    // The database function will handle the reset
    return { allowed: true };
  }

  // Check daily limit
  if (limits.daily_searches_used >= limits.daily_search_limit) {
    return {
      allowed: false,
      reason: `Daily search limit reached (${limits.daily_search_limit} searches). Resets at midnight.`,
    };
  }

  // Check monthly token limit
  if (limits.monthly_tokens_used >= limits.monthly_token_limit) {
    return {
      allowed: false,
      reason: `Monthly token limit reached (${limits.monthly_token_limit.toLocaleString()} tokens). Resets on the 1st.`,
    };
  }

  return { allowed: true };
}

// ============================================
// USER PREFERENCES OPERATIONS
// ============================================

export async function getUserPreferences(): Promise<UserPreferences | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) {
    // If no record exists, return defaults
    if (error.code === 'PGRST116') {
      return {
        user_id: user.id,
        default_provider: 'deepseek',
        default_mode: 'web',
      };
    }
    console.error('Error fetching user preferences:', error);
    throw error;
  }

  return data;
}

export async function updateUserPreferences(
  preferences: Partial<Pick<UserPreferences, 'default_provider' | 'default_mode'>>
): Promise<UserPreferences | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use the RPC function for atomic upsert
  const { data, error } = await supabase.rpc('upsert_user_preferences', {
    p_default_provider: preferences.default_provider || null,
    p_default_mode: preferences.default_mode || null,
  });

  if (error) {
    console.error('Error updating user preferences:', error);
    throw error;
  }

  return data;
}
