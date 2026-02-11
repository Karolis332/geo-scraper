/**
 * Generate humans.txt — Team, technology, and standards information.
 * Spec: https://humanstxt.org/
 */

import type { SiteCrawlResult, GeneratorOptions } from '../crawler/page-data.js';

export function generateHumansTxt(
  crawlResult: SiteCrawlResult,
  options: GeneratorOptions,
): string {
  const { siteIdentity, domain } = crawlResult;
  const orgName = siteIdentity.name || domain;
  const hasRealEmail = !!(options.contactEmail || siteIdentity.contactEmail);
  const contactEmail = options.contactEmail || siteIdentity.contactEmail || `hello@${domain}`;

  const lines: string[] = [];

  // Team section
  lines.push('/* TEAM */');
  lines.push(`  Name: ${orgName}`);
  if (contactEmail) {
    lines.push(`  Contact: ${contactEmail}${!hasRealEmail ? '  # TODO: replace placeholder' : ''}`);
  }
  if (siteIdentity.address) {
    lines.push(`  Location: ${siteIdentity.address}`);
  }
  lines.push('');

  // Technology section
  lines.push('/* TECHNOLOGY */');
  if (siteIdentity.techStack.length > 0) {
    for (const tech of siteIdentity.techStack) {
      lines.push(`  ${tech}`);
    }
  } else {
    lines.push('  HTML, CSS, JavaScript');
  }
  lines.push('');

  // Site section
  lines.push('/* SITE */');
  lines.push(`  Last update: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`  Language: ${crawlResult.pages[0]?.meta.language || 'en'}`);
  lines.push('  Standards: HTML5, CSS3, JavaScript ES2022');
  lines.push('  Software: geo-scraper');
  lines.push('');

  return lines.join('\n');
}
