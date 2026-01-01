import { createClient } from './server';

// Server-side usage tracking utilities

export interface UsageRecord {
  provider: string;
  tokens_used: number;
  request_type: 'refine' | 'summarize' | 'proofread' | 'research' | 'plan' | 'synthesize' | 'related';
}

/**
 * Track API usage on the server side.
 * Call this after each LLM API request to record token usage.
 */
export async function trackServerApiUsage(record: UsageRecord): Promise<void> {
  try {
    const supabase = await createClient();

    // Get the current user from the session
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // No user logged in, skip tracking
      return;
    }

    // Insert usage record
    const { error: insertError } = await supabase
      .from('api_usage')
      .insert({
        user_id: user.id,
        provider: record.provider,
        tokens_used: record.tokens_used,
        request_type: record.request_type,
      });

    if (insertError) {
      console.error('Error tracking API usage:', insertError);
      return;
    }

    // Update monthly token count in user_limits
    // Note: Using raw SQL for atomic increment
    const { error: updateError } = await supabase.rpc('increment_token_usage', {
      p_user_id: user.id,
      p_tokens: record.tokens_used
    });

    if (updateError) {
      // This might fail if the function doesn't exist - that's OK
      console.warn('Could not update token usage (function may not exist):', updateError);
    }
  } catch (error) {
    console.error('Error in trackServerApiUsage:', error);
    // Don't throw - tracking failures shouldn't break the main flow
  }
}

/**
 * Estimate token count from text (rough approximation).
 * Uses average of 4 characters per token.
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4);
}

/**
 * Check if user can make an API request (server-side).
 * Returns true if within limits, false if limit exceeded.
 */
export async function checkServerUsageLimits(): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // No user - allow (unauthenticated requests handled by middleware)
      return { allowed: true };
    }

    // Get user limits
    const { data: limits, error } = await supabase
      .from('user_limits')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error || !limits) {
      // No limits record - allow (might be new user)
      return { allowed: true };
    }

    // Check daily search limit
    const today = new Date().toISOString().split('T')[0];
    if (limits.last_daily_reset < today) {
      // Reset happened, counters are stale on client - allow
      return { allowed: true };
    }

    if (limits.daily_searches_used >= limits.daily_search_limit) {
      return {
        allowed: false,
        reason: `Daily search limit reached (${limits.daily_search_limit} searches). Resets at midnight.`
      };
    }

    // Check monthly token limit
    if (limits.monthly_tokens_used >= limits.monthly_token_limit) {
      return {
        allowed: false,
        reason: `Monthly token limit reached (${limits.monthly_token_limit.toLocaleString()} tokens). Resets on the 1st.`
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking usage limits:', error);
    // On error, allow the request
    return { allowed: true };
  }
}
