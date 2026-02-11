/**
 * HTML-to-Markdown conversion using Turndown.
 */

import TurndownService from 'turndown';
import { load as cheerioLoad } from 'cheerio';

let turndownInstance: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });

    // Remove script/style/nav/footer/header elements
    turndownInstance.remove(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']);

    // Custom rule for images to preserve alt text
    turndownInstance.addRule('images', {
      filter: 'img',
      replacement(_content, node) {
        const el = node as HTMLElement;
        const alt = el.getAttribute('alt') || '';
        const src = el.getAttribute('src') || '';
        if (!src) return '';
        return `![${alt}](${src})`;
      },
    });
  }
  return turndownInstance;
}

export function htmlToMarkdown(html: string): string {
  const td = getTurndown();
  try {
    let md = td.turndown(html);
    // Clean up excessive whitespace
    md = md.replace(/\n{3,}/g, '\n\n');
    md = md.trim();
    return md;
  } catch {
    return '';
  }
}

/**
 * Extract the "main content" from HTML using Cheerio, then convert to markdown.
 */
export function extractMainContentAsMarkdown(html: string): string {
  const $ = cheerioLoad(html);

  // Remove non-content elements
  $('script, style, nav, footer, header, aside, iframe, noscript, svg').remove();

  // Try semantic content selectors in priority order
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '#content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.page-content',
  ];

  for (const selector of contentSelectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      const contentHtml = el.html();
      if (contentHtml && contentHtml.trim().length > 100) {
        return htmlToMarkdown(contentHtml);
      }
    }
  }

  // Fallback: use the body
  const bodyHtml = $('body').html();
  if (bodyHtml) {
    return htmlToMarkdown(bodyHtml);
  }

  return htmlToMarkdown($.html());
}
