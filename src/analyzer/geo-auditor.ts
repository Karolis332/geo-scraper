/**
 * GEO Compliance Auditor — scores a site's existing AI/LLM readiness.
 * Checks for presence and quality of each GEO element.
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';

export const MAX_AFFECTED_URLS = 20;

export interface AuditItem {
  name: string;
  category: 'critical' | 'high' | 'medium' | 'low' | 'seo' | 'eeat' | 'aeo';
  score: number;       // 0-100
  maxScore: number;
  status: 'pass' | 'partial' | 'fail' | 'not_applicable';
  details: string;
  recommendation: string;
  affectedUrls?: string[];
}

export interface AuditResult {
  overallScore: number;
  maxPossibleScore: number;
  grade: string;
  items: AuditItem[];
  summary: {
    critical: { passed: number; total: number };
    high: { passed: number; total: number };
    medium: { passed: number; total: number };
    low: { passed: number; total: number };
    seo: { passed: number; total: number };
    eeat: { passed: number; total: number };
    aeo: { passed: number; total: number };
  };
}

export function auditSite(crawlResult: SiteCrawlResult): AuditResult {
  const items: AuditItem[] = [];
  const { existingGeoFiles, pages, siteIdentity } = crawlResult;

  // ===== CRITICAL CHECKS =====

  // 1. robots.txt with AI crawler directives
  items.push(auditRobotsTxt(existingGeoFiles.robotsTxt));

  // 2. sitemap.xml
  items.push(auditSitemap(existingGeoFiles.sitemapXml, pages.length));

  // 3. llms.txt
  items.push(auditLlmsTxt(existingGeoFiles.llmsTxt));

  // 4. Structured data (JSON-LD)
  items.push(auditStructuredData(crawlResult));

  // 5. Content renders without JS
  items.push(auditServerRendering(crawlResult));

  // 6. AI Bot Blocking — check if robots.txt accidentally blocks AI crawlers
  items.push(auditAiBotBlocking(existingGeoFiles.robotsTxt));

  // 7. Search Engine Indexing — verification tags, sitemap in robots, noindex check
  items.push(auditSearchIndexing(crawlResult));

  // ===== HIGH PRIORITY =====

  // 6. llms-full.txt
  items.push({
    name: 'llms-full.txt',
    category: 'high',
    score: existingGeoFiles.llmsFullTxt ? 100 : 0,
    maxScore: 100,
    status: existingGeoFiles.llmsFullTxt ? 'pass' : 'fail',
    details: existingGeoFiles.llmsFullTxt
      ? `Found llms-full.txt (${existingGeoFiles.llmsFullTxt.length} chars)`
      : 'No llms-full.txt found',
    recommendation: existingGeoFiles.llmsFullTxt
      ? 'llms-full.txt is present — good!'
      : 'Add /llms-full.txt with complete site content in markdown for bulk LLM ingestion',
  });

  // 7. ai.txt / ai.json
  items.push(auditAiPolicy(existingGeoFiles.aiTxt, existingGeoFiles.aiJson));

  // 8. Meta descriptions
  items.push(auditMetaDescriptions(crawlResult));

  // 9. Heading hierarchy
  items.push(auditHeadingHierarchy(crawlResult));

  // 10. Content Freshness — date signals and recency
  items.push(auditContentFreshness(crawlResult));

  // 11. Content Structure & Depth — word count and heading density
  items.push(auditContentDepth(crawlResult));

  // ===== MEDIUM PRIORITY =====

  // 10. security.txt
  items.push({
    name: 'security.txt',
    category: 'medium',
    score: existingGeoFiles.securityTxt ? 100 : 0,
    maxScore: 100,
    status: existingGeoFiles.securityTxt ? 'pass' : 'fail',
    details: existingGeoFiles.securityTxt
      ? 'security.txt found at /.well-known/security.txt'
      : 'No security.txt found',
    recommendation: existingGeoFiles.securityTxt
      ? 'RFC 9116 security.txt is present'
      : 'Add /.well-known/security.txt per RFC 9116 with security contact info',
  });

  // 11. TDM Reservation
  items.push({
    name: 'tdmrep.json',
    category: 'medium',
    score: existingGeoFiles.tdmrepJson ? 100 : 0,
    maxScore: 100,
    status: existingGeoFiles.tdmrepJson ? 'pass' : 'fail',
    details: existingGeoFiles.tdmrepJson
      ? 'TDM reservation found'
      : 'No TDM reservation found',
    recommendation: existingGeoFiles.tdmrepJson
      ? 'W3C TDM reservation is present'
      : 'Add /.well-known/tdmrep.json to define text/data mining rights',
  });

  // 12. Open Graph tags
  items.push(auditOpenGraph(crawlResult));

  // 13. AI Content Directives (max-snippet, max-image-preview)
  items.push(auditAiContentDirectives(crawlResult));

  // 14. manifest.json
  items.push({
    name: 'manifest.json',
    category: 'medium',
    score: existingGeoFiles.manifestJson ? 100 : 0,
    maxScore: 100,
    status: existingGeoFiles.manifestJson ? 'pass' : 'fail',
    details: existingGeoFiles.manifestJson
      ? 'Web manifest found'
      : 'No web manifest found',
    recommendation: existingGeoFiles.manifestJson
      ? 'Web manifest is present'
      : 'Add manifest.json for site identity metadata',
  });

  // ===== LOW PRIORITY =====

  // 15. humans.txt
  items.push({
    name: 'humans.txt',
    category: 'low',
    score: existingGeoFiles.humansTxt ? 100 : 0,
    maxScore: 100,
    status: existingGeoFiles.humansTxt ? 'pass' : 'fail',
    details: existingGeoFiles.humansTxt
      ? 'humans.txt found'
      : 'No humans.txt found',
    recommendation: existingGeoFiles.humansTxt
      ? 'humans.txt is present'
      : 'Add /humans.txt for team and technology info',
  });

  // 16. FAQ content
  items.push(auditFAQContent(crawlResult));

  // ===== SEO CHECKS =====

  // 17. Title Tag Quality
  items.push(auditTitleTags(crawlResult));

  // 18. Image Alt Text
  items.push(auditImageAltText(crawlResult));

  // 19. Internal Linking
  items.push(auditInternalLinking(crawlResult));

  // 20. Mobile Viewport
  items.push(auditMobileViewport(crawlResult));

  // 21. HTTPS Enforcement
  items.push(auditHttps(crawlResult));

  // 22. Broken Pages
  items.push(auditBrokenPages(crawlResult));

  // ===== E-E-A-T CHECKS =====

  items.push(auditAuthorExpertise(crawlResult));
  items.push(auditTrustSignals(crawlResult));
  items.push(auditSocialProof(crawlResult));
  items.push(auditCitationQuality(crawlResult));

  // ===== AEO CHECKS =====

  items.push(auditFeaturedSnippetReadiness(crawlResult));
  items.push(auditVoiceSearchOptimization(crawlResult));
  items.push(auditAnswerFormatDiversity(crawlResult));
  items.push(auditSchemaMarkupDiversity(crawlResult));

  // Calculate scores
  const weights: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0.5, seo: 1.5, eeat: 1.5, aeo: 1.5 };
  let totalWeightedScore = 0;
  let totalWeightedMax = 0;

  const summary = {
    critical: { passed: 0, total: 0 },
    high: { passed: 0, total: 0 },
    medium: { passed: 0, total: 0 },
    low: { passed: 0, total: 0 },
    seo: { passed: 0, total: 0 },
    eeat: { passed: 0, total: 0 },
    aeo: { passed: 0, total: 0 },
  };

  for (const item of items) {
    const weight = weights[item.category];
    totalWeightedScore += item.score * weight;
    totalWeightedMax += item.maxScore * weight;
    summary[item.category].total++;
    if (item.status === 'pass' || item.status === 'partial') summary[item.category].passed++;
  }

  const overallScore = totalWeightedMax > 0
    ? Math.round((totalWeightedScore / totalWeightedMax) * 100)
    : 0;

  return {
    overallScore,
    maxPossibleScore: 100,
    grade: scoreToGrade(overallScore),
    items,
    summary,
  };
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function auditRobotsTxt(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'robots.txt',
      category: 'critical',
      score: 0,
      maxScore: 100,
      status: 'fail',
      details: 'No robots.txt found',
      recommendation: 'Add /robots.txt with explicit AI crawler directives (GPTBot, ClaudeBot, PerplexityBot, etc.)',
    };
  }

  const aiCrawlers = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'Applebot-Extended'];
  const mentioned = aiCrawlers.filter(c => content.includes(c));

  if (mentioned.length === 0) {
    return {
      name: 'robots.txt',
      category: 'critical',
      score: 30,
      maxScore: 100,
      status: 'partial',
      details: 'robots.txt exists but has no AI crawler directives',
      recommendation: `Add explicit directives for AI crawlers: ${aiCrawlers.join(', ')}`,
    };
  }

  const score = Math.min(100, 30 + (mentioned.length / aiCrawlers.length) * 70);
  return {
    name: 'robots.txt',
    category: 'critical',
    score: Math.round(score),
    maxScore: 100,
    status: mentioned.length >= 3 ? 'pass' : 'partial',
    details: `robots.txt mentions ${mentioned.length}/${aiCrawlers.length} key AI crawlers: ${mentioned.join(', ')}`,
    recommendation: mentioned.length < aiCrawlers.length
      ? `Add directives for: ${aiCrawlers.filter(c => !mentioned.includes(c)).join(', ')}`
      : 'robots.txt has comprehensive AI crawler coverage',
  };
}

function auditSitemap(content: string | null, pageCount: number): AuditItem {
  if (!content) {
    return {
      name: 'sitemap.xml',
      category: 'critical',
      score: 0,
      maxScore: 100,
      status: 'fail',
      details: 'No sitemap.xml found',
      recommendation: 'Add /sitemap.xml with all discoverable URLs',
    };
  }

  const urlCount = (content.match(/<loc>/g) || []).length;
  const hasLastmod = content.includes('<lastmod>');

  let score = 50; // Base for existing
  if (urlCount > 0) score += 25;
  if (hasLastmod) score += 25;

  return {
    name: 'sitemap.xml',
    category: 'critical',
    score,
    maxScore: 100,
    status: score >= 75 ? 'pass' : 'partial',
    details: `Sitemap contains ${urlCount} URLs${hasLastmod ? ' with lastmod dates' : ' (no lastmod)'}. Crawled ${pageCount} pages.`,
    recommendation: !hasLastmod
      ? 'Add <lastmod> dates to sitemap entries for freshness signals'
      : 'Sitemap is well-configured',
  };
}

function auditLlmsTxt(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'llms.txt',
      category: 'critical',
      score: 0,
      maxScore: 100,
      status: 'fail',
      details: 'No llms.txt found',
      recommendation: 'Add /llms.txt following the llmstxt.org spec: H1 site name, blockquote summary, H2 sections with link lists',
    };
  }

  let score = 40; // Base for existing
  const hasH1 = /^# .+/m.test(content);
  const hasBlockquote = /^> .+/m.test(content);
  const hasH2 = /^## .+/m.test(content);
  const hasLinks = /\[.+\]\(.+\)/.test(content);

  if (hasH1) score += 15;
  if (hasBlockquote) score += 15;
  if (hasH2) score += 15;
  if (hasLinks) score += 15;

  return {
    name: 'llms.txt',
    category: 'critical',
    score,
    maxScore: 100,
    status: score >= 70 ? 'pass' : 'partial',
    details: `llms.txt found — H1: ${hasH1 ? 'yes' : 'no'}, Blockquote: ${hasBlockquote ? 'yes' : 'no'}, H2 sections: ${hasH2 ? 'yes' : 'no'}, Links: ${hasLinks ? 'yes' : 'no'}`,
    recommendation: score < 100
      ? 'Ensure llms.txt has: # Site Name, > summary blockquote, ## Sections with [link](url) lists'
      : 'llms.txt follows the spec correctly',
  };
}

function auditStructuredData(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let pagesWithJsonLd = 0;
  let totalJsonLdItems = 0;
  const schemaTypes = new Set<string>();
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.existingStructuredData.jsonLd.length > 0) {
      pagesWithJsonLd++;
      totalJsonLdItems += page.existingStructuredData.jsonLd.length;
      for (const item of page.existingStructuredData.jsonLd) {
        const rawType = item['@type'];
        if (Array.isArray(rawType)) {
          for (const t of rawType) schemaTypes.add(String(t));
        } else if (rawType) {
          schemaTypes.add(String(rawType));
        }
      }
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  if (totalJsonLdItems === 0) {
    return {
      name: 'Structured Data (JSON-LD)',
      category: 'critical',
      score: 0,
      maxScore: 100,
      status: 'fail',
      details: 'No JSON-LD structured data found on any page',
      recommendation: 'Add JSON-LD Schema.org markup: Organization on homepage, Article on blog posts, FAQPage on FAQ sections, Product on product pages',
      affectedUrls,
    };
  }

  const coverage = pages.length > 0 ? pagesWithJsonLd / pages.length : 0;
  const hasOrganization = schemaTypes.has('Organization');
  const hasWebSite = schemaTypes.has('WebSite');

  let score = Math.min(50, Math.round(coverage * 50));
  if (hasOrganization) score += 20;
  if (hasWebSite) score += 15;
  if (schemaTypes.size >= 3) score += 15;

  return {
    name: 'Structured Data (JSON-LD)',
    category: 'critical',
    score: Math.min(100, score),
    maxScore: 100,
    status: score >= 60 ? 'pass' : 'partial',
    details: `${pagesWithJsonLd}/${pages.length} pages have JSON-LD (${totalJsonLdItems} total items). Types: ${Array.from(schemaTypes).join(', ') || 'none'}`,
    recommendation: !hasOrganization
      ? 'Add Organization schema to homepage for entity disambiguation'
      : coverage < 0.5
        ? 'Increase JSON-LD coverage — aim for structured data on every significant page'
        : 'Good structured data coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditServerRendering(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let ssrPages = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    // If we got meaningful content via Cheerio (no JS), it's server-rendered
    if (page.content.wordCount > 50) {
      ssrPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = pages.length > 0 ? ssrPages / pages.length : 0;
  const score = Math.round(coverage * 100);

  return {
    name: 'Server-side Rendering',
    category: 'critical',
    score,
    maxScore: 100,
    status: coverage >= 0.8 ? 'pass' : coverage >= 0.5 ? 'partial' : 'fail',
    details: `${ssrPages}/${pages.length} pages have server-rendered content (>50 words without JS)`,
    recommendation: coverage < 0.8
      ? 'AI crawlers cannot execute JavaScript — ensure content is in initial HTML response via SSR/SSG'
      : 'Content renders without JavaScript — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditAiPolicy(aiTxt: string | null, aiJson: string | null): AuditItem {
  const hasTxt = !!aiTxt;
  const hasJson = !!aiJson;

  if (!hasTxt && !hasJson) {
    return {
      name: 'AI Policy (ai.txt / ai.json)',
      category: 'high',
      score: 0,
      maxScore: 100,
      status: 'fail',
      details: 'No ai.txt or ai.json found',
      recommendation: 'Add /ai.txt and /ai.json to define AI interaction permissions, restrictions, and attribution requirements',
    };
  }

  let score = hasTxt ? 50 : 0;
  score += hasJson ? 50 : 0;

  return {
    name: 'AI Policy (ai.txt / ai.json)',
    category: 'high',
    score,
    maxScore: 100,
    status: hasTxt && hasJson ? 'pass' : 'partial',
    details: `ai.txt: ${hasTxt ? 'found' : 'missing'}, ai.json: ${hasJson ? 'found' : 'missing'}`,
    recommendation: !hasTxt
      ? 'Add /ai.txt for human-readable AI policy'
      : !hasJson
        ? 'Add /ai.json for machine-parseable AI policy'
        : 'Both AI policy files are present',
  };
}

function auditMetaDescriptions(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withDescription = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    if (page.meta.description && page.meta.description.length >= 30) {
      withDescription++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = pages.length > 0 ? withDescription / pages.length : 0;
  const score = Math.round(coverage * 100);

  return {
    name: 'Meta Descriptions',
    category: 'high',
    score,
    maxScore: 100,
    status: coverage >= 0.8 ? 'pass' : coverage >= 0.5 ? 'partial' : 'fail',
    details: `${withDescription}/${pages.length} pages have meta descriptions (>=30 chars)`,
    recommendation: coverage < 0.8
      ? 'Add meaningful meta descriptions to all pages — AI engines use these for summaries and citations'
      : 'Good meta description coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditHeadingHierarchy(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let correctHierarchy = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const headings = page.content.headings;
    if (headings.length === 0) continue;

    const hasH1 = headings.some(h => h.level === 1);
    const h1Count = headings.filter(h => h.level === 1).length;

    // Check for no skipped levels
    let noSkips = true;
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level > headings[i - 1].level + 1) {
        noSkips = false;
        break;
      }
    }

    if (hasH1 && h1Count === 1 && noSkips) {
      correctHierarchy++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const pagesWithHeadings = pages.filter(p => p.content.headings.length > 0).length;
  const coverage = pagesWithHeadings > 0 ? correctHierarchy / pagesWithHeadings : 0;
  const score = Math.round(coverage * 100);

  return {
    name: 'Heading Hierarchy',
    category: 'high',
    score,
    maxScore: 100,
    status: coverage >= 0.8 ? 'pass' : coverage >= 0.5 ? 'partial' : 'fail',
    details: `${correctHierarchy}/${pagesWithHeadings} pages with headings have correct H1>H2>H3 hierarchy`,
    recommendation: coverage < 0.8
      ? 'Fix heading hierarchy: single H1, no skipped levels (H1>H2>H3). LLMs use headings to understand content structure.'
      : 'Heading hierarchy is clean',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
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

  return {
    name: 'Open Graph Tags',
    category: 'medium',
    score,
    maxScore: 100,
    status: coverage >= 0.8 ? 'pass' : coverage >= 0.5 ? 'partial' : 'fail',
    details: `${withOG}/${pages.length} pages have OG title + description`,
    recommendation: coverage < 0.8
      ? 'Add og:title and og:description to all pages for rich previews in AI responses'
      : 'Good Open Graph coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditAiContentDirectives(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withMaxSnippet = 0;
  let withMaxImagePreview = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const robots = page.meta.robots?.toLowerCase() || '';
    // Also check X-Robots-Tag header
    const xRobotsTag = (page.responseHeaders['x-robots-tag'] || '').toLowerCase();
    const combined = `${robots} ${xRobotsTag}`;

    const hasSnippet = combined.includes('max-snippet');
    const hasImagePreview = combined.includes('max-image-preview');
    if (hasSnippet) withMaxSnippet++;
    if (hasImagePreview) withMaxImagePreview++;
    if (!hasSnippet && !hasImagePreview) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const hasDirectives = withMaxSnippet > 0 || withMaxImagePreview > 0;
  const coverage = pages.length > 0
    ? Math.max(withMaxSnippet, withMaxImagePreview) / pages.length
    : 0;

  let score = 0;
  if (withMaxSnippet > 0) score += 50;
  if (withMaxImagePreview > 0) score += 50;
  // Scale by coverage
  score = Math.round(score * Math.max(coverage, hasDirectives ? 0.5 : 0));

  return {
    name: 'AI Content Directives',
    category: 'medium',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: hasDirectives
      ? `max-snippet on ${withMaxSnippet} pages, max-image-preview on ${withMaxImagePreview} pages`
      : 'No max-snippet or max-image-preview directives found',
    recommendation: !hasDirectives
      ? 'Add <meta name="robots" content="max-snippet:-1, max-image-preview:large"> to allow AI engines to use full content in responses'
      : coverage < 0.8
        ? 'Increase coverage of max-snippet and max-image-preview across all pages'
        : 'AI content directives are well-configured',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditAiBotBlocking(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'AI Bot Blocking',
      category: 'critical',
      score: 100,
      maxScore: 100,
      status: 'pass',
      details: 'No robots.txt found — AI bots are not blocked (but consider adding one with explicit Allow directives)',
      recommendation: 'Add /robots.txt with explicit "Allow: /" for AI crawlers to signal openness',
    };
  }

  const aiCrawlers = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
    'Google-Extended', 'Applebot-Extended', 'Meta-ExternalAgent', 'PerplexityBot',
    'Amazonbot', 'CCBot', 'DuckAssistBot', 'Bytespider',
  ];

  // Parse robots.txt into user-agent blocks
  const lines = content.split('\n').map(l => l.trim());
  const blockedBots: string[] = [];

  let currentAgents: string[] = [];
  for (const line of lines) {
    const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      currentAgents.push(agentMatch[1].trim());
      continue;
    }

    const disallowMatch = line.match(/^Disallow:\s*\/\s*$/i);
    if (disallowMatch && currentAgents.length > 0) {
      // "Disallow: /" — full block
      for (const agent of currentAgents) {
        if (agent === '*') {
          // Wildcard blocks all — check if any AI bot has a specific Allow override
          // We'll handle this conservatively: wildcard block counts for bots not explicitly allowed
          for (const bot of aiCrawlers) {
            if (!hasExplicitAllow(content, bot)) {
              blockedBots.push(bot);
            }
          }
        } else {
          const matchedBot = aiCrawlers.find(b => b.toLowerCase() === agent.toLowerCase());
          if (matchedBot) blockedBots.push(matchedBot);
        }
      }
    }

    // Reset current agents when we hit a non-agent, non-comment line
    if (!agentMatch && !line.startsWith('#') && line.length > 0) {
      currentAgents = [];
    }
  }

  const uniqueBlocked = [...new Set(blockedBots)];

  if (uniqueBlocked.length === 0) {
    return {
      name: 'AI Bot Blocking',
      category: 'critical',
      score: 100,
      maxScore: 100,
      status: 'pass',
      details: 'No AI crawlers are blocked in robots.txt',
      recommendation: 'robots.txt does not block AI crawlers — good!',
    };
  }

  const blockedPct = uniqueBlocked.length / aiCrawlers.length;
  const score = Math.round(Math.max(0, (1 - blockedPct) * 100));

  return {
    name: 'AI Bot Blocking',
    category: 'critical',
    score,
    maxScore: 100,
    status: blockedPct > 0.5 ? 'fail' : 'partial',
    details: `${uniqueBlocked.length}/${aiCrawlers.length} AI crawlers are blocked: ${uniqueBlocked.join(', ')}`,
    recommendation: `Remove "Disallow: /" for these AI crawlers to allow indexing: ${uniqueBlocked.join(', ')}. 5.9% of sites accidentally block GPTBot.`,
  };
}

function hasExplicitAllow(robotsTxt: string, botName: string): boolean {
  const lines = robotsTxt.split('\n').map(l => l.trim());
  let inBotBlock = false;
  for (const line of lines) {
    const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      inBotBlock = agentMatch[1].trim().toLowerCase() === botName.toLowerCase();
      continue;
    }
    if (inBotBlock && /^Allow:\s*\/\s*$/i.test(line)) return true;
    if (!agentMatch && !line.startsWith('#') && line.length > 0) {
      inBotBlock = false;
    }
  }
  return false;
}

function auditContentFreshness(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Content Freshness',
      category: 'high',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to assess content freshness',
    };
  }

  const now = Date.now();
  const twelveMonthsMs = 365 * 24 * 60 * 60 * 1000;
  const oneHourMs = 60 * 60 * 1000;
  let pagesWithDate = 0;
  let pagesRecent = 0;
  let pagesWithJsonLdDate = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    // Prefer HTML meta dates; only fall back to HTTP Last-Modified if it's
    // not suspiciously close to crawl time (CMS dynamic generation).
    let dateStr = page.meta.modifiedDate || page.meta.publishedDate;
    if (!dateStr && page.lastModified) {
      const lmTs = new Date(page.lastModified).getTime();
      if (!isNaN(lmTs) && (now - lmTs) > oneHourMs) {
        dateStr = page.lastModified;
      }
    }
    if (dateStr) {
      pagesWithDate++;
      const ts = new Date(dateStr).getTime();
      if (!isNaN(ts) && (now - ts) < twelveMonthsMs) {
        pagesRecent++;
      }
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }

    // Check for dateModified in JSON-LD
    for (const ld of page.existingStructuredData.jsonLd) {
      if (ld.dateModified || ld.datePublished) {
        pagesWithJsonLdDate++;
        break;
      }
    }
  }

  const dateCoverage = pagesWithDate / pages.length;
  const recencyRatio = pagesWithDate > 0 ? pagesRecent / pagesWithDate : 0;
  const jsonLdDateRatio = pages.length > 0 ? pagesWithJsonLdDate / pages.length : 0;

  // Score: date signal presence (50pts) + recency (30pts) + JSON-LD dates (20pts)
  const score = Math.min(100, Math.round(
    dateCoverage * 50 +
    recencyRatio * 30 +
    jsonLdDateRatio * 20
  ));

  return {
    name: 'Content Freshness',
    category: 'high',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${pagesWithDate}/${pages.length} pages have date signals, ${pagesRecent} updated within 12 months, ${pagesWithJsonLdDate} with JSON-LD dates`,
    recommendation: score < 60
      ? 'Add dateModified to JSON-LD and keep content updated — AI-cited content is 25.7% fresher than traditional results'
      : 'Content freshness signals are strong',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditContentDepth(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Content Structure & Depth',
      category: 'high',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to assess content depth',
    };
  }

  let thinPages = 0;      // <300 words
  let substantivePages = 0; // >500 words
  let wellStructured = 0;   // >500 words AND >=3 headings
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const words = page.content.wordCount;
    const headingCount = page.content.headings.length;

    if (words < 300) {
      thinPages++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
    if (words > 500) {
      substantivePages++;
      if (headingCount >= 3) wellStructured++;
    }
  }

  const thinRatio = thinPages / pages.length;
  const depthRatio = substantivePages / pages.length;
  const structureRatio = substantivePages > 0 ? wellStructured / substantivePages : 0;

  // Score: thin penalty (30pts, inverted), depth (40pts), structure (30pts)
  const score = Math.min(100, Math.round(
    (1 - thinRatio) * 30 +
    depthRatio * 40 +
    structureRatio * 30
  ));

  return {
    name: 'Content Structure & Depth',
    category: 'high',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${substantivePages}/${pages.length} pages >500 words, ${wellStructured} well-structured (>=3 headings), ${thinPages} thin pages (<300 words)`,
    recommendation: score < 60
      ? 'Add more substantive content (>500 words) with clear heading structure (>=3 headings). AI engines chunk content by paragraphs under headings.'
      : 'Content depth and structure are solid',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditSearchIndexing(crawlResult: SiteCrawlResult): AuditItem {
  const { pages, existingGeoFiles } = crawlResult;
  let score = 0;
  const signals: string[] = [];
  const missing: string[] = [];
  const affectedUrls: string[] = [];

  // 1. Google Search Console verification tag (20 pts)
  const hasGoogleVerification = pages.some(p => p.meta.googleVerification);
  if (hasGoogleVerification) {
    score += 20;
    signals.push('Google Search Console verification');
  } else {
    missing.push('Google Search Console verification tag');
  }

  // 2. Bing Webmaster Tools verification — meta tag OR BingSiteAuth.xml (20 pts)
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

  // 3. Sitemap referenced in robots.txt (20 pts)
  const robotsTxt = existingGeoFiles.robotsTxt || '';
  const hasSitemapInRobots = /^Sitemap:/im.test(robotsTxt);
  if (hasSitemapInRobots) {
    score += 20;
    signals.push('Sitemap in robots.txt');
  } else {
    missing.push('Sitemap directive in robots.txt');
  }

  // 4. No noindex blocking (20 pts)
  const noindexPages = pages.filter(p => {
    const robots = p.meta.robots?.toLowerCase() || '';
    const xRobotsTag = (p.responseHeaders['x-robots-tag'] || '').toLowerCase();
    return robots.includes('noindex') || xRobotsTag.includes('noindex');
  });
  if (noindexPages.length === 0) {
    score += 20;
    signals.push('No noindex pages');
  } else {
    missing.push(`${noindexPages.length} page(s) with noindex`);
    for (const p of noindexPages) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(p.url);
    }
  }

  // 5. Canonical URLs properly set (20 pts)
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

  // Deduplicate affected URLs (a page could be added for both noindex and missing canonical)
  const uniqueAffected = [...new Set(affectedUrls)].slice(0, MAX_AFFECTED_URLS);

  return {
    name: 'Search Engine Indexing',
    category: 'critical',
    score,
    maxScore: 100,
    status: score === 100 ? 'pass' : score >= 50 ? 'partial' : 'fail',
    details,
    recommendation,
    ...(uniqueAffected.length > 0 ? { affectedUrls: uniqueAffected } : {}),
  };
}

// ===== SEO AUDIT FUNCTIONS =====

function auditTitleTags(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Title Tags',
      category: 'seo',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to assess title tags',
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

  // Also add pages with duplicate titles
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

  // Coverage (40pts) + length quality (30pts) + uniqueness (30pts)
  const score = Math.min(100, Math.round(
    coverage * 40 +
    lengthRatio * 30 +
    uniqueRatio * 30
  ));

  return {
    name: 'Title Tags',
    category: 'seo',
    score,
    maxScore: 100,
    status: score >= 70 ? 'pass' : score >= 40 ? 'partial' : 'fail',
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
    return {
      name: 'Image Alt Text',
      category: 'seo',
      score: 100,
      maxScore: 100,
      status: 'pass',
      details: 'No images found on crawled pages',
      recommendation: 'No images to check — not applicable',
    };
  }

  const ratio = withAlt / totalImages;
  const score = Math.round(ratio * 100);

  return {
    name: 'Image Alt Text',
    category: 'seo',
    score,
    maxScore: 100,
    status: score >= 80 ? 'pass' : score >= 50 ? 'partial' : 'fail',
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
      name: 'Internal Linking',
      category: 'seo',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to assess internal linking',
    };
  }

  // Build inbound link map
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
  // Exclude homepage from orphan check (it's the entry point)
  const nonHomeOrphans = orphanPages.filter(([url]) => {
    try { return new URL(url).pathname !== '/'; } catch { return true; }
  });

  const affectedUrls = nonHomeOrphans.map(([url]) => url).slice(0, MAX_AFFECTED_URLS);

  const orphanRatio = pages.length > 1 ? nonHomeOrphans.length / (pages.length - 1) : 0;

  // Avg links quality (50pts) + orphan penalty (50pts)
  const linkScore = Math.min(50, avgLinksPerPage >= 5 ? 50 : Math.round((avgLinksPerPage / 5) * 50));
  const orphanScore = Math.round((1 - orphanRatio) * 50);
  const score = Math.min(100, linkScore + orphanScore);

  return {
    name: 'Internal Linking',
    category: 'seo',
    score,
    maxScore: 100,
    status: score >= 70 ? 'pass' : score >= 40 ? 'partial' : 'fail',
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
      name: 'Mobile Viewport',
      category: 'seo',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to assess mobile viewport',
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

  return {
    name: 'Mobile Viewport',
    category: 'seo',
    score,
    maxScore: 100,
    status: coverage >= 0.9 ? 'pass' : coverage >= 0.5 ? 'partial' : 'fail',
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
      name: 'HTTPS Enforcement',
      category: 'seo',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to assess HTTPS usage',
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

  return {
    name: 'HTTPS Enforcement',
    category: 'seo',
    score,
    maxScore: 100,
    status: ratio === 1 ? 'pass' : ratio >= 0.8 ? 'partial' : 'fail',
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
      name: 'Broken Pages',
      category: 'seo',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      details: 'No pages crawled',
      recommendation: 'Crawl pages to check for broken pages',
    };
  }

  const brokenPages = pages.filter(p => p.statusCode < 200 || p.statusCode >= 400);
  const affectedUrls = brokenPages.map(p => p.url).slice(0, MAX_AFFECTED_URLS);
  const ratio = brokenPages.length / pages.length;
  const score = Math.round((1 - ratio) * 100);

  return {
    name: 'Broken Pages',
    category: 'seo',
    score,
    maxScore: 100,
    status: brokenPages.length === 0 ? 'pass' : ratio <= 0.1 ? 'partial' : 'fail',
    details: brokenPages.length === 0
      ? `All ${pages.length} crawled pages returned successful status codes`
      : `${brokenPages.length}/${pages.length} pages returned error status codes: ${brokenPages.slice(0, 3).map(p => `${p.url} (${p.statusCode})`).join(', ')}${brokenPages.length > 3 ? '...' : ''}`,
    recommendation: brokenPages.length > 0
      ? 'Fix or remove broken pages (4xx/5xx status codes). Broken pages waste crawl budget and harm user experience.'
      : 'No broken pages detected',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== E-E-A-T AUDIT FUNCTIONS =====

function auditAuthorExpertise(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return { name: 'Author & Expertise Signals', category: 'eeat', score: 0, maxScore: 100, status: 'not_applicable', details: 'No pages crawled', recommendation: 'Crawl pages to assess author signals' };
  }

  let pagesWithAuthor = 0;
  let pagesWithBio = 0;
  const affectedUrls: string[] = [];

  // Only check content pages (>200 words)
  const contentPages = pages.filter(p => p.content.wordCount > 200);

  for (const page of contentPages) {
    const hasAuthor = !!page.meta.author;
    const hasBio = !!page.meta.authorBio;
    if (hasAuthor) pagesWithAuthor++;
    if (hasBio) pagesWithBio++;
    if (!hasAuthor && affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
  }

  if (contentPages.length === 0) {
    return { name: 'Author & Expertise Signals', category: 'eeat', score: 50, maxScore: 100, status: 'partial', details: 'No content pages (>200 words) found to assess', recommendation: 'Add substantive content pages with author attribution' };
  }

  const authorCoverage = pagesWithAuthor / contentPages.length;
  const bioCoverage = contentPages.length > 0 ? pagesWithBio / contentPages.length : 0;

  // Author attribution (60pts) + author bios (40pts)
  const score = Math.min(100, Math.round(authorCoverage * 60 + bioCoverage * 40));

  return {
    name: 'Author & Expertise Signals',
    category: 'eeat',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${pagesWithAuthor}/${contentPages.length} content pages have author attribution, ${pagesWithBio} with author bios`,
    recommendation: score < 60
      ? 'Add author names and bios to content pages. AI engines use author signals for E-E-A-T (Experience, Expertise, Authoritativeness, Trust) scoring.'
      : 'Author expertise signals are present',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditTrustSignals(crawlResult: SiteCrawlResult): AuditItem {
  const { siteIdentity, pages } = crawlResult;
  let score = 0;
  const signals: string[] = [];
  const missing: string[] = [];

  // Contact info (30pts)
  const hasEmail = !!siteIdentity.contactEmail;
  const hasPhone = !!siteIdentity.contactPhone;
  const hasAddress = !!siteIdentity.address;
  const contactScore = (hasEmail ? 10 : 0) + (hasPhone ? 10 : 0) + (hasAddress ? 10 : 0);
  score += contactScore;
  if (hasEmail) signals.push('email');
  if (hasPhone) signals.push('phone');
  if (hasAddress) signals.push('address');
  if (!hasEmail && !hasPhone && !hasAddress) missing.push('contact information (email, phone, or address)');

  // About page (25pts)
  const hasAbout = pages.some(p => {
    const path = new URL(p.url).pathname.toLowerCase();
    return /\/(about|apie|about-us|company)/.test(path);
  });
  if (hasAbout) { score += 25; signals.push('about page'); }
  else missing.push('about/company page');

  // Privacy/Terms pages (25pts)
  const hasPrivacy = pages.some(p => /\/(privacy|privatumas)/i.test(new URL(p.url).pathname));
  const hasTerms = pages.some(p => /\/(terms|salygos|conditions)/i.test(new URL(p.url).pathname));
  if (hasPrivacy) { score += 15; signals.push('privacy policy'); }
  else missing.push('privacy policy page');
  if (hasTerms) { score += 10; signals.push('terms page'); }

  // Site identity consistency (20pts)
  if (siteIdentity.name) { score += 10; signals.push('site name'); }
  if (siteIdentity.logoUrl) { score += 10; signals.push('logo'); }

  score = Math.min(100, score);

  return {
    name: 'Trust Signals',
    category: 'eeat',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
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

  // Social link count (60pts)
  const linkCount = socialLinks.length;
  score += Math.min(60, linkCount * 15);

  // Platform diversity (40pts) — different types of platforms
  const majorPlatforms = ['facebook', 'twitter', 'x', 'linkedin', 'instagram', 'youtube', 'github', 'tiktok'];
  const majorCount = majorPlatforms.filter(p => platforms.has(p)).length;
  score += Math.min(40, majorCount * 10);

  score = Math.min(100, score);

  return {
    name: 'Social Proof & Authority',
    category: 'eeat',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
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
    return { name: 'Citation Quality', category: 'eeat', score: 0, maxScore: 100, status: 'not_applicable', details: 'No content pages found', recommendation: 'Add content pages with citations and data' };
  }

  const statsRatio = pagesWithStats / contentPages.length;
  const sourceRatio = pagesWithSources / contentPages.length;
  const extLinkRatio = pagesWithExtLinks / contentPages.length;

  // Statistics (35pts) + source citations (35pts) + external authority links (30pts)
  const score = Math.min(100, Math.round(statsRatio * 35 + sourceRatio * 35 + extLinkRatio * 30));

  return {
    name: 'Citation Quality',
    category: 'eeat',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${pagesWithStats}/${contentPages.length} pages with statistics, ${pagesWithSources} with source citations, ${pagesWithExtLinks} with external links`,
    recommendation: score < 60
      ? 'Add data-backed claims (statistics, research citations, expert quotes) to content pages. AI engines favor well-cited content for featured responses.'
      : 'Content is well-cited with data and sources',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== AEO AUDIT FUNCTIONS =====

function auditFeaturedSnippetReadiness(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let snippetReadyPages = 0;
  let definitionPages = 0;
  const affectedUrls: string[] = [];

  const contentPages = pages.filter(p => p.content.wordCount > 100);

  for (const page of contentPages) {
    const { headings, bodyText } = page.content;
    let hasSnippetParagraph = false;

    // Check for concise answer paragraphs (40-60 words) following headings
    // We approximate by looking at the body text for paragraph-sized chunks
    const paragraphs = bodyText.split(/\.\s+/).filter(s => s.trim().length > 0);
    for (const para of paragraphs) {
      const words = para.split(/\s+/).length;
      if (words >= 30 && words <= 70) {
        hasSnippetParagraph = true;
        break;
      }
    }

    // Check for definition-style content ("X is...", "X refers to...")
    const hasDefinition = /\b(?:is a|is an|refers to|is defined as|means)\b/i.test(bodyText);
    if (hasDefinition) definitionPages++;

    if (hasSnippetParagraph) {
      snippetReadyPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  if (contentPages.length === 0) {
    return { name: 'Featured Snippet Readiness', category: 'aeo', score: 0, maxScore: 100, status: 'not_applicable', details: 'No content pages found', recommendation: 'Add content pages optimized for featured snippets' };
  }

  const snippetRatio = snippetReadyPages / contentPages.length;
  const defRatio = definitionPages / contentPages.length;

  // Snippet-length paragraphs (70pts) + definition content (30pts)
  const score = Math.min(100, Math.round(snippetRatio * 70 + defRatio * 30));

  return {
    name: 'Featured Snippet Readiness',
    category: 'aeo',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${snippetReadyPages}/${contentPages.length} pages have snippet-ready paragraphs (30-70 words), ${definitionPages} with definition-style content`,
    recommendation: score < 60
      ? 'Add concise answer paragraphs (40-60 words) directly under headings. Include "what is X" definitions. These formats are preferred for AI-generated featured snippets.'
      : 'Content is well-optimized for featured snippets',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditVoiceSearchOptimization(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let questionHeadings = 0;
  let totalHeadings = 0;
  let pagesWithShortAnswers = 0;
  const affectedUrls: string[] = [];

  const contentPages = pages.filter(p => p.content.wordCount > 100);

  for (const page of contentPages) {
    let hasQuestionHeading = false;
    let hasShortAnswer = false;

    for (const h of page.content.headings) {
      totalHeadings++;
      // Natural language headings (questions)
      if (/\?$/.test(h.text) || /^(how|what|why|when|where|who|which|can|does|is|are|should)\b/i.test(h.text)) {
        questionHeadings++;
        hasQuestionHeading = true;
      }
    }

    // Short direct answers — sentences under 30 words
    const sentences = page.content.bodyText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const shortAnswers = sentences.filter(s => s.trim().split(/\s+/).length <= 30 && s.trim().split(/\s+/).length >= 5);
    if (shortAnswers.length > 0) {
      hasShortAnswer = true;
      pagesWithShortAnswers++;
    }

    if (!hasQuestionHeading && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  if (contentPages.length === 0) {
    return { name: 'Voice Search Optimization', category: 'aeo', score: 0, maxScore: 100, status: 'not_applicable', details: 'No content pages found', recommendation: 'Add content optimized for voice search queries' };
  }

  const questionRatio = totalHeadings > 0 ? questionHeadings / totalHeadings : 0;
  const shortAnswerRatio = pagesWithShortAnswers / contentPages.length;

  // Question headings (50pts) + short direct answers (50pts)
  const score = Math.min(100, Math.round(questionRatio * 50 + shortAnswerRatio * 50));

  return {
    name: 'Voice Search Optimization',
    category: 'aeo',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${questionHeadings}/${totalHeadings} headings are questions, ${pagesWithShortAnswers}/${contentPages.length} pages have short direct answers`,
    recommendation: score < 60
      ? 'Use question-format headings (How, What, Why...) and provide direct, concise answers. Voice assistants prefer natural language Q&A formatting.'
      : 'Content is well-optimized for voice search',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditAnswerFormatDiversity(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let pagesWithTables = 0;
  let pagesWithOrderedLists = 0;
  let pagesWithFaq = 0;
  let pagesWithHowTo = 0;

  for (const page of pages) {
    if (page.content.tables.length > 0) pagesWithTables++;
    if (page.content.lists.length > 0) pagesWithOrderedLists++;
    if (page.content.faqItems.length > 0) pagesWithFaq++;
    // HowTo detection: step-like headings
    const hasSteps = page.content.headings.some(h => /^(step\s+\d+|^\d+[.)]\s)/i.test(h.text));
    if (hasSteps) pagesWithHowTo++;
  }

  const formatTypes = [pagesWithTables > 0, pagesWithOrderedLists > 0, pagesWithFaq > 0, pagesWithHowTo > 0];
  const diversityCount = formatTypes.filter(Boolean).length;

  // Diversity of formats (60pts, 15 per type) + coverage breadth (40pts)
  const diversityScore = diversityCount * 15;
  const totalFormatted = pages.length > 0
    ? (pagesWithTables + pagesWithOrderedLists + pagesWithFaq + pagesWithHowTo) / (pages.length * 4)
    : 0;
  const coverageScore = Math.round(totalFormatted * 40);

  const score = Math.min(100, diversityScore + coverageScore);

  return {
    name: 'Answer Format Diversity',
    category: 'aeo',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `Format types: tables (${pagesWithTables} pages), lists (${pagesWithOrderedLists}), FAQ (${pagesWithFaq}), HowTo steps (${pagesWithHowTo}). ${diversityCount}/4 format types used.`,
    recommendation: score < 60
      ? 'Diversify answer formats: add comparison tables, numbered steps, FAQ sections, and ordered lists. AI engines select different formats for different query types.'
      : 'Good diversity of answer formats',
  };
}

function auditSchemaMarkupDiversity(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const schemaTypes = new Set<string>();

  for (const page of pages) {
    for (const item of page.existingStructuredData.jsonLd) {
      const rawType = item['@type'];
      if (Array.isArray(rawType)) {
        for (const t of rawType) schemaTypes.add(String(t));
      } else if (rawType) {
        schemaTypes.add(String(rawType));
      }
    }
  }

  const valuableTypes = ['FAQPage', 'HowTo', 'Article', 'BlogPosting', 'Product', 'BreadcrumbList', 'Organization', 'WebSite', 'LocalBusiness', 'Review'];
  const foundValuable = valuableTypes.filter(t => schemaTypes.has(t));

  // Diverse schema types: 25pts per type up to 100
  const score = Math.min(100, foundValuable.length * 25);

  return {
    name: 'Schema Markup Diversity',
    category: 'aeo',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : score > 0 ? 'partial' : 'fail',
    details: `${schemaTypes.size} schema types found${foundValuable.length > 0 ? ': ' + foundValuable.join(', ') : ''}. ${foundValuable.length} high-value types for AEO.`,
    recommendation: score < 60
      ? 'Add diverse schema types: FAQPage, HowTo, Article, Product, BreadcrumbList. Each schema type enables different AI answer formats.'
      : 'Schema markup diversity is strong',
  };
}

// ===== PRIORITY ACTION ITEMS =====

export interface PriorityAction {
  name: string;
  category: string;
  currentScore: number;
  potentialScore: number;
  scoreImpact: number;
  effort: 'easy' | 'medium' | 'hard';
  seoImpact: 'foundational' | 'high' | 'medium' | 'low';
  timeToImpact: 'immediate' | '2-4 weeks' | '2-6 months';
  recommendation: string;
  affectedUrls?: string[];
}

const AUTO_GENERATED_ITEMS_SET = new Set([
  'robots.txt',
  'AI Bot Blocking',
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
  'AI Policy (ai.txt / ai.json)',
  'security.txt',
  'tdmrep.json',
  'humans.txt',
  'manifest.json',
  'Structured Data (JSON-LD)',
]);

const EFFORT_MAP: Record<string, 'easy' | 'medium' | 'hard'> = {
  'Open Graph Tags': 'easy',
  'AI Content Directives': 'easy',
  'Mobile Viewport': 'easy',
  'Meta Descriptions': 'medium',
  'Image Alt Text': 'medium',
  'Title Tags': 'medium',
  'Content Freshness': 'medium',
  'Internal Linking': 'medium',
  'Server-side Rendering': 'hard',
  'Heading Hierarchy': 'hard',
  'Content Structure & Depth': 'hard',
  'Search Engine Indexing': 'hard',
  'FAQ Content': 'hard',
  'HTTPS Enforcement': 'hard',
  'Broken Pages': 'medium',
  'Author & Expertise Signals': 'hard',
  'Trust Signals': 'hard',
  'Social Proof & Authority': 'hard',
  'Citation Quality': 'hard',
  'Featured Snippet Readiness': 'hard',
  'Voice Search Optimization': 'hard',
  'Answer Format Diversity': 'hard',
  'Schema Markup Diversity': 'hard',
};

const SEO_IMPACT_MAP: Record<string, 'foundational' | 'high' | 'medium' | 'low'> = {
  'Search Engine Indexing': 'foundational',
  'HTTPS Enforcement': 'foundational',
  'Broken Pages': 'foundational',
  'Server-side Rendering': 'foundational',
  'Title Tags': 'high',
  'Meta Descriptions': 'high',
  'Content Structure & Depth': 'high',
  'Heading Hierarchy': 'high',
  'Internal Linking': 'high',
  'Image Alt Text': 'medium',
  'FAQ Content': 'medium',
  'Mobile Viewport': 'medium',
  'Open Graph Tags': 'medium',
  'AI Content Directives': 'medium',
  'Content Freshness': 'medium',
  'Author & Expertise Signals': 'low',
  'Trust Signals': 'low',
  'Social Proof & Authority': 'low',
  'Citation Quality': 'low',
  'Featured Snippet Readiness': 'low',
  'Voice Search Optimization': 'low',
  'Answer Format Diversity': 'low',
  'Schema Markup Diversity': 'low',
};

const TIME_TO_IMPACT_MAP: Record<string, 'immediate' | '2-4 weeks' | '2-6 months'> = {
  'Open Graph Tags': 'immediate',
  'AI Content Directives': 'immediate',
  'Mobile Viewport': 'immediate',
  'Meta Descriptions': '2-4 weeks',
  'Image Alt Text': '2-4 weeks',
  'Title Tags': '2-4 weeks',
  'Broken Pages': '2-4 weeks',
  'Internal Linking': '2-4 weeks',
  'Content Freshness': '2-4 weeks',
  'Heading Hierarchy': '2-4 weeks',
  'Server-side Rendering': '2-6 months',
  'Content Structure & Depth': '2-6 months',
  'Search Engine Indexing': '2-6 months',
  'FAQ Content': '2-6 months',
  'HTTPS Enforcement': '2-6 months',
  'Author & Expertise Signals': '2-6 months',
  'Trust Signals': '2-6 months',
  'Social Proof & Authority': '2-6 months',
  'Citation Quality': '2-6 months',
  'Featured Snippet Readiness': '2-6 months',
  'Voice Search Optimization': '2-6 months',
  'Answer Format Diversity': '2-6 months',
  'Schema Markup Diversity': '2-6 months',
};

export function calculatePriorityActions(audit: AuditResult): PriorityAction[] {
  const weights: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0.5, seo: 1.5, eeat: 1.5, aeo: 1.5 };

  // Calculate total weighted max for score impact calculation
  let totalWeightedMax = 0;
  for (const item of audit.items) {
    totalWeightedMax += item.maxScore * weights[item.category];
  }

  const actions: PriorityAction[] = [];

  for (const item of audit.items) {
    // Skip auto-generated items, passing items, and items at max score
    if (AUTO_GENERATED_ITEMS_SET.has(item.name)) continue;
    if (item.status === 'pass' || item.score >= 100) continue;

    const weight = weights[item.category];
    const scoreImpact = totalWeightedMax > 0
      ? Math.round(((item.maxScore - item.score) * weight / totalWeightedMax) * 100 * 10) / 10
      : 0;

    // Dynamic effort: Meta Descriptions becomes 'hard' if score < 50 (meaning >50% pages affected)
    let effort = EFFORT_MAP[item.name] || 'medium';
    if (item.name === 'Meta Descriptions' && item.score < 50) {
      effort = 'hard';
    }

    actions.push({
      name: item.name,
      category: item.category,
      currentScore: item.score,
      potentialScore: item.maxScore,
      scoreImpact,
      effort,
      seoImpact: SEO_IMPACT_MAP[item.name] || 'low',
      timeToImpact: TIME_TO_IMPACT_MAP[item.name] || '2-6 months',
      recommendation: item.recommendation,
      ...(item.affectedUrls && item.affectedUrls.length > 0 ? { affectedUrls: item.affectedUrls } : {}),
    });
  }

  // Sort by score impact descending, return top 5
  actions.sort((a, b) => b.scoreImpact - a.scoreImpact);
  return actions.slice(0, 5);
}

function auditFAQContent(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let totalFAQs = 0;
  let pagesWithFAQ = 0;
  let hasFAQPageSchema = false;

  for (const page of pages) {
    const faqCount = page.content.faqItems.length;
    if (faqCount > 0) {
      totalFAQs += faqCount;
      pagesWithFAQ++;
    }
    // Check for FAQPage JSON-LD schema
    for (const item of page.existingStructuredData.jsonLd) {
      if (item['@type'] === 'FAQPage') {
        hasFAQPageSchema = true;
      }
    }
  }

  if (totalFAQs === 0) {
    return {
      name: 'FAQ Content',
      category: 'low',
      score: 0,
      maxScore: 100,
      status: 'fail',
      details: 'No FAQ content detected on any page',
      recommendation: 'Add FAQ sections to high-traffic pages. FAQPage schema has the highest AI citation probability.',
    };
  }

  // Score: base from FAQ count (up to 60), bonus for FAQPage schema (up to 40)
  let score = Math.min(60, totalFAQs * 15);
  if (hasFAQPageSchema) score += 40;
  score = Math.min(100, score);

  const schemaNote = hasFAQPageSchema ? ' with FAQPage schema' : ' (no FAQPage schema)';
  return {
    name: 'FAQ Content',
    category: 'low',
    score,
    maxScore: 100,
    status: score >= 60 ? 'pass' : 'partial',
    details: `${totalFAQs} FAQ items on ${pagesWithFAQ} pages${schemaNote}`,
    recommendation: !hasFAQPageSchema
      ? 'Add FAQPage JSON-LD schema markup alongside FAQ content for maximum AI citation rates'
      : totalFAQs < 5
        ? 'Add more FAQ content to additional high-traffic pages'
        : 'FAQ content with schema markup detected — good!',
  };
}
