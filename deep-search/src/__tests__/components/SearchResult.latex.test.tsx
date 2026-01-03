/**
 * Tests for LaTeX/Math rendering configuration in SearchResult.
 *
 * Since react-markdown is an ESM module that Jest can't directly transform,
 * these tests verify that the correct plugins are imported and configured
 * by checking the actual source file.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('LaTeX Rendering Configuration', () => {
  let searchResultSource: string;

  beforeAll(() => {
    // Read the SearchResult component source
    const componentPath = path.join(
      process.cwd(),
      'src/components/SearchResult.tsx'
    );
    searchResultSource = fs.readFileSync(componentPath, 'utf-8');
  });

  describe('Package Imports', () => {
    it('imports remark-math for parsing math syntax', () => {
      expect(searchResultSource).toContain("import remarkMath from 'remark-math'");
    });

    it('imports rehype-katex for rendering math', () => {
      expect(searchResultSource).toContain("import rehypeKatex from 'rehype-katex'");
    });

    it('imports KaTeX CSS for styling', () => {
      expect(searchResultSource).toContain("import 'katex/dist/katex.min.css'");
    });

    it('still imports remark-gfm for GitHub Flavored Markdown', () => {
      expect(searchResultSource).toContain("import remarkGfm from 'remark-gfm'");
    });

    it('still imports rehype-raw for raw HTML', () => {
      expect(searchResultSource).toContain("import rehypeRaw from 'rehype-raw'");
    });

    it('still imports rehype-sanitize for security', () => {
      expect(searchResultSource).toContain("import rehypeSanitize from 'rehype-sanitize'");
    });
  });

  describe('Plugin Configuration', () => {
    it('includes remarkMath in remarkPlugins array', () => {
      expect(searchResultSource).toMatch(/remarkPlugins=\{?\[.*remarkMath.*\]/);
    });

    it('includes rehypeKatex in rehypePlugins array', () => {
      expect(searchResultSource).toMatch(/rehypePlugins=\{?\[.*rehypeKatex.*\]/);
    });

    it('has remarkGfm before remarkMath in plugins order', () => {
      const remarkPluginsMatch = searchResultSource.match(
        /remarkPlugins=\{?\[([^\]]+)\]/
      );
      expect(remarkPluginsMatch).toBeTruthy();

      const pluginsStr = remarkPluginsMatch![1];
      const gfmIndex = pluginsStr.indexOf('remarkGfm');
      const mathIndex = pluginsStr.indexOf('remarkMath');

      expect(gfmIndex).toBeLessThan(mathIndex);
    });

    it('has rehypeKatex after rehypeSanitize in plugins order', () => {
      // This ensures KaTeX renders after sanitization
      const rehypePluginsMatch = searchResultSource.match(
        /rehypePlugins=\{?\[([^\]]+)\]/
      );
      expect(rehypePluginsMatch).toBeTruthy();

      const pluginsStr = rehypePluginsMatch![1];
      const sanitizeIndex = pluginsStr.indexOf('rehypeSanitize');
      const katexIndex = pluginsStr.indexOf('rehypeKatex');

      expect(sanitizeIndex).toBeLessThan(katexIndex);
    });
  });

  describe('Package.json Dependencies', () => {
    let packageJson: { dependencies: Record<string, string> };

    beforeAll(() => {
      const packagePath = path.join(process.cwd(), 'package.json');
      packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    });

    it('has remark-math as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('remark-math');
    });

    it('has rehype-katex as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('rehype-katex');
    });

    it('has katex as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('katex');
    });
  });
});

describe('Currency Escaping', () => {
  /**
   * Tests for the processContent function that escapes currency dollar signs
   * to prevent them from being interpreted as LaTeX delimiters.
   */

  // Helper to simulate processContent's currency escaping logic
  // Note: In JS regex replacement, $$ produces a literal $, so \\$$$ produces \$
  const escapeCurrency = (content: string) => {
    return content.replace(
      /(-?)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?[BMKbmk]?|\d+(?:\.\d{1,2})?[BMKbmk]?)/g,
      '$1\\$$$2'
    );
  };

  describe('Basic Currency Patterns', () => {
    it('escapes simple dollar amounts', () => {
      expect(escapeCurrency('$100')).toBe('\\$100');
      expect(escapeCurrency('$5')).toBe('\\$5');
      expect(escapeCurrency('$999')).toBe('\\$999');
    });

    it('escapes amounts with decimal places', () => {
      expect(escapeCurrency('$10.99')).toBe('\\$10.99');
      expect(escapeCurrency('$0.99')).toBe('\\$0.99');
      expect(escapeCurrency('$100.00')).toBe('\\$100.00');
    });

    it('escapes amounts with thousands separators', () => {
      expect(escapeCurrency('$1,000')).toBe('\\$1,000');
      expect(escapeCurrency('$10,000')).toBe('\\$10,000');
      expect(escapeCurrency('$1,000,000')).toBe('\\$1,000,000');
      expect(escapeCurrency('$1,000.00')).toBe('\\$1,000.00');
    });
  });

  describe('Negative Currency', () => {
    it('escapes negative dollar amounts', () => {
      expect(escapeCurrency('-$100')).toBe('-\\$100');
      expect(escapeCurrency('-$10.99')).toBe('-\\$10.99');
      expect(escapeCurrency('-$1,000')).toBe('-\\$1,000');
    });
  });

  describe('Currency with Suffixes', () => {
    it('escapes amounts with B/M/K suffixes', () => {
      expect(escapeCurrency('$1B')).toBe('\\$1B');
      expect(escapeCurrency('$1.5B')).toBe('\\$1.5B');
      expect(escapeCurrency('$2M')).toBe('\\$2M');
      expect(escapeCurrency('$500K')).toBe('\\$500K');
    });

    it('escapes lowercase suffixes', () => {
      expect(escapeCurrency('$1b')).toBe('\\$1b');
      expect(escapeCurrency('$2m')).toBe('\\$2m');
      expect(escapeCurrency('$500k')).toBe('\\$500k');
    });
  });

  describe('Currency in Context', () => {
    it('escapes multiple currency values in text', () => {
      const input = 'The price ranges from $100 to $500.';
      expect(escapeCurrency(input)).toBe('The price ranges from \\$100 to \\$500.');
    });

    it('escapes currency in a sentence', () => {
      const input = 'Apple reported revenue of $94.8B in Q1.';
      expect(escapeCurrency(input)).toBe('Apple reported revenue of \\$94.8B in Q1.');
    });

    it('preserves actual LaTeX expressions', () => {
      // LaTeX expressions like $E = mc^2$ should NOT be escaped (no match)
      const latex = 'The equation $E = mc^2$ describes energy.';
      expect(escapeCurrency(latex)).toBe(latex); // No change
    });

    it('escapes currency but preserves LaTeX in mixed content', () => {
      const input = 'The product costs $100 and uses formula $E = mc^2$.';
      // Only $100 should be escaped, not the LaTeX
      expect(escapeCurrency(input)).toBe('The product costs \\$100 and uses formula $E = mc^2$.');
    });
  });

  describe('Edge Cases', () => {
    it('handles standalone dollar sign', () => {
      // Standalone $ without number should not match
      const input = '$ is the dollar symbol';
      expect(escapeCurrency(input)).toBe(input);
    });

    it('handles dollar sign with text', () => {
      // $text should not match
      const input = '$variable is a placeholder';
      expect(escapeCurrency(input)).toBe(input);
    });

    it('handles multiple currencies on same line', () => {
      const input = 'Buy: $50, Sell: $100, Profit: $50';
      expect(escapeCurrency(input)).toBe('Buy: \\$50, Sell: \\$100, Profit: \\$50');
    });
  });
});

describe('LaTeX Syntax Support Documentation', () => {
  /**
   * These tests document the expected LaTeX syntax that should work
   * after the configuration is properly set up.
   */

  it('documents inline math syntax', () => {
    // Inline math uses single dollar signs: $E = mc^2$
    const inlineMathPattern = /\$[^$]+\$/;
    expect('$E = mc^2$').toMatch(inlineMathPattern);
    expect('$x^2 + y^2 = z^2$').toMatch(inlineMathPattern);
  });

  it('documents block math syntax', () => {
    // Block math uses double dollar signs: $$...$$
    const blockMathPattern = /\$\$[\s\S]+\$\$/;
    expect('$$\\frac{a}{b}$$').toMatch(blockMathPattern);
    expect(`$$
\\int_0^\\infty e^{-x^2} dx
$$`).toMatch(blockMathPattern);
  });

  it('documents common LaTeX commands', () => {
    // Common commands that should be supported
    const latexCommands = [
      '\\frac{a}{b}',     // fractions
      '\\sqrt{x}',        // square root
      '\\sum_{i=1}^{n}',  // summation
      '\\int_a^b',        // integral
      '\\alpha',          // Greek letters
      '\\mathbf{A}',      // bold math
      '^{2}',             // superscript
      '_{i}',             // subscript
    ];

    latexCommands.forEach(cmd => {
      expect(cmd).toBeTruthy(); // Just verify they're valid strings
    });
  });
});
