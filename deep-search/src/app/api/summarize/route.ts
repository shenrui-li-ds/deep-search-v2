import { NextRequest, NextResponse } from 'next/server';
import {
  callOpenAI,
  getCurrentDate,
  formatSearchResultsForSummarization,
  streamOpenAIResponse
} from '@/lib/api-utils';
import { summarizeSearchResultsPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { query, results, stream = true } = await req.json();

    if (!query || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: 'Query and results parameters are required' },
        { status: 400 }
      );
    }

    const currentDate = getCurrentDate();
    const formattedResults = formatSearchResultsForSummarization(results);
    
    // Create the complete prompt with query, date, and search results
    const completePrompt = `
${summarizeSearchResultsPrompt(query, currentDate)}
<searchResults>
${formattedResults}
</searchResults>
`;

    const messages: OpenAIMessage[] = [
      { 
        role: 'system', 
        content: 'You are DeepSearch, an AI specialized in summarizing search results into comprehensive, well-structured content with proper citations.'
      },
      { role: 'user', content: completePrompt }
    ];

    if (stream) {
      const response = await callOpenAI(messages, 'gpt-4o', 0.7, true);
      
      // Create a ReadableStream for streaming the response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamOpenAIResponse(response)) {
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
      const summary = await callOpenAI(messages, 'gpt-4o', 0.7, false);
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
