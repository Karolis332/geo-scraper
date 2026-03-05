/**
 * Shared constants, severity map, and helper functions for audit category modules.
 */

import type { AuditSeverity } from '../../crawler/page-data.js';

export type AuditCategory = 'ai_infrastructure' | 'content_quality' | 'ai_discoverability' | 'foundational_seo' | 'non_scored';

export interface AuditItem {
  name: string;
  category: AuditCategory;
  score: number;       // 0-100
  maxScore: number;
  status: 'pass' | 'partial' | 'fail' | 'not_applicable';
  severity: AuditSeverity;
  details: string;
  recommendation: string;
  affectedUrls?: string[];
}

export const MAX_AFFECTED_URLS = 20;

/** Default severity per check name */
export const SEVERITY_MAP: Record<string, AuditSeverity> = {
  // AI Infrastructure
  'robots.txt': 'error',
  'sitemap.xml': 'error',
  'llms.txt': 'warning',
  'llms-full.txt': 'warning',
  'AI Policy (ai.txt / ai.json)': 'warning',
  'AI Bot Blocking': 'error',
  'AI Content Directives': 'notice',
  'Training vs Retrieval Bot Strategy': 'notice',
  'agent-card.json': 'notice',
  'agents.json': 'notice',
  // Content Quality
  'Structured Data (JSON-LD)': 'warning',
  'FAQ Content': 'notice',
  'Content Structure & Depth': 'warning',
  'Heading Hierarchy': 'warning',
  'Meta Descriptions': 'warning',
  'Content Freshness': 'notice',
  'Schema Markup Diversity': 'notice',
  'Featured Snippet Readiness': 'notice',
  'Answer Format Diversity': 'notice',
  'Voice Search Optimization': 'notice',
  'Duplicate Titles': 'warning',
  'Duplicate Meta Descriptions': 'warning',
  'Content Too Long for AI': 'notice',
  'Paragraph Length Optimization': 'notice',
  'Answer-First Content Structure': 'notice',
  'Organization Schema Completeness': 'warning',
  'Security Headers': 'notice',
  'Compression': 'warning',
  'Content Quotability Score': 'notice',
  'Topic Cluster Detection': 'notice',
  // AI Discoverability
  'Server-side Rendering': 'error',
  'Search Engine Indexing': 'error',
  'Open Graph Tags': 'notice',
  'Author & Expertise Signals': 'notice',
  'Trust Signals': 'notice',
  'Social Proof & Authority': 'notice',
  'Citation Quality': 'notice',
  'Twitter Card Tags': 'notice',
  'Breadcrumb Schema': 'notice',
  'hreflang Tags': 'notice',
  // Foundational SEO
  'Title Tags': 'warning',
  'Image Alt Text': 'warning',
  'Internal Linking': 'warning',
  'Mobile Viewport': 'error',
  'HTTPS Enforcement': 'error',
  'Broken Pages': 'error',
  'Nofollow on Internal Links': 'warning',
  'URL Structure Quality': 'warning',
  'Canonical Link Issues': 'error',
  'Semantic HTML Usage': 'notice',
  'Text-to-HTML Ratio': 'warning',
  'Page Response Time': 'warning',
  'Redirect Chains': 'warning',
  'Character Encoding & Doctype': 'error',
  'HTML Page Size': 'warning',
  'Crawl Depth': 'notice',
  // Non-scored
  'security.txt': 'info',
  'tdmrep.json': 'info',
  'manifest.json': 'info',
  'humans.txt': 'info',
};

/** Resolve severity for an item, defaulting by status */
export function resolveSeverity(name: string, status: AuditItem['status']): AuditSeverity {
  if (status === 'pass' || status === 'not_applicable') return 'info';
  return SEVERITY_MAP[name] || 'notice';
}
