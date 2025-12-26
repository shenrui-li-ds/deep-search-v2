/**
 * Client-side text cleanup utilities for fixing common markdown issues
 */

/**
 * Quick cleanup for streamed content - fixes common issues without API call
 */
export function cleanupStreamedContent(text: string): string {
  let cleaned = text;

  // Remove gibberish patterns (random alphanumeric strings in brackets that look like broken citations)
  // These often appear as [RandomString123_abc] or similar
  cleaned = cleaned.replace(/\[[A-Za-z0-9_-]{15,}\]/g, '');

  // Fix broken markdown links - extract just the text part
  // Converts [text](url) to just "text" to prevent broken rendering
  cleaned = cleaned.replace(/\[([^\]]{1,100})\]\(https?:\/\/[^\s\)]{1,500}\)/g, '$1');

  // Remove orphaned markdown link syntax
  cleaned = cleaned.replace(/\]\([^\)]*$/g, ''); // Unclosed link at end
  cleaned = cleaned.replace(/\[[^\]]*$/g, ''); // Unclosed bracket at end

  // Remove raw URLs that appear in text (not in markdown link format)
  cleaned = cleaned.replace(/(?<![(\["'])(https?:\/\/[^\s<>\])"'\n]{10,})(?![)\]"'])/g, '');

  // Fix double spaces
  cleaned = cleaned.replace(/  +/g, ' ');

  // Fix spaces before punctuation
  cleaned = cleaned.replace(/\s+([.,;:!?])/g, '$1');

  return cleaned;
}

/**
 * More thorough cleanup for final content
 */
export function cleanupFinalContent(text: string): string {
  let cleaned = cleanupStreamedContent(text);

  // Fix headers that don't have space after #
  cleaned = cleaned.replace(/^(#{1,6})([^#\s])/gm, '$1 $2');

  // Ensure headers have blank lines before them (except at start)
  cleaned = cleaned.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

  // Ensure headers have blank lines after them
  cleaned = cleaned.replace(/(#{1,6}\s[^\n]+)\n([^#\n])/g, '$1\n\n$2');

  // Fix unclosed bold markers
  const boldCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    const lastBold = cleaned.lastIndexOf('**');
    if (lastBold !== -1) {
      cleaned = cleaned.slice(0, lastBold) + cleaned.slice(lastBold + 2);
    }
  }

  // Remove multiple consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from each line end
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

  // Ensure proper ending
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Normalize citation format to simple [1], [2] style
 */
export function normalizeCitations(text: string): string {
  let cleaned = text;

  // Convert [Source Name](url) style citations to numbered format
  // This is a simplified approach - a more robust solution would track and map sources
  let citationCount = 0;
  const citationMap = new Map<string, number>();

  // Find all markdown links that look like citations
  cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, (match, text, url) => {
    // If it looks like a regular link (long text), keep it as text only
    if (text.length > 50) {
      return text;
    }

    // Check if we've seen this URL before
    if (!citationMap.has(url)) {
      citationCount++;
      citationMap.set(url, citationCount);
    }

    return `[${citationMap.get(url)}]`;
  });

  return cleaned;
}
