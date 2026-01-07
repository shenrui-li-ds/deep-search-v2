import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, LLMProvider, LLMResponse } from '@/lib/api-utils';
import { trackServerApiUsage, estimateTokens } from '@/lib/supabase/usage-tracking';
import {
  researchRouterPrompt,
  researchPlannerPrompt,
  researchPlannerShoppingPrompt,
  researchPlannerTravelPrompt,
  researchPlannerTechnicalPrompt,
  researchPlannerAcademicPrompt,
  researchPlannerExplanatoryPrompt,
  researchPlannerFinancePrompt,
} from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';

export type QueryType = 'shopping' | 'travel' | 'technical' | 'academic' | 'explanatory' | 'finance' | 'general';
export type ResearchDepth = 'standard' | 'deep';

export interface ResearchPlanItem {
  aspect: string;
  query: string;
}

export interface ResearchPlanResponse {
  originalQuery: string;
  queryType: QueryType;
  suggestedDepth: ResearchDepth;
  plan: ResearchPlanItem[];
  cached?: boolean;
}

interface RouterResult {
  category: QueryType;
  suggestedDepth: ResearchDepth;
}

// Map query type to specialized planner prompt
function getPlannerPrompt(queryType: QueryType, query: string, currentDate: string): string {
  switch (queryType) {
    case 'shopping':
      return researchPlannerShoppingPrompt(query, currentDate);
    case 'travel':
      return researchPlannerTravelPrompt(query, currentDate);
    case 'technical':
      return researchPlannerTechnicalPrompt(query, currentDate);
    case 'academic':
      return researchPlannerAcademicPrompt(query, currentDate);
    case 'explanatory':
      return researchPlannerExplanatoryPrompt(query, currentDate);
    case 'finance':
      return researchPlannerFinancePrompt(query, currentDate);
    case 'general':
    default:
      return researchPlannerPrompt(query, currentDate);
  }
}

// Classify query type and suggest depth using router
async function classifyQuery(query: string, provider: LLMProvider | undefined): Promise<RouterResult> {
  const prompt = researchRouterPrompt(query);

  const messages: OpenAIMessage[] = [
    { role: 'system', content: 'You are a query classifier. Output only a JSON object with category and suggestedDepth.' },
    { role: 'user', content: prompt }
  ];

  const defaultResult: RouterResult = { category: 'general', suggestedDepth: 'standard' };

  try {
    const llmResult = await callLLM(messages, 0.3, false, provider) as LLMResponse;

    // Track API usage for router
    const routerInputTokens = estimateTokens(prompt);
    const routerOutputTokens = estimateTokens(llmResult.content);
    trackServerApiUsage({
      provider: provider || 'auto',
      tokens_used: routerInputTokens + routerOutputTokens,
      request_type: 'plan',
      actual_usage: llmResult.usage
    }).catch(err => console.error('Failed to track API usage:', err));

    // Parse JSON response
    let jsonStr = llmResult.content.trim();
    // Extract from markdown code block if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate the category
    const validCategories: QueryType[] = ['shopping', 'travel', 'technical', 'academic', 'explanatory', 'finance', 'general'];
    const validDepths: ResearchDepth[] = ['standard', 'deep'];

    const category = validCategories.includes(parsed.category) ? parsed.category : 'general';
    const suggestedDepth = validDepths.includes(parsed.suggestedDepth) ? parsed.suggestedDepth : 'standard';

    console.log(`[Router] Query classified as: ${category}, depth: ${suggestedDepth}`);
    return { category, suggestedDepth };
  } catch (error) {
    console.error('[Router] Classification failed, defaulting to general/standard:', error);
    return defaultResult;
  }
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

    // Cache miss - first classify the query type and depth
    const { category: queryType, suggestedDepth } = await classifyQuery(query, llmProvider);

    // Get the appropriate planner prompt based on query type
    const currentDate = getCurrentDate();
    const prompt = getPlannerPrompt(queryType, query, currentDate);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'You are a research planning expert. You analyze topics and identify distinct research angles for comprehensive coverage.' },
      { role: 'user', content: prompt }
    ];

    const plannerResult = await callLLM(messages, 0.7, false, llmProvider) as LLMResponse;

    // Track API usage for planner
    const plannerInputTokens = estimateTokens(prompt);
    const plannerOutputTokens = estimateTokens(plannerResult.content);
    trackServerApiUsage({
      provider: llmProvider || 'auto',
      tokens_used: plannerInputTokens + plannerOutputTokens,
      request_type: 'plan',
      actual_usage: plannerResult.usage
    }).catch(err => console.error('Failed to track API usage:', err));

    // Parse the JSON response
    let plan: ResearchPlanItem[] = [];
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = plannerResult.content.trim();
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
      queryType,
      suggestedDepth,
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
