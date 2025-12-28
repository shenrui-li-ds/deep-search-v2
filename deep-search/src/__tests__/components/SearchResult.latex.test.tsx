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
