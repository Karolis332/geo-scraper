/**
 * GEO Compliance Auditor — orchestrator that delegates to category modules.
 * Scores a site's existing AI/LLM readiness across 5 categories.
 */

import type { SiteCrawlResult, AuditSeverity } from '../crawler/page-data.js';
import { auditAiInfrastructure } from './audits/ai-infrastructure.js';
import { auditContentQuality } from './audits/content-quality.js';
import { auditAiDiscoverability } from './audits/ai-discoverability.js';
import { auditFoundationalSeo } from './audits/foundational-seo.js';
import { auditNonScored } from './audits/non-scored.js';

// Re-export types from audits/types.ts so existing imports keep working
export type { AuditCategory, AuditItem } from './audits/types.js';
export { MAX_AFFECTED_URLS } from './audits/types.js';

export interface AuditResult {
  overallScore: number;
  maxPossibleScore: number;
  grade: string;
  items: import('./audits/types.js').AuditItem[];
  summary: {
    ai_infrastructure: { passed: number; total: number };
    content_quality: { passed: number; total: number };
    ai_discoverability: { passed: number; total: number };
    foundational_seo: { passed: number; total: number };
    non_scored: { passed: number; total: number };
  };
  issueCounts: { errors: number; warnings: number; notices: number };
  subScores: { aiSearchHealth: number };
}

export const CATEGORY_WEIGHTS: Record<string, number> = {
  ai_infrastructure: 3,
  content_quality: 2.5,
  ai_discoverability: 2.5,
  foundational_seo: 1.5,
  non_scored: 0,
};

export function auditSite(crawlResult: SiteCrawlResult): AuditResult {
  // Collect items from all category modules
  const items = [
    ...auditAiInfrastructure(crawlResult),
    ...auditContentQuality(crawlResult),
    ...auditAiDiscoverability(crawlResult),
    ...auditFoundationalSeo(crawlResult),
    ...auditNonScored(crawlResult.existingGeoFiles),
  ];

  // Calculate weighted scores
  let totalWeightedScore = 0;
  let totalWeightedMax = 0;

  const summary = {
    ai_infrastructure: { passed: 0, total: 0 },
    content_quality: { passed: 0, total: 0 },
    ai_discoverability: { passed: 0, total: 0 },
    foundational_seo: { passed: 0, total: 0 },
    non_scored: { passed: 0, total: 0 },
  };

  const issueCounts = { errors: 0, warnings: 0, notices: 0 };

  for (const item of items) {
    if (item.status === 'not_applicable') continue;
    const weight = CATEGORY_WEIGHTS[item.category] ?? 0;
    totalWeightedScore += item.score * weight;
    totalWeightedMax += item.maxScore * weight;
    summary[item.category].total++;
    if (item.status === 'pass' || item.status === 'partial') summary[item.category].passed++;

    // Count issues by severity (only for non-passing items)
    if (item.status !== 'pass') {
      if (item.severity === 'error') issueCounts.errors++;
      else if (item.severity === 'warning') issueCounts.warnings++;
      else if (item.severity === 'notice') issueCounts.notices++;
    }
  }

  const overallScore = totalWeightedMax > 0
    ? Math.round((totalWeightedScore / totalWeightedMax) * 100)
    : 0;

  // Calculate AI Search Health sub-score
  const aiSearchHealth = calculateAiSearchHealth(items);

  return {
    overallScore,
    maxPossibleScore: 100,
    grade: scoreToGrade(overallScore),
    items,
    summary,
    issueCounts,
    subScores: { aiSearchHealth },
  };
}

/** AI Search Health sub-score — composite of AI-specific items */
function calculateAiSearchHealth(items: import('./audits/types.js').AuditItem[]): number {
  const weights: Record<string, number> = {
    'AI Bot Blocking': 2,
    'robots.txt': 2,
    'llms.txt': 2,
    'llms-full.txt': 1,
    'AI Policy (ai.txt / ai.json)': 1,
    'AI Content Directives': 1,
    'Training vs Retrieval Bot Strategy': 1,
    'agent-card.json': 0.5,
    'agents.json': 0.5,
  };

  let totalWeightedScore = 0;
  let totalWeightedMax = 0;

  for (const item of items) {
    const w = weights[item.name];
    if (w === undefined) continue;
    if (item.status === 'not_applicable') continue;
    totalWeightedScore += item.score * w;
    totalWeightedMax += item.maxScore * w;
  }

  return totalWeightedMax > 0
    ? Math.round((totalWeightedScore / totalWeightedMax) * 100)
    : 0;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
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
  'Twitter Card Tags': 'easy',
  'Meta Descriptions': 'medium',
  'Image Alt Text': 'medium',
  'Title Tags': 'medium',
  'Content Freshness': 'medium',
  'Internal Linking': 'medium',
  'Broken Pages': 'medium',
  'Duplicate Titles': 'medium',
  'Duplicate Meta Descriptions': 'medium',
  'URL Structure Quality': 'medium',
  'Canonical Link Issues': 'medium',
  'Nofollow on Internal Links': 'easy',
  'Server-side Rendering': 'hard',
  'Heading Hierarchy': 'hard',
  'Content Structure & Depth': 'hard',
  'Search Engine Indexing': 'hard',
  'FAQ Content': 'hard',
  'HTTPS Enforcement': 'hard',
  'Author & Expertise Signals': 'hard',
  'Trust Signals': 'hard',
  'Social Proof & Authority': 'hard',
  'Citation Quality': 'hard',
  'Featured Snippet Readiness': 'hard',
  'Voice Search Optimization': 'hard',
  'Answer Format Diversity': 'hard',
  'Schema Markup Diversity': 'hard',
  'Content Too Long for AI': 'medium',
  'Paragraph Length Optimization': 'hard',
  'Answer-First Content Structure': 'hard',
  'Organization Schema Completeness': 'medium',
  'Breadcrumb Schema': 'medium',
  'Semantic HTML Usage': 'hard',
  'Training vs Retrieval Bot Strategy': 'easy',
  // Tier 2
  'Text-to-HTML Ratio': 'hard',
  'Page Response Time': 'hard',
  'Redirect Chains': 'medium',
  'Character Encoding & Doctype': 'easy',
  'HTML Page Size': 'hard',
  'Crawl Depth': 'hard',
  'Security Headers': 'medium',
  'Compression': 'easy',
  'hreflang Tags': 'medium',
  // Tier 3
  'agent-card.json': 'medium',
  'agents.json': 'medium',
  'Content Quotability Score': 'hard',
  'Topic Cluster Detection': 'hard',
};

const SEO_IMPACT_MAP: Record<string, 'foundational' | 'high' | 'medium' | 'low'> = {
  'Search Engine Indexing': 'foundational',
  'HTTPS Enforcement': 'foundational',
  'Broken Pages': 'foundational',
  'Server-side Rendering': 'foundational',
  'Canonical Link Issues': 'foundational',
  'Title Tags': 'high',
  'Meta Descriptions': 'high',
  'Content Structure & Depth': 'high',
  'Heading Hierarchy': 'high',
  'Internal Linking': 'high',
  'Duplicate Titles': 'high',
  'Duplicate Meta Descriptions': 'high',
  'Image Alt Text': 'medium',
  'FAQ Content': 'medium',
  'Mobile Viewport': 'medium',
  'Open Graph Tags': 'medium',
  'AI Content Directives': 'medium',
  'Content Freshness': 'medium',
  'URL Structure Quality': 'medium',
  'Nofollow on Internal Links': 'medium',
  'Semantic HTML Usage': 'medium',
  'Organization Schema Completeness': 'medium',
  'Author & Expertise Signals': 'low',
  'Trust Signals': 'low',
  'Social Proof & Authority': 'low',
  'Citation Quality': 'low',
  'Featured Snippet Readiness': 'low',
  'Voice Search Optimization': 'low',
  'Answer Format Diversity': 'low',
  'Schema Markup Diversity': 'low',
  'Content Too Long for AI': 'low',
  'Paragraph Length Optimization': 'low',
  'Answer-First Content Structure': 'low',
  'Breadcrumb Schema': 'low',
  'Twitter Card Tags': 'low',
  'Training vs Retrieval Bot Strategy': 'low',
  // Tier 2
  'Text-to-HTML Ratio': 'medium',
  'Page Response Time': 'high',
  'Redirect Chains': 'medium',
  'Character Encoding & Doctype': 'foundational',
  'HTML Page Size': 'medium',
  'Crawl Depth': 'medium',
  'Security Headers': 'low',
  'Compression': 'medium',
  'hreflang Tags': 'low',
  // Tier 3
  'agent-card.json': 'low',
  'agents.json': 'low',
  'Content Quotability Score': 'medium',
  'Topic Cluster Detection': 'medium',
};

const TIME_TO_IMPACT_MAP: Record<string, 'immediate' | '2-4 weeks' | '2-6 months'> = {
  'Open Graph Tags': 'immediate',
  'AI Content Directives': 'immediate',
  'Mobile Viewport': 'immediate',
  'Nofollow on Internal Links': 'immediate',
  'Training vs Retrieval Bot Strategy': 'immediate',
  'Twitter Card Tags': 'immediate',
  'Meta Descriptions': '2-4 weeks',
  'Image Alt Text': '2-4 weeks',
  'Title Tags': '2-4 weeks',
  'Broken Pages': '2-4 weeks',
  'Internal Linking': '2-4 weeks',
  'Content Freshness': '2-4 weeks',
  'Heading Hierarchy': '2-4 weeks',
  'Duplicate Titles': '2-4 weeks',
  'Duplicate Meta Descriptions': '2-4 weeks',
  'URL Structure Quality': '2-4 weeks',
  'Canonical Link Issues': '2-4 weeks',
  'Organization Schema Completeness': '2-4 weeks',
  'Breadcrumb Schema': '2-4 weeks',
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
  'Content Too Long for AI': '2-4 weeks',
  'Paragraph Length Optimization': '2-6 months',
  'Answer-First Content Structure': '2-6 months',
  'Semantic HTML Usage': '2-6 months',
  // Tier 2
  'Text-to-HTML Ratio': '2-6 months',
  'Page Response Time': '2-4 weeks',
  'Redirect Chains': '2-4 weeks',
  'Character Encoding & Doctype': 'immediate',
  'HTML Page Size': '2-6 months',
  'Crawl Depth': '2-6 months',
  'Security Headers': 'immediate',
  'Compression': 'immediate',
  'hreflang Tags': '2-4 weeks',
  // Tier 3
  'agent-card.json': '2-4 weeks',
  'agents.json': '2-4 weeks',
  'Content Quotability Score': '2-6 months',
  'Topic Cluster Detection': '2-6 months',
};

export function calculatePriorityActions(audit: AuditResult): PriorityAction[] {
  let totalWeightedMax = 0;
  for (const item of audit.items) {
    if (item.status === 'not_applicable') continue;
    totalWeightedMax += item.maxScore * (CATEGORY_WEIGHTS[item.category] ?? 0);
  }

  const actions: PriorityAction[] = [];

  for (const item of audit.items) {
    if (AUTO_GENERATED_ITEMS_SET.has(item.name)) continue;
    if (item.status === 'pass' || item.status === 'not_applicable' || item.score >= 100) continue;

    const weight = CATEGORY_WEIGHTS[item.category] ?? 0;
    const scoreImpact = totalWeightedMax > 0
      ? Math.round(((item.maxScore - item.score) * weight / totalWeightedMax) * 100 * 10) / 10
      : 0;

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

  actions.sort((a, b) => b.scoreImpact - a.scoreImpact);
  return actions.slice(0, 5);
}
