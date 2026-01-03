import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMProvider, detectLanguage } from '@/lib/api-utils';
import { aspectExtractorPrompt } from '@/lib/prompts';
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

export interface ExtractedClaim {
  statement: string;
  sources: number[];
  confidence: 'established' | 'emerging' | 'contested';
}

export interface ExtractedStatistic {
  metric: string;
  value: string;
  source: number;
  year?: string;
}

export interface ExtractedDefinition {
  term: string;
  definition: string;
  source: number;
}

export interface ExtractedExpertOpinion {
  expert: string;
  opinion: string;
  source: number;
}

export interface ExtractedContradiction {
  claim1: string;
  claim2: string;
  sources: [number, number];
}

export interface AspectExtraction {
  aspect: string;
  claims: ExtractedClaim[];
  statistics: ExtractedStatistic[];
  definitions: ExtractedDefinition[];
  expertOpinions: ExtractedExpertOpinion[];
  contradictions: ExtractedContradiction[];
  keyInsight: string;
}

function formatSourcesForExtraction(
  results: SearchResultItem[],
  globalSourceIndex: Map<string, number>
): string {
  let formatted = '';

  for (const result of results) {
    // Get or assign a global source index for this URL
    let sourceIndex = globalSourceIndex.get(result.url);
    if (sourceIndex === undefined) {
      sourceIndex = globalSourceIndex.size + 1;
      globalSourceIndex.set(result.url, sourceIndex);
    }

    formatted += `<source index="${sourceIndex}">
  <title>${result.title}</title>
  <url>${result.url}</url>
  <content>${result.content}</content>
</source>\n\n`;
  }

  return formatted;
}

export async function POST(req: NextRequest) {
  try {
    const { query, aspectResult, globalSourceIndex, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query || !aspectResult) {
      return NextResponse.json(
        { error: 'Query and aspectResult parameters are required' },
        { status: 400 }
      );
    }

    // Detect language from the query
    const detectedLanguage = detectLanguage(query);

    // Reconstruct the global source index map
    const sourceIndexMap = new Map<string, number>(
      Object.entries(globalSourceIndex || {}).map(([url, idx]) => [url, idx as number])
    );

    // Format sources for extraction
    const formattedSources = formatSourcesForExtraction(
      aspectResult.results || [],
      sourceIndexMap
    );

    // Create the extraction prompt
    const prompt = aspectExtractorPrompt(aspectResult.aspect, query, detectedLanguage);

    const completePrompt = `
${prompt}

<searchResults>
${formattedSources}
</searchResults>

Extract structured knowledge from these search results for the "${aspectResult.aspect}" aspect of the research topic.
Return ONLY valid JSON matching the specified format.
`;

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'You are a research extraction agent. Extract structured facts from search results. Output only valid JSON.'
      },
      { role: 'user', content: completePrompt }
    ];

    const response = await callLLM(messages, 0.3, false, llmProvider); // Lower temperature for factual extraction

    // Parse the JSON response
    let extraction: AspectExtraction;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = response.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      extraction = JSON.parse(jsonStr);

      // Validate and provide defaults for missing fields
      extraction = {
        aspect: extraction.aspect || aspectResult.aspect,
        claims: Array.isArray(extraction.claims) ? extraction.claims : [],
        statistics: Array.isArray(extraction.statistics) ? extraction.statistics : [],
        definitions: Array.isArray(extraction.definitions) ? extraction.definitions : [],
        expertOpinions: Array.isArray(extraction.expertOpinions) ? extraction.expertOpinions : [],
        contradictions: Array.isArray(extraction.contradictions) ? extraction.contradictions : [],
        keyInsight: extraction.keyInsight || ''
      };
    } catch (parseError) {
      console.error('Failed to parse extraction JSON:', parseError);
      // Return a minimal valid extraction on parse error
      extraction = {
        aspect: aspectResult.aspect,
        claims: [],
        statistics: [],
        definitions: [],
        expertOpinions: [],
        contradictions: [],
        keyInsight: 'Extraction failed - using raw data'
      };
    }

    // Return updated source index map along with extraction
    const updatedSourceIndex = Object.fromEntries(sourceIndexMap);

    return NextResponse.json({
      extraction,
      updatedSourceIndex
    });

  } catch (error) {
    console.error('Error in research extract API:', error);
    return NextResponse.json(
      { error: 'Failed to extract research data' },
      { status: 500 }
    );
  }
}
