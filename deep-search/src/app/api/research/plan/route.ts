import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getCurrentDate, LLMProvider } from '@/lib/api-utils';
import { researchPlannerPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

export interface ResearchPlanItem {
  aspect: string;
  query: string;
}

export interface ResearchPlanResponse {
  originalQuery: string;
  plan: ResearchPlanItem[];
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
    const prompt = researchPlannerPrompt(query, currentDate);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: 'You are a research planning expert. You analyze topics and identify distinct research angles.' },
      { role: 'user', content: prompt }
    ];

    const response = await callLLM(messages, 0.7, false, llmProvider);

    // Parse the JSON response
    let plan: ResearchPlanItem[] = [];
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = response.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      plan = JSON.parse(jsonStr);

      // Validate the plan structure
      if (!Array.isArray(plan) || plan.length === 0) {
        throw new Error('Invalid plan format');
      }

      // Ensure each item has aspect and query
      plan = plan.filter(item => item.aspect && item.query);

      // Limit to 4 search queries max
      if (plan.length > 4) {
        plan = plan.slice(0, 4);
      }
    } catch (parseError) {
      console.error('Failed to parse research plan:', parseError);
      // Fallback: use the original query as a single search
      plan = [{ aspect: 'general', query: query }];
    }

    return NextResponse.json({
      originalQuery: query,
      plan
    } as ResearchPlanResponse);

  } catch (error) {
    console.error('Error in research plan API:', error);
    return NextResponse.json(
      { error: 'Failed to create research plan' },
      { status: 500 }
    );
  }
}
