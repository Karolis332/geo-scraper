/**
 * Extract existing JSON-LD, Microdata, and RDFa structured data from HTML.
 */

import type { CheerioAPI } from 'cheerio';
import type { ExistingStructuredData } from '../crawler/page-data.js';

export function extractStructuredData($: CheerioAPI): ExistingStructuredData {
  return {
    jsonLd: extractJsonLd($),
    microdata: extractMicrodata($),
    rdfa: extractRdfa($),
  };
}

function extractJsonLd($: CheerioAPI): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            results.push(item as Record<string, unknown>);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        // Handle @graph
        if (Array.isArray((parsed as Record<string, unknown>)['@graph'])) {
          for (const item of (parsed as Record<string, unknown>)['@graph'] as unknown[]) {
            if (item && typeof item === 'object') {
              results.push(item as Record<string, unknown>);
            }
          }
        } else {
          results.push(parsed as Record<string, unknown>);
        }
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  });

  return results;
}

function extractMicrodata($: CheerioAPI): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  $('[itemscope][itemtype]').each((_i, el) => {
    const itemType = $(el).attr('itemtype') || '';
    const properties: Record<string, string> = {};

    $(el).find('[itemprop]').each((_j, prop) => {
      const propName = $(prop).attr('itemprop') || '';
      const value =
        $(prop).attr('content') ||
        $(prop).attr('href') ||
        $(prop).attr('src') ||
        $(prop).text().trim();
      if (propName && value) {
        properties[propName] = value;
      }
    });

    if (itemType) {
      results.push({
        '@type': itemType.split('/').pop() || itemType,
        itemtype: itemType,
        ...properties,
      });
    }
  });

  return results;
}

function extractRdfa($: CheerioAPI): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  $('[typeof]').each((_i, el) => {
    const rdfType = $(el).attr('typeof') || '';
    const properties: Record<string, string> = {};

    $(el).find('[property]').each((_j, prop) => {
      const propName = $(prop).attr('property') || '';
      const value =
        $(prop).attr('content') ||
        $(prop).attr('href') ||
        $(prop).text().trim();
      if (propName && value) {
        properties[propName] = value;
      }
    });

    if (rdfType) {
      results.push({ '@type': rdfType, ...properties });
    }
  });

  return results;
}
