import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMProvider, getStreamParser, LLMResponse, TokenUsage } from '@/lib/api-utils';
import { proofreadContentPrompt, proofreadParagraphPrompt, researchProofreadPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { trackServerApiUsage, estimateTokens } from '@/lib/supabase/usage-tracking';

/**
 * Lightweight text cleanup without LLM
 * Fixes common formatting issues quickly
 */
function quickCleanup(text: string): string {
  let cleaned = text;

  // Convert adjacent bracket citations [1][2] to comma-separated [1, 2]
  cleaned = cleaned.replace(/\](\s*)\[(\d+)/g, ', $2');

  // Remove gibberish patterns (random alphanumeric strings in brackets)
  cleaned = cleaned.replace(/\[[A-Za-z0-9_-]{20,}\]/g, '');

  // Fix broken markdown links - convert [text](url) mid-sentence to just text
  cleaned = cleaned.replace(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g, '$1');

  // Remove raw URLs that appear in text
  cleaned = cleaned.replace(/(?<![(\[])(https?:\/\/[^\s<>\])"]+)(?![)\]])/g, '');

  // Fix unclosed bold markers
  const boldCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    // Find the last ** and remove it if unclosed
    const lastBold = cleaned.lastIndexOf('**');
    if (lastBold !== -1) {
      cleaned = cleaned.slice(0, lastBold) + cleaned.slice(lastBold + 2);
    }
  }

  // Fix unclosed italic markers (single *)
  // This is tricky because * can be used for lists
  const lines = cleaned.split('\n');
  cleaned = lines.map(line => {
    // Skip list items
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || /^\d+\.\s/.test(line.trim())) {
      return line;
    }
    // Count single * that are for italics (not ** for bold)
    const italicMatches = line.match(/(?<!\*)\*(?!\*)/g) || [];
    if (italicMatches.length % 2 !== 0) {
      // Remove the last unmatched *
      const lastItalic = line.lastIndexOf('*');
      if (lastItalic !== -1 && line[lastItalic - 1] !== '*' && line[lastItalic + 1] !== '*') {
        line = line.slice(0, lastItalic) + line.slice(lastItalic + 1);
      }
    }
    return line;
  }).join('\n');

  // Fix headers that don't have space after #
  cleaned = cleaned.replace(/^(#{1,6})([^#\s])/gm, '$1 $2');

  // Ensure headers have blank lines before them (except at start)
  cleaned = cleaned.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

  // Remove multiple consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from each line
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

  // Ensure proper ending
  cleaned = cleaned.trim();

  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const { content, mode = 'quick', provider, paragraphIndex, stream = false } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content parameter is required and must be a string' },
        { status: 400 }
      );
    }

    // Quick mode: just use regex-based cleanup
    if (mode === 'quick') {
      const cleaned = quickCleanup(content);
      return NextResponse.json({
        proofread: cleaned,
        mode: 'quick',
        paragraphIndex
      });
    }

    // Paragraph mode: lightweight LLM proofreading for a single paragraph
    if (mode === 'paragraph') {
      const messages: OpenAIMessage[] = [
        {
          role: 'system',
          content: proofreadParagraphPrompt()
        },
        {
          role: 'user',
          content: content
        }
      ];

      const result = await callLLM(messages, 0.2, false, llmProvider) as LLMResponse;

      // Track API usage
      const inputTokens = estimateTokens(content);
      const outputTokens = estimateTokens(result.content);
      trackServerApiUsage({
        provider: llmProvider || 'auto',
        tokens_used: inputTokens + outputTokens,
        request_type: 'proofread',
        actual_usage: result.usage
      }).catch(err => console.error('Failed to track API usage:', err));

      return NextResponse.json({
        proofread: result.content,
        mode: 'paragraph',
        paragraphIndex
      });
    }

    // Research mode: specialized proofreading for research documents
    if (mode === 'research') {
      const prompt = `Please proofread and polish the following research document:\n\n${content}`;
      const messages: OpenAIMessage[] = [
        {
          role: 'system',
          content: researchProofreadPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const result = await callLLM(messages, 0.3, false, llmProvider) as LLMResponse;

      // Track API usage
      const inputTokens = estimateTokens(prompt);
      const outputTokens = estimateTokens(result.content);
      trackServerApiUsage({
        provider: llmProvider || 'auto',
        tokens_used: inputTokens + outputTokens,
        request_type: 'proofread',
        actual_usage: result.usage
      }).catch(err => console.error('Failed to track API usage:', err));

      return NextResponse.json({
        proofread: result.content,
        mode: 'research',
        paragraphIndex
      });
    }

    // Full mode: use LLM for thorough proofreading of entire content
    const prompt = `Please proofread and clean up the following content:\n\n${content}`;
    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: proofreadContentPrompt()
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    // Streaming mode for full proofreading
    if (stream && mode === 'full') {
      const response = await callLLM(messages, 0.3, true, llmProvider) as Response;
      const streamParser = getStreamParser(llmProvider || 'deepseek');

      // Track total output and actual usage
      let totalOutput = '';
      let actualUsage: TokenUsage | undefined;
      const inputTokens = estimateTokens(prompt);

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
              request_type: 'proofread',
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
    }

    // Non-streaming mode
    const result = await callLLM(messages, 0.3, false, llmProvider) as LLMResponse;

    // Track API usage
    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(result.content);
    trackServerApiUsage({
      provider: llmProvider || 'auto',
      tokens_used: inputTokens + outputTokens,
      request_type: 'proofread',
      actual_usage: result.usage
    }).catch(err => console.error('Failed to track API usage:', err));

    return NextResponse.json({
      proofread: result.content,
      mode: 'full',
      paragraphIndex
    });
  } catch (error) {
    console.error('Error in proofread API:', error);
    return NextResponse.json(
      { error: 'Failed to proofread content' },
      { status: 500 }
    );
  }
}
