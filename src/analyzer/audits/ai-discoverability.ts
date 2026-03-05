/**
 * AI Discoverability audit checks (category weight: 2.5x)
 */

import type { SiteCrawlResult } from '../../crawler/page-data.js';
import type { AuditItem } from './types.js';
import { MAX_AFFECTED_URLS, resolveSeverity } from './types.js';

export function auditAiDiscoverability(crawlResult: SiteCrawlResult): AuditItem[] {
  const items: AuditItem[] = [];

  items.push(auditServerRendering(crawlResult));
  items.push(auditSearchIndexing(crawlResult));
  items.push(auditOpenGraph(crawlResult));
  items.push(auditAuthorExpertise(crawlResult));
  items.push(auditTrustSignals(crawlResult));
  items.push(auditSocialProof(crawlResult));
  items.push(auditCitationQuality(crawlResult));
  // New Tier 1 checks
  items.push(auditTwitterCards(crawlResult));
  items.push(auditBreadcrumbSchema(crawlResult));
  // New Tier 2 checks
  items.push(auditHreflangTags(crawlResult));

  return items;
}

function auditServerRendering(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let ssrPages = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.content.wordCount > 50) {
      ssrPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = pages.length > 0 ? ssrPages / pages.length : 0;
  const score = Math.round(coverage * 100);
  const status = coverage >= 0.8 ? 'pass' as const : coverage >= 0.5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Server-side Rendering',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Server-side Rendering', status),
    details: `${ssrPages}/${pages.length} pages have server-rendered content (>50 words without JS)`,
    recommendation: coverage < 0.8
      ? 'AI crawlers cannot execute JavaScript — ensure content is in initial HTML response via SSR/SSG'
      : 'Content renders without JavaScript — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditSearchIndexing(crawlResult: SiteCrawlResult): AuditItem {
  const { pages, existingGeoFiles } = crawlResult;
  let score = 0;
  const signals: string[] = [];
  const missing: string[] = [];
  const affectedUrls: string[] = [];

  const hasGoogleVerification = pages.some(p => p.meta.googleVerification);
  if (hasGoogleVerification) { score += 20; signals.push('Google Search Console verification'); }
  else { missing.push('Google Search Console verification tag'); }

  const hasBingMetaTag = pages.some(p => p.meta.bingVerification);
  const hasBingSiteAuth = !!existingGeoFiles.bingSiteAuth;
  if (hasBingMetaTag || hasBingSiteAuth) {
    score += 20;
    const method = hasBingMetaTag && hasBingSiteAuth
      ? 'meta tag + BingSiteAuth.xml'
      : hasBingMetaTag ? 'meta tag' : 'BingSiteAuth.xml';
    signals.push(`Bing Webmaster Tools verification (${method})`);
  } else {
    missing.push('Bing Webmaster Tools verification (meta tag or BingSiteAuth.xml)');
  }

  const robotsTxt = existingGeoFiles.robotsTxt || '';
  const hasSitemapInRobots = /^Sitemap:/im.test(robotsTxt);
  if (hasSitemapInRobots) { score += 20; signals.push('Sitemap in robots.txt'); }
  else { missing.push('Sitemap directive in robots.txt'); }

  const noindexPages = pages.filter(p => {
    const robots = p.meta.robots?.toLowerCase() || '';
    const xRobotsTag = (p.responseHeaders['x-robots-tag'] || '').toLowerCase();
    return robots.includes('noindex') || xRobotsTag.includes('noindex');
  });
  if (noindexPages.length === 0) { score += 20; signals.push('No noindex pages'); }
  else {
    missing.push(`${noindexPages.length} page(s) with noindex`);
    for (const p of noindexPages) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(p.url);
    }
  }

  const pagesWithCanonical = pages.filter(p => p.meta.canonical);
  const canonicalCoverage = pages.length > 0 ? pagesWithCanonical.length / pages.length : 0;
  if (canonicalCoverage >= 0.8) {
    score += 20;
    signals.push(`Canonical URLs set (${pagesWithCanonical.length}/${pages.length} pages)`);
  } else if (canonicalCoverage > 0) {
    score += Math.round(20 * canonicalCoverage);
    missing.push(`Canonical URLs on only ${pagesWithCanonical.length}/${pages.length} pages`);
    for (const p of pages) {
      if (!p.meta.canonical && affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(p.url);
    }
  } else {
    missing.push('No canonical URLs set');
    for (const p of pages) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(p.url);
    }
  }

  const details = signals.length > 0
    ? `Indexing signals found: ${signals.join(', ')}${missing.length > 0 ? '. Missing: ' + missing.join(', ') : ''}`
    : `No indexing signals found. Missing: ${missing.join(', ')}`;

  let recommendation: string;
  if (score === 100) {
    recommendation = 'All search engine indexing signals are present — your site is well-configured for discovery';
  } else if (score >= 50) {
    recommendation = `Partial indexing setup. Add missing signals: ${missing.join(', ')}`;
  } else {
    recommendation = `Your site is likely not indexed by search engines. Set up Google Search Console and Bing Webmaster Tools, add a Sitemap directive to robots.txt, set canonical URLs, and remove any noindex tags`;
  }

  const uniqueAffected = [...new Set(affectedUrls)].slice(0, MAX_AFFECTED_URLS);
  const status = score === 100 ? 'pass' as const : score >= 50 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Search Engine Indexing',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Search Engine Indexing', status),
    details, recommendation,
    ...(uniqueAffected.length > 0 ? { affectedUrls: uniqueAffected } : {}),
  };
}

function auditOpenGraph(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withOG = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.meta.ogTitle && page.meta.ogDescription) {
      withOG++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = pages.length > 0 ? withOG / pages.length : 0;
  const score = Math.round(coverage * 100);
  const status = coverage >= 0.8 ? 'pass' as const : coverage >= 0.5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Open Graph Tags',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Open Graph Tags', status),
    details: `${withOG}/${pages.length} pages have OG title + description`,
    recommendation: coverage < 0.8
      ? 'Add og:title and og:description to all pages for rich previews in AI responses'
      : 'Good Open Graph coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditAuthorExpertise(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Author & Expertise Signals', category: 'ai_discoverability',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess author signals',
    };
  }

  let pagesWithAuthor = 0;
  let pagesWithBio = 0;
  const affectedUrls: string[] = [];
  const contentPages = pages.filter(p => p.content.wordCount > 200);

  for (const page of contentPages) {
    if (page.meta.author) pagesWithAuthor++;
    if (page.meta.authorBio) pagesWithBio++;
    if (!page.meta.author && affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
  }

  if (contentPages.length === 0) {
    return {
      name: 'Author & Expertise Signals', category: 'ai_discoverability',
      score: 50, maxScore: 100, status: 'partial', severity: 'info',
      details: 'No content pages (>200 words) found to assess', recommendation: 'Add substantive content pages with author attribution',
    };
  }

  const authorCoverage = pagesWithAuthor / contentPages.length;
  const bioCoverage = pagesWithBio / contentPages.length;
  const score = Math.min(100, Math.round(authorCoverage * 60 + bioCoverage * 40));
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Author & Expertise Signals',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Author & Expertise Signals', status),
    details: `${pagesWithAuthor}/${contentPages.length} content pages have author attribution, ${pagesWithBio} with author bios`,
    recommendation: score < 60
      ? 'Add author names and bios to content pages. AI engines use author signals for E-E-A-T (Experience, Expertise, Authoritativeness, Trust) scoring.'
      : 'Author expertise signals are present',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditTrustSignals(crawlResult: SiteCrawlResult): AuditItem {
  const { siteIdentity, pages, existingGeoFiles } = crawlResult;
  let score = 0;
  const signals: string[] = [];
  const missing: string[] = [];

  if (pages.length === 0 && existingGeoFiles.sitemapXml) {
    const sitemapUrls = (existingGeoFiles.sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || [])
      .map(m => m.replace(/<\/?loc>/g, '').toLowerCase());

    const trustPatterns: { pattern: RegExp; label: string }[] = [
      { pattern: /\/(privacy|privatumas|privacy-policy)/, label: 'privacy page (sitemap)' },
      { pattern: /\/(about|apie|about-us|company)/, label: 'about page (sitemap)' },
      { pattern: /\/(contact|kontaktai|contact-us)/, label: 'contact page (sitemap)' },
      { pattern: /\/(terms|salygos|conditions|tos)/, label: 'terms page (sitemap)' },
    ];

    for (const { pattern, label } of trustPatterns) {
      if (sitemapUrls.some(u => pattern.test(u))) {
        score += 10; signals.push(label);
      }
    }

    if (siteIdentity.name) { score += 10; signals.push('site name'); }
    if (siteIdentity.logoUrl) { score += 10; signals.push('logo'); }
    score = Math.min(100, score);

    return {
      name: 'Trust Signals',
      category: 'ai_discoverability',
      score, maxScore: 100,
      status: score > 0 ? 'partial' as const : 'not_applicable' as const,
      severity: resolveSeverity('Trust Signals', score > 0 ? 'partial' : 'not_applicable'),
      details: `No pages crawled — heuristic from sitemap URLs. Signals found: ${signals.join(', ') || 'none'}`,
      recommendation: score > 0
        ? 'Trust signal URLs detected in sitemap but could not be verified (pages not crawled). Ensure these pages are accessible.'
        : 'No pages crawled and no trust signals detected in sitemap',
    };
  }

  const hasEmail = !!siteIdentity.contactEmail;
  const hasPhone = !!siteIdentity.contactPhone;
  const hasAddress = !!siteIdentity.address;
  const contactScore = (hasEmail ? 10 : 0) + (hasPhone ? 10 : 0) + (hasAddress ? 10 : 0);
  score += contactScore;
  if (hasEmail) signals.push('email');
  if (hasPhone) signals.push('phone');
  if (hasAddress) signals.push('address');
  if (!hasEmail && !hasPhone && !hasAddress) missing.push('contact information (email, phone, or address)');

  const hasAbout = pages.some(p => {
    const path = new URL(p.url).pathname.toLowerCase();
    return /\/(about|apie|about-us|company)/.test(path);
  });
  if (hasAbout) { score += 25; signals.push('about page'); }
  else missing.push('about/company page');

  const hasPrivacy = pages.some(p => /\/(privacy|privatumas)/i.test(new URL(p.url).pathname));
  const hasTerms = pages.some(p => /\/(terms|salygos|conditions)/i.test(new URL(p.url).pathname));
  if (hasPrivacy) { score += 15; signals.push('privacy policy'); }
  else missing.push('privacy policy page');
  if (hasTerms) { score += 10; signals.push('terms page'); }

  if (siteIdentity.name) { score += 10; signals.push('site name'); }
  if (siteIdentity.logoUrl) { score += 10; signals.push('logo'); }

  score = Math.min(100, score);
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Trust Signals',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Trust Signals', status),
    details: `Trust signals found: ${signals.join(', ') || 'none'}${missing.length > 0 ? '. Missing: ' + missing.join(', ') : ''}`,
    recommendation: score < 60
      ? 'Add trust signals: contact information, about page, privacy policy. These are critical for E-E-A-T trust assessment by AI engines.'
      : 'Trust signals are well-established',
  };
}

function auditSocialProof(crawlResult: SiteCrawlResult): AuditItem {
  const { siteIdentity } = crawlResult;
  const socialLinks = siteIdentity.socialLinks;
  const platforms = new Set(socialLinks.map(s => s.platform.toLowerCase()));

  let score = 0;
  const linkCount = socialLinks.length;
  score += Math.min(60, linkCount * 15);

  const majorPlatforms = ['facebook', 'twitter', 'x', 'linkedin', 'instagram', 'youtube', 'github', 'tiktok'];
  const majorCount = majorPlatforms.filter(p => platforms.has(p)).length;
  score += Math.min(40, majorCount * 10);
  score = Math.min(100, score);
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Social Proof & Authority',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Social Proof & Authority', status),
    details: `${socialLinks.length} social media links across ${platforms.size} platforms${platforms.size > 0 ? ': ' + Array.from(platforms).join(', ') : ''}`,
    recommendation: score < 60
      ? 'Add social media profile links to your site. Multiple platform presence signals authority and helps AI engines verify entity identity.'
      : 'Social proof signals are strong',
  };
}

function auditCitationQuality(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let pagesWithStats = 0;
  let pagesWithSources = 0;
  let pagesWithExtLinks = 0;
  const affectedUrls: string[] = [];
  const contentPages = pages.filter(p => p.content.wordCount > 200);

  for (const page of contentPages) {
    const hasStats = page.content.citations.statistics.length > 0;
    const hasSources = page.content.citations.sources.length > 0 || page.content.citations.quotes.length > 0;
    const hasExtLinks = page.externalLinks.length > 0;

    if (hasStats) pagesWithStats++;
    if (hasSources) pagesWithSources++;
    if (hasExtLinks) pagesWithExtLinks++;

    if (!hasStats && !hasSources && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  if (contentPages.length === 0) {
    return {
      name: 'Citation Quality', category: 'ai_discoverability',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages found', recommendation: 'Add content pages with citations and data',
    };
  }

  const statsRatio = pagesWithStats / contentPages.length;
  const sourceRatio = pagesWithSources / contentPages.length;
  const extLinkRatio = pagesWithExtLinks / contentPages.length;

  const score = Math.min(100, Math.round(statsRatio * 35 + sourceRatio * 35 + extLinkRatio * 30));
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Citation Quality',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Citation Quality', status),
    details: `${pagesWithStats}/${contentPages.length} pages with statistics, ${pagesWithSources} with source citations, ${pagesWithExtLinks} with external links`,
    recommendation: score < 60
      ? 'Add data-backed claims (statistics, research citations, expert quotes) to content pages. AI engines favor well-cited content for featured responses.'
      : 'Content is well-cited with data and sources',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== NEW TIER 1 CHECKS =====

function auditTwitterCards(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withCard = 0;
  let withTitle = 0;
  let withDesc = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const hasCard = !!page.meta.twitterCard;
    const hasTitle = !!page.meta.twitterTitle;
    const hasDesc = !!page.meta.twitterDescription;
    if (hasCard) withCard++;
    if (hasTitle) withTitle++;
    if (hasDesc) withDesc++;
    if (!hasCard && !hasTitle && !hasDesc) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = pages.length > 0
    ? (withCard + withTitle + withDesc) / (pages.length * 3)
    : 0;
  const score = Math.round(coverage * 100);
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Twitter Card Tags',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Twitter Card Tags', status),
    details: `twitter:card on ${withCard}/${pages.length} pages, twitter:title on ${withTitle}, twitter:description on ${withDesc}`,
    recommendation: score < 60
      ? 'Add twitter:card, twitter:title, and twitter:description to all pages. These control how your content appears in social shares and AI knowledge graphs.'
      : 'Good Twitter Card coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditBreadcrumbSchema(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let pagesWithBreadcrumbs = 0;
  let pagesWithBreadcrumbSchema = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const hasBreadcrumbs = page.breadcrumbs.length > 0;
    if (hasBreadcrumbs) pagesWithBreadcrumbs++;

    let hasBreadcrumbLd = false;
    for (const ld of page.existingStructuredData.jsonLd) {
      const rawType = ld['@type'];
      const types = Array.isArray(rawType) ? rawType.map(String) : [String(rawType)];
      if (types.includes('BreadcrumbList')) {
        hasBreadcrumbLd = true;
        break;
      }
    }
    if (hasBreadcrumbLd) pagesWithBreadcrumbSchema++;

    // Only flag inner pages (not homepage) missing breadcrumbs
    try {
      if (new URL(page.url).pathname !== '/' && !hasBreadcrumbs && !hasBreadcrumbLd) {
        if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
      }
    } catch { /* skip invalid URLs */ }
  }

  const innerPages = pages.filter(p => {
    try { return new URL(p.url).pathname !== '/'; } catch { return false; }
  }).length;

  if (innerPages === 0) {
    return {
      name: 'Breadcrumb Schema',
      category: 'ai_discoverability',
      score: 100, maxScore: 100, status: 'pass', severity: 'info',
      details: 'Only homepage crawled — breadcrumbs not applicable',
      recommendation: 'Breadcrumbs are for inner pages',
    };
  }

  const coverage = innerPages > 0
    ? Math.max(pagesWithBreadcrumbs, pagesWithBreadcrumbSchema) / innerPages
    : 0;
  const score = Math.round(coverage * 100);
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Breadcrumb Schema',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('Breadcrumb Schema', status),
    details: `${pagesWithBreadcrumbs} pages with HTML breadcrumbs, ${pagesWithBreadcrumbSchema} with BreadcrumbList JSON-LD`,
    recommendation: score < 60
      ? 'Add BreadcrumbList JSON-LD schema to inner pages. Breadcrumbs help AI engines understand site hierarchy and provide navigation context in citations.'
      : 'Good breadcrumb coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== NEW TIER 2 CHECKS =====

function auditHreflangTags(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'hreflang Tags', category: 'ai_discoverability',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess hreflang tags',
    };
  }

  // Detect if the site is multilingual
  const languages = new Set<string>();
  let pagesWithHreflang = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.meta.language) languages.add(page.meta.language.split('-')[0]);
    if (page.meta.hreflang.length > 0) {
      pagesWithHreflang++;
      for (const h of page.meta.hreflang) {
        languages.add(h.lang.split('-')[0]);
      }
    }
  }

  // If only one language detected and no hreflang, it's not applicable
  if (languages.size <= 1 && pagesWithHreflang === 0) {
    return {
      name: 'hreflang Tags', category: 'ai_discoverability',
      score: 100, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'Single-language site — hreflang not applicable',
      recommendation: 'hreflang tags are for multilingual sites',
    };
  }

  // For multilingual sites, check hreflang coverage
  for (const page of pages) {
    if (page.meta.hreflang.length === 0 && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  const coverage = pagesWithHreflang / pages.length;
  const score = Math.round(coverage * 100);
  const status = coverage >= 0.6 ? 'pass' as const : coverage > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'hreflang Tags',
    category: 'ai_discoverability',
    score, maxScore: 100, status,
    severity: resolveSeverity('hreflang Tags', status),
    details: `${pagesWithHreflang}/${pages.length} pages have hreflang tags. ${languages.size} language(s) detected: ${[...languages].join(', ')}`,
    recommendation: coverage < 0.6
      ? 'Add hreflang tags to all pages on multilingual sites. Correct hreflang helps AI engines serve the right language version in responses.'
      : 'Good hreflang coverage for multilingual content',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}
