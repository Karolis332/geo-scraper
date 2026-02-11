/**
 * Generate sitemap.xml from all discovered URLs.
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';

export function generateSitemapXml(crawlResult: SiteCrawlResult): string {
  const { pages, baseUrl } = crawlResult;
  const today = new Date().toISOString().split('T')[0];

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const page of pages) {
    if (page.statusCode >= 400) continue;

    const loc = page.url;
    const lastmod = page.lastModified
      ? new Date(page.lastModified).toISOString().split('T')[0]
      : today;

    // Determine changefreq and priority based on page type
    const path = new URL(page.url).pathname;
    let changefreq = 'monthly';
    let priority = '0.5';

    if (path === '/' || path === '/index.html') {
      changefreq = 'daily';
      priority = '1.0';
    } else if (/^\/(blog|news|articles?)/.test(path)) {
      changefreq = 'weekly';
      priority = '0.7';
    } else if (/^\/(docs?|documentation|api|reference)/.test(path)) {
      changefreq = 'weekly';
      priority = '0.8';
    } else if (/^\/(about|contact|pricing|products?)/.test(path)) {
      changefreq = 'monthly';
      priority = '0.6';
    } else if (/^\/(legal|privacy|terms)/.test(path)) {
      changefreq = 'yearly';
      priority = '0.3';
    }

    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(loc)}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push(`    <changefreq>${changefreq}</changefreq>`);
    lines.push(`    <priority>${priority}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n') + '\n';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
