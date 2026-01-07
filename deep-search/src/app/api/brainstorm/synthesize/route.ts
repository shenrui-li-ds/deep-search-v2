import { NextRequest, NextResponse } from 'next/server';
import {
  callLLM,
  getCurrentDate,
  getStreamParser,
  LLMProvider,
  detectLanguage,
  TokenUsage,
  LLMResponse
} from '@/lib/api-utils';
import { brainstormSynthesizerPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { trackServerApiUsage, estimateTokens } from '@/lib/supabase/usage-tracking';

interface SynthesisCache {
  content: string;
}

interface SearchResultItem {
  title: string;
  url: string;
  content: string;
}

interface AngleSearchResults {
  angle: string;
  query: string;
  results: SearchResultItem[];
}

function formatBrainstormResultsForSynthesis(
  angleResults: AngleSearchResults[],
  globalSourceIndex: Map<string, number>
): string {
  let formatted = '';

  for (const angleResult of angleResults) {
    formatted += `<inspirationSource angle="${angleResult.angle}" searchQuery="${angleResult.query}">\n`;

    for (const result of angleResult.results) {
      // Get or assign a global source index for this URL
      let sourceIndex = globalSourceIndex.get(result.url);
      if (sourceIndex === undefined) {
        sourceIndex = globalSourceIndex.size + 1;
        globalSourceIndex.set(result.url, sourceIndex);
      }

      formatted += `  <source index="${sourceIndex}">
    <title>${result.title}</title>
    <url>${result.url}</url>
    <content>${result.content}</content>
  </source>\n`;
    }

    formatted += `</inspirationSource>\n\n`;
  }

  return formatted;
}

export async function POST(req: NextRequest) {
  try {
    const { query, angleResults, stream = true, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query || !angleResults || !Array.isArray(angleResults)) {
      return NextResponse.json(
        { error: 'Query and angleResults parameters are required' },
        { status: 400 }
      );
    }

    // Check synthesis cache
    const supabase = await createClient();
    const cacheKey = generateCacheKey('brainstorm-synthesis', {
      query,
      provider: llmProvider,
      angleResults
    });

    const { data: cachedData } = await getFromCache<SynthesisCache>(cacheKey, supabase);

    if (cachedData) {
      console.log(`[Brainstorm Synthesize] Cache HIT for query: ${query.slice(0, 50)}...`);

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
        return NextResponse.json({ synthesis: cachedData.content, cached: true });
      }
    }

    const currentDate = getCurrentDate();

    // Detect language from the query to ensure response matches
    const detectedLanguage = detectLanguage(query);
    console.log(`Detected brainstorm topic language: ${detectedLanguage}`);

    // Build a global source index map to ensure consistent citation numbers
    const globalSourceIndex = new Map<string, number>();
    const formattedResults = formatBrainstormResultsForSynthesis(angleResults, globalSourceIndex);

    // Create the complete prompt
    const completePrompt = `
${brainstormSynthesizerPrompt(query, currentDate, detectedLanguage)}

<crossDomainResearch>
${formattedResults}
</crossDomainResearch>

Important: You have been provided search results from ${angleResults.length} different creative angles/domains.
These are NOT direct research on the topic - they are inspiration sources from other domains.
Your job is to find unexpected connections and generate innovative ideas.
Use the source index numbers [1], [2], etc. as shown in the results for your citations.
Focus on actionable ideas and experiments, not just observations.
`;

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are a creative ideation expert who synthesizes cross-domain inspiration into innovative ideas. You think like a design thinker and innovation consultant. Be enthusiastic, generative, and focus on unexpected connections.'
      },
      { role: 'user', content: completePrompt }
    ];

    if (stream) {
      const response = await callLLM(messages, 0.8, true, llmProvider) as Response;
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
                actualUsage = chunk.usage;
              }
            }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: '', done: true })}\n\n`));
            controller.close();

            // Cache the completed synthesis result
            setToCache(cacheKey, 'brainstorm-synthesis', query, { content: totalOutput }, llmProvider, supabase)
              .catch(err => console.error('Failed to cache brainstorm synthesis:', err));

            // Track API usage after stream completes
            const outputTokens = estimateTokens(totalOutput);
            trackServerApiUsage({
              provider: llmProvider || 'auto',
              tokens_used: inputTokens + outputTokens,
              request_type: 'synthesize',
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
      const result = await callLLM(messages, 0.8, false, llmProvider) as LLMResponse;

      // Track API usage (non-streaming)
      const inputTokens = estimateTokens(completePrompt);
      const outputTokens = estimateTokens(result.content);
      trackServerApiUsage({
        provider: llmProvider || 'auto',
        tokens_used: inputTokens + outputTokens,
        request_type: 'synthesize',
        actual_usage: result.usage
      }).catch(err => console.error('Failed to track API usage:', err));

      return NextResponse.json({ synthesis: result.content });
    }
  } catch (error) {
    console.error('Error in brainstorm synthesize API:', error);
    return NextResponse.json(
      { error: 'Failed to synthesize brainstorm ideas' },
      { status: 500 }
    );
  }
}
