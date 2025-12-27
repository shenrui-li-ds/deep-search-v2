import {
  refineSearchQueryPrompt,
  summarizeSearchResultsPrompt,
  proofreadContentPrompt,
  proofreadParagraphPrompt,
  researchPlannerPrompt,
  researchSynthesizerPrompt,
  researchProofreadPrompt,
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

    it('has proper XML structure', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<summarizeSearchResults>');
      expect(prompt).toContain('</summarizeSearchResults>');
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

    it('limits to 2-4 search queries', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('2-4 distinct search queries');
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
      expect(prompt).toContain('600-800 words');
    });

    it('includes citation format rules', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1], [2], [3] format');
      expect(prompt).toContain('citationRules');
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
  });

  describe('researchProofreadPrompt', () => {
    it('includes editorial tasks', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('logical flow between sections');
      expect(prompt).toContain('Improve transitions');
      expect(prompt).toContain('consistent terminology');
    });

    it('includes research-specific preserve rules', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('Do NOT shorten explanations');
      expect(prompt).toContain('depth is intentional');
      expect(prompt).toContain('Do NOT simplify technical content');
    });

    it('includes Key Takeaways verification', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('Key Takeaways section');
    });

    it('has proper XML structure', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<researchProofread>');
      expect(prompt).toContain('</researchProofread>');
      expect(prompt).toContain('<editorialTasks>');
      expect(prompt).toContain('<preserveRules>');
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
});
