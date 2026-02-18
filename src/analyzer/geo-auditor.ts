/**
 * GEO Compliance Auditor — scores a site's existing AI/LLM readiness.
 * Checks for presence and quality of each GEO element.
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';

export interface AuditItem {
  name: string;
  category: 'critical' | 'high' | 'medium' | 'low';
  score: number;       // 0-100
  maxScore: number;
  status: 'pass' | 'partial' | 'fail' | 'not_applicable';
  details: string;
  recommendation: string;
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

  // Calculate scores
  const weights = { critical: 3, high: 2, medium: 1, low: 0.5 };
  let totalWeightedScore = 0;
  let totalWeightedMax = 0;

  const summary = {
    critical: { passed: 0, total: 0 },
    high: { passed: 0, total: 0 },
    medium: { passed: 0, total: 0 },
    low: { passed: 0, total: 0 },
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

  for (const page of pages) {
    if (page.existingStructuredData.jsonLd.length > 0) {
      pagesWithJsonLd++;
      totalJsonLdItems += page.existingStructuredData.jsonLd.length;
      for (const item of page.existingStructuredData.jsonLd) {
        const type = (item['@type'] as string) || 'unknown';
        schemaTypes.add(type);
      }
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
  };
}

function auditServerRendering(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let ssrPages = 0;

  for (const page of pages) {
    // If we got meaningful content via Cheerio (no JS), it's server-rendered
    if (page.content.wordCount > 50) ssrPages++;
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

  for (const page of pages) {
    if (page.meta.description && page.meta.description.length >= 30) {
      withDescription++;
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
  };
}

function auditHeadingHierarchy(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let correctHierarchy = 0;

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

    if (hasH1 && h1Count === 1 && noSkips) correctHierarchy++;
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
  };
}

function auditOpenGraph(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withOG = 0;

  for (const page of pages) {
    if (page.meta.ogTitle && page.meta.ogDescription) withOG++;
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
  };
}

function auditAiContentDirectives(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withMaxSnippet = 0;
  let withMaxImagePreview = 0;

  for (const page of pages) {
    const robots = page.meta.robots?.toLowerCase() || '';
    // Also check X-Robots-Tag header
    const xRobotsTag = (page.responseHeaders['x-robots-tag'] || '').toLowerCase();
    const combined = `${robots} ${xRobotsTag}`;

    if (combined.includes('max-snippet')) withMaxSnippet++;
    if (combined.includes('max-image-preview')) withMaxImagePreview++;
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
  let pagesWithDate = 0;
  let pagesRecent = 0;
  let pagesWithJsonLdDate = 0;

  for (const page of pages) {
    const dateStr = page.meta.modifiedDate || page.meta.publishedDate || page.lastModified;
    if (dateStr) {
      pagesWithDate++;
      const ts = new Date(dateStr).getTime();
      if (!isNaN(ts) && (now - ts) < twelveMonthsMs) {
        pagesRecent++;
      }
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

  for (const page of pages) {
    const words = page.content.wordCount;
    const headingCount = page.content.headings.length;

    if (words < 300) thinPages++;
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
  };
}

function auditSearchIndexing(crawlResult: SiteCrawlResult): AuditItem {
  const { pages, existingGeoFiles } = crawlResult;
  let score = 0;
  const signals: string[] = [];
  const missing: string[] = [];

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
  } else {
    missing.push('No canonical URLs set');
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

  return {
    name: 'Search Engine Indexing',
    category: 'critical',
    score,
    maxScore: 100,
    status: score === 100 ? 'pass' : score >= 50 ? 'partial' : 'fail',
    details,
    recommendation,
  };
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
