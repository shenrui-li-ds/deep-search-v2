import { createClient } from './server';
import type { TokenUsage } from '../api-utils';

// Server-side usage tracking utilities

export interface UsageRecord {
  provider: string;
  tokens_used: number;
  request_type: 'refine' | 'summarize' | 'proofread' | 'research' | 'plan' | 'synthesize' | 'related';
  // Optional: actual token usage from LLM provider (more accurate than estimation)
  actual_usage?: TokenUsage;
}

/**
 * Track API usage on the server side.
 * Call this after each LLM API request to record token usage.
 *
 * Token priority:
 * 1. actual_usage.total_tokens (most accurate, from LLM provider)
 * 2. tokens_used (estimated fallback)
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

    // Prefer actual usage from provider, fall back to estimate
    const tokensToTrack = record.actual_usage?.total_tokens || record.tokens_used;

    // Log when we have actual usage for debugging
    if (record.actual_usage) {
      console.log(`[Usage] Tracking actual tokens: ${tokensToTrack} (in: ${record.actual_usage.prompt_tokens}, out: ${record.actual_usage.completion_tokens})`);
    }

    // Insert usage record with token breakdown if available
    const insertData: Record<string, unknown> = {
      user_id: user.id,
      provider: record.provider,
      tokens_used: tokensToTrack,
      request_type: record.request_type,
    };

    // Add breakdown if we have actual usage data
    if (record.actual_usage) {
      insertData.prompt_tokens = record.actual_usage.prompt_tokens;
      insertData.completion_tokens = record.actual_usage.completion_tokens;
    }

    const { error: insertError } = await supabase
      .from('api_usage')
      .insert(insertData);

    if (insertError) {
      console.error('Error tracking API usage:', insertError);
      return;
    }

    // Update monthly token count in user_limits
    // Note: Using raw SQL for atomic increment
    const { error: updateError } = await supabase.rpc('increment_token_usage', {
      p_user_id: user.id,
      p_tokens: tokensToTrack
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
 *
 * @deprecated Use /api/check-limit endpoint instead. That endpoint performs a unified
 * atomic check of ALL limits (search, tokens, credits) at the start of each search flow.
 * Calling this function mid-flow can cause race conditions where token usage from earlier
 * API calls (like /api/refine) pushes the user over the limit even though the search
 * was already authorized by /api/check-limit.
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
      .select('monthly_tokens_used, monthly_token_limit')
      .eq('user_id', user.id)
      .single();

    if (error || !limits) {
      // No limits record - allow (might be new user)
      return { allowed: true };
    }

    // Check monthly token limit (safety net for excessive token usage)
    // Note: Search limits are now enforced by the credit system, not here
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
