import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, getStreamParser, LLMProvider } from '@/lib/api-utils';
import { refineSearchQueryPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

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

    const currentDate = getCurrentDate();
    const prompt = refineSearchQueryPrompt(query, currentDate);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'You are DeepSearch, an AI specialized in refining search queries.' },
      { role: 'user', content: prompt }
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
      const refinedQuery = await callLLM(messages, 0.7, false, llmProvider);
      return NextResponse.json({ refinedQuery });
    }
  } catch (error) {
    console.error('Error in refine API:', error);
    return NextResponse.json(
      { error: 'Failed to refine search query' },
      { status: 500 }
    );
  }
}
