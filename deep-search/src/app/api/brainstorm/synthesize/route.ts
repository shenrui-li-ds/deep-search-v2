import { NextRequest, NextResponse } from 'next/server';
import {
  callLLM,
  getCurrentDate,
  getStreamParser,
  LLMProvider,
  detectLanguage
} from '@/lib/api-utils';
import { brainstormSynthesizerPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

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
      const response = await callLLM(messages, 0.8, true, llmProvider);
      const streamParser = getStreamParser(llmProvider || 'openai');

      // Create a ReadableStream for streaming the response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamParser(response)) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: chunk, done: false })}\n\n`));
            }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ data: '', done: true })}\n\n`));
            controller.close();
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
      const synthesis = await callLLM(messages, 0.8, false, llmProvider);
      return NextResponse.json({ synthesis });
    }
  } catch (error) {
    console.error('Error in brainstorm synthesize API:', error);
    return NextResponse.json(
      { error: 'Failed to synthesize brainstorm ideas' },
      { status: 500 }
    );
  }
}
