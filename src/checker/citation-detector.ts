/**
 * Citation detector — analyzes LLM responses for site mentions.
 */

export interface CitationResult {
  mentioned: boolean;
  mentionType: 'cited' | 'mentioned' | 'absent';
  context: string | null;
}

export function detectCitation(
  response: string,
  citations: string[],
  domain: string,
  brandName: string,
): CitationResult {
  // 1. Check if domain appears in citations/URLs
  const domainVariants = [domain, `www.${domain}`];
  const cited = citations.some((url) =>
    domainVariants.some((d) => url.includes(d)),
  );

  if (cited) {
    const context = extractContext(response, domain) || extractContext(response, brandName);
    return { mentioned: true, mentionType: 'cited', context };
  }

  // 2. Check if domain or brand name appears in response text
  const responseLower = response.toLowerCase();
  const domainMentioned = domainVariants.some((d) => responseLower.includes(d.toLowerCase()));
  const brandMentioned = brandName.length > 1 && responseLower.includes(brandName.toLowerCase());

  if (domainMentioned || brandMentioned) {
    const searchTerm = domainMentioned ? domain : brandName;
    const context = extractContext(response, searchTerm);
    return { mentioned: true, mentionType: 'mentioned', context };
  }

  // 3. Not found
  return { mentioned: false, mentionType: 'absent', context: null };
}

function extractContext(text: string, term: string): string | null {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return null;

  const start = Math.max(0, idx - 100);
  const end = Math.min(text.length, idx + term.length + 100);
  let context = text.slice(start, end);

  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
}
