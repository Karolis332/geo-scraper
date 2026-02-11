/**
 * Extract main content, headings, FAQ patterns, word count from HTML.
 */

import type { CheerioAPI } from 'cheerio';
import type { PageContent, HeadingNode, FAQItem } from '../crawler/page-data.js';

export function extractContent($: CheerioAPI): PageContent {
  const headings = extractHeadings($);
  const faqItems = extractFAQItems($);
  const bodyText = extractBodyText($);
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const lists = extractLists($);
  const tables = extractTables($);

  return { headings, bodyText, wordCount, faqItems, lists, tables };
}

function extractHeadings($: CheerioAPI): HeadingNode[] {
  const headings: HeadingNode[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
    const tagName = $(el).prop('tagName')?.toLowerCase() || '';
    const level = parseInt(tagName.replace('h', ''), 10);
    const text = $(el).text().trim();
    if (text && !isNaN(level)) {
      headings.push({ level, text });
    }
  });
  return headings;
}

function extractFAQItems($: CheerioAPI): FAQItem[] {
  const items: FAQItem[] = [];

  // Pattern 1: Schema.org FAQPage markup
  $('[itemtype*="FAQPage"] [itemtype*="Question"]').each((_i, el) => {
    const q = $(el).find('[itemprop="name"]').text().trim();
    const a = $(el).find('[itemprop="acceptedAnswer"], [itemprop="text"]').text().trim();
    if (q && a) items.push({ question: q, answer: a });
  });

  // Pattern 2: Details/summary elements
  $('details').each((_i, el) => {
    const q = $(el).find('summary').text().trim();
    const a = $(el).clone().children('summary').remove().end().text().trim();
    if (q && a) items.push({ question: q, answer: a });
  });

  // Pattern 3: FAQ-like heading + content pairs
  // Look for headings that end with '?' followed by paragraph text
  $('h2, h3, h4').each((_i, el) => {
    const text = $(el).text().trim();
    if (text.endsWith('?')) {
      const nextP = $(el).next('p, div').text().trim();
      if (nextP && nextP.length > 20) {
        items.push({ question: text, answer: nextP });
      }
    }
  });

  // Pattern 4: dt/dd pairs
  $('dl').each((_i, dl) => {
    $(dl).find('dt').each((_j, dt) => {
      const q = $(dt).text().trim();
      const dd = $(dt).next('dd');
      const a = dd.text().trim();
      if (q && a) items.push({ question: q, answer: a });
    });
  });

  // Deduplicate by question text
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.question)) return false;
    seen.add(item.question);
    return true;
  });
}

function extractBodyText($: CheerioAPI): string {
  // Clone and remove non-content elements
  const clone = $.root().clone();
  clone.find('script, style, nav, footer, header, aside, iframe, noscript, svg').remove();

  // Try main content area first
  let text = clone.find('main, article, [role="main"]').text();
  if (!text || text.trim().length < 50) {
    text = clone.find('body').text() || clone.text();
  }

  return text.replace(/\s+/g, ' ').trim();
}

function extractLists($: CheerioAPI): string[][] {
  const lists: string[][] = [];
  $('main ul, main ol, article ul, article ol, [role="main"] ul, [role="main"] ol').each((_i, el) => {
    const items: string[] = [];
    $(el).children('li').each((_j, li) => {
      const text = $(li).text().trim();
      if (text) items.push(text);
    });
    if (items.length > 0) lists.push(items);
  });
  return lists;
}

function extractTables($: CheerioAPI): string[][][] {
  const tables: string[][][] = [];
  $('table').each((_i, table) => {
    const rows: string[][] = [];
    $(table).find('tr').each((_j, tr) => {
      const cells: string[] = [];
      $(tr).find('th, td').each((_k, cell) => {
        cells.push($(cell).text().trim());
      });
      if (cells.length > 0) rows.push(cells);
    });
    if (rows.length > 0) tables.push(rows);
  });
  return tables;
}
