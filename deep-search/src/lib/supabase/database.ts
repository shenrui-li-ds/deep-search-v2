import { createClient } from './client';

// Types for database records
export interface SearchHistoryEntry {
  id?: string;
  user_id?: string;
  query: string;
  refined_query?: string;
  provider: string;
  mode: 'web' | 'pro' | 'brainstorm';
  deep?: boolean;  // Whether deep research mode was used (for pro mode)
  sources_count: number;
  bookmarked?: boolean;
  created_at?: string;
  deleted_at?: string | null;
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

// ModelId type for grouped model selection
// Uses provider-based naming for future compatibility
export type UserModelId =
  | 'gemini'          // Google Gemini Flash (latest fast model)
  | 'gemini-pro'      // Google Gemini Pro (latest pro model)
  | 'openai'          // OpenAI flagship (latest)
  | 'openai-mini'     // OpenAI mini series (latest)
  | 'deepseek'        // DeepSeek Chat
  | 'grok'            // xAI Grok
  | 'claude'          // Anthropic Claude
  | 'vercel-gateway'; // Vercel AI Gateway

export type UILanguage = 'en' | 'zh';

export interface UserPreferences {
  user_id: string;
  default_provider: UserModelId;
  default_mode: 'web' | 'pro' | 'brainstorm';
  language: UILanguage;
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
    p_deep: entry.deep || false,
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
    .is('deleted_at', null)
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
    .is('deleted_at', null)
    .or(`query.ilike.%${searchTerm}%,refined_query.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error searching history:', error);
    throw error;
  }

  return data || [];
}

/**
 * Soft delete a search entry (moves to deleted state, recoverable)
 */
export async function deleteSearchFromHistory(id: string): Promise<void> {
  const supabase = createClient();

  // Try using the RPC function first (preferred)
  const { error: rpcError } = await supabase.rpc('soft_delete_search', {
    p_search_id: id,
  });

  if (rpcError) {
    // Fallback to direct update if RPC doesn't exist
    if (rpcError.code === '42883') {
      const { error } = await supabase
        .from('search_history')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Error soft deleting search from history:', error);
        throw error;
      }
      return;
    }
    console.error('Error soft deleting search from history:', rpcError);
    throw rpcError;
  }
}

/**
 * Soft delete all search history for the current user (recoverable)
 */
export async function clearSearchHistory(): Promise<void> {
  const supabase = createClient();

  // Try using the RPC function first (preferred)
  const { error: rpcError } = await supabase.rpc('soft_delete_all_searches');

  if (rpcError) {
    // Fallback to direct update if RPC doesn't exist
    if (rpcError.code === '42883') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('search_history')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('deleted_at', null);

      if (error) {
        console.error('Error clearing search history:', error);
        throw error;
      }
      return;
    }
    console.error('Error clearing search history:', rpcError);
    throw rpcError;
  }
}

/**
 * Recover a soft-deleted search entry
 */
export async function recoverSearchFromHistory(id: string): Promise<void> {
  const supabase = createClient();

  // Try using the RPC function first (preferred)
  const { error: rpcError } = await supabase.rpc('recover_search', {
    p_search_id: id,
  });

  if (rpcError) {
    // Fallback to direct update if RPC doesn't exist
    if (rpcError.code === '42883') {
      const { error } = await supabase
        .from('search_history')
        .update({ deleted_at: null })
        .eq('id', id);

      if (error) {
        console.error('Error recovering search from history:', error);
        throw error;
      }
      return;
    }
    console.error('Error recovering search from history:', rpcError);
    throw rpcError;
  }
}

/**
 * Get deleted search history (for recovery UI)
 */
export async function getDeletedSearchHistory(limit = 50, offset = 0): Promise<SearchHistoryEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching deleted search history:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get count of deleted search history entries
 */
export async function getDeletedSearchCount(): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from('search_history')
    .select('*', { count: 'exact', head: true })
    .not('deleted_at', 'is', null);

  if (error) {
    console.error('Error getting deleted search count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Permanently delete a search entry (no recovery)
 */
export async function permanentlyDeleteSearch(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error permanently deleting search:', error);
    throw error;
  }
}

export async function getSearchHistoryCount(): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from('search_history')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

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
    .is('deleted_at', null)
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
    .eq('bookmarked', true)
    .is('deleted_at', null);

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

/**
 * Check if user has credits available for a search.
 *
 * @deprecated Use /api/check-limit endpoint instead for actual billing.
 * This function provides a client-side preview only.
 *
 * @param mode - Search mode (default: 'web')
 */
export async function checkSearchLimit(mode: SearchMode = 'web'): Promise<{ allowed: boolean; remaining: number; limit: number; reason?: string }> {
  // Use credit system for checking
  const credits = await getUserCredits();

  if (!credits) {
    // Can't check credits - allow (server will enforce)
    return { allowed: true, remaining: -1, limit: -1 };
  }

  const creditsNeeded = CREDIT_COSTS[mode];
  const allowed = credits.total_available >= creditsNeeded;

  return {
    allowed,
    remaining: credits.total_available,
    limit: credits.monthly_free_credits,
    reason: allowed ? undefined : `You need ${creditsNeeded} credits but only have ${credits.total_available}. Purchase more credits to continue.`,
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

/**
 * Check if user can perform a search (client-side preview).
 *
 * Note: This is a preview check only. The actual billing/limit enforcement
 * is done server-side by /api/check-limit using the credit system.
 *
 * @param mode - Search mode to check credits for (default: 'web')
 */
export async function canPerformSearch(mode: SearchMode = 'web'): Promise<{ allowed: boolean; reason?: string }> {
  // Use the credit system for checking
  const credits = await getUserCredits();

  if (!credits) {
    // Can't check credits - allow (server will enforce)
    return { allowed: true };
  }

  const creditsNeeded = CREDIT_COSTS[mode];

  if (credits.total_available < creditsNeeded) {
    return {
      allowed: false,
      reason: `You need ${creditsNeeded} credits but only have ${credits.total_available}. Purchase more credits to continue.`,
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
        default_provider: 'gemini',
        default_mode: 'web',
        language: 'en',
      };
    }
    console.error('Error fetching user preferences:', error);
    throw error;
  }

  // Ensure language has a default
  return {
    ...data,
    language: data.language || 'en',
  };
}

export async function updateUserPreferences(
  preferences: Partial<Pick<UserPreferences, 'default_provider' | 'default_mode' | 'language'>>
): Promise<UserPreferences | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use the RPC function for atomic upsert
  const { data, error } = await supabase.rpc('upsert_user_preferences', {
    p_default_provider: preferences.default_provider || null,
    p_default_mode: preferences.default_mode || null,
    p_language: preferences.language || null,
  });

  if (error) {
    console.error('Error updating user preferences:', error);
    throw error;
  }

  return data;
}

// ============================================
// CREDIT SYSTEM
// ============================================

export interface UserCredits {
  user_tier?: 'free' | 'pro' | 'admin';
  monthly_free_credits: number;
  free_credits_used: number;
  free_credits_remaining: number;
  purchased_credits: number;
  total_available: number;
  days_until_reset: number;
}

export interface CreditPurchase {
  id: string;
  user_id: string;
  stripe_session_id?: string;
  stripe_payment_intent?: string;
  pack_type: 'starter' | 'plus' | 'pro';
  credits: number;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
}

export interface CreditCheckResult {
  allowed: boolean;
  error?: string;
  source?: 'free' | 'purchased';
  credits_used?: number;
  needed?: number;
  remaining_free: number;
  remaining_purchased: number;
}

// Maximum credits reserved per search mode (1 credit = 1 Tavily query)
// Actual credits charged are based on actual queries made
export const MAX_CREDITS = {
  web: 1,        // 1 query (always 1)
  pro: 4,        // 3-4 queries (research angles)
  deep: 8,       // 6-8 queries (deep research with gap analysis)
  brainstorm: 6, // 4-6 queries (creative angles)
} as const;

// For backwards compatibility
export const CREDIT_COSTS = MAX_CREDITS;

// Type for search modes (includes deep research)
export type SearchMode = 'web' | 'pro' | 'deep' | 'brainstorm';

/**
 * Get current credit balances (read-only, no side effects)
 */
export async function getUserCredits(): Promise<UserCredits | null> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('get_user_credits');

  if (error) {
    // Function doesn't exist - return null
    if (error.code === '42883') {
      return null;
    }
    console.error('Error getting user credits:', error.message);
    return null;
  }

  // Handle error response from function
  if (data?.error) {
    return null;
  }

  return data as UserCredits;
}

/**
 * Check if user has enough credits and deduct them.
 * Uses free credits first, then purchased credits.
 * @param mode - The search mode to get credit cost
 * @returns Result with allowed status and remaining credits
 */
export async function checkAndUseCredits(mode: SearchMode): Promise<CreditCheckResult> {
  const supabase = createClient();
  const creditsNeeded = CREDIT_COSTS[mode];

  const { data, error } = await supabase.rpc('check_and_use_credits', {
    p_credits_needed: creditsNeeded,
  });

  if (error) {
    console.error('Error checking/using credits:', error);
    // On error, return a safe default that blocks the search
    return {
      allowed: false,
      error: 'Failed to check credits',
      remaining_free: 0,
      remaining_purchased: 0,
    };
  }

  return data as CreditCheckResult;
}

/**
 * Check if user has enough credits without deducting them (preview only)
 * @param mode - The search mode to check
 */
export async function hasEnoughCredits(mode: SearchMode): Promise<{
  hasCredits: boolean;
  totalAvailable: number;
  creditsNeeded: number;
}> {
  const credits = await getUserCredits();
  const creditsNeeded = CREDIT_COSTS[mode];

  if (!credits) {
    return { hasCredits: false, totalAvailable: 0, creditsNeeded };
  }

  return {
    hasCredits: credits.total_available >= creditsNeeded,
    totalAvailable: credits.total_available,
    creditsNeeded,
  };
}

/**
 * Get user's credit purchase history
 */
export async function getPurchaseHistory(limit = 50): Promise<CreditPurchase[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('credit_purchases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching purchase history:', error);
    throw error;
  }

  return data || [];
}

// ============================================
// USAGE STATISTICS
// ============================================

export interface UsageStats {
  totalSearches: number;
  todaySearches: number;
  thisMonthSearches: number;
  byMode: { mode: string; count: number }[];
  byProvider: { provider: string; count: number }[];
  last30Days: { date: string; count: number }[];
}

export interface ProviderUsageSummary {
  provider: string;
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface ApiUsageWithCosts {
  totalCostUsd: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  byProvider: ProviderUsageSummary[];
}

/**
 * Get API usage with estimated costs by provider.
 * Uses the get_usage_summary RPC function which calculates costs based on provider pricing.
 * @param days - Number of days to look back (default 30)
 */
export async function getApiUsageWithCosts(days = 30): Promise<ApiUsageWithCosts | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc('get_usage_summary', {
    p_user_id: user.id,
    p_days: days,
  });

  if (error) {
    // Function might not exist yet
    if (error.code === '42883') {
      console.log('[ApiUsage] get_usage_summary function not available');
      return null;
    }
    console.error('Error fetching API usage with costs:', error);
    return null;
  }

  if (!data || !Array.isArray(data)) {
    return {
      totalCostUsd: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      byProvider: [],
    };
  }

  // Aggregate totals from all providers
  let totalCostUsd = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;

  const byProvider: ProviderUsageSummary[] = data.map((row: ProviderUsageSummary) => {
    totalCostUsd += Number(row.estimated_cost_usd) || 0;
    totalPromptTokens += Number(row.total_prompt_tokens) || 0;
    totalCompletionTokens += Number(row.total_completion_tokens) || 0;
    totalTokens += Number(row.total_tokens) || 0;

    return {
      provider: row.provider,
      total_requests: Number(row.total_requests) || 0,
      total_prompt_tokens: Number(row.total_prompt_tokens) || 0,
      total_completion_tokens: Number(row.total_completion_tokens) || 0,
      total_tokens: Number(row.total_tokens) || 0,
      estimated_cost_usd: Number(row.estimated_cost_usd) || 0,
    };
  });

  return {
    totalCostUsd,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    byProvider,
  };
}

/**
 * Get usage statistics for visualization
 * @param days - Number of days to look back (default 30)
 */
export async function getUsageStats(days = 30): Promise<UsageStats> {
  const supabase = createClient();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('search_history')
    .select('mode, provider, created_at')
    .gte('created_at', startDate.toISOString());

  if (error) {
    console.error('Error fetching usage stats:', error);
    throw error;
  }

  const records = data || [];

  // Get today's date string and current month
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7); // YYYY-MM format

  // Count by mode, provider, and time periods
  const modeCount: Record<string, number> = {};
  const providerCount: Record<string, number> = {};
  const dailyCount: Record<string, number> = {};
  let todaySearches = 0;
  let thisMonthSearches = 0;

  records.forEach((record) => {
    // Mode counts
    modeCount[record.mode] = (modeCount[record.mode] || 0) + 1;

    // Provider counts
    providerCount[record.provider] = (providerCount[record.provider] || 0) + 1;

    // Daily counts
    const date = new Date(record.created_at).toISOString().split('T')[0];
    dailyCount[date] = (dailyCount[date] || 0) + 1;

    // Today's count
    if (date === today) {
      todaySearches++;
    }

    // This month's count
    if (date.startsWith(currentMonth)) {
      thisMonthSearches++;
    }
  });

  // Convert to arrays and sort
  const byMode = Object.entries(modeCount)
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);

  const byProvider = Object.entries(providerCount)
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count);

  // Create daily array with all days (fill gaps with 0)
  const last30Days: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last30Days.push({ date: dateStr, count: dailyCount[dateStr] || 0 });
  }

  return {
    totalSearches: records.length,
    todaySearches,
    thisMonthSearches,
    byMode,
    byProvider,
    last30Days,
  };
}
