/**
 * Generate llms-full.txt — Complete content dump of all pages as markdown.
 * Each page is separated by a header with the source URL.
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';
import { extractMainContentAsMarkdown } from '../utils/markdown.js';

/** Maximum markdown length per page (100 KB) */
const MAX_PAGE_MARKDOWN = 100 * 1024;

export function generateLlmsFullTxt(crawlResult: SiteCrawlResult): string {
  const { pages, siteIdentity, domain } = crawlResult;
  const siteName = siteIdentity.name || domain;

  const sections: string[] = [];

  sections.push(`# ${siteName} — Complete Content`);
  sections.push('');
  sections.push(`> Full content of ${pages.length} pages from ${domain}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  for (const page of pages) {
    const title = page.meta.title || page.url;
    let markdown = extractMainContentAsMarkdown(page.html);

    if (!markdown || markdown.trim().length < 20) continue;

    // Cap per-page content to prevent oversized output
    if (markdown.length > MAX_PAGE_MARKDOWN) {
      markdown = markdown.slice(0, MAX_PAGE_MARKDOWN) + '\n\n[Content truncated]';
    }

    sections.push(`## ${title}`);
    sections.push('');
    sections.push(`**Source:** ${page.url}`);
    if (page.meta.description) {
      sections.push(`**Description:** ${page.meta.description}`);
    }
    sections.push('');
    sections.push(markdown);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  return sections.join('\n').trim() + '\n';
}
