/**
 * Generate JSON-LD structured data for each page.
 * Detects page type and generates appropriate Schema.org markup.
 */

import type { SiteCrawlResult, PageData } from '../crawler/page-data.js';
import { resolveUrl } from '../utils/url-utils.js';

interface StructuredDataOutput {
  /** Key: page slug, Value: JSON-LD array */
  perPage: Map<string, Record<string, unknown>[]>;
  /** Aggregated site-level schemas */
  siteLevel: Record<string, unknown>[];
}

export function generateStructuredData(crawlResult: SiteCrawlResult): StructuredDataOutput {
  const { pages, siteIdentity, baseUrl } = crawlResult;

  // Collect all existing schema types across the site
  const siteExistingTypes = new Set<string>();
  for (const page of pages) {
    for (const item of page.existingStructuredData.jsonLd) {
      const t = item['@type'] as string;
      if (t) siteExistingTypes.add(t);
    }
  }

  // Site-level schemas
  const siteLevel: Record<string, unknown>[] = [];

  // Organization — only generate if site doesn't already have one
  if (!siteExistingTypes.has('Organization')) {
    siteLevel.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteIdentity.name || crawlResult.domain,
      url: baseUrl,
      ...(siteIdentity.logoUrl && { logo: resolveUrl(siteIdentity.logoUrl, baseUrl) }),
      ...(siteIdentity.contactEmail && {
        contactPoint: {
          '@type': 'ContactPoint',
          email: siteIdentity.contactEmail,
          ...(siteIdentity.contactPhone && { telephone: siteIdentity.contactPhone }),
        },
      }),
      ...(siteIdentity.socialLinks.length > 0 && {
        sameAs: siteIdentity.socialLinks.map(s => s.url),
      }),
    });
  }

  // WebSite — only generate if site doesn't already have one
  if (!siteExistingTypes.has('WebSite')) {
    siteLevel.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteIdentity.name || crawlResult.domain,
      url: baseUrl,
      ...(siteIdentity.tagline && { description: siteIdentity.tagline }),
    });
  }

  // Per-page schemas
  const perPage = new Map<string, Record<string, unknown>[]>();

  for (const page of pages) {
    const schemas: Record<string, unknown>[] = [];
    const path = new URL(page.url).pathname;
    const slug = pathToSlug(path);

    // Collect existing schema types on this specific page
    const pageExistingTypes = new Set<string>();
    for (const item of page.existingStructuredData.jsonLd) {
      const t = item['@type'] as string;
      if (t) pageExistingTypes.add(t);
    }

    // BreadcrumbList (if breadcrumbs exist and page doesn't already have one)
    if (page.breadcrumbs.length > 1 && !pageExistingTypes.has('BreadcrumbList')) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: page.breadcrumbs.map((bc, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: bc.name,
          item: bc.url,
        })),
      });
    }

    // FAQPage (if FAQ items detected and page doesn't already have FAQPage)
    if (page.content.faqItems.length > 0 && !pageExistingTypes.has('FAQPage')) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: page.content.faqItems.map(faq => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      });
    }

    // Article / BlogPosting detection (skip if page already has Article or BlogPosting)
    if (isArticlePage(page) && !pageExistingTypes.has('Article') && !pageExistingTypes.has('BlogPosting')) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': isBlogPage(page.url) ? 'BlogPosting' : 'Article',
        headline: page.meta.title,
        url: page.url,
        ...(page.meta.description && { description: page.meta.description }),
        ...(page.meta.author && {
          author: { '@type': 'Person', name: page.meta.author },
        }),
        ...(page.meta.publishedDate && { datePublished: page.meta.publishedDate }),
        ...(page.meta.modifiedDate && { dateModified: page.meta.modifiedDate }),
        ...(page.meta.ogImage && { image: page.meta.ogImage }),
        publisher: {
          '@type': 'Organization',
          name: siteIdentity.name || crawlResult.domain,
          ...(siteIdentity.logoUrl && {
            logo: { '@type': 'ImageObject', url: resolveUrl(siteIdentity.logoUrl, baseUrl) },
          }),
        },
      });
    }

    // HowTo detection (pages with step-like headings, skip if already has HowTo)
    const howToSteps = detectHowToSteps(page);
    if (howToSteps.length >= 2 && !pageExistingTypes.has('HowTo')) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: page.meta.title,
        ...(page.meta.description && { description: page.meta.description }),
        step: howToSteps.map((step, i) => ({
          '@type': 'HowToStep',
          position: i + 1,
          name: step.name,
          text: step.text,
        })),
      });
    }

    // Product detection (skip if page already has Product)
    if (isProductPage(page) && !pageExistingTypes.has('Product')) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: page.meta.title,
        url: page.url,
        ...(page.meta.description && { description: page.meta.description }),
        ...(page.meta.ogImage && { image: page.meta.ogImage }),
      });
    }

    // SiteNavigationElement for pages with significant nav
    if (page.navigation.length >= 3 && path === '/') {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'SiteNavigationElement',
        name: 'Main Navigation',
        hasPart: page.navigation.slice(0, 20).map(nav => ({
          '@type': 'WebPage',
          name: nav.text,
          url: nav.url,
        })),
      });
    }

    if (schemas.length > 0) {
      perPage.set(slug, schemas);
    }
  }

  return { perPage, siteLevel };
}

function isArticlePage(page: PageData): boolean {
  const path = new URL(page.url).pathname.toLowerCase();
  if (/^\/(blog|news|articles?|posts?)\/[^/]+/.test(path)) return true;
  if (page.meta.ogType === 'article') return true;
  if (page.meta.publishedDate) return true;
  if (page.content.wordCount > 300 && page.meta.author) return true;
  return false;
}

function isBlogPage(url: string): boolean {
  return /^\/(blog|posts?)\//.test(new URL(url).pathname.toLowerCase());
}

function isProductPage(page: PageData): boolean {
  const path = new URL(page.url).pathname.toLowerCase();
  if (/^\/(products?|shop|store)\/[^/]+/.test(path)) return true;
  if (page.meta.ogType === 'product') return true;
  // Check for price patterns in body text
  if (/\$\d+\.?\d*/.test(page.content.bodyText) && page.content.bodyText.includes('cart')) return true;
  return false;
}

function detectHowToSteps(page: PageData): { name: string; text: string }[] {
  const steps: { name: string; text: string }[] = [];
  const { headings, bodyText } = page.content;

  // Look for numbered step headings: "Step 1:", "1.", etc.
  for (const heading of headings) {
    if (/^(step\s+\d+|^\d+[.)]\s)/i.test(heading.text)) {
      steps.push({
        name: heading.text,
        text: heading.text, // Simplified — would ideally grab following paragraph
      });
    }
  }

  // Also check for "how to" in the title
  if (steps.length === 0 && /how\s+to/i.test(page.meta.title)) {
    // Use H2/H3 headings as steps
    const subHeadings = headings.filter(h => h.level === 2 || h.level === 3);
    for (const h of subHeadings) {
      steps.push({ name: h.text, text: h.text });
    }
  }

  return steps;
}

function pathToSlug(path: string): string {
  let slug = path.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
  if (!slug) slug = 'index';
  return slug.replace(/\.[^.]+$/, '');
}

