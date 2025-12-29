import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, LLMProvider } from '@/lib/api-utils';
import { researchPlannerPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';

export interface ResearchPlanItem {
  aspect: string;
  query: string;
}

export interface ResearchPlanResponse {
  originalQuery: string;
  plan: ResearchPlanItem[];
  cached?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { query, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Generate cache key
    const cacheKey = generateCacheKey('plan', {
      query,
      provider: llmProvider,
    });

    // Try to get from cache
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      console.log('[Cache] Supabase not available, using memory cache only');
    }

    const { data: cachedData, source } = await getFromCache<ResearchPlanResponse>(
      cacheKey,
      supabase
    );

    if (cachedData) {
      console.log(`[Plan] Cache ${source} hit for: ${query.slice(0, 50)}`);
      return NextResponse.json({
        ...cachedData,
        cached: true,
      });
    }

    // Cache miss - call LLM
    const currentDate = getCurrentDate();
    const prompt = researchPlannerPrompt(query, currentDate);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'You are a research planning expert. You analyze topics and identify distinct research angles.' },
      { role: 'user', content: prompt }
    ];

    const response = await callLLM(messages, 0.7, false, llmProvider);

    // Parse the JSON response
    let plan: ResearchPlanItem[] = [];
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = response.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      plan = JSON.parse(jsonStr);

      // Validate the plan structure
      if (!Array.isArray(plan) || plan.length === 0) {
        throw new Error('Invalid plan format');
      }

      // Ensure each item has aspect and query
      plan = plan.filter(item => item.aspect && item.query);

      // Limit to 4 search queries max
      if (plan.length > 4) {
        plan = plan.slice(0, 4);
      }
    } catch (parseError) {
      console.error('Failed to parse research plan:', parseError);
      // Fallback: use the original query as a single search
      plan = [{ aspect: 'general', query: query }];
    }

    const result: ResearchPlanResponse = {
      originalQuery: query,
      plan
    };

    // Cache the response
    await setToCache(cacheKey, 'plan', query, result, llmProvider, supabase);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in research plan API:', error);
    return NextResponse.json(
      { error: 'Failed to create research plan' },
      { status: 500 }
    );
  }
}
