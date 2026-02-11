/**
 * Extract navigation links, breadcrumbs, site sections.
 */

import type { CheerioAPI } from 'cheerio';
import type { NavLink, BreadcrumbItem } from '../crawler/page-data.js';
import { normalizeUrl } from '../utils/url-utils.js';

export function extractNavigation($: CheerioAPI, baseUrl: string): NavLink[] {
  const links: NavLink[] = [];
  const seen = new Set<string>();

  // Primary: <nav> elements
  $('nav a[href]').each((_i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (!text || !href) return;
    const normalized = normalizeUrl(href, baseUrl);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      links.push({ text, url: normalized });
    }
  });

  // If no nav found, try header links
  if (links.length === 0) {
    $('header a[href]').each((_i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      if (!text || !href) return;
      const normalized = normalizeUrl(href, baseUrl);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        links.push({ text, url: normalized });
      }
    });
  }

  return links;
}

export function extractBreadcrumbs($: CheerioAPI, baseUrl: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];

  // Pattern 1: Schema.org BreadcrumbList
  $('[itemtype*="BreadcrumbList"] [itemtype*="ListItem"]').each((_i, el) => {
    const name = $(el).find('[itemprop="name"]').text().trim();
    const url = $(el).find('[itemprop="item"]').attr('href') || '';
    if (name) {
      items.push({ name, url: normalizeUrl(url, baseUrl) || baseUrl });
    }
  });

  if (items.length > 0) return items;

  // Pattern 2: JSON-LD BreadcrumbList (handled in structured-data-extractor)

  // Pattern 3: Common breadcrumb CSS patterns
  const breadcrumbSelectors = [
    '[class*="breadcrumb"]',
    '[aria-label="breadcrumb"]',
    '[aria-label="Breadcrumb"]',
    '.breadcrumbs',
    '#breadcrumbs',
  ];

  for (const selector of breadcrumbSelectors) {
    const container = $(selector).first();
    if (container.length === 0) continue;

    container.find('a').each((_i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      if (name && href) {
        items.push({ name, url: normalizeUrl(href, baseUrl) || baseUrl });
      }
    });

    // Include the current page (last text node without link)
    const lastText = container.find('span:last-child, li:last-child').last().text().trim();
    if (lastText && (!items.length || items[items.length - 1].name !== lastText)) {
      items.push({ name: lastText, url: baseUrl });
    }

    if (items.length > 0) break;
  }

  return items;
}

export function extractLinks($: CheerioAPI, pageUrl: string, baseUrl: string): { internal: string[]; external: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  const seenInternal = new Set<string>();
  const seenExternal = new Set<string>();
  const baseDomain = new URL(baseUrl).hostname.replace(/^www\./, '');

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;

    try {
      const linkDomain = new URL(normalized).hostname.replace(/^www\./, '');
      if (linkDomain === baseDomain) {
        if (!seenInternal.has(normalized)) {
          seenInternal.add(normalized);
          internal.push(normalized);
        }
      } else {
        if (!seenExternal.has(normalized)) {
          seenExternal.add(normalized);
          external.push(normalized);
        }
      }
    } catch {
      // Skip invalid URLs
    }
  });

  return { internal, external };
}

export function extractImages($: CheerioAPI): { src: string; alt: string }[] {
  const images: { src: string; alt: string }[] = [];
  $('img[src]').each((_i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const alt = $(el).attr('alt') || '';
    if (src) images.push({ src, alt });
  });
  return images;
}
