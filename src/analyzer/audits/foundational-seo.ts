/**
 * Foundational SEO audit checks (category weight: 1.5x)
 */

import type { SiteCrawlResult } from '../../crawler/page-data.js';
import type { AuditItem } from './types.js';
import { MAX_AFFECTED_URLS, resolveSeverity } from './types.js';

export function auditFoundationalSeo(crawlResult: SiteCrawlResult): AuditItem[] {
  const items: AuditItem[] = [];

  items.push(auditTitleTags(crawlResult));
  items.push(auditImageAltText(crawlResult));
  items.push(auditInternalLinking(crawlResult));
  items.push(auditMobileViewport(crawlResult));
  items.push(auditHttps(crawlResult));
  items.push(auditBrokenPages(crawlResult));
  // New Tier 1 checks
  items.push(auditNofollowInternalLinks(crawlResult));
  items.push(auditUrlStructure(crawlResult));
  items.push(auditCanonicalLinks(crawlResult));
  items.push(auditSemanticHtml(crawlResult));
  // New Tier 2 checks
  items.push(auditTextToHtmlRatio(crawlResult));
  items.push(auditPageResponseTime(crawlResult));
  items.push(auditRedirectChains(crawlResult));
  items.push(auditCharsetDoctype(crawlResult));
  items.push(auditHtmlPageSize(crawlResult));
  items.push(auditCrawlDepth(crawlResult));

  return items;
}

function auditTitleTags(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Title Tags', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess title tags',
    };
  }

  let withTitle = 0;
  let goodLength = 0;
  const titles = new Set<string>();
  const duplicates = new Set<string>();
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const title = page.meta.title;
    if (title && title.length > 0) {
      withTitle++;
      if (title.length >= 30 && title.length <= 70) {
        goodLength++;
      } else {
        if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
      }
      if (titles.has(title)) duplicates.add(title);
      titles.add(title);
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  if (duplicates.size > 0) {
    for (const page of pages) {
      if (duplicates.has(page.meta.title) && affectedUrls.length < MAX_AFFECTED_URLS && !affectedUrls.includes(page.url)) {
        affectedUrls.push(page.url);
      }
    }
  }

  const coverage = withTitle / pages.length;
  const lengthRatio = withTitle > 0 ? goodLength / withTitle : 0;
  const uniqueRatio = pages.length > 1 ? 1 - (duplicates.size / pages.length) : 1;

  const score = Math.min(100, Math.round(
    coverage * 40 + lengthRatio * 30 + uniqueRatio * 30
  ));
  const status = score >= 70 ? 'pass' as const : score >= 40 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Title Tags',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Title Tags', status),
    details: `${withTitle}/${pages.length} pages have titles, ${goodLength} with optimal length (30-70 chars), ${duplicates.size} duplicate titles`,
    recommendation: score < 70
      ? 'Ensure every page has a unique title tag between 30-70 characters. Include primary keyword near the beginning.'
      : 'Title tags are well-optimized',
    ...(affectedUrls.length > 0 ? { affectedUrls: affectedUrls.slice(0, MAX_AFFECTED_URLS) } : {}),
  };
}

function auditImageAltText(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let totalImages = 0;
  let withAlt = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    let pageHasMissingAlt = false;
    for (const img of page.images) {
      totalImages++;
      if (img.alt && img.alt.trim().length > 0) {
        withAlt++;
      } else {
        pageHasMissingAlt = true;
      }
    }
    if (pageHasMissingAlt && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  if (totalImages === 0) {
    if (pages.length === 0) {
      return {
        name: 'Image Alt Text', category: 'foundational_seo',
        score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
        details: 'No pages crawled', recommendation: 'Crawl pages to assess image alt text',
      };
    }
    return {
      name: 'Image Alt Text', category: 'foundational_seo',
      score: 100, maxScore: 100, status: 'pass', severity: 'info',
      details: 'No images found on crawled pages', recommendation: 'No images to check — not applicable',
    };
  }

  const ratio = withAlt / totalImages;
  const score = Math.round(ratio * 100);
  const status = score >= 80 ? 'pass' as const : score >= 50 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Image Alt Text',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Image Alt Text', status),
    details: `${withAlt}/${totalImages} images have alt text (${Math.round(ratio * 100)}%)`,
    recommendation: score < 80
      ? 'Add descriptive alt text to all images. Alt text helps search engines and AI models understand image content.'
      : 'Good image alt text coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditInternalLinking(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Internal Linking', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess internal linking',
    };
  }

  const pageUrls = new Set(pages.map(p => p.url));
  const inboundCount = new Map<string, number>();
  for (const url of pageUrls) inboundCount.set(url, 0);

  let totalOutbound = 0;
  for (const page of pages) {
    for (const link of page.internalLinks) {
      totalOutbound++;
      if (inboundCount.has(link)) {
        inboundCount.set(link, (inboundCount.get(link) || 0) + 1);
      }
    }
  }

  const avgLinksPerPage = pages.length > 0 ? totalOutbound / pages.length : 0;
  const orphanPages = [...inboundCount.entries()].filter(([, count]) => count === 0);
  const nonHomeOrphans = orphanPages.filter(([url]) => {
    try { return new URL(url).pathname !== '/'; } catch { return true; }
  });
  const affectedUrls = nonHomeOrphans.map(([url]) => url).slice(0, MAX_AFFECTED_URLS);
  const orphanRatio = pages.length > 1 ? nonHomeOrphans.length / (pages.length - 1) : 0;

  const linkScore = Math.min(50, avgLinksPerPage >= 5 ? 50 : Math.round((avgLinksPerPage / 5) * 50));
  const orphanScore = Math.round((1 - orphanRatio) * 50);
  const score = Math.min(100, linkScore + orphanScore);
  const status = score >= 70 ? 'pass' as const : score >= 40 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Internal Linking',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Internal Linking', status),
    details: `Avg ${avgLinksPerPage.toFixed(1)} internal links/page, ${nonHomeOrphans.length} orphan pages (no inbound links)`,
    recommendation: score < 70
      ? 'Improve internal linking: add contextual links between related pages and ensure no pages are orphaned (unreachable from other pages).'
      : 'Internal linking structure is healthy',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditMobileViewport(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Mobile Viewport', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess mobile viewport',
    };
  }

  let withViewport = 0;
  const affectedUrls: string[] = [];
  for (const page of pages) {
    if (page.meta.viewport) {
      withViewport++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = withViewport / pages.length;
  const score = Math.round(coverage * 100);
  const status = coverage >= 0.9 ? 'pass' as const : coverage >= 0.5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Mobile Viewport',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Mobile Viewport', status),
    details: `${withViewport}/${pages.length} pages have a viewport meta tag`,
    recommendation: score < 90
      ? 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to all pages for mobile-friendly rendering.'
      : 'Mobile viewport is properly configured',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditHttps(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'HTTPS Enforcement', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess HTTPS usage',
    };
  }

  let httpsCount = 0;
  const nonHttpsUrls: string[] = [];

  for (const page of pages) {
    if (page.url.startsWith('https://')) {
      httpsCount++;
    } else {
      nonHttpsUrls.push(page.url);
    }
  }

  const ratio = httpsCount / pages.length;
  const score = Math.round(ratio * 100);
  const status = ratio === 1 ? 'pass' as const : ratio >= 0.8 ? 'partial' as const : 'fail' as const;

  return {
    name: 'HTTPS Enforcement',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('HTTPS Enforcement', status),
    details: ratio === 1
      ? 'All pages served over HTTPS'
      : `${httpsCount}/${pages.length} pages use HTTPS. Non-HTTPS: ${nonHttpsUrls.slice(0, 3).join(', ')}${nonHttpsUrls.length > 3 ? '...' : ''}`,
    recommendation: ratio < 1
      ? 'Migrate all pages to HTTPS. Search engines penalize non-HTTPS sites and browsers show security warnings.'
      : 'All pages are served securely over HTTPS',
    ...(nonHttpsUrls.length > 0 ? { affectedUrls: nonHttpsUrls.slice(0, MAX_AFFECTED_URLS) } : {}),
  };
}

function auditBrokenPages(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Broken Pages', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to check for broken pages',
    };
  }

  const brokenPages = pages.filter(p => p.statusCode < 200 || p.statusCode >= 400);
  const affectedUrls = brokenPages.map(p => p.url).slice(0, MAX_AFFECTED_URLS);
  const ratio = brokenPages.length / pages.length;
  const score = Math.round((1 - ratio) * 100);
  const status = brokenPages.length === 0 ? 'pass' as const : ratio <= 0.1 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Broken Pages',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Broken Pages', status),
    details: brokenPages.length === 0
      ? `All ${pages.length} crawled pages returned successful status codes`
      : `${brokenPages.length}/${pages.length} pages returned error status codes: ${brokenPages.slice(0, 3).map(p => `${p.url} (${p.statusCode})`).join(', ')}${brokenPages.length > 3 ? '...' : ''}`,
    recommendation: brokenPages.length > 0
      ? 'Fix or remove broken pages (4xx/5xx status codes). Broken pages waste crawl budget and harm user experience.'
      : 'No broken pages detected',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== NEW TIER 1 CHECKS =====

function auditNofollowInternalLinks(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let totalInternalLinks = 0;
  let nofollowInternalLinks = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    // Check HTML for rel="nofollow" on internal links
    const html = page.html;
    // Simple regex to find anchor tags with nofollow
    const anchorPattern = /<a\s[^>]*rel\s*=\s*["'][^"']*nofollow[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi;
    const anchorPattern2 = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*nofollow[^"']*["']/gi;

    const nofollowHrefs = new Set<string>();
    let match;
    while ((match = anchorPattern.exec(html)) !== null) nofollowHrefs.add(match[1]);
    while ((match = anchorPattern2.exec(html)) !== null) nofollowHrefs.add(match[1]);

    for (const href of nofollowHrefs) {
      // Check if the link is internal
      try {
        const linkUrl = new URL(href, page.url);
        const pageUrl = new URL(page.url);
        if (linkUrl.hostname === pageUrl.hostname) {
          nofollowInternalLinks++;
        }
      } catch { /* skip invalid URLs */ }
    }

    totalInternalLinks += page.internalLinks.length;
    if (nofollowHrefs.size > 0 && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  const score = nofollowInternalLinks === 0 ? 100 : Math.round(Math.max(0, (1 - nofollowInternalLinks / Math.max(totalInternalLinks, 1)) * 100));
  const status = nofollowInternalLinks === 0 ? 'pass' as const : nofollowInternalLinks <= 5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Nofollow on Internal Links',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Nofollow on Internal Links', status),
    details: nofollowInternalLinks === 0
      ? 'No rel="nofollow" found on internal links'
      : `${nofollowInternalLinks} internal links have rel="nofollow" — leaking link equity`,
    recommendation: nofollowInternalLinks > 0
      ? 'Remove rel="nofollow" from internal links. Nofollow on internal links wastes PageRank that should flow through your site.'
      : 'No internal links use nofollow — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditUrlStructure(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let issueCount = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    let hasIssue = false;
    try {
      const url = new URL(page.url);
      const path = url.pathname;

      // Check for underscores (should use hyphens)
      if (path.includes('_')) hasIssue = true;
      // Check URL length >200 chars
      if (page.url.length > 200) hasIssue = true;
      // Check excessive query parameters (>3)
      if (url.searchParams.toString().split('&').length > 3) hasIssue = true;
      // Check for uppercase in path
      if (path !== path.toLowerCase()) hasIssue = true;
    } catch { hasIssue = true; }

    if (hasIssue) {
      issueCount++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const score = pages.length > 0
    ? Math.round(Math.max(0, (1 - issueCount / pages.length)) * 100)
    : 100;
  const status = issueCount === 0 ? 'pass' as const : issueCount <= 3 ? 'partial' as const : 'fail' as const;

  return {
    name: 'URL Structure Quality',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('URL Structure Quality', status),
    details: issueCount === 0
      ? 'All URLs follow SEO best practices'
      : `${issueCount} URL(s) have issues (underscores, excessive length, too many params, or uppercase)`,
    recommendation: issueCount > 0
      ? 'Use hyphens instead of underscores, keep URLs under 200 characters, minimize query parameters, and use lowercase paths.'
      : 'URL structure follows SEO best practices',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditCanonicalLinks(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Canonical Link Issues', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess canonical links',
    };
  }

  const crawledUrls = new Set(pages.map(p => p.url));
  let issueCount = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const canonical = page.meta.canonical;
    if (!canonical) continue;

    let hasIssue = false;

    // Self-referencing canonical pointing to a different URL variant
    try {
      const canonUrl = new URL(canonical, page.url).href;
      // Check if canonical points to a non-crawled URL (potentially broken)
      if (canonUrl !== page.url && !crawledUrls.has(canonUrl)) {
        // Only flag if it's the same domain
        const pageHost = new URL(page.url).hostname;
        const canonHost = new URL(canonUrl).hostname;
        if (pageHost === canonHost) {
          hasIssue = true;
        }
      }
    } catch {
      hasIssue = true; // Malformed canonical URL
    }

    if (hasIssue) {
      issueCount++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const pagesWithCanonical = pages.filter(p => p.meta.canonical).length;
  const score = issueCount === 0 ? 100 : Math.round(Math.max(0, (1 - issueCount / Math.max(pagesWithCanonical, 1)) * 100));
  const status = issueCount === 0 ? 'pass' as const : issueCount <= 2 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Canonical Link Issues',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Canonical Link Issues', status),
    details: issueCount === 0
      ? `${pagesWithCanonical}/${pages.length} pages have valid canonical links`
      : `${issueCount} canonical link issue(s) found (pointing to non-crawled or malformed URLs)`,
    recommendation: issueCount > 0
      ? 'Fix canonical links that point to non-existent or malformed URLs. Incorrect canonicals can cause content to be de-indexed.'
      : 'Canonical links are properly configured',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditSemanticHtml(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Semantic HTML Usage', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess semantic HTML',
    };
  }

  let semanticPages = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const html = page.html.toLowerCase();
    const semanticTags = ['<article', '<section', '<main', '<figure', '<aside', '<nav', '<header', '<footer'];
    const semanticCount = semanticTags.filter(tag => html.includes(tag)).length;

    // Count divs for ratio comparison
    const divCount = (html.match(/<div/g) || []).length;
    const hasGoodRatio = semanticCount >= 3 || (divCount > 0 && semanticCount / divCount >= 0.1);

    if (hasGoodRatio) {
      semanticPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const ratio = semanticPages / pages.length;
  const score = Math.round(ratio * 100);
  const status = ratio >= 0.6 ? 'pass' as const : ratio > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Semantic HTML Usage',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Semantic HTML Usage', status),
    details: `${semanticPages}/${pages.length} pages use semantic HTML tags (article, section, main, figure)`,
    recommendation: ratio < 0.6
      ? 'Use semantic HTML5 tags (article, section, main, figure) instead of generic divs. Semantic markup helps AI engines understand content structure and extract relevant sections.'
      : 'Good semantic HTML usage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== NEW TIER 2 CHECKS =====

function auditTextToHtmlRatio(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Text-to-HTML Ratio', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess text-to-HTML ratio',
    };
  }

  let lowRatioCount = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const textBytes = Buffer.byteLength(page.content.bodyText, 'utf-8');
    const htmlBytes = page.htmlSizeBytes || Buffer.byteLength(page.html, 'utf-8');
    const ratio = htmlBytes > 0 ? textBytes / htmlBytes : 0;

    if (ratio < 0.1) {
      lowRatioCount++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const score = pages.length > 0
    ? Math.round(Math.max(0, (1 - lowRatioCount / pages.length)) * 100)
    : 100;
  const status = lowRatioCount === 0 ? 'pass' as const : lowRatioCount <= 3 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Text-to-HTML Ratio',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Text-to-HTML Ratio', status),
    details: lowRatioCount === 0
      ? 'All pages have >10% text-to-HTML ratio'
      : `${lowRatioCount} page(s) have <10% text-to-HTML ratio — too much markup, too little content`,
    recommendation: lowRatioCount > 0
      ? 'Increase text content relative to HTML markup. Pages with <10% text ratio may be seen as thin content by search engines and AI crawlers.'
      : 'Text-to-HTML ratios are healthy',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditPageResponseTime(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Page Response Time', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess response times',
    };
  }

  let slowPages = 0;
  const affectedUrls: string[] = [];
  let totalTime = 0;

  for (const page of pages) {
    totalTime += page.responseTimeMs;
    if (page.responseTimeMs > 3000) {
      slowPages++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const avgTime = Math.round(totalTime / pages.length);
  const score = pages.length > 0
    ? Math.round(Math.max(0, (1 - slowPages / pages.length)) * 100)
    : 100;
  const status = slowPages === 0 ? 'pass' as const : slowPages <= 3 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Page Response Time',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Page Response Time', status),
    details: `Avg response: ${avgTime}ms. ${slowPages} page(s) exceed 3s threshold.`,
    recommendation: slowPages > 0
      ? 'Optimize server response times to under 3 seconds. Slow pages hurt crawl efficiency and may be deprioritized by AI crawlers with timeout limits.'
      : 'All page response times are within acceptable limits',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditRedirectChains(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Redirect Chains', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess redirect chains',
    };
  }

  let chainIssues = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.redirectChain.length > 1) {
      chainIssues++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const score = Math.round(Math.max(0, (1 - chainIssues / pages.length)) * 100);
  const status = chainIssues === 0 ? 'pass' as const : chainIssues <= 3 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Redirect Chains',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Redirect Chains', status),
    details: chainIssues === 0
      ? 'No redirect chains detected (>1 hop)'
      : `${chainIssues} page(s) have redirect chains with >1 hop`,
    recommendation: chainIssues > 0
      ? 'Shorten redirect chains to a single hop. Each redirect adds latency and wastes crawl budget for both search engines and AI crawlers.'
      : 'No redirect chain issues detected',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditCharsetDoctype(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Character Encoding & Doctype', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess charset and doctype',
    };
  }

  let issueCount = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    let hasIssue = false;
    if (!page.meta.charset) hasIssue = true;
    if (!page.meta.hasDoctype) hasIssue = true;

    if (hasIssue) {
      issueCount++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const score = Math.round(Math.max(0, (1 - issueCount / pages.length)) * 100);
  const status = issueCount === 0 ? 'pass' as const : issueCount <= 2 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Character Encoding & Doctype',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Character Encoding & Doctype', status),
    details: issueCount === 0
      ? 'All pages declare charset and DOCTYPE'
      : `${issueCount} page(s) missing charset declaration or DOCTYPE`,
    recommendation: issueCount > 0
      ? 'Add <!DOCTYPE html> and <meta charset="utf-8"> to all pages. Missing declarations cause rendering issues and content misinterpretation by crawlers.'
      : 'Charset and DOCTYPE are properly declared',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditHtmlPageSize(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'HTML Page Size', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess HTML page sizes',
    };
  }

  const TWO_MB = 2 * 1024 * 1024;
  let oversizedCount = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.htmlSizeBytes > TWO_MB) {
      oversizedCount++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const score = Math.round(Math.max(0, (1 - oversizedCount / pages.length)) * 100);
  const status = oversizedCount === 0 ? 'pass' as const : oversizedCount <= 2 ? 'partial' as const : 'fail' as const;

  return {
    name: 'HTML Page Size',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('HTML Page Size', status),
    details: oversizedCount === 0
      ? 'All pages are under 2MB HTML size'
      : `${oversizedCount} page(s) exceed 2MB HTML size`,
    recommendation: oversizedCount > 0
      ? 'Reduce HTML page size below 2MB. Oversized pages are slow to parse and may hit crawler size limits, causing incomplete indexing.'
      : 'All page sizes are within limits',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditCrawlDepth(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Crawl Depth', category: 'foundational_seo',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess crawl depth',
    };
  }

  let deepPages = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.crawlDepth > 3) {
      deepPages++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const maxDepth = Math.max(...pages.map(p => p.crawlDepth));
  const avgDepth = pages.reduce((sum, p) => sum + p.crawlDepth, 0) / pages.length;
  const score = Math.round(Math.max(0, (1 - deepPages / pages.length)) * 100);
  const status = deepPages === 0 ? 'pass' as const : deepPages <= 5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Crawl Depth',
    category: 'foundational_seo',
    score, maxScore: 100, status,
    severity: resolveSeverity('Crawl Depth', status),
    details: `Max depth: ${maxDepth}, avg: ${avgDepth.toFixed(1)}. ${deepPages} page(s) are >3 clicks from homepage.`,
    recommendation: deepPages > 0
      ? 'Flatten site architecture so all important pages are within 3 clicks of the homepage. Deep pages are less likely to be crawled and indexed by AI engines.'
      : 'All pages are within 3 clicks of homepage — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}
