import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMProvider } from '@/lib/api-utils';
import { gapAnalyzerPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';

export type GapType =
  | 'missing_perspective'
  | 'needs_verification'
  | 'missing_practical'
  | 'needs_recency'
  | 'missing_comparison'
  | 'missing_expert';

export interface ResearchGap {
  type: GapType;
  gap: string;
  query: string;
  importance: 'high' | 'medium';
}

export interface AnalyzeGapsResponse {
  gaps: ResearchGap[];
  hasGaps: boolean;
}

// Simplified extraction data for gap analysis
interface ExtractedAspect {
  aspect: string;
  keyInsight?: string;
  claims?: Array<{ statement: string }>;
}

function summarizeExtractedData(extractedData: ExtractedAspect[]): string {
  // Create a concise summary of what was extracted for the gap analyzer
  const summaries = extractedData.map(aspect => {
    const claimCount = aspect.claims?.length || 0;
    const insight = aspect.keyInsight || 'No key insight';
    return `- ${aspect.aspect}: ${claimCount} claims extracted. Key insight: ${insight}`;
  });

  return summaries.join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { query, extractedData, language, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query || !extractedData) {
      return NextResponse.json(
        { error: 'Query and extractedData are required' },
        { status: 400 }
      );
    }

    // Summarize the extracted data for the prompt
    const extractedSummary = summarizeExtractedData(extractedData);

    // Build the prompt
    const prompt = gapAnalyzerPrompt(query, extractedSummary, language || 'English');

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are a research gap analyst. Analyze research data and identify critical gaps. Be selective - only identify truly important gaps. Output valid JSON only.'
      },
      {
        role: 'user',
        content: `${prompt}\n\n<extractedResearchData>\n${extractedSummary}\n</extractedResearchData>`
      }
    ];

    // Use low temperature for analytical task
    const response = await callLLM(messages, 0.4, false, llmProvider);

    // Parse the JSON response
    let gaps: ResearchGap[] = [];
    try {
      let jsonStr = response.trim();

      // Extract from markdown code block if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      // Validate it's an array
      if (!Array.isArray(parsed)) {
        console.warn('[Gap Analysis] Response is not an array, treating as no gaps');
        gaps = [];
      } else {
        // Filter and validate each gap
        gaps = parsed.filter((item: ResearchGap) =>
          item.type &&
          item.gap &&
          item.query &&
          item.importance
        );

        // Limit to 3 gaps max
        if (gaps.length > 3) {
          gaps = gaps.slice(0, 3);
        }
      }
    } catch (parseError) {
      console.error('[Gap Analysis] Failed to parse response:', parseError);
      console.error('[Gap Analysis] Raw response:', response);
      // On parse error, treat as no gaps (don't block the pipeline)
      gaps = [];
    }

    console.log(`[Gap Analysis] Found ${gaps.length} gaps for query: ${query.slice(0, 50)}`);

    const result: AnalyzeGapsResponse = {
      gaps,
      hasGaps: gaps.length > 0
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in gap analysis API:', error);
    // On error, return no gaps (fail-safe to not block pipeline)
    return NextResponse.json({
      gaps: [],
      hasGaps: false,
      error: 'Gap analysis failed, continuing without round 2'
    });
  }
}
