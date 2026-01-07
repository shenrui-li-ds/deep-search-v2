import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, getStreamParser, LLMProvider, LLMResponse, TokenUsage } from '@/lib/api-utils';
import { refineSearchQueryPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { trackServerApiUsage, estimateTokens } from '@/lib/supabase/usage-tracking';

// Response type for caching
interface RefineResponse {
  refinedQuery: string;
  searchIntent?: string;
  cached?: boolean;
}

// Parse LLM response - handles both JSON format and plain text fallback
function parseRefineResponse(response: string, originalQuery: string): { refinedQuery: string; searchIntent?: string } {
  const trimmed = response.trim();

  // Try to parse as JSON first
  try {
    // Handle potential markdown code blocks
    let jsonStr = trimmed;
    const jsonMatch = jsonStr.match(/```(?:json)?\\s*([\\s\\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (parsed.query && typeof parsed.query === 'string') {
      return {
        refinedQuery: parsed.query,
        searchIntent: parsed.intent || undefined
      };
    }
  } catch {
    // Not valid JSON, treat as plain text refined query (backward compatibility)
  }

  // Fallback: treat entire response as refined query
  return { refinedQuery: trimmed || originalQuery };
}

export async function POST(req: NextRequest) {
  try {
    const { query, stream = false, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // For non-streaming requests, check cache first
    if (!stream) {
      const cacheKey = generateCacheKey('refine', {
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

      const { data: cachedData, source } = await getFromCache<RefineResponse>(
        cacheKey,
        supabase
      );

      if (cachedData) {
        console.log(`[Refine] Cache ${source} hit for: ${query.slice(0, 50)}`);
        return NextResponse.json({
          ...cachedData,
          cached: true,
        });
      }

      // Cache miss - call LLM
      const currentDate = getCurrentDate();
      const prompt = refineSearchQueryPrompt(query, currentDate);

      const messages: OpenAIMessage[] = [
        { role: 'system', content: 'You are Athenius, an AI specialized in refining search queries.' },
        { role: 'user', content: prompt }
      ];

      const llmResult = await callLLM(messages, 0.7, false, llmProvider) as LLMResponse;
      const { refinedQuery, searchIntent } = parseRefineResponse(llmResult.content, query);

      const response: RefineResponse = { refinedQuery, searchIntent };

      // Track API usage (non-streaming)
      const inputTokens = estimateTokens(prompt);
      const outputTokens = estimateTokens(llmResult.content);
      trackServerApiUsage({
        provider: llmProvider || 'auto',
        tokens_used: inputTokens + outputTokens,
        request_type: 'refine',
        actual_usage: llmResult.usage
      }).catch(err => console.error('Failed to track API usage:', err));

      // Cache the response
      await setToCache(cacheKey, 'refine', query, response, llmProvider, supabase);

      return NextResponse.json(response);
    }

    // Streaming mode - don't cache
    const currentDate = getCurrentDate();
    const prompt = refineSearchQueryPrompt(query, currentDate);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'You are Athenius, an AI specialized in refining search queries.' },
      { role: 'user', content: prompt }
    ];

    const response = await callLLM(messages, 0.7, true, llmProvider) as Response;
    const streamParser = getStreamParser(llmProvider || 'openai');

    // Track total output and actual usage from provider
    let totalOutput = '';
    let actualUsage: TokenUsage | undefined;
    const inputTokens = estimateTokens(prompt);

    // Create a ReadableStream for streaming the response
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamParser(response)) {
            if (chunk.type === 'content' && chunk.content) {
              totalOutput += chunk.content;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: chunk.content, done: false })}\n\n`));
            } else if (chunk.type === 'usage' && chunk.usage) {
              actualUsage = chunk.usage;
            }
          }
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: '', done: true })}\n\n`));
          controller.close();

          // Track API usage after stream completes
          const outputTokens = estimateTokens(totalOutput);
          trackServerApiUsage({
            provider: llmProvider || 'auto',
            tokens_used: inputTokens + outputTokens,
            request_type: 'refine',
            actual_usage: actualUsage
          }).catch(err => console.error('Failed to track API usage:', err));
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in refine API:', error);
    return NextResponse.json(
      { error: 'Failed to refine search query' },
      { status: 500 }
    );
  }
}
