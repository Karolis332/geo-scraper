/**
 * Business context extraction and search query generation.
 */

import type { SiteCrawlResult, BusinessContext, SearchQuery, PageData } from '../crawler/page-data.js';
import { classifyPageSection } from '../utils/url-utils.js';

interface PageContext {
  url: string;
  title: string;
  description: string;
  section: string;
  headings: string[];
  snippet: string;
}

export function extractBusinessContext(crawlResult: SiteCrawlResult): BusinessContext {
  const { siteIdentity, pages, domain } = crawlResult;

  const name = siteIdentity.name || domain;
  const language = detectLanguage(pages);
  const description = buildDescription(pages);
  const keywords = extractKeywords(pages);
  const industry = inferIndustry(pages, keywords);
  const location = siteIdentity.address || detectLocation(pages);
  const { services, products } = extractServicesProducts(pages);

  return {
    name,
    domain,
    industry,
    location,
    services,
    products,
    keywords,
    language,
    description,
  };
}

export async function generateQueries(
  context: BusinessContext,
  count: number,
  apiKey: string | null,
  provider: 'openai' | 'anthropic' | 'gemini' | null,
): Promise<SearchQuery[]> {
  // Try LLM-based generation if an API key is available
  if (apiKey && provider) {
    try {
      return await generateQueriesViaLLM(context, count, apiKey, provider);
    } catch {
      // Fall back to template-based
    }
  }

  return generateTemplateQueries(context, count);
}

function getLangName(code: string): string {
  const map: Record<string, string> = { lt: 'Lithuanian', en: 'English', de: 'German', fr: 'French', es: 'Spanish', pl: 'Polish', lv: 'Latvian', et: 'Estonian' };
  return map[code] || code;
}

async function generateQueriesViaLLM(
  context: BusinessContext,
  count: number,
  apiKey: string,
  provider: 'openai' | 'anthropic' | 'gemini',
): Promise<SearchQuery[]> {
  const langName = getLangName(context.language);
  const langCode = context.language || 'en';

  const prompt = `You are a GEO (Generative Engine Optimization) visibility analyst.
Generate search queries that a real user would type into an AI assistant (ChatGPT, Perplexity, Claude) when looking for products/services in this industry.

CRITICAL RULES:
- NEVER mention the brand name "${context.name}" in generic_faq or purchase_intent queries
- These must be pure industry queries that the site SHOULD appear for
- Generate queries in both ${langName} and English
- Split: ~60% ${langName}, ~40% English
- Focus on informational and transactional intent

Business context:
- Industry: ${context.industry}
- Location: ${context.location || 'unknown'}
- Services: ${context.services.join(', ') || 'unknown'}
- Products: ${context.products.join(', ') || 'unknown'}
- Keywords: ${context.keywords.join(', ') || 'unknown'}
- Description: ${context.description}

Generate ${count} queries as JSON array:
- 2 brand queries (these CAN mention "${context.name}")
- 8 generic_faq queries (industry FAQ style, split between ${langName} and English)
- 6 purchase_intent queries (buying/comparison, split between ${langName} and English)
- 4 page_specific queries (based on actual content topics, no brand mention)

Return ONLY a JSON array:
[{"query": "...", "category": "brand|generic_faq|purchase_intent|page_specific", "intent": "...", "language": "en|${langCode}"}]`;

  let responseText: string;

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    responseText = response.choices[0]?.message?.content || '[]';
  } else if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt + '\n\nRespond with ONLY the JSON array, no other text.' }],
    });
    const block = response.content[0];
    responseText = block.type === 'text' ? block.text : '[]';
  } else {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt + '\n\nRespond with ONLY the JSON array, no other text.',
    });
    responseText = response.text || '[]';
  }

  // Parse the JSON response
  const parsed = JSON.parse(extractJsonArray(responseText));
  const queries: SearchQuery[] = [];
  const validCategories = new Set(['brand', 'generic_faq', 'purchase_intent', 'page_specific']);

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.query && item.category && validCategories.has(item.category)) {
        queries.push({
          query: item.query,
          category: item.category,
          intent: item.intent || '',
          language: item.language || 'en',
        });
      }
    }
  }

  return queries.slice(0, count);
}

function extractJsonArray(text: string): string {
  // Try to find JSON array in the response
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  // Try to parse as JSON object with an array property
  try {
    const obj = JSON.parse(text);
    if (obj.queries && Array.isArray(obj.queries)) return JSON.stringify(obj.queries);
    // Find first array property
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return JSON.stringify(val);
    }
  } catch {
    // ignore
  }

  return '[]';
}

function generateTemplateQueries(context: BusinessContext, count: number): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const loc = context.location || '';
  const lang = context.language || 'en';
  const service0 = context.services[0] || context.industry;
  const service1 = context.services[1] || context.keywords[0] || context.industry;

  // Brand queries (2) — CAN mention brand name
  queries.push({
    query: `what does ${context.name} do and are they reputable`,
    category: 'brand',
    intent: 'Brand reputation query',
    language: 'en',
  });
  queries.push({
    query: `${context.name} ${context.industry} reviews and pricing`,
    category: 'brand',
    intent: 'Brand evaluation search',
    language: 'en',
  });

  // Generic FAQ queries (8) — NO brand mention, industry-level
  queries.push({
    query: `how to choose a good ${service0} provider${loc ? ' in ' + loc : ''}`,
    category: 'generic_faq',
    intent: 'Industry FAQ: choosing provider',
    language: 'en',
  });
  queries.push({
    query: `what should I look for when buying ${service1}`,
    category: 'generic_faq',
    intent: 'Industry FAQ: buying guide',
    language: 'en',
  });
  queries.push({
    query: `what is the difference between cheap and premium ${context.industry}`,
    category: 'generic_faq',
    intent: 'Industry FAQ: quality comparison',
    language: 'en',
  });
  queries.push({
    query: `how much does ${service0} typically cost${loc ? ' in ' + loc : ''}`,
    category: 'generic_faq',
    intent: 'Industry FAQ: pricing',
    language: 'en',
  });
  queries.push({
    query: `what are the benefits of professional ${service0}`,
    category: 'generic_faq',
    intent: 'Industry FAQ: benefits',
    language: lang,
  });
  queries.push({
    query: `common mistakes when choosing ${context.industry} services`,
    category: 'generic_faq',
    intent: 'Industry FAQ: mistakes to avoid',
    language: lang,
  });
  queries.push({
    query: `${context.industry} trends and innovations this year`,
    category: 'generic_faq',
    intent: 'Industry FAQ: trends',
    language: lang,
  });
  queries.push({
    query: `how long does ${service0} process usually take`,
    category: 'generic_faq',
    intent: 'Industry FAQ: timeline',
    language: lang,
  });

  // Purchase intent queries (6) — NO brand mention, buying/comparison
  queries.push({
    query: `best ${context.industry} companies${loc ? ' in ' + loc : ''} comparison`,
    category: 'purchase_intent',
    intent: 'Purchase comparison query',
    language: 'en',
  });
  queries.push({
    query: `top rated ${service0} providers near me`,
    category: 'purchase_intent',
    intent: 'Purchase: local search',
    language: 'en',
  });
  queries.push({
    query: `${service0} price comparison${loc ? ' ' + loc : ''}`,
    category: 'purchase_intent',
    intent: 'Purchase: price comparison',
    language: lang,
  });
  queries.push({
    query: `recommend a reliable ${context.industry} company for ${service1}`,
    category: 'purchase_intent',
    intent: 'Purchase: recommendation',
    language: lang,
  });
  queries.push({
    query: `where to order custom ${service0}${loc ? ' in ' + loc : ''}`,
    category: 'purchase_intent',
    intent: 'Purchase: where to buy',
    language: lang,
  });
  queries.push({
    query: `${service0} vs ${service1} which is better for my needs`,
    category: 'purchase_intent',
    intent: 'Purchase: service comparison',
    language: 'en',
  });

  // Page-specific queries (4) — based on content topics, no brand
  queries.push({
    query: `explain the pros and cons of different ${context.industry} approaches for someone just getting started`,
    category: 'page_specific',
    intent: 'Educational content query',
    language: 'en',
  });
  queries.push({
    query: `step by step guide to ${service0}`,
    category: 'page_specific',
    intent: 'How-to content query',
    language: 'en',
  });
  if (context.keywords[0]) {
    queries.push({
      query: `${context.keywords[0]} complete guide and tips`,
      category: 'page_specific',
      intent: 'Keyword content query',
      language: lang,
    });
  }
  if (context.keywords[1]) {
    queries.push({
      query: `everything you need to know about ${context.keywords[1]}`,
      category: 'page_specific',
      intent: 'Keyword content query',
      language: lang,
    });
  }

  return queries.slice(0, count);
}

// ============================================================================
// Page-specific query generation
// ============================================================================

function selectImportantPages(pages: PageData[], maxPages = 10): PageContext[] {
  const skipSections = new Set(['Main', 'Legal', 'Careers', 'Changelog']);
  const keepSections = new Set(['Services', 'Products', 'Blog', 'Documentation', 'Examples', 'About', 'Support', 'Pages']);

  const candidates: PageContext[] = [];

  for (const page of pages) {
    const section = classifyPageSection(page.url);
    if (skipSections.has(section)) continue;
    if (!keepSections.has(section)) continue;
    if (page.content.wordCount < 100) continue;
    if (!page.meta.title || page.meta.title.length < 5) continue;

    candidates.push({
      url: page.url,
      title: page.meta.title,
      description: page.meta.description || '',
      section,
      headings: page.content.headings
        .filter((h) => h.level <= 2)
        .map((h) => h.text)
        .slice(0, 5),
      snippet: page.content.bodyText.slice(0, 200),
    });
  }

  return candidates.slice(0, maxPages);
}

export async function generatePageQueries(
  pages: PageData[],
  context: BusinessContext,
  apiKey: string | null,
  provider: 'openai' | 'anthropic' | 'gemini' | null,
): Promise<SearchQuery[]> {
  const importantPages = selectImportantPages(pages);
  if (importantPages.length === 0) return [];

  if (apiKey && provider) {
    try {
      return await generatePageQueriesViaLLM(importantPages, context, apiKey, provider);
    } catch {
      // Fall back to template-based
    }
  }

  return generatePageTemplateQueries(importantPages, context);
}

async function generatePageQueriesViaLLM(
  pages: PageContext[],
  context: BusinessContext,
  apiKey: string,
  provider: 'openai' | 'anthropic' | 'gemini',
): Promise<SearchQuery[]> {
  const pageList = pages.map((p, i) =>
    `${i + 1}. URL: ${p.url}\n   Title: ${p.title}\n   Section: ${p.section}\n   Headings: ${p.headings.join(', ') || 'none'}\n   Description: ${p.description || 'none'}`
  ).join('\n');

  const maxQueries = Math.min(pages.length * 2, 20);

  const prompt = `Given this business and its individual pages, generate 1-2 targeted search queries PER PAGE that simulate how real users talk to AI assistants about that specific page's content. Queries should be in ${context.language === 'lt' ? 'Lithuanian' : context.language === 'en' ? 'English' : context.language || 'English'}.

Business: ${context.name} (${context.domain}) — ${context.industry}${context.location ? ', ' + context.location : ''}

Pages:
${pageList}

Generate up to ${maxQueries} queries total (1-2 per page). Each query should be specific to that page's content — not generic site-wide queries.

Return ONLY a JSON array:
[{"query": "...", "category": "page_specific", "intent": "...", "language": "en|${context.language}", "targetPage": "<exact page URL>"}]`;

  let responseText: string;

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    responseText = response.choices[0]?.message?.content || '[]';
  } else if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt + '\n\nRespond with ONLY the JSON array, no other text.' }],
    });
    const block = response.content[0];
    responseText = block.type === 'text' ? block.text : '[]';
  } else {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt + '\n\nRespond with ONLY the JSON array, no other text.',
    });
    responseText = response.text || '[]';
  }

  const parsed = JSON.parse(extractJsonArray(responseText));
  const queries: SearchQuery[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.query && item.targetPage) {
        queries.push({
          query: item.query,
          category: 'page_specific',
          intent: item.intent || '',
          language: item.language || 'en',
          targetPage: item.targetPage,
        });
      }
    }
  }

  return queries.slice(0, maxQueries);
}

function generatePageTemplateQueries(pages: PageContext[], context: BusinessContext): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const loc = context.location || '';

  for (const page of pages) {
    const title = page.title;
    let query: string;

    switch (page.section) {
      case 'Services':
        query = loc
          ? `how does ${context.name} ${title.toLowerCase()} compare to other providers in ${loc}`
          : `what does ${context.name} offer for ${title.toLowerCase()} and is it worth it`;
        break;
      case 'Products':
        query = `${title} by ${context.name} review and alternatives`;
        break;
      case 'Blog':
        query = page.headings[0]
          ? `explain ${page.headings[0].toLowerCase()} in detail`
          : `${title.toLowerCase()} guide and best practices`;
        break;
      case 'Documentation':
        query = page.headings[0]
          ? `how to ${page.headings[0].toLowerCase()} with ${context.name}`
          : `${context.name} ${title.toLowerCase()} documentation and examples`;
        break;
      case 'Examples':
        query = `${context.name} ${title.toLowerCase()} examples and use cases`;
        break;
      case 'About':
        query = `who is ${context.name} and what is their background in ${context.industry}`;
        break;
      default:
        query = `${context.name} ${title.toLowerCase()} detailed information`;
        break;
    }

    queries.push({
      query,
      category: 'page_specific',
      intent: `Page-specific: ${page.section} — ${title}`,
      targetPage: page.url,
    });
  }

  return queries.slice(0, 20);
}

function detectLanguage(pages: SiteCrawlResult['pages']): string {
  for (const page of pages) {
    if (page.meta.language) return page.meta.language;
  }
  return 'en';
}

function buildDescription(pages: SiteCrawlResult['pages']): string {
  // Use the homepage meta description, or first page with one
  for (const page of pages) {
    if (page.meta.description && page.meta.description.length > 20) {
      return page.meta.description;
    }
  }
  // Fallback: first 200 chars of homepage body text
  if (pages.length > 0 && pages[0].content.bodyText) {
    return pages[0].content.bodyText.slice(0, 200);
  }
  return '';
}

function extractKeywords(pages: SiteCrawlResult['pages']): string[] {
  const keywords = new Set<string>();

  for (const page of pages) {
    for (const kw of page.meta.keywords) {
      keywords.add(kw.trim().toLowerCase());
    }
    // Also extract from H1/H2 headings
    for (const h of page.content.headings) {
      if (h.level <= 2 && h.text.length > 3 && h.text.length < 60) {
        keywords.add(h.text.toLowerCase());
      }
    }
  }

  return Array.from(keywords).slice(0, 20);
}

function inferIndustry(pages: SiteCrawlResult['pages'], keywords: string[]): string {
  // Check JSON-LD for industry hints
  for (const page of pages) {
    for (const ld of page.existingStructuredData.jsonLd) {
      const type = ld['@type'] as string;
      if (type && !['WebSite', 'WebPage', 'Organization', 'BreadcrumbList'].includes(type)) {
        return type;
      }
      if (ld.industry) return ld.industry as string;
    }
  }

  // Use first meaningful keyword as industry hint
  if (keywords.length > 0) return keywords[0];

  return 'general';
}

function detectLocation(pages: SiteCrawlResult['pages']): string | null {
  // Check JSON-LD for address
  for (const page of pages) {
    for (const ld of page.existingStructuredData.jsonLd) {
      const addr = ld.address as Record<string, unknown> | undefined;
      if (addr) {
        const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
          .filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    }
  }
  return null;
}

function extractServicesProducts(pages: SiteCrawlResult['pages']): {
  services: string[];
  products: string[];
} {
  const services: string[] = [];
  const products: string[] = [];

  for (const page of pages) {
    for (const ld of page.existingStructuredData.jsonLd) {
      const type = ld['@type'] as string;
      const name = ld.name as string | undefined;
      if (type === 'Service' && name) services.push(name);
      if (type === 'Product' && name) products.push(name);
    }

    // Infer from page headings on service/product pages
    const url = page.url.toLowerCase();
    if (url.includes('service') || url.includes('paslaug')) {
      for (const h of page.content.headings) {
        if (h.level === 2 && h.text.length > 3 && h.text.length < 80) {
          services.push(h.text);
        }
      }
    }
    if (url.includes('product') || url.includes('produ')) {
      for (const h of page.content.headings) {
        if (h.level === 2 && h.text.length > 3 && h.text.length < 80) {
          products.push(h.text);
        }
      }
    }
  }

  return {
    services: [...new Set(services)].slice(0, 10),
    products: [...new Set(products)].slice(0, 10),
  };
}
