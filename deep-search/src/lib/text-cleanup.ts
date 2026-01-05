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
 * Fix unclosed bold markers (**) on each line
 * If a line has an odd number of **, try to close intelligently or remove
 */
function fixUnclosedBold(text: string): string {
  return text.split('\n').map(line => {
    const boldMatches = line.match(/\*\*/g);
    if (!boldMatches || boldMatches.length % 2 === 0) {
      return line; // Even count or none, no fix needed
    }

    // Odd number of ** markers - need to fix
    // Strategy: Find unclosed ** and either close after phrase or remove

    // Pattern: **Word(s): - likely meant to bold just the label
    // e.g., "**Navigation Warning: some text" -> "**Navigation Warning:** some text"
    const labelPattern = /\*\*([^*:]+):\s/;
    const labelMatch = line.match(labelPattern);
    if (labelMatch) {
      // Check if this ** is unclosed (no matching ** after the colon)
      const afterColon = line.slice(line.indexOf(labelMatch[0]) + labelMatch[0].length);
      const afterColonBolds = (afterColon.match(/\*\*/g) || []).length;
      if (afterColonBolds === 0) {
        // Close the bold after the colon
        return line.replace(labelPattern, '**$1:** ');
      }
    }

    // Pattern: **Word at start of line with no closing - remove the **
    if (line.startsWith('**') && (boldMatches.length === 1)) {
      return line.slice(2);
    }

    // Pattern: trailing unclosed ** - remove it
    if (line.endsWith('**') && (boldMatches.length % 2 !== 0)) {
      return line.slice(0, -2);
    }

    // Fallback: remove the last ** to make it even
    const lastBold = line.lastIndexOf('**');
    if (lastBold !== -1) {
      return line.slice(0, lastBold) + line.slice(lastBold + 2);
    }

    return line;
  }).join('\n');
}

/**
 * Fix unclosed italic markers (*) - careful not to affect ** or list items
 */
function fixUnclosedItalic(text: string): string {
  return text.split('\n').map(line => {
    // Skip list items (lines starting with * )
    if (/^\s*\*\s/.test(line)) {
      return line;
    }

    // Count single * (not part of **)
    // Replace ** temporarily to count single *
    const withoutBold = line.replace(/\*\*/g, '\x00\x00');
    const italicMatches = withoutBold.match(/\*/g);

    if (!italicMatches || italicMatches.length % 2 === 0) {
      return line; // Even count or none, no fix needed
    }

    // Find and fix unclosed italic
    // Pattern: *Word(s) at start without closing
    if (/^\*[^*\s]/.test(line) && italicMatches.length === 1) {
      return line.slice(1); // Remove opening *
    }

    // Pattern: trailing unclosed * - remove it
    if (line.endsWith('*') && !line.endsWith('**')) {
      return line.slice(0, -1);
    }

    // Fallback: find last single * and remove it
    let result = line;
    let lastSingleStar = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i] === '*') {
        // Check if it's part of **
        const isBold = (i > 0 && result[i-1] === '*') || (i < result.length - 1 && result[i+1] === '*');
        if (!isBold) {
          lastSingleStar = i;
          break;
        }
      }
    }

    if (lastSingleStar !== -1) {
      result = result.slice(0, lastSingleStar) + result.slice(lastSingleStar + 1);
    }

    return result;
  }).join('\n');
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

  // Fix unclosed bold markers - more robust line-by-line approach
  cleaned = fixUnclosedBold(cleaned);

  // Fix unclosed italic markers (single *)
  cleaned = fixUnclosedItalic(cleaned);

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
