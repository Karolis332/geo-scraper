/**
 * Business context extraction and search query generation.
 */

import type { SiteCrawlResult, BusinessContext, SearchQuery } from '../crawler/page-data.js';

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

async function generateQueriesViaLLM(
  context: BusinessContext,
  count: number,
  apiKey: string,
  provider: 'openai' | 'anthropic' | 'gemini',
): Promise<SearchQuery[]> {
  const prompt = `Given this business profile, generate exactly ${count} search queries that simulate how real users talk to AI assistants (ChatGPT, Perplexity, Google AI). The queries should be in ${context.language === 'lt' ? 'Lithuanian' : context.language === 'en' ? 'English' : context.language || 'the same language as the business website'}.

Business Profile:
- Name: ${context.name}
- Domain: ${context.domain}
- Industry: ${context.industry}
- Location: ${context.location || 'unknown'}
- Services: ${context.services.join(', ') || 'unknown'}
- Products: ${context.products.join(', ') || 'unknown'}
- Keywords: ${context.keywords.join(', ') || 'unknown'}
- Description: ${context.description}

IMPORTANT: AI assistants decompose user prompts into long-tail sub-queries. Generate complex, conversational queries of 7+ words that match how users actually talk to AI. AI overviews appear far more on longer, niche queries.

Include a mix of:
- brand: searching for the business by name
- service: searching for what they offer
- product: product-specific queries
- location: location-based queries
- industry: industry/competitor queries
- longtail: complex scenario-based queries (at least 30% of total)

Examples of good longtail queries:
- "Plan me a 5-day trip to Japan in November" (not "Japan travel")
- "What's the best CRM for a 10-person sales team under $50/month" (not "best CRM")
- "Compare organic vs paid marketing for a new SaaS startup" (not "marketing strategies")

Return ONLY a JSON array with objects like:
[{"query": "...", "category": "brand|service|product|location|industry|competitor|longtail", "intent": "..."}]`;

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

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.query && item.category) {
        queries.push({
          query: item.query,
          category: item.category,
          intent: item.intent || '',
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

  // Brand queries
  queries.push({
    query: `what does ${context.name} do and are they reputable`,
    category: 'brand',
    intent: 'Brand reputation query',
  });
  if (context.domain !== context.name.toLowerCase()) {
    queries.push({
      query: `${context.name} ${context.industry} reviews and pricing`,
      category: 'brand',
      intent: 'Brand + industry + evaluation search',
    });
  }

  // Service queries — more specific, conversational
  for (const service of context.services.slice(0, 3)) {
    queries.push({
      query: loc
        ? `best ${service} provider in ${loc} for a small business`
        : `what is the best ${service} provider for a small business`,
      category: 'service',
      intent: `Service search: ${service}`,
    });
  }

  // Product queries — comparative
  for (const product of context.products.slice(0, 2)) {
    queries.push({
      query: `${product} vs competitors which one should I choose`,
      category: 'product',
      intent: `Product comparison: ${product}`,
    });
  }

  // Location queries — scenario-based
  if (loc) {
    queries.push({
      query: `recommend a good ${context.industry} company in ${loc} with experience`,
      category: 'location',
      intent: 'Location-based recommendation query',
    });
  }

  // Industry queries — longer, more specific
  queries.push({
    query: `what are the top ${context.industry} companies${loc ? ' in ' + loc : ''} and how do they compare`,
    category: 'industry',
    intent: 'Competitive landscape query',
  });

  // Long-tail scenario queries
  const service0 = context.services[0] || context.industry;
  const service1 = context.services[1] || context.keywords[0] || context.industry;

  queries.push({
    query: `I need help with ${service0}${loc ? ' in ' + loc : ''} what should I look for when choosing a provider`,
    category: 'longtail',
    intent: 'Decision-making scenario query',
  });

  queries.push({
    query: `compare ${context.name} with other ${context.industry} options for ${service1}`,
    category: 'longtail',
    intent: 'Comparative scenario query',
  });

  if (loc) {
    queries.push({
      query: `what is the best way to find reliable ${service0} in ${loc} for my specific needs`,
      category: 'longtail',
      intent: 'Complex local scenario query',
    });
  }

  queries.push({
    query: `explain the pros and cons of different ${context.industry} approaches for someone just getting started`,
    category: 'longtail',
    intent: 'Educational long-tail query',
  });

  return queries.slice(0, count);
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
