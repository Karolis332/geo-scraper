/**
 * Platform-Specific Optimization — scores readiness for each major AI search platform.
 *
 * Each AI platform has different source preferences:
 * - Google AI Overviews: favors top-10 organic, question headings, tables
 * - ChatGPT: uses Bing index, weights entity recognition heavily
 * - Perplexity: weights Reddit/community validation, recent content
 * - Gemini: Google index + Knowledge Graph, YouTube, GBP
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';
import type { AuditItem } from './audits/types.js';
import type { BrandMentionResult } from './brand-scanner.js';

export interface PlatformReadiness {
  platform: 'google_ai_overviews' | 'chatgpt' | 'perplexity' | 'gemini';
  displayName: string;
  score: number;        // 0-100
  grade: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface PlatformOptimizationResult {
  platforms: PlatformReadiness[];
  bestPlatform: string;
  worstPlatform: string;
}

interface AuditResult {
  items: AuditItem[];
}

/**
 * Get an audit item's score by name, defaulting to 0 if not found.
 */
function getItemScore(items: AuditItem[], name: string): number {
  const item = items.find(i => i.name === name);
  if (!item || item.status === 'not_applicable') return 0;
  return item.score;
}

function getItemMax(items: AuditItem[], name: string): number {
  const item = items.find(i => i.name === name);
  return item?.maxScore ?? 100;
}

function pct(score: number, max: number): number {
  return max > 0 ? (score / max) * 100 : 0;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * Score Google AI Overviews readiness.
 * Favors: organic SEO strength, question headings, tables, structured data, snippets.
 */
function scoreGoogleAIO(items: AuditItem[], crawlResult: SiteCrawlResult): PlatformReadiness {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Title Tags + Meta Descriptions + Internal Linking (30%)
  const seoScore = (
    pct(getItemScore(items, 'Title Tags'), getItemMax(items, 'Title Tags')) +
    pct(getItemScore(items, 'Meta Descriptions'), getItemMax(items, 'Meta Descriptions')) +
    pct(getItemScore(items, 'Internal Linking'), getItemMax(items, 'Internal Linking'))
  ) / 3;
  if (seoScore >= 70) strengths.push('Strong organic SEO foundation');
  else { weaknesses.push('Weak organic SEO signals'); recommendations.push('Improve title tags, meta descriptions, and internal linking — 92% of AIO citations come from top-10 organic results'); }

  // Question-based headings (20%)
  const questionHeadings = crawlResult.pages.flatMap(p =>
    p.content.headings.filter(h => /\?$/.test(h.text.trim()))
  );
  const questionScore = Math.min(100, questionHeadings.length * 10);
  if (questionScore >= 50) strengths.push(`${questionHeadings.length} question-based headings found`);
  else { weaknesses.push('Few question-based headings'); recommendations.push('Add H2/H3 headings phrased as questions — AIO heavily favors Q&A-formatted content'); }

  // Tables and lists (20%)
  const tablesCount = crawlResult.pages.reduce((s, p) => s + p.content.tables.length, 0);
  const listsCount = crawlResult.pages.reduce((s, p) => s + p.content.lists.length, 0);
  const structureScore = Math.min(100, (tablesCount * 15) + (listsCount * 5));
  if (structureScore >= 50) strengths.push(`Rich content structure (${tablesCount} tables, ${listsCount} lists)`);
  else { weaknesses.push('Lacks tables and structured lists'); recommendations.push('Add comparison tables and structured lists — AIO prefers content that can be directly extracted into answer cards'); }

  // Structured data (15%)
  const sdScore = pct(getItemScore(items, 'Structured Data (JSON-LD)'), getItemMax(items, 'Structured Data (JSON-LD)'));
  if (sdScore >= 70) strengths.push('JSON-LD structured data present');
  else { weaknesses.push('Missing or incomplete structured data'); recommendations.push('Add Organization, FAQ, and Article JSON-LD schemas'); }

  // Featured snippet readiness (15%)
  const snippetScore = pct(getItemScore(items, 'Featured Snippet Readiness'), getItemMax(items, 'Featured Snippet Readiness'));
  if (snippetScore >= 50) strengths.push('Content optimized for featured snippets');
  else { weaknesses.push('Not optimized for featured snippets'); recommendations.push('Format content for snippets: definition paragraphs, numbered steps, comparison tables'); }

  const score = Math.round(seoScore * 0.30 + questionScore * 0.20 + structureScore * 0.20 + sdScore * 0.15 + snippetScore * 0.15);

  return {
    platform: 'google_ai_overviews',
    displayName: 'Google AI Overviews',
    score,
    grade: scoreToGrade(score),
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
}

/**
 * Score ChatGPT readiness.
 * Uses Bing index, weights entity recognition, content quotability, E-E-A-T.
 */
function scoreChatGPT(items: AuditItem[], crawlResult: SiteCrawlResult): PlatformReadiness {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Bing/search indexing signals (25%)
  const indexScore = pct(getItemScore(items, 'Search Engine Indexing'), getItemMax(items, 'Search Engine Indexing'));
  const hasBing = crawlResult.pages.some(p => p.meta.bingVerification);
  const bingBonus = hasBing ? 20 : 0;
  if (indexScore >= 60 || hasBing) strengths.push('Good search engine indexing signals');
  else { weaknesses.push('Weak search indexing'); recommendations.push('Add Bing Webmaster verification — ChatGPT uses Bing index for web search'); }

  // Entity recognition / structured data (25%)
  const orgScore = pct(getItemScore(items, 'Organization Schema Completeness'), getItemMax(items, 'Organization Schema Completeness'));
  const sdScore = pct(getItemScore(items, 'Structured Data (JSON-LD)'), getItemMax(items, 'Structured Data (JSON-LD)'));
  const entityScore = (orgScore + sdScore) / 2;
  if (entityScore >= 60) strengths.push('Strong entity recognition signals');
  else { weaknesses.push('Weak entity recognition'); recommendations.push('Add complete Organization schema with sameAs links to Wikipedia, LinkedIn, Crunchbase'); }

  // Content quotability (20%)
  const quotScore = pct(getItemScore(items, 'Content Quotability Score'), getItemMax(items, 'Content Quotability Score'));
  if (quotScore >= 60) strengths.push('Content is quotable and extractable');
  else { weaknesses.push('Content not optimized for citation extraction'); recommendations.push('Write self-contained paragraphs of 134-167 words that answer questions directly'); }

  // E-E-A-T signals (15%)
  const authorScore = pct(getItemScore(items, 'Author & Expertise Signals'), getItemMax(items, 'Author & Expertise Signals'));
  const trustScore = pct(getItemScore(items, 'Trust Signals'), getItemMax(items, 'Trust Signals'));
  const eeatScore = (authorScore + trustScore) / 2;
  if (eeatScore >= 50) strengths.push('Author and trust signals present');
  else { weaknesses.push('Missing author/trust signals'); recommendations.push('Add author bios, about page, and visible credentials'); }

  // Social proof (15%)
  const socialScore = pct(getItemScore(items, 'Social Proof & Authority'), getItemMax(items, 'Social Proof & Authority'));
  if (socialScore >= 50) strengths.push('Good social proof signals');
  else { weaknesses.push('Weak social proof'); recommendations.push('Link to active social media profiles and industry recognition'); }

  const score = Math.round(
    Math.min(100, indexScore + bingBonus) * 0.25 +
    entityScore * 0.25 +
    quotScore * 0.20 +
    eeatScore * 0.15 +
    socialScore * 0.15
  );

  return {
    platform: 'chatgpt',
    displayName: 'ChatGPT',
    score,
    grade: scoreToGrade(score),
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
}

/**
 * Score Perplexity readiness.
 * Weights Reddit/community validation, content recency, citation quality.
 */
function scorePerplexity(items: AuditItem[], crawlResult: SiteCrawlResult, brandResult?: BrandMentionResult): PlatformReadiness {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Reddit/community presence (30%)
  let redditScore = 0;
  if (brandResult) {
    const reddit = brandResult.platforms.find(p => p.platform === 'reddit');
    redditScore = reddit?.score ?? 0;
  }
  // Also check social links
  const hasReddit = crawlResult.siteIdentity.socialLinks.some(s => s.url.includes('reddit.com'));
  if (hasReddit && redditScore < 30) redditScore = 30;
  if (redditScore >= 50) strengths.push('Active Reddit/community presence');
  else { weaknesses.push('No Reddit/community presence'); recommendations.push('Build Reddit presence — Perplexity heavily weights Reddit (46.7% of citations come from Reddit)'); }

  // Content recency (25%)
  const freshnessScore = pct(getItemScore(items, 'Content Freshness'), getItemMax(items, 'Content Freshness'));
  if (freshnessScore >= 60) strengths.push('Content is fresh and recently updated');
  else { weaknesses.push('Content appears dated'); recommendations.push('Add publication and modification dates to all content pages'); }

  // Citation quality (20%)
  const citScore = pct(getItemScore(items, 'Citation Quality'), getItemMax(items, 'Citation Quality'));
  if (citScore >= 50) strengths.push('Content has quality citations and sources');
  else { weaknesses.push('Content lacks citations and data sources'); recommendations.push('Add specific statistics, source citations, and original data — Perplexity cites 5-15 sources per answer'); }

  // Content depth (15%)
  const depthScore = pct(getItemScore(items, 'Content Structure & Depth'), getItemMax(items, 'Content Structure & Depth'));
  if (depthScore >= 60) strengths.push('Deep, comprehensive content');
  else { weaknesses.push('Content lacks depth'); recommendations.push('Create comprehensive, 2000+ word pages on core topics'); }

  // FAQ content (10%)
  const faqScore = pct(getItemScore(items, 'FAQ Content'), getItemMax(items, 'FAQ Content'));
  if (faqScore >= 50) strengths.push('FAQ content available');
  else { weaknesses.push('No FAQ content'); recommendations.push('Add FAQ sections with question-based headings'); }

  const score = Math.round(redditScore * 0.30 + freshnessScore * 0.25 + citScore * 0.20 + depthScore * 0.15 + faqScore * 0.10);

  return {
    platform: 'perplexity',
    displayName: 'Perplexity',
    score,
    grade: scoreToGrade(score),
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
}

/**
 * Score Gemini readiness.
 * Google index, Knowledge Graph, YouTube, Google Business Profile signals.
 */
function scoreGemini(items: AuditItem[], crawlResult: SiteCrawlResult, brandResult?: BrandMentionResult): PlatformReadiness {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Google index signals (25%)
  const indexScore = pct(getItemScore(items, 'Search Engine Indexing'), getItemMax(items, 'Search Engine Indexing'));
  const hasGoogle = crawlResult.pages.some(p => p.meta.googleVerification);
  const googleBonus = hasGoogle ? 15 : 0;
  if (indexScore >= 60 || hasGoogle) strengths.push('Google search indexing verified');
  else { weaknesses.push('Google indexing not verified'); recommendations.push('Add Google Search Console verification and submit sitemap'); }

  // Knowledge Graph / entity signals (20%)
  const orgScore = pct(getItemScore(items, 'Organization Schema Completeness'), getItemMax(items, 'Organization Schema Completeness'));
  if (orgScore >= 60) strengths.push('Organization entity well-defined');
  else { weaknesses.push('Weak Knowledge Graph signals'); recommendations.push('Complete Organization schema with sameAs links to Wikipedia, Google Business Profile, and social media'); }

  // YouTube presence (20%)
  let ytScore = 0;
  if (brandResult) {
    const yt = brandResult.platforms.find(p => p.platform === 'youtube');
    ytScore = yt?.score ?? 0;
  }
  const hasYouTube = crawlResult.siteIdentity.socialLinks.some(s => s.url.includes('youtube.com'));
  if (hasYouTube && ytScore < 30) ytScore = 30;
  if (ytScore >= 50) strengths.push('YouTube presence established');
  else { weaknesses.push('No YouTube presence'); recommendations.push('Create a YouTube channel — Gemini heavily weights YouTube content for multi-modal answers'); }

  // Google Business Profile indicators (15%)
  const hasAddress = !!crawlResult.siteIdentity.address;
  const hasPhone = !!crawlResult.siteIdentity.contactPhone;
  const gbpScore = (hasAddress ? 50 : 0) + (hasPhone ? 50 : 0);
  if (gbpScore >= 50) strengths.push('Local business signals present');
  else { weaknesses.push('Missing local business signals'); recommendations.push('Add address, phone, and Google Business Profile for local AI search visibility'); }

  // Content structure (20%)
  const headingScore = pct(getItemScore(items, 'Heading Hierarchy'), getItemMax(items, 'Heading Hierarchy'));
  const depthScore = pct(getItemScore(items, 'Content Structure & Depth'), getItemMax(items, 'Content Structure & Depth'));
  const contentScore = (headingScore + depthScore) / 2;
  if (contentScore >= 60) strengths.push('Well-structured content hierarchy');
  else { weaknesses.push('Poor content structure'); recommendations.push('Use proper heading hierarchy (H1→H2→H3) and structured content blocks'); }

  const score = Math.round(
    Math.min(100, indexScore + googleBonus) * 0.25 +
    orgScore * 0.20 +
    ytScore * 0.20 +
    gbpScore * 0.15 +
    contentScore * 0.20
  );

  return {
    platform: 'gemini',
    displayName: 'Gemini',
    score,
    grade: scoreToGrade(score),
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
}

/**
 * Analyze platform-specific readiness across all major AI search engines.
 */
export function analyzePlatformReadiness(
  audit: AuditResult,
  crawlResult: SiteCrawlResult,
  brandResult?: BrandMentionResult,
): PlatformOptimizationResult {
  const platforms = [
    scoreGoogleAIO(audit.items, crawlResult),
    scoreChatGPT(audit.items, crawlResult),
    scorePerplexity(audit.items, crawlResult, brandResult),
    scoreGemini(audit.items, crawlResult, brandResult),
  ];

  const sorted = [...platforms].sort((a, b) => b.score - a.score);

  return {
    platforms,
    bestPlatform: sorted[0].displayName,
    worstPlatform: sorted[sorted.length - 1].displayName,
  };
}
