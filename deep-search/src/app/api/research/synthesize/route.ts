import { NextRequest, NextResponse } from 'next/server';
import {
  callLLM,
  getCurrentDate,
  getStreamParser,
  LLMProvider,
  detectLanguage
} from '@/lib/api-utils';
import { researchSynthesizerPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

interface SearchResultItem {
  title: string;
  url: string;
  content: string;
}

interface AspectSearchResults {
  aspect: string;
  query: string;
  results: SearchResultItem[];
}

function formatResearchResultsForSynthesis(
  aspectResults: AspectSearchResults[],
  globalSourceIndex: Map<string, number>
): string {
  let formatted = '';

  for (const aspectResult of aspectResults) {
    formatted += `<researchAspect name="${aspectResult.aspect}" query="${aspectResult.query}">\n`;

    for (const result of aspectResult.results) {
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

    formatted += `</researchAspect>\n\n`;
  }

  return formatted;
}

export async function POST(req: NextRequest) {
  try {
    const { query, aspectResults, stream = true, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query || !aspectResults || !Array.isArray(aspectResults)) {
      return NextResponse.json(
        { error: 'Query and aspectResults parameters are required' },
        { status: 400 }
      );
    }

    const currentDate = getCurrentDate();

    // Detect language from the query to ensure response matches
    const detectedLanguage = detectLanguage(query);
    console.log(`Detected research topic language: ${detectedLanguage}`);

    // Build a global source index map to ensure consistent citation numbers
    const globalSourceIndex = new Map<string, number>();
    const formattedResults = formatResearchResultsForSynthesis(aspectResults, globalSourceIndex);

    // Create the complete prompt
    const completePrompt = `
${researchSynthesizerPrompt(query, currentDate, detectedLanguage)}

<researchData>
${formattedResults}
</researchData>

Important: You have been provided search results from ${aspectResults.length} different research angles.
Synthesize ALL the information into a comprehensive research document.
Use the source index numbers [1], [2], etc. as shown in the results for your citations.
Your response must be well-formatted in Markdown syntax with proper headers, sections, and formatting.
Target length: 600-800 words for comprehensive coverage.
`;

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are a research synthesis expert. You create comprehensive, well-organized research documents from multiple search results covering different aspects of a topic. Always format your response in Markdown with proper citations.'
      },
      { role: 'user', content: completePrompt }
    ];

    if (stream) {
      const response = await callLLM(messages, 0.7, true, llmProvider);
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
      const synthesis = await callLLM(messages, 0.7, false, llmProvider);
      return NextResponse.json({ synthesis });
    }
  } catch (error) {
    console.error('Error in research synthesize API:', error);
    return NextResponse.json(
      { error: 'Failed to synthesize research results' },
      { status: 500 }
    );
  }
}
