import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, LLMProvider, detectLanguage, LLMResponse } from '@/lib/api-utils';
import { brainstormReframePrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { trackServerApiUsage, estimateTokens } from '@/lib/supabase/usage-tracking';

export interface ReframeItem {
  angle: string;
  query: string;
}

export interface BrainstormReframeResponse {
  originalQuery: string;
  angles: ReframeItem[];
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

    const currentDate = getCurrentDate();
    const detectedLanguage = detectLanguage(query);
    console.log(`Detected brainstorm query language: ${detectedLanguage}`);
    const prompt = brainstormReframePrompt(query, currentDate);

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are a creative thinking expert who excels at lateral thinking and cross-domain inspiration. Generate unexpected angles to explore a topic.'
      },
      { role: 'user', content: prompt }
    ];

    const result = await callLLM(messages, 0.8, false, llmProvider) as LLMResponse;

    // Track API usage
    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(result.content);
    trackServerApiUsage({
      provider: llmProvider || 'auto',
      tokens_used: inputTokens + outputTokens,
      request_type: 'plan',
      actual_usage: result.usage
    }).catch(err => console.error('Failed to track API usage:', err));

    // Parse the JSON response
    let angles: ReframeItem[] = [];
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = result.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      angles = JSON.parse(jsonStr);

      // Validate the angles structure
      if (!Array.isArray(angles) || angles.length === 0) {
        throw new Error('Invalid angles format');
      }

      // Ensure each item has angle and query
      angles = angles.filter(item => item.angle && item.query);

      // Limit to 5 search queries max
      if (angles.length > 5) {
        angles = angles.slice(0, 5);
      }
    } catch (parseError) {
      console.error('Failed to parse brainstorm angles:', parseError);
      // Fallback: use the original query as a single search with a creative angle
      angles = [{ angle: 'direct', query: query }];
    }

    return NextResponse.json({
      originalQuery: query,
      angles
    } as BrainstormReframeResponse);

  } catch (error) {
    console.error('Error in brainstorm reframe API:', error);
    return NextResponse.json(
      { error: 'Failed to generate creative angles' },
      { status: 500 }
    );
  }
}
