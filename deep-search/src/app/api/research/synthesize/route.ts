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
import { AspectExtraction } from '../extract/route';

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

// Format raw search results for synthesis (legacy mode)
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

// Format structured extractions for synthesis (new mode)
function formatExtractionsForSynthesis(extractions: AspectExtraction[]): string {
  let formatted = '';

  for (const extraction of extractions) {
    formatted += `<aspectExtraction name="${extraction.aspect}">\n`;

    // Key insight summary
    if (extraction.keyInsight) {
      formatted += `  <keyInsight>${extraction.keyInsight}</keyInsight>\n`;
    }

    // Claims
    if (extraction.claims && extraction.claims.length > 0) {
      formatted += `  <claims>\n`;
      for (const claim of extraction.claims) {
        formatted += `    <claim sources="[${claim.sources.join(', ')}]" confidence="${claim.confidence}">${claim.statement}</claim>\n`;
      }
      formatted += `  </claims>\n`;
    }

    // Statistics
    if (extraction.statistics && extraction.statistics.length > 0) {
      formatted += `  <statistics>\n`;
      for (const stat of extraction.statistics) {
        formatted += `    <stat source="[${stat.source}]"${stat.year ? ` year="${stat.year}"` : ''}>${stat.metric}: ${stat.value}</stat>\n`;
      }
      formatted += `  </statistics>\n`;
    }

    // Definitions
    if (extraction.definitions && extraction.definitions.length > 0) {
      formatted += `  <definitions>\n`;
      for (const def of extraction.definitions) {
        formatted += `    <definition term="${def.term}" source="[${def.source}]">${def.definition}</definition>\n`;
      }
      formatted += `  </definitions>\n`;
    }

    // Expert opinions
    if (extraction.expertOpinions && extraction.expertOpinions.length > 0) {
      formatted += `  <expertOpinions>\n`;
      for (const opinion of extraction.expertOpinions) {
        formatted += `    <opinion expert="${opinion.expert}" source="[${opinion.source}]">${opinion.opinion}</opinion>\n`;
      }
      formatted += `  </expertOpinions>\n`;
    }

    // Contradictions
    if (extraction.contradictions && extraction.contradictions.length > 0) {
      formatted += `  <contradictions>\n`;
      for (const contra of extraction.contradictions) {
        formatted += `    <contradiction sources="[${contra.sources.join(', ')}]">\n`;
        formatted += `      <view1>${contra.claim1}</view1>\n`;
        formatted += `      <view2>${contra.claim2}</view2>\n`;
        formatted += `    </contradiction>\n`;
      }
      formatted += `  </contradictions>\n`;
    }

    formatted += `</aspectExtraction>\n\n`;
  }

  return formatted;
}

export async function POST(req: NextRequest) {
  try {
    const { query, aspectResults, extractedData, stream = true, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    // Support both old format (aspectResults) and new format (extractedData)
    const hasExtractedData = extractedData && Array.isArray(extractedData) && extractedData.length > 0;
    const hasAspectResults = aspectResults && Array.isArray(aspectResults) && aspectResults.length > 0;

    if (!query || (!hasExtractedData && !hasAspectResults)) {
      return NextResponse.json(
        { error: 'Query and either extractedData or aspectResults parameters are required' },
        { status: 400 }
      );
    }

    const currentDate = getCurrentDate();

    // Detect language from the query to ensure response matches
    const detectedLanguage = detectLanguage(query);
    console.log(`Detected research topic language: ${detectedLanguage}`);

    let formattedData: string;
    let dataDescription: string;
    let systemPrompt: string;

    if (hasExtractedData) {
      // New mode: structured extractions
      formattedData = formatExtractionsForSynthesis(extractedData);
      dataDescription = `You have been provided structured extractions from ${extractedData.length} different research aspects.
Each extraction contains pre-analyzed claims, statistics, definitions, expert opinions, and contradictions.
Synthesize this structured knowledge into a comprehensive research document.
Use the source index numbers [1], [2], etc. as shown in the extractions for your citations.
Address any contradictions by presenting multiple perspectives fairly.
Use HTML <details> tags for technical deep-dives as instructed in the prompt.`;
      systemPrompt = 'You are a research synthesis expert. You create comprehensive, well-organized research documents from structured knowledge extractions. Format your response in Markdown with proper citations. Use HTML details/summary tags for collapsible technical sections.';
    } else {
      // Legacy mode: raw search results
      const globalSourceIndex = new Map<string, number>();
      formattedData = formatResearchResultsForSynthesis(aspectResults, globalSourceIndex);
      dataDescription = `You have been provided search results from ${aspectResults.length} different research angles.
Synthesize ALL the information into a comprehensive research document.
Use the source index numbers [1], [2], etc. as shown in the results for your citations.`;
      systemPrompt = 'You are a research synthesis expert. You create comprehensive, well-organized research documents from multiple search results covering different aspects of a topic. Always format your response in Markdown with proper citations.';
    }

    // Create the complete prompt
    const completePrompt = `
${researchSynthesizerPrompt(query, currentDate, detectedLanguage)}

<researchData>
${formattedData}
</researchData>

${dataDescription}
Your response must be well-formatted in Markdown syntax with proper headers, sections, and formatting.
Target length: 700-900 words for comprehensive coverage.
`;

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: systemPrompt
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
