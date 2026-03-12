/**
 * Type definitions for scraped page data and crawl results.
 */

export interface PageMeta {
  title: string;
  description: string;
  canonical: string | null;
  language: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogType: string | null;
  ogSiteName: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  author: string | null;
  authorBio: string | null;
  publishedDate: string | null;
  modifiedDate: string | null;
  keywords: string[];
  robots: string | null;
  googleVerification: string | null;
  bingVerification: string | null;
  yandexVerification: string | null;
  viewport: string | null;
  hreflang: { lang: string; url: string }[];
  charset: string | null;
  hasDoctype: boolean;
}

export interface RedirectHop {
  url: string;
  statusCode: number;
}

export interface ExternalLinkCheck {
  url: string;
  statusCode: number;       // 0 = network error
  error?: string;
  sourcePages: string[];
}

export interface InternalRedirectCheck {
  url: string;
  statusCode: number;       // 301/302/307/308
  finalUrl: string;
  sourcePages: string[];
}

export interface HeadingNode {
  level: number;
  text: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface NavLink {
  text: string;
  url: string;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface CitationData {
  statistics: string[];
  sources: string[];
  quotes: string[];
}

export interface PageContent {
  headings: HeadingNode[];
  bodyText: string;
  wordCount: number;
  faqItems: FAQItem[];
  lists: string[][];
  tables: string[][][];
  citations: CitationData;
}

export interface ExistingStructuredData {
  jsonLd: Record<string, unknown>[];
  microdata: Record<string, unknown>[];
  rdfa: Record<string, unknown>[];
}

export interface SiteIdentity {
  name: string | null;
  tagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  socialLinks: { platform: string; url: string }[];
  copyright: string | null;
  techStack: string[];
}

export interface PageData {
  url: string;
  statusCode: number;
  contentType: string;
  html: string;
  meta: PageMeta;
  content: PageContent;
  navigation: NavLink[];
  breadcrumbs: BreadcrumbItem[];
  existingStructuredData: ExistingStructuredData;
  internalLinks: string[];
  externalLinks: string[];
  images: { src: string; alt: string }[];
  lastModified: string | null;
  responseHeaders: Record<string, string>;
  htmlSizeBytes: number;
  responseTimeMs: number;
  redirectChain: RedirectHop[];
  crawlDepth: number;
}

export interface ExistingGeoFiles {
  robotsTxt: string | null;
  sitemapXml: string | null;
  llmsTxt: string | null;
  llmsFullTxt: string | null;
  aiTxt: string | null;
  aiJson: string | null;
  securityTxt: string | null;
  tdmrepJson: string | null;
  humansTxt: string | null;
  manifestJson: string | null;
  bingSiteAuth: string | null;
  agentCardJson: string | null;
  agentsJson: string | null;
}

export interface FailedPage {
  url: string;
  statusCode?: number;
  error: string;
  retries: number;
}

export interface MobileProbeResult {
  accessible: boolean;
  statusCode: number;
  contentDiffers: boolean;
  /** Approximate ratio: mobile word count / desktop word count */
  contentRatio: number;
  desktopWordCount: number;
  mobileWordCount: number;
  hasViewport: boolean;
  viewportContent: string | null;
  /** Mobile-specific issues detected */
  issues: string[];
  /** Responsive image coverage: images with srcset / total images */
  responsiveImageRatio: number;
  totalImages: number;
  responsiveImages: number;
}

export interface SiteCrawlResult {
  baseUrl: string;
  domain: string;
  pages: PageData[];
  siteIdentity: SiteIdentity;
  existingGeoFiles: ExistingGeoFiles;
  crawlStats: {
    totalPages: number;
    totalTime: number;
    errors: number;
    failedPages: FailedPage[];
  };
  externalLinkChecks: ExternalLinkCheck[];
  internalRedirectChecks: InternalRedirectCheck[];
  mobileProbe?: MobileProbeResult;
  pageSpeed?: {
    mobile: import('./pagespeed-probe.js').PageSpeedResult | null;
    desktop: import('./pagespeed-probe.js').PageSpeedResult | null;
  };
}

export interface CrawlOptions {
  maxPages: number;
  concurrency: number;
  jsRender: boolean;
  verbose: boolean;
}

export interface GeneratorOptions {
  allowTraining: boolean;
  denyTraining: boolean;
  contactEmail: string | null;
  outputDir: string;
}

export interface CLIOptions extends CrawlOptions, GeneratorOptions {
  auditOnly: boolean;
}

export type AuditSeverity = 'error' | 'warning' | 'notice' | 'info';

// ===== LLM Visibility Checker Types =====

export interface BusinessContext {
  name: string;
  domain: string;
  industry: string;
  location: string | null;
  services: string[];
  products: string[];
  keywords: string[];
  language: string;
  description: string;
}

export interface SearchQuery {
  query: string;
  category: 'brand' | 'generic_faq' | 'purchase_intent' | 'page_specific';
  intent: string;
  language?: string;
  targetPage?: string;
}

export interface LLMResponse {
  engine: 'openai' | 'perplexity' | 'gemini' | 'claude';
  query: string;
  response: string;
  citations: string[];
  mentioned: boolean;
  mentionType: 'cited' | 'mentioned' | 'absent';
  mentionContext: string | null;
  latencyMs: number;
  error: string | null;
}

export interface EngineVisibility {
  engine: string;
  queriesRun: number;
  cited: number;
  mentioned: number;
  absent: number;
  score: number;
}

export interface VisibilityResult {
  site: { url: string; domain: string; name: string };
  businessContext: BusinessContext;
  queries: SearchQuery[];
  responses: LLMResponse[];
  engineScores: EngineVisibility[];
  overallScore: number;
  grade: string;
  generated: string;
}

export interface CheckOptions {
  maxPages: number;
  concurrency: number;
  verbose: boolean;
  queryCount: number;
  engines: string[];
  queryFile: string | null;
  outputDir: string;
  region: string | null;
}
