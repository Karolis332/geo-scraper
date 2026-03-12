/**
 * Schema Template Generation — produces recommended JSON-LD templates based on site content.
 *
 * Detects site type and generates appropriate schemas:
 * - Organization (all sites)
 * - LocalBusiness (if address/phone found)
 * - WebSite + SearchAction (all sites)
 * - Article + Author (if blog/article content found)
 * - Product (if e-commerce signals found)
 * - FAQPage (if FAQ content found)
 */

import type { SiteCrawlResult, SiteIdentity } from '../crawler/page-data.js';

export interface SchemaTemplate {
  name: string;
  description: string;
  filename: string;
  schema: Record<string, unknown>;
  priority: 'critical' | 'recommended' | 'optional';
}

export interface SchemaTemplateResult {
  templates: SchemaTemplate[];
  detectedSiteType: string;
  existingSchemaTypes: string[];
  missingCritical: string[];
}

function detectSiteType(crawlResult: SiteCrawlResult): string {
  const identity = crawlResult.siteIdentity;
  const allText = crawlResult.pages.map(p => p.content.bodyText.toLowerCase()).join(' ');
  const urls = crawlResult.pages.map(p => p.url.toLowerCase());

  // E-commerce signals
  const ecomSignals = ['add to cart', 'buy now', 'shopping cart', 'checkout', 'price', 'product'];
  const ecomCount = ecomSignals.filter(s => allText.includes(s)).length;
  if (ecomCount >= 3) return 'e-commerce';

  // Local business signals
  if (identity.address || identity.contactPhone) return 'local-business';

  // Blog/publisher signals
  const blogUrls = urls.filter(u => /\/(blog|news|article|post)/.test(u));
  if (blogUrls.length >= 3) return 'publisher';

  // SaaS signals
  const saasSignals = ['sign up', 'free trial', 'pricing', 'demo', 'api', 'dashboard', 'login'];
  const saasCount = saasSignals.filter(s => allText.includes(s) || urls.some(u => u.includes(s.replace(' ', '-')))).length;
  if (saasCount >= 3) return 'saas';

  return 'organization';
}

function getExistingSchemaTypes(crawlResult: SiteCrawlResult): string[] {
  const types = new Set<string>();
  for (const page of crawlResult.pages) {
    for (const ld of page.existingStructuredData.jsonLd) {
      if (ld['@type']) {
        const t = Array.isArray(ld['@type']) ? ld['@type'] : [ld['@type']];
        t.forEach(type => types.add(String(type)));
      }
    }
  }
  return Array.from(types);
}

function buildOrganizationSchema(identity: SiteIdentity, baseUrl: string): Record<string, unknown> {
  const sameAs: string[] = identity.socialLinks.map(s => s.url);

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: identity.name || '{{ORGANIZATION_NAME}}',
    url: baseUrl,
    logo: identity.logoUrl || '{{LOGO_URL}}',
    description: '{{DESCRIPTION}}',
    foundingDate: '{{FOUNDING_DATE}}',
    ...(identity.contactEmail ? { email: identity.contactEmail } : { email: '{{EMAIL}}' }),
    ...(identity.contactPhone ? { telephone: identity.contactPhone } : {}),
    ...(identity.address ? {
      address: {
        '@type': 'PostalAddress',
        streetAddress: '{{STREET}}',
        addressLocality: '{{CITY}}',
        addressCountry: '{{COUNTRY}}',
      },
    } : {}),
    sameAs: sameAs.length > 0 ? sameAs : [
      '{{LINKEDIN_URL}}',
      '{{YOUTUBE_URL}}',
      '{{FACEBOOK_URL}}',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: identity.contactEmail || '{{EMAIL}}',
    },
  };
}

function buildLocalBusinessSchema(identity: SiteIdentity, baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: identity.name || '{{BUSINESS_NAME}}',
    url: baseUrl,
    logo: identity.logoUrl || '{{LOGO_URL}}',
    description: '{{DESCRIPTION}}',
    telephone: identity.contactPhone || '{{PHONE}}',
    email: identity.contactEmail || '{{EMAIL}}',
    address: {
      '@type': 'PostalAddress',
      streetAddress: identity.address || '{{STREET_ADDRESS}}',
      addressLocality: '{{CITY}}',
      postalCode: '{{POSTAL_CODE}}',
      addressCountry: '{{COUNTRY_CODE}}',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: '{{LATITUDE}}',
      longitude: '{{LONGITUDE}}',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '17:00',
      },
    ],
    sameAs: identity.socialLinks.map(s => s.url),
    priceRange: '{{PRICE_RANGE}}',
  };
}

function buildWebSiteSchema(identity: SiteIdentity, baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: identity.name || '{{SITE_NAME}}',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

function buildArticleAuthorSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '{{ARTICLE_TITLE}}',
    description: '{{ARTICLE_DESCRIPTION}}',
    image: '{{ARTICLE_IMAGE_URL}}',
    datePublished: '{{YYYY-MM-DD}}',
    dateModified: '{{YYYY-MM-DD}}',
    author: {
      '@type': 'Person',
      name: '{{AUTHOR_NAME}}',
      url: '{{AUTHOR_PAGE_URL}}',
      jobTitle: '{{JOB_TITLE}}',
      worksFor: {
        '@type': 'Organization',
        name: '{{ORGANIZATION_NAME}}',
      },
      sameAs: [
        '{{LINKEDIN_PROFILE}}',
        '{{TWITTER_PROFILE}}',
      ],
    },
    publisher: {
      '@type': 'Organization',
      name: '{{ORGANIZATION_NAME}}',
      logo: {
        '@type': 'ImageObject',
        url: '{{LOGO_URL}}',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': '{{PAGE_URL}}',
    },
  };
}

function buildProductSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: '{{PRODUCT_NAME}}',
    description: '{{PRODUCT_DESCRIPTION}}',
    image: '{{PRODUCT_IMAGE_URL}}',
    brand: {
      '@type': 'Brand',
      name: '{{BRAND_NAME}}',
    },
    offers: {
      '@type': 'Offer',
      price: '{{PRICE}}',
      priceCurrency: '{{CURRENCY}}',
      availability: 'https://schema.org/InStock',
      url: '{{PRODUCT_URL}}',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '{{RATING}}',
      reviewCount: '{{REVIEW_COUNT}}',
    },
  };
}

function buildSaaSSchema(identity: SiteIdentity, baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: identity.name || '{{APP_NAME}}',
    url: baseUrl,
    applicationCategory: '{{CATEGORY}}',
    operatingSystem: 'Web',
    description: '{{DESCRIPTION}}',
    offers: {
      '@type': 'Offer',
      price: '{{PRICE}}',
      priceCurrency: '{{CURRENCY}}',
    },
    author: {
      '@type': 'Organization',
      name: identity.name || '{{ORGANIZATION_NAME}}',
      url: baseUrl,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '{{RATING}}',
      reviewCount: '{{REVIEW_COUNT}}',
    },
  };
}

function buildFAQSchema(crawlResult: SiteCrawlResult): Record<string, unknown> | null {
  const allFAQs = crawlResult.pages.flatMap(p => p.content.faqItems);
  if (allFAQs.length === 0) return null;

  const items = allFAQs.slice(0, 10).map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items,
  };
}

export function generateSchemaTemplates(crawlResult: SiteCrawlResult): SchemaTemplateResult {
  const siteType = detectSiteType(crawlResult);
  const existingTypes = getExistingSchemaTypes(crawlResult);
  const templates: SchemaTemplate[] = [];

  // Organization — always recommended
  if (!existingTypes.includes('Organization')) {
    templates.push({
      name: 'Organization',
      description: 'Core entity identity — helps AI understand who you are',
      filename: 'organization-schema.json',
      schema: buildOrganizationSchema(crawlResult.siteIdentity, crawlResult.baseUrl),
      priority: 'critical',
    });
  }

  // WebSite + SearchAction — always recommended
  if (!existingTypes.includes('WebSite')) {
    templates.push({
      name: 'WebSite + SearchAction',
      description: 'Enables sitelinks search box in Google and AI platforms',
      filename: 'website-schema.json',
      schema: buildWebSiteSchema(crawlResult.siteIdentity, crawlResult.baseUrl),
      priority: 'recommended',
    });
  }

  // LocalBusiness — if local signals detected
  if (siteType === 'local-business' && !existingTypes.includes('LocalBusiness')) {
    templates.push({
      name: 'LocalBusiness',
      description: 'Local entity with address, hours, and contact for local AI search',
      filename: 'local-business-schema.json',
      schema: buildLocalBusinessSchema(crawlResult.siteIdentity, crawlResult.baseUrl),
      priority: 'critical',
    });
  }

  // Article + Author — if publisher or has blog pages
  const hasBlogContent = crawlResult.pages.some(p => /\/(blog|news|article|post)/.test(p.url));
  if ((siteType === 'publisher' || hasBlogContent) && !existingTypes.includes('Article')) {
    templates.push({
      name: 'Article + Author',
      description: 'E-E-A-T signals via author identity — critical for content publishers',
      filename: 'article-author-schema.json',
      schema: buildArticleAuthorSchema(),
      priority: 'critical',
    });
  }

  // Product — if e-commerce
  if (siteType === 'e-commerce' && !existingTypes.includes('Product')) {
    templates.push({
      name: 'Product',
      description: 'Product schema with pricing and reviews for shopping AI results',
      filename: 'product-schema.json',
      schema: buildProductSchema(),
      priority: 'critical',
    });
  }

  // SaaS — if SaaS detected
  if (siteType === 'saas' && !existingTypes.includes('SoftwareApplication')) {
    templates.push({
      name: 'SoftwareApplication',
      description: 'SaaS/software schema for app-related AI queries',
      filename: 'saas-schema.json',
      schema: buildSaaSSchema(crawlResult.siteIdentity, crawlResult.baseUrl),
      priority: 'recommended',
    });
  }

  // FAQPage — if FAQ content exists
  if (!existingTypes.includes('FAQPage')) {
    const faqSchema = buildFAQSchema(crawlResult);
    if (faqSchema) {
      templates.push({
        name: 'FAQPage',
        description: 'FAQ rich result eligibility — high value for AI citation',
        filename: 'faq-schema.json',
        schema: faqSchema,
        priority: 'recommended',
      });
    }
  }

  const missingCritical = templates.filter(t => t.priority === 'critical').map(t => t.name);

  return {
    templates,
    detectedSiteType: siteType,
    existingSchemaTypes: existingTypes,
    missingCritical,
  };
}
