/**
 * Crawlee-based site crawler that discovers pages and extracts all data.
 */

import { CheerioCrawler, type CheerioCrawlingContext, Configuration } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { extractMeta } from '../extractors/meta-extractor.js';
import { extractContent } from '../extractors/content-extractor.js';
import { extractNavigation, extractBreadcrumbs, extractLinks, extractImages } from '../extractors/nav-extractor.js';
import { extractStructuredData } from '../extractors/structured-data-extractor.js';
import { extractSiteIdentity } from '../extractors/site-identity-extractor.js';
import { extractDomain, isSameDomain, normalizeUrl } from '../utils/url-utils.js';
import type {
  PageData, SiteCrawlResult, ExistingGeoFiles,
  SiteIdentity, CrawlOptions, FailedPage,
  ExternalLinkCheck, InternalRedirectCheck,
} from './page-data.js';

// Crawlee bundles its own cheerio version which may differ from ours.
// We use `any` to bridge the type gap safely — both expose the same jQuery-like API.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Maximum HTML size to store per page (2 MB) */
const MAX_HTML_SIZE = 2 * 1024 * 1024;
/** Keep link health checks bounded so scans don't appear stuck on large sites */
const MAX_EXTERNAL_LINK_CHECKS = 250;
const MAX_INTERNAL_REDIRECT_CHECKS = 250;

const GEO_FILE_PATHS = [
  { key: 'robotsTxt', path: '/robots.txt' },
  { key: 'sitemapXml', path: '/sitemap.xml' },
  { key: 'llmsTxt', path: '/llms.txt' },
  { key: 'llmsFullTxt', path: '/llms-full.txt' },
  { key: 'aiTxt', path: '/ai.txt' },
  { key: 'aiJson', path: '/ai.json' },
  { key: 'securityTxt', path: '/.well-known/security.txt' },
  { key: 'tdmrepJson', path: '/.well-known/tdmrep.json' },
  { key: 'humansTxt', path: '/humans.txt' },
  { key: 'manifestJson', path: '/manifest.json' },
  { key: 'bingSiteAuth', path: '/BingSiteAuth.xml' },
  { key: 'agentCardJson', path: '/.well-known/agent-card.json' },
  { key: 'agentsJson', path: '/agents.json' },
] as const;

export async function crawlSite(
  targetUrl: string,
  options: CrawlOptions,
  onProgress?: (msg: string) => void,
): Promise<SiteCrawlResult> {
  const baseUrl = new URL(targetUrl).origin;
  const domain = extractDomain(targetUrl);
  const pages: PageData[] = [];
  const failedPages: FailedPage[] = [];
  const startTime = Date.now();

  const log = (msg: string, verboseOnly = false) => {
    if (onProgress && (!verboseOnly || options.verbose)) onProgress(msg);
  };

  // Disable Crawlee's persistent storage to avoid leftover state
  const config = Configuration.getGlobalConfig();
  config.set('persistStorage', false);

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: options.maxPages,
    maxConcurrency: options.concurrency,
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 15,
    maxRequestRetries: 2,
    additionalMimeTypes: ['application/xhtml+xml'],
    preNavigationHooks: [
      (ctx, gotOptions) => {
        gotOptions.headers = {
          ...gotOptions.headers,
          'User-Agent': 'Mozilla/5.0 (compatible; GeoScraper/1.0; +https://github.com/nicobrinkkemper/geo-scraper)',
        };
        // Track request start time for response time measurement
        ctx.request.userData.requestStartTime = Date.now();
      },
    ],

    async requestHandler({ request, $, response }: CheerioCrawlingContext) {
      const url = request.loadedUrl || request.url;
      log(`Crawling (${pages.length + 1}/${options.maxPages}): ${url}`);
      log(`Crawled: ${url}`, true);

      // Only process HTML pages, but tolerate incorrect/missing content-type headers.
      const rawContentType = response?.headers?.['content-type'];
      const contentType = Array.isArray(rawContentType)
        ? rawContentType.join('; ')
        : (rawContentType || '');
      const rawHtml = $.html();
      const looksLikeHtml = /<!doctype html|<html[\s>]/i.test(rawHtml);
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml') && !looksLikeHtml) {
        return;
      }

      // Calculate response time
      const requestStartTime = (request.userData.requestStartTime as number) || Date.now();
      const responseTimeMs = Date.now() - requestStartTime;

      // Cap stored HTML to prevent OOM on huge pages
      let html = rawHtml;
      const htmlSizeBytes = Buffer.byteLength(html, 'utf-8');
      if (html.length > MAX_HTML_SIZE) {
        html = html.slice(0, MAX_HTML_SIZE);
      }

      const meta = extractMeta($ as any, url, html);
      const content = extractContent($ as any);
      const navigation = extractNavigation($ as any, baseUrl);
      const breadcrumbs = extractBreadcrumbs($ as any, baseUrl);
      const existingStructuredData = extractStructuredData($ as any);
      const { internal: internalLinks, external: externalLinks } = extractLinks($ as any, url, baseUrl);
      const images = extractImages($ as any);

      const headers: Record<string, string> = {};
      if (response?.headers) {
        for (const [k, v] of Object.entries(response.headers)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }

      // Build redirect chain from request vs loaded URL
      const redirectChain: import('./page-data.js').RedirectHop[] = [];
      if (request.loadedUrl && request.loadedUrl !== request.url) {
        redirectChain.push({ url: request.url, statusCode: 301 });
      }

      // Crawl depth from user data
      const crawlDepth = (request.userData.depth as number) || 0;

      const pageData: PageData = {
        url,
        statusCode: response?.statusCode || 200,
        contentType,
        html,
        meta,
        content,
        navigation,
        breadcrumbs,
        existingStructuredData,
        internalLinks,
        externalLinks,
        images,
        lastModified: headers['last-modified'] || null,
        responseHeaders: headers,
        htmlSizeBytes,
        responseTimeMs,
        redirectChain,
        crawlDepth,
      };

      pages.push(pageData);

      // Enqueue internal links with incremented depth
      const linksToEnqueue: string[] = [];
      for (const link of internalLinks) {
        if (isSameDomain(link, baseUrl)) {
          const normalized = normalizeUrl(link, baseUrl);
          if (normalized && !normalized.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|avi|mov)$/i)) {
            linksToEnqueue.push(normalized);
          }
        }
      }

      if (linksToEnqueue.length > 0) {
        await crawler.addRequests(linksToEnqueue.map(u => ({
          url: u,
          userData: { depth: crawlDepth + 1 },
        })));
      }
    },

    failedRequestHandler({ request }, error) {
      failedPages.push({
        url: request.url,
        statusCode: (request as any).response?.statusCode,
        error: error.message,
        retries: request.retryCount,
      });
      log(`Failed: ${request.url} — ${error.message}`);
    },
  });

  // Start with the target URL (depth 0)
  await crawler.run([{ url: targetUrl, userData: { depth: 0 } }]);

  // Deduplicate pages by canonical URL
  let deduplicatedPages = deduplicateByCanonical(pages);
  if (deduplicatedPages.length === 0) {
    log('No HTML pages captured by crawler, attempting fallback fetch...', true);
    const fallbackPage = await fetchFallbackPage(targetUrl, baseUrl);
    if (fallbackPage) {
      deduplicatedPages = [fallbackPage];
      log(`Fallback captured page: ${fallbackPage.url}`, true);
    }
  }

  // Fetch existing GEO files
  log('Checking existing GEO files...');
  log('Fetching existing GEO files from target site...', true);
  const existingGeoFiles = await fetchExistingGeoFiles(baseUrl);

  // Check external links for broken URLs
  log('Checking external links...');
  const externalLinkChecks = await checkExternalLinks(deduplicatedPages, log);

  // Detect temporary redirects on internal links
  log('Detecting temporary redirects...');
  const internalRedirectChecks = await detectInternalRedirects(deduplicatedPages, baseUrl, log);

  // Merge site identity from all pages (homepage wins)
  const homepageHtml = deduplicatedPages.find(p => {
    const path = new URL(p.url).pathname;
    return path === '/' || path === '/index.html' || path === '/index';
  })?.html || deduplicatedPages[0]?.html || '';

  const $home = cheerioLoad(homepageHtml);
  const siteIdentity = extractSiteIdentity($home as any, baseUrl);

  // Enrich site identity from other pages
  enrichSiteIdentity(siteIdentity, deduplicatedPages);

  return {
    baseUrl,
    domain,
    pages: deduplicatedPages,
    siteIdentity,
    existingGeoFiles,
    crawlStats: {
      totalPages: deduplicatedPages.length,
      totalTime: Date.now() - startTime,
      errors: failedPages.length,
      failedPages,
    },
    externalLinkChecks,
    internalRedirectChecks,
  };
}

async function fetchFallbackPage(targetUrl: string, baseUrl: string): Promise<PageData | null> {
  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GeoScraper/1.0; +https://github.com/nicobrinkkemper/geo-scraper)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const contentType = response.headers.get('content-type') || '';
    let html = await response.text();
    if (!contentType.includes('text/html') && !/<!doctype html|<html[\s>]/i.test(html)) {
      return null;
    }

    const htmlSizeBytes = Buffer.byteLength(html, 'utf-8');
    if (html.length > MAX_HTML_SIZE) {
      html = html.slice(0, MAX_HTML_SIZE);
    }

    const $ = cheerioLoad(html);
    const finalUrl = response.url || targetUrl;
    const meta = extractMeta($ as any, finalUrl, html);
    const content = extractContent($ as any);
    const navigation = extractNavigation($ as any, baseUrl);
    const breadcrumbs = extractBreadcrumbs($ as any, baseUrl);
    const existingStructuredData = extractStructuredData($ as any);
    const { internal: internalLinks, external: externalLinks } = extractLinks($ as any, finalUrl, baseUrl);
    const images = extractImages($ as any);

    const headers: Record<string, string> = {};
    for (const [k, v] of response.headers.entries()) {
      headers[k] = v;
    }

    const redirectChain: import('./page-data.js').RedirectHop[] = [];
    if (finalUrl !== targetUrl) {
      redirectChain.push({ url: targetUrl, statusCode: 301 });
    }

    return {
      url: finalUrl,
      statusCode: response.status,
      contentType,
      html,
      meta,
      content,
      navigation,
      breadcrumbs,
      existingStructuredData,
      internalLinks,
      externalLinks,
      images,
      lastModified: headers['last-modified'] || null,
      responseHeaders: headers,
      htmlSizeBytes,
      responseTimeMs: 0,
      redirectChain,
      crawlDepth: 0,
    };
  } catch {
    return null;
  }
}

/** Run async tasks with limited concurrency */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const next = async (): Promise<void> => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

/** Check external links for broken URLs via HEAD requests */
async function checkExternalLinks(
  pages: PageData[],
  log: (msg: string, verboseOnly?: boolean) => void,
): Promise<ExternalLinkCheck[]> {
  // Collect unique external URLs and map to source pages
  const urlToSources = new Map<string, string[]>();
  for (const page of pages) {
    for (const extUrl of page.externalLinks) {
      if (!extUrl.startsWith('http')) continue;
      const sources = urlToSources.get(extUrl) || [];
      sources.push(page.url);
      urlToSources.set(extUrl, sources);
    }
  }

  const uniqueUrls = Array.from(urlToSources.keys());
  if (uniqueUrls.length === 0) return [];
  const urlsToCheck = uniqueUrls.slice(0, MAX_EXTERNAL_LINK_CHECKS);

  if (uniqueUrls.length > urlsToCheck.length) {
    log(`Checking ${urlsToCheck.length}/${uniqueUrls.length} external links (fast mode)...`);
  } else {
    log(`Checking ${urlsToCheck.length} external links...`);
  }
  const results: ExternalLinkCheck[] = [];
  let checked = 0;

  await runWithConcurrency(urlsToCheck, 10, async (url) => {
    let statusCode = 0;
    let error: string | undefined;
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'geo-scraper/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
      });
      statusCode = response.status;
    } catch (e) {
      statusCode = 0;
      error = e instanceof Error ? e.message : String(e);
    }
    results.push({ url, statusCode, error, sourcePages: urlToSources.get(url)! });
    checked++;
    if (checked % 20 === 0 || checked === urlsToCheck.length) {
      log(`  External links: ${checked}/${urlsToCheck.length}`);
    }
  });

  return results;
}

/** Detect temporary redirects on internal link targets via HEAD with redirect: manual */
async function detectInternalRedirects(
  pages: PageData[],
  baseUrl: string,
  log: (msg: string, verboseOnly?: boolean) => void,
): Promise<InternalRedirectCheck[]> {
  // Collect unique internal link targets and map to source pages
  const urlToSources = new Map<string, string[]>();
  for (const page of pages) {
    for (const intUrl of page.internalLinks) {
      if (!isSameDomain(intUrl, baseUrl)) continue;
      const normalized = normalizeUrl(intUrl, baseUrl);
      if (!normalized) continue;
      const sources = urlToSources.get(normalized) || [];
      sources.push(page.url);
      urlToSources.set(normalized, sources);
    }
  }

  const uniqueUrls = Array.from(urlToSources.keys());
  if (uniqueUrls.length === 0) return [];
  const urlsToCheck = uniqueUrls.slice(0, MAX_INTERNAL_REDIRECT_CHECKS);

  if (uniqueUrls.length > urlsToCheck.length) {
    log(`Checking ${urlsToCheck.length}/${uniqueUrls.length} internal URLs for redirects (fast mode)...`);
  } else {
    log(`Checking ${urlsToCheck.length} internal URLs for redirects...`);
  }
  const results: InternalRedirectCheck[] = [];
  let checked = 0;

  await runWithConcurrency(urlsToCheck, 10, async (url) => {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'geo-scraper/1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      });
      const status = response.status;
      if (status === 301 || status === 302 || status === 307 || status === 308) {
        const finalUrl = response.headers.get('location') || '';
        results.push({ url, statusCode: status, finalUrl, sourcePages: urlToSources.get(url)! });
      }
    } catch {
      // Skip network errors for redirect detection
    }
    checked++;
    if (checked % 20 === 0 || checked === urlsToCheck.length) {
      log(`  Internal redirects: ${checked}/${urlsToCheck.length}`);
    }
  });

  return results;
}

/**
 * Deduplicate pages that share the same canonical URL.
 * When multiple URLs point to the same canonical, keep the page whose URL matches the canonical.
 */
function deduplicateByCanonical(pages: PageData[]): PageData[] {
  const canonicalMap = new Map<string, PageData>();

  for (const page of pages) {
    const canonical = page.meta.canonical || page.url;
    const existing = canonicalMap.get(canonical);

    if (!existing) {
      canonicalMap.set(canonical, page);
    } else {
      // Prefer the page whose URL matches the canonical
      if (page.url === canonical) {
        canonicalMap.set(canonical, page);
      }
      // Otherwise keep the existing one (first seen)
    }
  }

  return Array.from(canonicalMap.values());
}

async function fetchExistingGeoFiles(baseUrl: string): Promise<ExistingGeoFiles> {
  const result: Record<string, string | null> = {};

  await Promise.allSettled(
    GEO_FILE_PATHS.map(async ({ key, path }) => {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: { 'User-Agent': 'geo-scraper/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const text = await response.text();
          // Sanity check — ignore HTML error pages served as 200
          const isHtmlPage = /<!DOCTYPE|<html/i.test(text);
          const isXmlFile = key === 'sitemapXml';
          const isBingSiteAuth = key === 'bingSiteAuth';
          const isJsonFile = key === 'manifestJson' || key === 'aiJson' || key === 'tdmrepJson' || key === 'agentCardJson' || key === 'agentsJson';

          if (isXmlFile) {
            // Accept sitemap if it contains <urlset> or <sitemapindex>
            if (text.includes('<urlset') || text.includes('<sitemapindex')) {
              result[key] = text;
            } else {
              result[key] = null;
            }
          } else if (isBingSiteAuth) {
            // Accept BingSiteAuth.xml if it contains <users> or <access-token>
            if (text.includes('<users') || text.includes('<access-token')) {
              result[key] = text;
            } else {
              result[key] = null;
            }
          } else if (isJsonFile) {
            try {
              JSON.parse(text);
              result[key] = text;
            } catch {
              result[key] = null;
            }
          } else if (!isHtmlPage) {
            result[key] = text;
          } else {
            result[key] = null;
          }
        } else {
          result[key] = null;
        }
      } catch {
        result[key] = null;
      }
    })
  );

  return result as unknown as ExistingGeoFiles;
}

function enrichSiteIdentity(identity: SiteIdentity, pages: PageData[]): void {
  // Try to find more info from about/contact pages
  for (const page of pages) {
    const path = new URL(page.url).pathname.toLowerCase();
    if (/\/(about|contact|team)/.test(path)) {
      if (!identity.contactEmail) {
        const emailMatch = page.content.bodyText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        if (emailMatch) identity.contactEmail = emailMatch[0];
      }
      if (!identity.address) {
        // Look for address patterns
        const addrMatch = page.content.bodyText.match(/\d{1,5}\s[\w\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl)[.,]?\s+[\w\s]+,\s*[A-Z]{2}\s+\d{5}/);
        if (addrMatch) identity.address = addrMatch[0];
      }
    }
  }
}
