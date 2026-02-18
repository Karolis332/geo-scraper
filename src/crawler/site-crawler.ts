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
  SiteIdentity, CrawlOptions,
} from './page-data.js';

// Crawlee bundles its own cheerio version which may differ from ours.
// We use `any` to bridge the type gap safely — both expose the same jQuery-like API.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Maximum HTML size to store per page (2 MB) */
const MAX_HTML_SIZE = 2 * 1024 * 1024;

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
] as const;

export async function crawlSite(
  targetUrl: string,
  options: CrawlOptions,
  onProgress?: (msg: string) => void,
): Promise<SiteCrawlResult> {
  const baseUrl = new URL(targetUrl).origin;
  const domain = extractDomain(targetUrl);
  const pages: PageData[] = [];
  const startTime = Date.now();
  let errorCount = 0;

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
    maxRequestRetries: 2,

    async requestHandler({ request, $, response }: CheerioCrawlingContext) {
      const url = request.loadedUrl || request.url;
      log(`Crawling (${pages.length + 1}/${options.maxPages}): ${url}`);
      log(`Crawled: ${url}`, true);

      // Only process same-domain HTML pages
      const contentType = response?.headers?.['content-type'] || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return;
      }

      const meta = extractMeta($ as any, url);
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

      // Cap stored HTML to prevent OOM on huge pages
      let html = $.html();
      if (html.length > MAX_HTML_SIZE) {
        html = html.slice(0, MAX_HTML_SIZE);
      }

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
      };

      pages.push(pageData);

      // Enqueue internal links
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
        await crawler.addRequests(linksToEnqueue.map(u => ({ url: u })));
      }
    },

    failedRequestHandler({ request }, error) {
      errorCount++;
      log(`Failed: ${request.url} — ${error.message}`);
    },
  });

  // Start with the target URL
  await crawler.run([targetUrl]);

  // Deduplicate pages by canonical URL
  const deduplicatedPages = deduplicateByCanonical(pages);

  // Fetch existing GEO files
  log('Checking existing GEO files...');
  log('Fetching existing GEO files from target site...', true);
  const existingGeoFiles = await fetchExistingGeoFiles(baseUrl);

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
      errors: errorCount,
    },
  };
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
          const isJsonFile = key === 'manifestJson' || key === 'aiJson' || key === 'tdmrepJson';

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
