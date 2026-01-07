import { NextRequest, NextResponse } from 'next/server';
import {
  callLLM,
  getCurrentDate,
  formatSearchResultsForSummarization,
  getStreamParser,
  LLMProvider,
  detectLanguage,
  TokenUsage,
  LLMResponse
} from '@/lib/api-utils';
import { summarizeSearchResultsPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { trackServerApiUsage, estimateTokens, checkServerUsageLimits } from '@/lib/supabase/usage-tracking';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';

interface SynthesisCache {
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query, results, stream = true, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    // Check usage limits
    const limitCheck = await checkServerUsageLimits();
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.reason || 'Usage limit exceeded' },
        { status: 429 }
      );
    }

    if (!query || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'Query and results parameters are required' },
        { status: 400 }
      );
    }

    // Check synthesis cache
    const supabase = await createClient();
    const sourceUrls = results.map((r: { url: string }) => r.url);
    const cacheKey = generateCacheKey('summary', {
      query,
      provider: llmProvider,
      sources: sourceUrls
    });

    const { data: cachedData } = await getFromCache<SynthesisCache>(cacheKey, supabase);

    if (cachedData) {
      console.log(`[Summarize] Cache HIT for query: ${query.slice(0, 50)}...`);

      if (stream) {
        // Return cached content as SSE for consistent client handling
        const readableStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: cachedData.content, done: false })}\n\n`));
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: '', done: true, cached: true })}\n\n`));
            controller.close();
          }
        });

        return new NextResponse(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } else {
        return NextResponse.json({ summary: cachedData.content, cached: true });
      }
    }

    const currentDate = getCurrentDate();
    const formattedResults = formatSearchResultsForSummarization(results);

    // Detect language from the query to ensure response matches
    const detectedLanguage = detectLanguage(query);
    console.log(`Detected query language: ${detectedLanguage}`);

    // Create the complete prompt with query, date, language, and search results
    const completePrompt = `
${summarizeSearchResultsPrompt(query, currentDate, detectedLanguage)}
<searchResults>
${formattedResults}
</searchResults>

Your response must be well-formatted in Markdown syntax. Use appropriate headers, bullet points,
and formatting. Ensure sentences are properly constructed and complete. Do not split words or
sentences mid-way. Output complete, coherent paragraphs with proper spacing.
`;

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are Athenius, an AI specialized in summarizing search results into comprehensive, well-structured content with proper citations. Always format your response in Markdown.'
      },
      { role: 'user', content: completePrompt }
    ];

    if (stream) {
      const response = await callLLM(messages, 0.7, true, llmProvider) as Response;
      const streamParser = getStreamParser(llmProvider || 'openai');

      // Track total output and actual usage from provider
      let totalOutput = '';
      let actualUsage: TokenUsage | undefined;
      const inputTokens = estimateTokens(completePrompt);

      // Create a ReadableStream for streaming the response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamParser(response)) {
              if (chunk.type === 'content' && chunk.content) {
                totalOutput += chunk.content;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: chunk.content, done: false })}\n\n`));
              } else if (chunk.type === 'usage' && chunk.usage) {
                // Capture actual usage from provider
                actualUsage = chunk.usage;
              }
            }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: '', done: true })}\n\n`));
            controller.close();

            // Cache the completed synthesis result
            setToCache(cacheKey, 'summary', query, { content: totalOutput }, llmProvider, supabase)
              .catch(err => console.error('Failed to cache synthesis:', err));

            // Track API usage after stream completes (prefer actual usage from provider)
            const outputTokens = estimateTokens(totalOutput);
            trackServerApiUsage({
              provider: llmProvider || 'auto',
              tokens_used: inputTokens + outputTokens,
              request_type: 'summarize',
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
    } else {
      const result = await callLLM(messages, 0.7, false, llmProvider) as LLMResponse;

      // Track API usage (non-streaming) - prefer actual usage from provider
      const inputTokens = estimateTokens(completePrompt);
      const outputTokens = estimateTokens(result.content);
      trackServerApiUsage({
        provider: llmProvider || 'auto',
        tokens_used: inputTokens + outputTokens,
        request_type: 'summarize',
        actual_usage: result.usage
      }).catch(err => console.error('Failed to track API usage:', err));

      return NextResponse.json({ summary: result.content });
    }
  } catch (error) {
    console.error('Error in summarize API:', error);
    return NextResponse.json(
      { error: 'Failed to summarize search results' },
      { status: 500 }
    );
  }
}
