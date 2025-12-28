import { NextRequest, NextResponse } from 'next/server';
import {
  callLLM,
  getCurrentDate,
  formatSearchResultsForSummarization,
  getStreamParser,
  LLMProvider,
  detectLanguage
} from '@/lib/api-utils';
import { summarizeSearchResultsPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { query, results, stream = true, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'Query and results parameters are required' },
        { status: 400 }
      );
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
        content: 'You are DeepSearch, an AI specialized in summarizing search results into comprehensive, well-structured content with proper citations. Always format your response in Markdown.'
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
      const summary = await callLLM(messages, 0.7, false, llmProvider);
      return NextResponse.json({ summary });
    }
  } catch (error) {
    console.error('Error in summarize API:', error);
    return NextResponse.json(
      { error: 'Failed to summarize search results' },
      { status: 500 }
    );
  }
}
