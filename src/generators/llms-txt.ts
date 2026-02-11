/**
 * Generate llms.txt — Markdown site map for LLMs.
 * Follows the spec at llmstxt.org:
 *   - H1: site name (required)
 *   - Blockquote: short summary
 *   - H2 sections: categorized link lists
 *   - ## Optional section for secondary content
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';
import { classifyPageSection, getRelativePath } from '../utils/url-utils.js';

export function generateLlmsTxt(crawlResult: SiteCrawlResult): string {
  const { pages, siteIdentity, baseUrl } = crawlResult;
  const siteName = siteIdentity.name || crawlResult.domain;
  const description = siteIdentity.tagline || pages[0]?.meta.description || '';

  const lines: string[] = [];

  // H1: Site name
  lines.push(`# ${siteName}`);
  lines.push('');

  // Blockquote: Summary
  if (description) {
    lines.push(`> ${description}`);
    lines.push('');
  }

  // Group pages by section
  const sections = new Map<string, { title: string; url: string; description: string }[]>();

  for (const page of pages) {
    const section = classifyPageSection(page.url);
    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section)!.push({
      title: page.meta.title || getRelativePath(page.url, baseUrl),
      url: page.url,
      description: page.meta.description || '',
    });
  }

  // Primary sections first (Main, Documentation, Products, Services, Blog, About)
  const primaryOrder = ['Main', 'Documentation', 'Products', 'Services', 'Blog', 'About', 'Support'];
  const optionalSections = ['Legal', 'Careers', 'Changelog', 'Examples', 'Pages'];

  for (const sectionName of primaryOrder) {
    const sectionPages = sections.get(sectionName);
    if (!sectionPages || sectionPages.length === 0) continue;

    lines.push(`## ${sectionName}`);
    lines.push('');
    for (const page of sectionPages) {
      const desc = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${page.url})${desc}`);
    }
    lines.push('');
    sections.delete(sectionName);
  }

  // Optional section
  const hasOptional = optionalSections.some(s => sections.has(s) && sections.get(s)!.length > 0);
  if (hasOptional) {
    lines.push('## Optional');
    lines.push('');
    for (const sectionName of optionalSections) {
      const sectionPages = sections.get(sectionName);
      if (!sectionPages || sectionPages.length === 0) continue;
      for (const page of sectionPages) {
        const desc = page.description ? `: ${page.description}` : '';
        lines.push(`- [${page.title}](${page.url})${desc}`);
      }
      sections.delete(sectionName);
    }
    lines.push('');
  }

  // Any remaining uncategorized sections
  for (const [sectionName, sectionPages] of sections) {
    if (sectionPages.length === 0) continue;
    lines.push(`## ${sectionName}`);
    lines.push('');
    for (const page of sectionPages) {
      const desc = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${page.url})${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
