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
  publishedDate: string | null;
  modifiedDate: string | null;
  keywords: string[];
  robots: string | null;
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

export interface PageContent {
  headings: HeadingNode[];
  bodyText: string;
  wordCount: number;
  faqItems: FAQItem[];
  lists: string[][];
  tables: string[][][];
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
  category: 'brand' | 'service' | 'product' | 'location' | 'industry' | 'competitor' | 'longtail';
  intent: string;
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
}
