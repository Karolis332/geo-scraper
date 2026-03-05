import type { AuditItem, AuditResult } from '../analyzer/geo-auditor.js';
import type { SiteCrawlResult, PageData, ExistingGeoFiles, SiteIdentity } from '../crawler/page-data.js';

export function createMockAuditItem(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    name: 'Test Item',
    category: 'content_quality',
    score: 0,
    maxScore: 100,
    status: 'fail',
    severity: 'warning',
    details: 'Test details',
    recommendation: 'Test recommendation',
    ...overrides,
  };
}

export function createMockAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  const defaultItems: AuditItem[] = [
    // AI Infrastructure (10)
    createMockAuditItem({ name: 'robots.txt', category: 'ai_infrastructure', severity: 'error' }),
    createMockAuditItem({ name: 'sitemap.xml', category: 'ai_infrastructure', severity: 'error' }),
    createMockAuditItem({ name: 'llms.txt', category: 'ai_infrastructure', severity: 'warning' }),
    createMockAuditItem({ name: 'llms-full.txt', category: 'ai_infrastructure', severity: 'warning' }),
    createMockAuditItem({ name: 'AI Policy (ai.txt / ai.json)', category: 'ai_infrastructure', severity: 'warning' }),
    createMockAuditItem({ name: 'AI Bot Blocking', category: 'ai_infrastructure', severity: 'error' }),
    createMockAuditItem({ name: 'AI Content Directives', category: 'ai_infrastructure', severity: 'notice' }),
    createMockAuditItem({ name: 'Training vs Retrieval Bot Strategy', category: 'ai_infrastructure', severity: 'notice' }),
    createMockAuditItem({ name: 'agent-card.json', category: 'ai_infrastructure', severity: 'notice' }),
    createMockAuditItem({ name: 'agents.json', category: 'ai_infrastructure', severity: 'notice' }),
    // Content Quality (20)
    createMockAuditItem({ name: 'Structured Data (JSON-LD)', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'FAQ Content', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Content Structure & Depth', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Heading Hierarchy', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Meta Descriptions', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Content Freshness', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Schema Markup Diversity', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Featured Snippet Readiness', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Answer Format Diversity', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Voice Search Optimization', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Duplicate Titles', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Duplicate Meta Descriptions', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Content Too Long for AI', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Paragraph Length Optimization', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Answer-First Content Structure', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Organization Schema Completeness', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Security Headers', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Compression', category: 'content_quality', severity: 'warning' }),
    createMockAuditItem({ name: 'Content Quotability Score', category: 'content_quality', severity: 'notice' }),
    createMockAuditItem({ name: 'Topic Cluster Detection', category: 'content_quality', severity: 'notice' }),
    // AI Discoverability (10)
    createMockAuditItem({ name: 'Server-side Rendering', category: 'ai_discoverability', severity: 'error' }),
    createMockAuditItem({ name: 'Search Engine Indexing', category: 'ai_discoverability', severity: 'error' }),
    createMockAuditItem({ name: 'Open Graph Tags', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'Author & Expertise Signals', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'Trust Signals', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'Social Proof & Authority', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'Citation Quality', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'Twitter Card Tags', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'Breadcrumb Schema', category: 'ai_discoverability', severity: 'notice' }),
    createMockAuditItem({ name: 'hreflang Tags', category: 'ai_discoverability', severity: 'notice' }),
    // Foundational SEO (16)
    createMockAuditItem({ name: 'Title Tags', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Image Alt Text', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Internal Linking', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Mobile Viewport', category: 'foundational_seo', severity: 'error' }),
    createMockAuditItem({ name: 'HTTPS Enforcement', category: 'foundational_seo', severity: 'error' }),
    createMockAuditItem({ name: 'Broken Pages', category: 'foundational_seo', severity: 'error' }),
    createMockAuditItem({ name: 'Nofollow on Internal Links', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'URL Structure Quality', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Canonical Link Issues', category: 'foundational_seo', severity: 'error' }),
    createMockAuditItem({ name: 'Semantic HTML Usage', category: 'foundational_seo', severity: 'notice' }),
    createMockAuditItem({ name: 'Text-to-HTML Ratio', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Page Response Time', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Redirect Chains', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Character Encoding & Doctype', category: 'foundational_seo', severity: 'error' }),
    createMockAuditItem({ name: 'HTML Page Size', category: 'foundational_seo', severity: 'warning' }),
    createMockAuditItem({ name: 'Crawl Depth', category: 'foundational_seo', severity: 'notice' }),
    // Non-scored (4)
    createMockAuditItem({ name: 'security.txt', category: 'non_scored', severity: 'info' }),
    createMockAuditItem({ name: 'tdmrep.json', category: 'non_scored', severity: 'info' }),
    createMockAuditItem({ name: 'manifest.json', category: 'non_scored', severity: 'info' }),
    createMockAuditItem({ name: 'humans.txt', category: 'non_scored', severity: 'info' }),
  ];

  return {
    overallScore: 0,
    maxPossibleScore: 100,
    grade: 'F',
    items: defaultItems,
    summary: {
      ai_infrastructure: { passed: 0, total: 10 },
      content_quality: { passed: 0, total: 20 },
      ai_discoverability: { passed: 0, total: 10 },
      foundational_seo: { passed: 0, total: 16 },
      non_scored: { passed: 0, total: 4 },
    },
    issueCounts: { errors: 0, warnings: 0, notices: 0 },
    subScores: { aiSearchHealth: 0 },
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
    bingSiteAuth: null,
    agentCardJson: null,
    agentsJson: null,
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
      authorBio: null,
      publishedDate: null,
      modifiedDate: null,
      keywords: [],
      robots: null,
      googleVerification: null,
      bingVerification: null,
      yandexVerification: null,
      viewport: null,
      hreflang: [],
      charset: 'utf-8',
      hasDoctype: true,
    },
    content: {
      headings: [{ level: 1, text: 'Test' }],
      bodyText: 'Test body text '.repeat(40), // >50 words
      wordCount: 120,
      faqItems: [],
      lists: [],
      tables: [],
      citations: { statistics: [], sources: [], quotes: [] },
    },
    navigation: [],
    breadcrumbs: [],
    existingStructuredData: { jsonLd: [], microdata: [], rdfa: [] },
    internalLinks: [],
    externalLinks: [],
    images: [],
    lastModified: null,
    responseHeaders: {},
    htmlSizeBytes: 30,
    responseTimeMs: 200,
    redirectChain: [],
    crawlDepth: 0,
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
    crawlStats: { totalPages: 1, totalTime: 1000, errors: 0, failedPages: [] },
    ...overrides,
  };
}

export { createMockGeoFiles, createMockSiteIdentity };
