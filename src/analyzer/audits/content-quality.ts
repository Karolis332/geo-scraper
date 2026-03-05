/**
 * Content Quality audit checks (category weight: 2.5x)
 */

import type { SiteCrawlResult } from '../../crawler/page-data.js';
import type { AuditItem } from './types.js';
import { MAX_AFFECTED_URLS, resolveSeverity } from './types.js';

export function auditContentQuality(crawlResult: SiteCrawlResult): AuditItem[] {
  const items: AuditItem[] = [];

  items.push(auditStructuredData(crawlResult));
  items.push(auditFAQContent(crawlResult));
  items.push(auditContentDepth(crawlResult));
  items.push(auditHeadingHierarchy(crawlResult));
  items.push(auditMetaDescriptions(crawlResult));
  items.push(auditContentFreshness(crawlResult));
  items.push(auditSchemaMarkupDiversity(crawlResult));
  items.push(auditFeaturedSnippetReadiness(crawlResult));
  items.push(auditAnswerFormatDiversity(crawlResult));
  items.push(auditVoiceSearchOptimization(crawlResult));
  // New Tier 1 checks
  items.push(auditDuplicateTitles(crawlResult));
  items.push(auditDuplicateMetaDescriptions(crawlResult));
  items.push(auditContentTooLong(crawlResult));
  items.push(auditParagraphLength(crawlResult));
  items.push(auditAnswerFirstContent(crawlResult));
  items.push(auditOrganizationSchemaCompleteness(crawlResult));
  // New Tier 2 checks
  items.push(auditSecurityHeaders(crawlResult));
  items.push(auditCompression(crawlResult));
  // Tier 3 checks
  items.push(auditContentQuotability(crawlResult));
  items.push(auditTopicClusterDetection(crawlResult));
  // Semrush-aligned checks
  items.push(auditContentReadability(crawlResult));

  return items;
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
      category: 'content_quality',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: resolveSeverity('Structured Data (JSON-LD)', 'fail'),
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

  const finalScore = Math.min(100, score);
  const status = finalScore >= 60 ? 'pass' as const : 'partial' as const;
  return {
    name: 'Structured Data (JSON-LD)',
    category: 'content_quality',
    score: finalScore,
    maxScore: 100,
    status,
    severity: resolveSeverity('Structured Data (JSON-LD)', status),
    details: `${pagesWithJsonLd}/${pages.length} pages have JSON-LD (${totalJsonLdItems} total items). Types: ${Array.from(schemaTypes).join(', ') || 'none'}`,
    recommendation: !hasOrganization
      ? 'Add Organization schema to homepage for entity disambiguation'
      : coverage < 0.5
        ? 'Increase JSON-LD coverage — aim for structured data on every significant page'
        : 'Good structured data coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
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
    for (const item of page.existingStructuredData.jsonLd) {
      if (item['@type'] === 'FAQPage') {
        hasFAQPageSchema = true;
      }
    }
  }

  if (totalFAQs === 0) {
    return {
      name: 'FAQ Content',
      category: 'content_quality',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: resolveSeverity('FAQ Content', 'fail'),
      details: 'No FAQ content detected on any page',
      recommendation: 'Add FAQ sections to high-traffic pages. FAQPage schema has the highest AI citation probability.',
    };
  }

  let score = Math.min(60, totalFAQs * 15);
  if (hasFAQPageSchema) score += 40;
  score = Math.min(100, score);

  const schemaNote = hasFAQPageSchema ? ' with FAQPage schema' : ' (no FAQPage schema)';
  const status = score >= 60 ? 'pass' as const : 'partial' as const;
  return {
    name: 'FAQ Content',
    category: 'content_quality',
    score,
    maxScore: 100,
    status,
    severity: resolveSeverity('FAQ Content', status),
    details: `${totalFAQs} FAQ items on ${pagesWithFAQ} pages${schemaNote}`,
    recommendation: !hasFAQPageSchema
      ? 'Add FAQPage JSON-LD schema markup alongside FAQ content for maximum AI citation rates'
      : totalFAQs < 5
        ? 'Add more FAQ content to additional high-traffic pages'
        : 'FAQ content with schema markup detected — good!',
  };
}

function auditContentDepth(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Content Structure & Depth',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess content depth',
    };
  }

  let thinPages = 0;
  let substantivePages = 0;
  let wellStructured = 0;
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

  const score = Math.min(100, Math.round(
    (1 - thinRatio) * 30 + depthRatio * 40 + structureRatio * 30
  ));
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Content Structure & Depth',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Content Structure & Depth', status),
    details: `${substantivePages}/${pages.length} pages >500 words, ${wellStructured} well-structured (>=3 headings), ${thinPages} thin pages (<300 words)`,
    recommendation: score < 60
      ? 'Add more substantive content (>500 words) with clear heading structure (>=3 headings). AI engines chunk content by paragraphs under headings.'
      : 'Content depth and structure are solid',
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
  const status = coverage >= 0.8 ? 'pass' as const : coverage >= 0.5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Heading Hierarchy',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Heading Hierarchy', status),
    details: `${correctHierarchy}/${pagesWithHeadings} pages with headings have correct H1>H2>H3 hierarchy`,
    recommendation: coverage < 0.8
      ? 'Fix heading hierarchy: single H1, no skipped levels (H1>H2>H3). LLMs use headings to understand content structure.'
      : 'Heading hierarchy is clean',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
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
  const status = coverage >= 0.8 ? 'pass' as const : coverage >= 0.5 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Meta Descriptions',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Meta Descriptions', status),
    details: `${withDescription}/${pages.length} pages have meta descriptions (>=30 chars)`,
    recommendation: coverage < 0.8
      ? 'Add meaningful meta descriptions to all pages — AI engines use these for summaries and citations'
      : 'Good meta description coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditContentFreshness(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Content Freshness',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess content freshness',
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

  const score = Math.min(100, Math.round(
    dateCoverage * 50 + recencyRatio * 30 + jsonLdDateRatio * 20
  ));
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Content Freshness',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Content Freshness', status),
    details: `${pagesWithDate}/${pages.length} pages have date signals, ${pagesRecent} updated within 12 months, ${pagesWithJsonLdDate} with JSON-LD dates`,
    recommendation: score < 60
      ? 'Add dateModified to JSON-LD and keep content updated — AI-cited content is 25.7% fresher than traditional results'
      : 'Content freshness signals are strong',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
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

  const score = Math.min(100, foundValuable.length * 25);
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Schema Markup Diversity',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Schema Markup Diversity', status),
    details: `${schemaTypes.size} schema types found${foundValuable.length > 0 ? ': ' + foundValuable.join(', ') : ''}. ${foundValuable.length} high-value types for AEO.`,
    recommendation: score < 60
      ? 'Add diverse schema types: FAQPage, HowTo, Article, Product, BreadcrumbList. Each schema type enables different AI answer formats.'
      : 'Schema markup diversity is strong',
  };
}

function auditFeaturedSnippetReadiness(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let snippetReadyPages = 0;
  let definitionPages = 0;
  const affectedUrls: string[] = [];

  const contentPages = pages.filter(p => p.content.wordCount > 100);

  for (const page of contentPages) {
    const { bodyText } = page.content;
    let hasSnippetParagraph = false;

    const paragraphs = bodyText.split(/\.\s+/).filter(s => s.trim().length > 0);
    for (const para of paragraphs) {
      const words = para.split(/\s+/).length;
      if (words >= 30 && words <= 70) {
        hasSnippetParagraph = true;
        break;
      }
    }

    const hasDefinition = /\b(?:is a|is an|refers to|is defined as|means)\b/i.test(bodyText);
    if (hasDefinition) definitionPages++;

    if (hasSnippetParagraph) {
      snippetReadyPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  if (contentPages.length === 0) {
    return {
      name: 'Featured Snippet Readiness',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages found', recommendation: 'Add content pages optimized for featured snippets',
    };
  }

  const snippetRatio = snippetReadyPages / contentPages.length;
  const defRatio = definitionPages / contentPages.length;
  const score = Math.min(100, Math.round(snippetRatio * 70 + defRatio * 30));
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Featured Snippet Readiness',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Featured Snippet Readiness', status),
    details: `${snippetReadyPages}/${contentPages.length} pages have snippet-ready paragraphs (30-70 words), ${definitionPages} with definition-style content`,
    recommendation: score < 60
      ? 'Add concise answer paragraphs (40-60 words) directly under headings. Include "what is X" definitions. These formats are preferred for AI-generated featured snippets.'
      : 'Content is well-optimized for featured snippets',
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
    const hasSteps = page.content.headings.some(h => /^(step\s+\d+|^\d+[.)]\s)/i.test(h.text));
    if (hasSteps) pagesWithHowTo++;
  }

  const formatTypes = [pagesWithTables > 0, pagesWithOrderedLists > 0, pagesWithFaq > 0, pagesWithHowTo > 0];
  const diversityCount = formatTypes.filter(Boolean).length;

  const diversityScore = diversityCount * 15;
  const totalFormatted = pages.length > 0
    ? (pagesWithTables + pagesWithOrderedLists + pagesWithFaq + pagesWithHowTo) / (pages.length * 4)
    : 0;
  const coverageScore = Math.round(totalFormatted * 40);
  const score = Math.min(100, diversityScore + coverageScore);
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Answer Format Diversity',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Answer Format Diversity', status),
    details: `Format types: tables (${pagesWithTables} pages), lists (${pagesWithOrderedLists}), FAQ (${pagesWithFaq}), HowTo steps (${pagesWithHowTo}). ${diversityCount}/4 format types used.`,
    recommendation: score < 60
      ? 'Diversify answer formats: add comparison tables, numbered steps, FAQ sections, and ordered lists. AI engines select different formats for different query types.'
      : 'Good diversity of answer formats',
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

    for (const h of page.content.headings) {
      totalHeadings++;
      if (/\?$/.test(h.text) || /^(how|what|why|when|where|who|which|can|does|is|are|should)\b/i.test(h.text)) {
        questionHeadings++;
        hasQuestionHeading = true;
      }
    }

    const sentences = page.content.bodyText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const shortAnswers = sentences.filter(s => s.trim().split(/\s+/).length <= 30 && s.trim().split(/\s+/).length >= 5);
    if (shortAnswers.length > 0) {
      pagesWithShortAnswers++;
    }

    if (!hasQuestionHeading && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  if (contentPages.length === 0) {
    return {
      name: 'Voice Search Optimization',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages found', recommendation: 'Add content optimized for voice search queries',
    };
  }

  const questionRatio = totalHeadings > 0 ? questionHeadings / totalHeadings : 0;
  const shortAnswerRatio = pagesWithShortAnswers / contentPages.length;
  const score = Math.min(100, Math.round(questionRatio * 50 + shortAnswerRatio * 50));
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Voice Search Optimization',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Voice Search Optimization', status),
    details: `${questionHeadings}/${totalHeadings} headings are questions, ${pagesWithShortAnswers}/${contentPages.length} pages have short direct answers`,
    recommendation: score < 60
      ? 'Use question-format headings (How, What, Why...) and provide direct, concise answers. Voice assistants prefer natural language Q&A formatting.'
      : 'Content is well-optimized for voice search',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== NEW TIER 1 CHECKS =====

function auditDuplicateTitles(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const titleMap = new Map<string, string[]>();
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const title = page.meta.title?.trim();
    if (!title) continue;
    const urls = titleMap.get(title) || [];
    urls.push(page.url);
    titleMap.set(title, urls);
  }

  let duplicateCount = 0;
  for (const [, urls] of titleMap) {
    if (urls.length > 1) {
      duplicateCount += urls.length;
      for (const url of urls) {
        if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(url);
      }
    }
  }

  const duplicateGroups = [...titleMap.values()].filter(urls => urls.length > 1).length;
  const pagesWithTitles = pages.filter(p => p.meta.title?.trim()).length;
  const score = pagesWithTitles > 0
    ? Math.round(Math.max(0, (1 - duplicateCount / pagesWithTitles)) * 100)
    : 100;
  const status = duplicateCount === 0 ? 'pass' as const : duplicateCount <= 2 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Duplicate Titles',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Duplicate Titles', status),
    details: duplicateCount === 0
      ? 'All page titles are unique'
      : `${duplicateCount} pages share ${duplicateGroups} duplicate title(s)`,
    recommendation: duplicateCount > 0
      ? 'Give every page a unique title tag. Duplicate titles confuse search engines and AI models about which page to cite for a topic.'
      : 'All page titles are unique — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditDuplicateMetaDescriptions(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const descMap = new Map<string, string[]>();
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const desc = page.meta.description?.trim();
    if (!desc || desc.length < 20) continue;
    const urls = descMap.get(desc) || [];
    urls.push(page.url);
    descMap.set(desc, urls);
  }

  let duplicateCount = 0;
  for (const [, urls] of descMap) {
    if (urls.length > 1) {
      duplicateCount += urls.length;
      for (const url of urls) {
        if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(url);
      }
    }
  }

  const duplicateGroups = [...descMap.values()].filter(urls => urls.length > 1).length;
  const pagesWithDesc = pages.filter(p => (p.meta.description?.trim()?.length || 0) >= 20).length;
  const score = pagesWithDesc > 0
    ? Math.round(Math.max(0, (1 - duplicateCount / pagesWithDesc)) * 100)
    : 100;
  const status = duplicateCount === 0 ? 'pass' as const : duplicateCount <= 2 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Duplicate Meta Descriptions',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Duplicate Meta Descriptions', status),
    details: duplicateCount === 0
      ? 'All meta descriptions are unique'
      : `${duplicateCount} pages share ${duplicateGroups} duplicate meta description(s)`,
    recommendation: duplicateCount > 0
      ? 'Give every page a unique meta description. AI engines use descriptions as summary text — duplicates reduce citation accuracy.'
      : 'All meta descriptions are unique — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditContentTooLong(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const affectedUrls: string[] = [];
  let tooLongCount = 0;

  for (const page of pages) {
    if (page.content.wordCount > 10000) {
      tooLongCount++;
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const score = pages.length > 0
    ? Math.round(Math.max(0, (1 - tooLongCount / pages.length)) * 100)
    : 100;
  const status = tooLongCount === 0 ? 'pass' as const : tooLongCount <= 2 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Content Too Long for AI',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Content Too Long for AI', status),
    details: tooLongCount === 0
      ? 'No pages exceed 10,000 words'
      : `${tooLongCount} page(s) exceed 10,000 words — risk of AI truncation`,
    recommendation: tooLongCount > 0
      ? 'Break extremely long pages (>10,000 words) into multiple focused pages. AI models have context window limits and may truncate or ignore excessively long content.'
      : 'No pages are too long for AI processing — good!',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditParagraphLength(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const contentPages = pages.filter(p => p.content.wordCount > 100);
  if (contentPages.length === 0) {
    return {
      name: 'Paragraph Length Optimization',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages found', recommendation: 'Add content pages to assess paragraph optimization',
    };
  }

  let optimalPages = 0;
  const affectedUrls: string[] = [];

  for (const page of contentPages) {
    // Split into paragraphs by double newline or sentence boundaries
    const paragraphs = page.content.bodyText.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    if (paragraphs.length === 0) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
      continue;
    }

    const avgWords = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length;
    if (avgWords >= 40 && avgWords <= 75) {
      optimalPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const ratio = optimalPages / contentPages.length;
  const score = Math.round(ratio * 100);
  const status = ratio >= 0.6 ? 'pass' as const : ratio > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Paragraph Length Optimization',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Paragraph Length Optimization', status),
    details: `${optimalPages}/${contentPages.length} content pages have optimal avg paragraph length (40-75 words)`,
    recommendation: ratio < 0.6
      ? 'Aim for paragraphs of 40-75 words. This is the ideal extraction size for AI models — too short lacks context, too long gets truncated.'
      : 'Paragraph lengths are well-optimized for AI extraction',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditAnswerFirstContent(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const contentPages = pages.filter(p => p.content.wordCount > 100 && p.content.headings.length >= 2);
  if (contentPages.length === 0) {
    return {
      name: 'Answer-First Content Structure',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages with multiple headings found', recommendation: 'Add structured content pages to assess',
    };
  }

  let answerFirstPages = 0;
  const affectedUrls: string[] = [];

  for (const page of contentPages) {
    // Check if the first substantive paragraph after body start contains a direct answer pattern
    const text = page.content.bodyText;
    const firstParagraph = text.split(/\n\s*\n/)[0] || '';
    const words = firstParagraph.split(/\s+/).length;

    // An answer-first pattern: starts with a direct statement (not a question),
    // is between 20-80 words, and contains assertive language
    const isAnswerFirst = words >= 20 && words <= 80 &&
      !/^\s*(how|what|why|when|where|who|which)\b/i.test(firstParagraph) &&
      /\b(is|are|provides|offers|helps|enables|allows|includes|means|refers)\b/i.test(firstParagraph);

    if (isAnswerFirst) {
      answerFirstPages++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const ratio = answerFirstPages / contentPages.length;
  const score = Math.round(ratio * 100);
  const status = ratio >= 0.5 ? 'pass' as const : ratio > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Answer-First Content Structure',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Answer-First Content Structure', status),
    details: `${answerFirstPages}/${contentPages.length} content pages lead with direct answer paragraphs`,
    recommendation: ratio < 0.5
      ? 'Start sections with a direct answer (20-80 words) before elaborating. AI engines extract the first paragraph after headings as the primary answer candidate.'
      : 'Good answer-first content structure',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

function auditOrganizationSchemaCompleteness(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let hasOrgSchema = false;
  let hasLogo = false;
  let hasContactPoint = false;
  let hasSameAs = false;

  for (const page of pages) {
    for (const ld of page.existingStructuredData.jsonLd) {
      const rawType = ld['@type'];
      const types = Array.isArray(rawType) ? rawType.map(String) : [String(rawType)];
      if (types.includes('Organization') || types.includes('LocalBusiness')) {
        hasOrgSchema = true;
        if (ld.logo) hasLogo = true;
        if (ld.contactPoint) hasContactPoint = true;
        if (ld.sameAs && Array.isArray(ld.sameAs) && (ld.sameAs as unknown[]).length > 0) hasSameAs = true;
      }
    }
  }

  if (!hasOrgSchema) {
    return {
      name: 'Organization Schema Completeness',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'fail',
      severity: resolveSeverity('Organization Schema Completeness', 'fail'),
      details: 'No Organization or LocalBusiness JSON-LD schema found',
      recommendation: 'Add Organization JSON-LD with logo, contactPoint, and sameAs (social profiles) for entity disambiguation by AI engines',
    };
  }

  let score = 25; // base for having org schema
  if (hasLogo) score += 25;
  if (hasContactPoint) score += 25;
  if (hasSameAs) score += 25;

  const status = score >= 75 ? 'pass' as const : score >= 50 ? 'partial' as const : 'fail' as const;
  const missing: string[] = [];
  if (!hasLogo) missing.push('logo');
  if (!hasContactPoint) missing.push('contactPoint');
  if (!hasSameAs) missing.push('sameAs');

  return {
    name: 'Organization Schema Completeness',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Organization Schema Completeness', status),
    details: `Organization schema: logo ${hasLogo ? '✓' : '✗'}, contactPoint ${hasContactPoint ? '✓' : '✗'}, sameAs ${hasSameAs ? '✓' : '✗'}`,
    recommendation: missing.length > 0
      ? `Add ${missing.join(', ')} to Organization JSON-LD for complete entity representation in AI knowledge graphs`
      : 'Organization schema is complete — good!',
  };
}

// ===== NEW TIER 2 CHECKS =====

function auditSecurityHeaders(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Security Headers', category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess security headers',
    };
  }

  // Check the first page (homepage usually) for security headers
  const homepage = pages[0];
  const headers = homepage.responseHeaders;
  let score = 0;
  const found: string[] = [];
  const missing: string[] = [];

  // HSTS
  if (headers['strict-transport-security']) {
    score += 35; found.push('HSTS');
  } else { missing.push('HSTS (Strict-Transport-Security)'); }

  // CSP
  if (headers['content-security-policy']) {
    score += 35; found.push('CSP');
  } else { missing.push('CSP (Content-Security-Policy)'); }

  // X-Frame-Options
  if (headers['x-frame-options']) {
    score += 15; found.push('X-Frame-Options');
  } else { missing.push('X-Frame-Options'); }

  // X-Content-Type-Options
  if (headers['x-content-type-options']) {
    score += 15; found.push('X-Content-Type-Options');
  } else { missing.push('X-Content-Type-Options'); }

  const status = score >= 70 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Security Headers',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Security Headers', status),
    details: `Found: ${found.join(', ') || 'none'}${missing.length > 0 ? '. Missing: ' + missing.join(', ') : ''}`,
    recommendation: missing.length > 0
      ? `Add security headers: ${missing.join(', ')}. Security headers improve trust signals and protect against common web attacks.`
      : 'All key security headers are present',
  };
}

function auditCompression(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  if (pages.length === 0) {
    return {
      name: 'Compression', category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No pages crawled', recommendation: 'Crawl pages to assess compression',
    };
  }

  let compressedCount = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const encoding = (page.responseHeaders['content-encoding'] || '').toLowerCase();
    if (encoding.includes('gzip') || encoding.includes('br') || encoding.includes('deflate')) {
      compressedCount++;
    } else {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const coverage = compressedCount / pages.length;
  const score = Math.round(coverage * 100);
  const status = coverage >= 0.8 ? 'pass' as const : coverage > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Compression',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Compression', status),
    details: `${compressedCount}/${pages.length} pages served with compression (gzip/brotli)`,
    recommendation: coverage < 0.8
      ? 'Enable gzip or brotli compression on your server. Compressed responses load faster and reduce bandwidth — critical for crawl efficiency.'
      : 'Good compression coverage',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

// ===== TIER 3 CHECKS =====

/** Content Quotability Score — measures self-contained, extractable paragraphs */
function auditContentQuotability(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const contentPages = pages.filter(p => p.content.wordCount > 100);

  if (contentPages.length === 0) {
    return {
      name: 'Content Quotability Score',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages found', recommendation: 'Add content pages to assess quotability',
    };
  }

  let totalQuotable = 0;
  let totalParagraphs = 0;
  const affectedUrls: string[] = [];

  for (const page of contentPages) {
    const paragraphs = page.content.bodyText.split(/\n\s*\n/).filter(p => p.trim().length > 30);
    let pageQuotable = 0;

    for (const para of paragraphs) {
      totalParagraphs++;
      const words = para.trim().split(/\s+/).length;
      // A quotable paragraph: 20-80 words, self-contained (has a subject+verb pattern),
      // doesn't start with "however", "but", "also" (dependent on prior context)
      const isRightLength = words >= 20 && words <= 80;
      const isNotDependent = !/^\s*(however|but|also|additionally|furthermore|moreover|nevertheless|consequently|therefore)\b/i.test(para.trim());
      const hasAssertiveVerb = /\b(is|are|was|were|has|have|provides|offers|includes|enables|allows|contains|features|supports|delivers|ensures)\b/i.test(para);

      if (isRightLength && isNotDependent && hasAssertiveVerb) {
        pageQuotable++;
      }
    }

    totalQuotable += pageQuotable;
    if (paragraphs.length > 0 && pageQuotable / paragraphs.length < 0.3) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const quotableRatio = totalParagraphs > 0 ? totalQuotable / totalParagraphs : 0;
  const score = Math.min(100, Math.round(quotableRatio * 150)); // generous scoring — 67%+ quotable = 100
  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Content Quotability Score',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Content Quotability Score', status),
    details: `${totalQuotable}/${totalParagraphs} paragraphs are self-contained and quotable (${Math.round(quotableRatio * 100)}%)`,
    recommendation: score < 60
      ? 'Write self-contained paragraphs (20-80 words) that make sense without surrounding context. AI engines extract individual paragraphs as citation snippets — dependent clauses get skipped.'
      : 'Content has strong quotability for AI citations',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

/** Topic Cluster Detection — identifies pillar pages via internal link graph */
function auditTopicClusterDetection(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;

  if (pages.length < 3) {
    return {
      name: 'Topic Cluster Detection',
      category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: pages.length < 2 ? 'Not enough pages to analyze topic clusters' : 'Need at least 3 pages for topic cluster analysis',
      recommendation: 'Crawl more pages to assess topic cluster structure',
    };
  }

  // Build internal link graph: count inbound internal links per URL
  const inboundCounts = new Map<string, number>();
  const pageUrlSet = new Set(pages.map(p => p.url));

  for (const page of pages) {
    for (const link of page.internalLinks) {
      // Normalize to match crawled URLs
      const normalized = link.split('#')[0].split('?')[0].replace(/\/$/, '');
      for (const pUrl of pageUrlSet) {
        if (pUrl.replace(/\/$/, '') === normalized) {
          inboundCounts.set(pUrl, (inboundCounts.get(pUrl) || 0) + 1);
          break;
        }
      }
    }
  }

  // A "pillar page" is one that receives significantly more inbound links than average
  const counts = Array.from(inboundCounts.values());
  const avgInbound = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const pillarThreshold = Math.max(3, avgInbound * 2);

  const pillarPages: string[] = [];
  for (const [url, count] of inboundCounts) {
    if (count >= pillarThreshold) {
      pillarPages.push(url);
    }
  }

  // Check if pillar pages have substantive content (cluster hubs should be comprehensive)
  let wellLinkedPillars = 0;
  for (const pillarUrl of pillarPages) {
    const page = pages.find(p => p.url === pillarUrl);
    if (page && page.content.wordCount > 500 && page.internalLinks.length >= 3) {
      wellLinkedPillars++;
    }
  }

  // Score based on: having pillar pages, their quality, and link distribution
  const hasClusters = pillarPages.length > 0;
  const clusterQuality = pillarPages.length > 0 ? wellLinkedPillars / pillarPages.length : 0;
  // Check link distribution (good sites have varied inbound counts, not flat)
  const hasVariedLinks = counts.length > 0 && Math.max(...counts) > avgInbound * 1.5;

  let score = 0;
  if (hasClusters) score += 40;
  score += Math.round(clusterQuality * 30);
  if (hasVariedLinks) score += 30;
  score = Math.min(100, score);

  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;

  return {
    name: 'Topic Cluster Detection',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Topic Cluster Detection', status),
    details: `${pillarPages.length} pillar page(s) detected (${wellLinkedPillars} with strong content), avg ${avgInbound.toFixed(1)} inbound links per page`,
    recommendation: score < 60
      ? 'Build topic clusters: create comprehensive pillar pages (>500 words) and link supporting content to them. AI engines favor topically authoritative sites with clear content hierarchies.'
      : 'Topic cluster structure detected — good content hierarchy',
  };
}

// ===== SEMRUSH-ALIGNED CHECKS =====

/** Count syllables in a word using vowel-group heuristic */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;
  // Remove silent trailing 'e'
  const trimmed = w.endsWith('e') ? w.slice(0, -1) : w;
  const vowelGroups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

/** Calculate Flesch Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words) */
function fleschReadingEase(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 0;

  let totalSyllables = 0;
  for (const word of words) {
    totalSyllables += countSyllables(word);
  }

  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (totalSyllables / words.length);
  return Math.max(0, Math.min(100, score));
}

function auditContentReadability(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  const contentPages = pages.filter(p => p.content.wordCount > 100);

  if (contentPages.length === 0) {
    return {
      name: 'Content Readability', category: 'content_quality',
      score: 0, maxScore: 100, status: 'not_applicable', severity: 'info',
      details: 'No content pages found (>100 words)', recommendation: 'Add content pages to assess readability',
    };
  }

  let totalFlesch = 0;
  const affectedUrls: string[] = [];

  for (const page of contentPages) {
    const flesch = fleschReadingEase(page.content.bodyText);
    totalFlesch += flesch;
    if (flesch < 30 && affectedUrls.length < MAX_AFFECTED_URLS) {
      affectedUrls.push(page.url);
    }
  }

  const avgFlesch = totalFlesch / contentPages.length;
  // Map Flesch score to audit score: 60+ is ideal, 30-60 is OK, <30 is poor
  const score = Math.min(100, Math.round(avgFlesch * 100 / 60));
  const status = avgFlesch >= 50 ? 'pass' as const : avgFlesch >= 30 ? 'partial' as const : 'fail' as const;

  const difficultyLabel = avgFlesch >= 60 ? 'easy to read' : avgFlesch >= 50 ? 'fairly easy' : avgFlesch >= 30 ? 'difficult' : 'very difficult';
  const difficultPages = contentPages.filter(p => fleschReadingEase(p.content.bodyText) < 30).length;

  return {
    name: 'Content Readability',
    category: 'content_quality',
    score, maxScore: 100, status,
    severity: resolveSeverity('Content Readability', status),
    details: `Avg Flesch Reading Ease: ${avgFlesch.toFixed(1)} (${difficultyLabel}). ${difficultPages} page(s) scored below 30 (very difficult).`,
    recommendation: avgFlesch < 50
      ? 'Simplify content to improve readability. Use shorter sentences, common words, and active voice. AI engines prefer content that is clear and concise.'
      : 'Content readability is at an acceptable level',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}
