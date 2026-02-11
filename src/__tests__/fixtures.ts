import type { AuditItem, AuditResult } from '../analyzer/geo-auditor.js';
import type { SiteCrawlResult, PageData, ExistingGeoFiles, SiteIdentity } from '../crawler/page-data.js';

export function createMockAuditItem(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    name: 'Test Item',
    category: 'medium',
    score: 0,
    maxScore: 100,
    status: 'fail',
    details: 'Test details',
    recommendation: 'Test recommendation',
    ...overrides,
  };
}

export function createMockAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  const defaultItems: AuditItem[] = [
    // Critical (6)
    createMockAuditItem({ name: 'robots.txt', category: 'critical' }),
    createMockAuditItem({ name: 'sitemap.xml', category: 'critical' }),
    createMockAuditItem({ name: 'llms.txt', category: 'critical' }),
    createMockAuditItem({ name: 'Structured Data (JSON-LD)', category: 'critical' }),
    createMockAuditItem({ name: 'Server-side Rendering', category: 'critical' }),
    createMockAuditItem({ name: 'AI Bot Blocking', category: 'critical' }),
    // High (6)
    createMockAuditItem({ name: 'llms-full.txt', category: 'high' }),
    createMockAuditItem({ name: 'AI Policy (ai.txt / ai.json)', category: 'high' }),
    createMockAuditItem({ name: 'Meta Descriptions', category: 'high' }),
    createMockAuditItem({ name: 'Heading Hierarchy', category: 'high' }),
    createMockAuditItem({ name: 'Content Freshness', category: 'high' }),
    createMockAuditItem({ name: 'Content Structure & Depth', category: 'high' }),
    // Medium (4)
    createMockAuditItem({ name: 'security.txt', category: 'medium' }),
    createMockAuditItem({ name: 'tdmrep.json', category: 'medium' }),
    createMockAuditItem({ name: 'Open Graph Tags', category: 'medium' }),
    createMockAuditItem({ name: 'AI Content Directives', category: 'medium' }),
    createMockAuditItem({ name: 'manifest.json', category: 'medium' }),
    // Low (2)
    createMockAuditItem({ name: 'humans.txt', category: 'low' }),
    createMockAuditItem({ name: 'FAQ Content', category: 'low' }),
  ];

  return {
    overallScore: 0,
    maxPossibleScore: 100,
    grade: 'F',
    items: defaultItems,
    summary: {
      critical: { passed: 0, total: 6 },
      high: { passed: 0, total: 6 },
      medium: { passed: 0, total: 5 },
      low: { passed: 0, total: 2 },
    },
    ...overrides,
  };
}

function createMockGeoFiles(overrides: Partial<ExistingGeoFiles> = {}): ExistingGeoFiles {
  return {
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
    llmsFullTxt: null,
    aiTxt: null,
    aiJson: null,
    securityTxt: null,
    tdmrepJson: null,
    humansTxt: null,
    manifestJson: null,
    ...overrides,
  };
}

function createMockSiteIdentity(overrides: Partial<SiteIdentity> = {}): SiteIdentity {
  return {
    name: 'Test Site',
    tagline: null,
    logoUrl: null,
    faviconUrl: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    socialLinks: [],
    copyright: null,
    techStack: [],
    ...overrides,
  };
}

export function createMockPageData(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/',
    statusCode: 200,
    contentType: 'text/html',
    html: '<html><body>Test</body></html>',
    meta: {
      title: 'Test Page',
      description: 'A test page description that is long enough',
      canonical: null,
      language: 'en',
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogType: null,
      ogSiteName: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      author: null,
      publishedDate: null,
      modifiedDate: null,
      keywords: [],
      robots: null,
    },
    content: {
      headings: [{ level: 1, text: 'Test' }],
      bodyText: 'Test body text '.repeat(40), // >50 words
      wordCount: 120,
      faqItems: [],
      lists: [],
      tables: [],
    },
    navigation: [],
    breadcrumbs: [],
    existingStructuredData: { jsonLd: [], microdata: [], rdfa: [] },
    internalLinks: [],
    externalLinks: [],
    images: [],
    lastModified: null,
    responseHeaders: {},
    ...overrides,
  };
}

export function createMockCrawlResult(overrides: Partial<SiteCrawlResult> = {}): SiteCrawlResult {
  return {
    baseUrl: 'https://example.com',
    domain: 'example.com',
    pages: [createMockPageData()],
    siteIdentity: createMockSiteIdentity(),
    existingGeoFiles: createMockGeoFiles(),
    crawlStats: { totalPages: 1, totalTime: 1000, errors: 0 },
    ...overrides,
  };
}

export { createMockGeoFiles, createMockSiteIdentity };
