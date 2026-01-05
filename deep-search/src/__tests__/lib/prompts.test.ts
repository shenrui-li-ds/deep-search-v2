import {
  refineSearchQueryPrompt,
  summarizeSearchResultsPrompt,
  proofreadContentPrompt,
  proofreadParagraphPrompt,
  researchPlannerPrompt,
  researchSynthesizerPrompt,
  researchProofreadPrompt,
  brainstormReframePrompt,
  brainstormSynthesizerPrompt,
  generateRelatedSearchesPrompt,
} from '@/lib/prompts';

describe('Prompts', () => {
  describe('refineSearchQueryPrompt', () => {
    it('includes the search term', () => {
      const prompt = refineSearchQueryPrompt('test query', 'December 27, 2024');
      expect(prompt).toContain('test query');
    });

    it('includes the current date', () => {
      const prompt = refineSearchQueryPrompt('test query', 'December 27, 2024');
      expect(prompt).toContain('December 27, 2024');
    });

    it('has proper XML structure', () => {
      const prompt = refineSearchQueryPrompt('test', 'date');
      expect(prompt).toContain('<refineSearchQuery>');
      expect(prompt).toContain('</refineSearchQuery>');
      expect(prompt).toContain('<rules>');
      expect(prompt).toContain('<examples>');
    });

    it('specifies JSON output format with intent and query', () => {
      const prompt = refineSearchQueryPrompt('test', 'date');
      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('"intent"');
      expect(prompt).toContain('"query"');
      expect(prompt).toContain('{"intent": "...", "query": "..."}');
    });

    it('includes examples with intent field', () => {
      const prompt = refineSearchQueryPrompt('test', 'date');
      expect(prompt).toContain('<intent>');
      expect(prompt).toContain('</intent>');
      expect(prompt).toContain('Looking up');
      expect(prompt).toContain('Searching for');
    });
  });

  describe('summarizeSearchResultsPrompt', () => {
    it('includes the query', () => {
      const prompt = summarizeSearchResultsPrompt('quantum computing', 'December 27, 2024');
      expect(prompt).toContain('quantum computing');
    });

    it('includes citation format rules', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('[1]');
      expect(prompt).toContain('[2]');
      expect(prompt).toContain('citationFormat');
    });

    it('specifies comma-separated format for multiple citations', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('[1, 2]');
      expect(prompt).toContain('COMMA-SEPARATED');
      expect(prompt).toContain('DO NOT use adjacent brackets like [1][2]');
    });

    it('has proper XML structure', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<summarizeSearchResults>');
      expect(prompt).toContain('</summarizeSearchResults>');
    });

    it('includes responseLanguage field in context', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date', 'English');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes critical language requirement section', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date', 'Chinese');
      expect(prompt).toContain('<CRITICAL_LANGUAGE_REQUIREMENT>');
      expect(prompt).toContain('You MUST write your ENTIRE response in Chinese');
      expect(prompt).toContain('DO NOT mix languages');
    });

    it('uses provided language parameter in enforcement', () => {
      const englishPrompt = summarizeSearchResultsPrompt('test', 'date', 'English');
      expect(englishPrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: English');

      const chinesePrompt = summarizeSearchResultsPrompt('test', 'date', 'Chinese');
      expect(chinesePrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: Chinese');
    });

    it('defaults to English when language not specified', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes LaTeX math instructions for STEM topics', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<mathAndScience>');
      expect(prompt).toContain('LaTeX notation');
      expect(prompt).toContain('$E = mc^2$');
      expect(prompt).toContain('$$');
    });

    it('provides LaTeX syntax examples', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('\\frac{');
      expect(prompt).toContain('\\sqrt{');
      expect(prompt).toContain('\\int');
      expect(prompt).toContain('\\sum');
    });
  });

  describe('proofreadContentPrompt', () => {
    it('includes proofreading tasks', () => {
      const prompt = proofreadContentPrompt();
      expect(prompt).toContain('Fix any grammar or spelling errors');
      expect(prompt).toContain('Fix broken markdown formatting');
      expect(prompt).toContain('Remove any gibberish');
    });

    it('includes preserve rules', () => {
      const prompt = proofreadContentPrompt();
      expect(prompt).toContain('Keep all factual content');
      expect(prompt).toContain('Do NOT add new information');
    });

    it('has proper XML structure', () => {
      const prompt = proofreadContentPrompt();
      expect(prompt).toContain('<proofreadContent>');
      expect(prompt).toContain('</proofreadContent>');
    });
  });

  describe('proofreadParagraphPrompt', () => {
    it('includes quick fixes', () => {
      const prompt = proofreadParagraphPrompt();
      expect(prompt).toContain('Grammar and spelling errors');
      expect(prompt).toContain('Broken markdown');
    });

    it('has proper XML structure', () => {
      const prompt = proofreadParagraphPrompt();
      expect(prompt).toContain('<proofreadParagraph>');
      expect(prompt).toContain('</proofreadParagraph>');
    });
  });

  describe('researchPlannerPrompt', () => {
    it('includes the research topic', () => {
      const prompt = researchPlannerPrompt('machine learning', 'December 27, 2024');
      expect(prompt).toContain('machine learning');
    });

    it('includes the current date', () => {
      const prompt = researchPlannerPrompt('test', 'December 27, 2024');
      expect(prompt).toContain('December 27, 2024');
    });

    it('specifies output format as JSON array', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"aspect"');
      expect(prompt).toContain('"query"');
    });

    it('limits to 3-4 search queries', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('3-4 distinct search queries');
    });

    it('has proper XML structure', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('<researchPlanner>');
      expect(prompt).toContain('</researchPlanner>');
      expect(prompt).toContain('<task>');
      expect(prompt).toContain('<rules>');
      expect(prompt).toContain('<examples>');
    });

    it('includes language preservation rule', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('PRESERVE the original language');
    });
  });

  describe('researchSynthesizerPrompt', () => {
    it('includes the research topic', () => {
      const prompt = researchSynthesizerPrompt('quantum computing', 'December 27, 2024');
      expect(prompt).toContain('quantum computing');
    });

    it('includes the current date', () => {
      const prompt = researchSynthesizerPrompt('test', 'December 27, 2024');
      expect(prompt).toContain('December 27, 2024');
    });

    it('specifies comprehensive depth requirements', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Explain concepts thoroughly');
      expect(prompt).toContain('4-6 sentences');
      expect(prompt).toContain('multiple perspectives');
    });

    it('includes synthesis requirements', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Integrate information from ALL');
      expect(prompt).toContain('Cross-reference');
      expect(prompt).toContain('consensus views');
    });

    it('specifies target word count', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('800-1000 words');
    });

    it('includes citation format rules', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1], [2], [3] format');
      expect(prompt).toContain('citationRules');
    });

    it('specifies comma-separated format for multiple citations', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1, 2]');
      expect(prompt).toContain('NOT adjacent brackets [1][2]');
    });

    it('has proper XML structure', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<researchSynthesizer>');
      expect(prompt).toContain('</researchSynthesizer>');
      expect(prompt).toContain('<requirements>');
      expect(prompt).toContain('<structure>');
      expect(prompt).toContain('<formatting>');
    });

    it('includes Key Takeaways section requirement', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Key Takeaways');
      expect(prompt).toContain('5-7 bullet points');
    });

    it('includes responseLanguage field in context', () => {
      const prompt = researchSynthesizerPrompt('test', 'date', 'English');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes critical language requirement section', () => {
      const prompt = researchSynthesizerPrompt('test', 'date', 'Chinese');
      expect(prompt).toContain('<CRITICAL_LANGUAGE_REQUIREMENT>');
      expect(prompt).toContain('You MUST write your ENTIRE response in Chinese');
      expect(prompt).toContain('DO NOT mix languages');
    });

    it('uses provided language parameter in enforcement', () => {
      const englishPrompt = researchSynthesizerPrompt('test', 'date', 'English');
      expect(englishPrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: English');

      const japanesePrompt = researchSynthesizerPrompt('test', 'date', 'Japanese');
      expect(japanesePrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: Japanese');
    });

    it('defaults to English when language not specified', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes LaTeX math instructions for STEM topics', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<mathAndScience>');
      expect(prompt).toContain('LaTeX notation');
      expect(prompt).toContain('$E = mc^2$');
      expect(prompt).toContain('$$');
    });

    it('provides LaTeX syntax examples', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('\\frac{');
      expect(prompt).toContain('\\sqrt{');
      expect(prompt).toContain('\\int');
      expect(prompt).toContain('\\sum');
    });
  });

  describe('researchProofreadPrompt', () => {
    it('is minimal and focuses only on typos and grammar', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('minimal copy editor');
      expect(prompt).toContain('fix typos and obvious grammar errors');
    });

    it('includes allowed edits', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<allowedEdits>');
      expect(prompt).toContain('Fix spelling mistakes');
      expect(prompt).toContain('Fix obvious grammar errors');
      expect(prompt).toContain('Fix punctuation errors');
    });

    it('includes strict prohibitions against content changes', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<strictProhibitions>');
      expect(prompt).toContain('Do NOT rephrase or reword');
      expect(prompt).toContain('Do NOT restructure');
      expect(prompt).toContain('Do NOT remove ANY content');
      expect(prompt).toContain('Do NOT shorten or condense');
    });

    it('includes length requirement', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<lengthRequirement>');
      expect(prompt).toContain('at least 95% of the input length');
    });

    it('has proper XML structure', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<researchProofread>');
      expect(prompt).toContain('</researchProofread>');
    });
  });

  describe('generateRelatedSearchesPrompt', () => {
    it('includes the original query', () => {
      const prompt = generateRelatedSearchesPrompt('machine learning', 'AI, neural networks');
      expect(prompt).toContain('machine learning');
    });

    it('includes key topics', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topic1, topic2');
      expect(prompt).toContain('topic1, topic2');
    });

    it('specifies diversity requirements', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topics');
      expect(prompt).toContain('deeper');
      expect(prompt).toContain('related');
      expect(prompt).toContain('comparison');
      expect(prompt).toContain('practical');
    });

    it('includes language preservation rule', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topics');
      expect(prompt).toContain('PRESERVE the language');
    });

    it('has proper XML structure', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topics');
      expect(prompt).toContain('<generateRelatedSearches>');
      expect(prompt).toContain('</generateRelatedSearches>');
      expect(prompt).toContain('<diversityRequirements>');
      expect(prompt).toContain('<examples>');
    });
  });

  describe('brainstormReframePrompt', () => {
    it('includes the topic', () => {
      const prompt = brainstormReframePrompt('remote meetings', 'December 31, 2024');
      expect(prompt).toContain('remote meetings');
    });

    it('includes the current date', () => {
      const prompt = brainstormReframePrompt('test', 'December 31, 2024');
      expect(prompt).toContain('December 31, 2024');
    });

    it('specifies lateral thinking approaches', () => {
      const prompt = brainstormReframePrompt('test', 'date');
      expect(prompt).toContain('lateral thinking');
      expect(prompt).toContain('cross-domain');
      expect(prompt).toContain('contrarian');
    });

    it('specifies output format as JSON array', () => {
      const prompt = brainstormReframePrompt('test', 'date');
      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"angle"');
      expect(prompt).toContain('"query"');
    });

    it('has proper XML structure', () => {
      const prompt = brainstormReframePrompt('test', 'date');
      expect(prompt).toContain('<brainstormReframe>');
      expect(prompt).toContain('</brainstormReframe>');
      expect(prompt).toContain('<creativePrinciples>');
    });
  });

  describe('brainstormSynthesizerPrompt', () => {
    it('includes the original challenge', () => {
      const prompt = brainstormSynthesizerPrompt('improve team productivity', 'December 31, 2024');
      expect(prompt).toContain('improve team productivity');
    });

    it('includes the current date', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'December 31, 2024');
      expect(prompt).toContain('December 31, 2024');
    });

    it('specifies creative mindset principles', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Yes, and...');
      expect(prompt).toContain('novelty');
      expect(prompt).toContain('actionable');
    });

    it('includes citation format rules', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1], [2]');
      expect(prompt).toContain('citationRules');
    });

    it('specifies comma-separated format for multiple citations', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1, 2]');
      expect(prompt).toContain('NOT adjacent brackets [1][2]');
    });

    it('includes output structure with idea cards', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('idea cards');
      expect(prompt).toContain('Unexpected Connections');
      expect(prompt).toContain('Experiments to Try');
    });

    it('has proper XML structure', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<brainstormSynthesizer>');
      expect(prompt).toContain('</brainstormSynthesizer>');
      expect(prompt).toContain('<outputStructure>');
      expect(prompt).toContain('<toneGuidelines>');
    });

    it('includes language requirement', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date', 'Spanish');
      expect(prompt).toContain('<responseLanguage>Spanish</responseLanguage>');
      expect(prompt).toContain('CRITICAL_LANGUAGE_REQUIREMENT');
    });

    it('defaults to English when language not specified', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });
  });
});
