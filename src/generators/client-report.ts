/**
 * Client Report Generator — produces a polished markdown report for client delivery.
 *
 * Business-friendly language, executive summary, prioritized action plan.
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';
import type { AuditResult, AuditItem } from '../analyzer/geo-auditor.js';
import type { EEATScore } from '../analyzer/eeat-scorer.js';
import type { SiteCitabilityResult } from '../analyzer/citability-scorer.js';
import type { PlatformOptimizationResult } from '../analyzer/platform-optimizer.js';
import type { BrandMentionResult } from '../analyzer/brand-scanner.js';
import type { SiteAIContentResult } from '../analyzer/ai-content-detector.js';
import type { SchemaTemplateResult } from './schema-templates.js';

export interface ClientReportData {
  audit: AuditResult;
  crawlResult: SiteCrawlResult;
  eeatScore?: EEATScore;
  citabilityResult?: SiteCitabilityResult;
  platformResult?: PlatformOptimizationResult;
  brandResult?: BrandMentionResult;
  aiContentResult?: SiteAIContentResult;
  schemaResult?: SchemaTemplateResult;
}

function gradeEmoji(grade: string): string {
  if (grade.startsWith('A')) return 'Excellent';
  if (grade === 'B') return 'Good';
  if (grade === 'C') return 'Fair';
  if (grade === 'D') return 'Poor';
  return 'Critical';
}

function priorityLabel(score: number): string {
  if (score >= 80) return 'Low';
  if (score >= 50) return 'Medium';
  return 'High';
}

function categorizeActions(items: AuditItem[]): { quickWins: AuditItem[]; mediumTerm: AuditItem[]; strategic: AuditItem[] } {
  const actionable = items.filter(i => i.status !== 'pass' && i.status !== 'not_applicable' && i.category !== 'non_scored');

  const quickWins: AuditItem[] = [];
  const mediumTerm: AuditItem[] = [];
  const strategic: AuditItem[] = [];

  const quickNames = new Set([
    'robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt',
    'AI Policy (ai.txt / ai.json)', 'Meta Descriptions', 'Title Tags',
    'Missing H1 Heading', 'AI Content Directives', 'Open Graph Tags',
    'Twitter Card Tags', 'agent-card.json', 'agents.json',
  ]);

  const strategicNames = new Set([
    'Content Structure & Depth', 'Content Freshness', 'Topic Cluster Detection',
    'Content Readability', 'Answer-First Content Structure', 'Voice Search Optimization',
    'Brand Authority Score', 'Social Proof & Authority',
  ]);

  for (const item of actionable) {
    if (quickNames.has(item.name)) quickWins.push(item);
    else if (strategicNames.has(item.name)) strategic.push(item);
    else mediumTerm.push(item);
  }

  return { quickWins, mediumTerm, strategic };
}

export function generateClientReport(data: ClientReportData): string {
  const { audit, crawlResult, eeatScore, citabilityResult, platformResult, brandResult, aiContentResult, schemaResult } = data;
  const siteName = crawlResult.siteIdentity.name || crawlResult.domain;
  const date = new Date().toISOString().split('T')[0];
  const { quickWins, mediumTerm, strategic } = categorizeActions(audit.items);

  const lines: string[] = [];

  // Header
  lines.push(`# GEO Audit Report: ${siteName}`);
  lines.push('');
  lines.push(`**Date:** ${date}  `);
  lines.push(`**URL:** ${crawlResult.baseUrl}  `);
  lines.push(`**Pages Analyzed:** ${crawlResult.crawlStats.totalPages}  `);
  lines.push(`**Crawl Time:** ${(crawlResult.crawlStats.totalTime / 1000).toFixed(1)}s`);
  lines.push('');

  // Executive Summary
  lines.push('---');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`**GEO Readiness Score: ${audit.overallScore}/100 (Grade: ${audit.grade} — ${gradeEmoji(audit.grade)})**`);
  lines.push('');

  if (audit.overallScore >= 80) {
    lines.push(`${siteName} demonstrates strong readiness for AI-powered search engines. Focus on maintaining existing strengths and addressing the remaining optimization opportunities below.`);
  } else if (audit.overallScore >= 50) {
    lines.push(`${siteName} has a solid foundation but significant opportunities exist to improve visibility across AI search platforms. Implementing the recommended changes could increase the score by 20-30 points.`);
  } else {
    lines.push(`${siteName} has critical gaps in AI search readiness. Without addressing these issues, the site risks losing visibility as search traffic shifts from traditional to AI-powered engines. Industry analysts project a 50% decline in traditional search traffic by 2028 (Gartner).`);
  }

  lines.push('');
  lines.push('### Key Metrics');
  lines.push('');
  lines.push('| Metric | Score | Status |');
  lines.push('|--------|-------|--------|');
  lines.push(`| GEO Readiness | ${audit.overallScore}/100 | ${audit.grade} |`);

  if (eeatScore) {
    lines.push(`| E-E-A-T Score | ${eeatScore.total}/100 | ${priorityLabel(eeatScore.total)} priority |`);
  }
  if (citabilityResult) {
    lines.push(`| AI Citability | ${citabilityResult.siteScore}/100 | ${citabilityResult.totalHighCitability}/${citabilityResult.totalPassages} passages citable |`);
  }
  if (aiContentResult) {
    lines.push(`| AI Content Risk | ${aiContentResult.averageScore}/100 | ${aiContentResult.pagesLikelyAI} pages flagged |`);
  }

  lines.push('');

  // Platform Readiness
  if (platformResult) {
    lines.push('### AI Platform Readiness');
    lines.push('');
    lines.push('| Platform | Score | Grade | Assessment |');
    lines.push('|----------|-------|-------|------------|');
    for (const p of platformResult.platforms) {
      lines.push(`| ${p.displayName} | ${p.score}/100 | ${p.grade} | ${p.strengths[0] || p.weaknesses[0] || ''} |`);
    }
    lines.push('');
    lines.push(`**Best platform:** ${platformResult.bestPlatform} | **Needs most work:** ${platformResult.worstPlatform}`);
    lines.push('');
  }

  // Category Breakdown
  lines.push('---');
  lines.push('');
  lines.push('## Category Breakdown');
  lines.push('');

  const categories = [
    { key: 'ai_infrastructure', name: 'AI Infrastructure', desc: 'Files and configurations that help AI systems discover and understand your site' },
    { key: 'content_quality', name: 'Content Quality', desc: 'How well your content is structured for AI extraction and citation' },
    { key: 'ai_discoverability', name: 'AI Discoverability', desc: 'Signals that help AI engines find, verify, and trust your brand' },
    { key: 'foundational_seo', name: 'Foundational SEO', desc: 'Technical SEO foundation that all search (traditional + AI) depends on' },
  ];

  for (const cat of categories) {
    const summary = audit.summary[cat.key as keyof typeof audit.summary];
    if (!summary) continue;
    const pct = Math.round((summary.passed / summary.total) * 100);
    lines.push(`### ${cat.name} (${summary.passed}/${summary.total} passed — ${pct}%)`);
    lines.push('');
    lines.push(`> ${cat.desc}`);
    lines.push('');

    const catItems = audit.items.filter(i => i.category === cat.key);
    const failures = catItems.filter(i => i.status === 'fail' || i.status === 'partial');
    const passes = catItems.filter(i => i.status === 'pass');

    if (passes.length > 0) {
      lines.push('**Passing:**');
      for (const item of passes) {
        lines.push(`- ${item.name} (${item.score}/100)`);
      }
      lines.push('');
    }

    if (failures.length > 0) {
      lines.push('**Needs Improvement:**');
      for (const item of failures) {
        lines.push(`- **${item.name}** (${item.score}/100) — ${item.recommendation}`);
      }
      lines.push('');
    }
  }

  // E-E-A-T Breakdown
  if (eeatScore) {
    lines.push('---');
    lines.push('');
    lines.push('## E-E-A-T Analysis');
    lines.push('');
    lines.push('Google\'s content quality framework — critical for AI search visibility.');
    lines.push('');
    lines.push('| Dimension | Score | Assessment |');
    lines.push('|-----------|-------|------------|');
    lines.push(`| Experience | ${eeatScore.experience}/25 | ${eeatScore.experience >= 15 ? 'Strong' : eeatScore.experience >= 8 ? 'Moderate' : 'Weak'} first-hand knowledge signals |`);
    lines.push(`| Expertise | ${eeatScore.expertise}/25 | ${eeatScore.expertise >= 15 ? 'Strong' : eeatScore.expertise >= 8 ? 'Moderate' : 'Weak'} technical depth |`);
    lines.push(`| Authoritativeness | ${eeatScore.authoritativeness}/25 | ${eeatScore.authoritativeness >= 15 ? 'Strong' : eeatScore.authoritativeness >= 8 ? 'Moderate' : 'Weak'} authority signals |`);
    lines.push(`| Trustworthiness | ${eeatScore.trustworthiness}/25 | ${eeatScore.trustworthiness >= 15 ? 'Strong' : eeatScore.trustworthiness >= 8 ? 'Moderate' : 'Weak'} trust foundation |`);
    lines.push(`| **Total** | **${eeatScore.total}/100** | |`);
    lines.push('');

    if (eeatScore.signals.length > 0) {
      lines.push('**Detected Signals:**');
      for (const signal of eeatScore.signals.slice(0, 10)) {
        const icon = signal.found ? '+' : '-';
        lines.push(`- [${icon}] ${signal.signal} (${signal.dimension}, ${signal.contribution}pts)`);
      }
      lines.push('');
    }
  }

  // Brand Authority
  if (brandResult) {
    lines.push('---');
    lines.push('');
    lines.push('## Brand Authority');
    lines.push('');
    lines.push('> Brand mentions correlate 3x more strongly with AI visibility than backlinks (Ahrefs Dec 2025).');
    lines.push('');
    lines.push(`**Overall Score:** ${brandResult.overallScore}/100`);
    lines.push('');
    lines.push('| Platform | Score | Status |');
    lines.push('|----------|-------|--------|');
    for (const p of brandResult.platforms) {
      const status = p.found ? `Found (${p.score}/100)` : 'Not found';
      lines.push(`| ${p.platform.charAt(0).toUpperCase() + p.platform.slice(1)} | ${p.score}/100 | ${status} |`);
    }
    lines.push('');
  }

  // AI Content Detection
  if (aiContentResult && aiContentResult.pages.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## AI Content Detection');
    lines.push('');
    lines.push(`**Average AI Score:** ${aiContentResult.averageScore}/100 (higher = more likely AI-generated)`);
    lines.push('');
    lines.push(aiContentResult.overallAssessment);
    lines.push('');

    if (aiContentResult.pagesLikelyAI > 0) {
      lines.push('**Pages flagged as likely AI-generated:**');
      lines.push('');
      for (const page of aiContentResult.pages.filter(p => p.aiScore >= 60).slice(0, 5)) {
        const path = new URL(page.url).pathname;
        lines.push(`- \`${path}\` — Score: ${page.aiScore}/100 (${page.signals.join(', ')})`);
      }
      lines.push('');
    }
  }

  // Schema Templates
  if (schemaResult && schemaResult.templates.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Recommended Schema Markup');
    lines.push('');
    lines.push(`**Detected site type:** ${schemaResult.detectedSiteType}`);
    if (schemaResult.existingSchemaTypes.length > 0) {
      lines.push(`**Existing schemas:** ${schemaResult.existingSchemaTypes.join(', ')}`);
    }
    lines.push('');

    if (schemaResult.missingCritical.length > 0) {
      lines.push(`**Missing critical schemas:** ${schemaResult.missingCritical.join(', ')}`);
      lines.push('');
    }

    lines.push('| Template | Priority | Description |');
    lines.push('|----------|----------|-------------|');
    for (const t of schemaResult.templates) {
      lines.push(`| ${t.name} | ${t.priority.toUpperCase()} | ${t.description} |`);
    }
    lines.push('');
    lines.push('> Schema template files are included in the output directory. Replace `{{PLACEHOLDER}}` values with your data.');
    lines.push('');
  }

  // Action Plan
  lines.push('---');
  lines.push('');
  lines.push('## Action Plan');
  lines.push('');

  if (quickWins.length > 0) {
    lines.push('### Quick Wins (1-2 weeks)');
    lines.push('');
    lines.push('These can be implemented immediately with minimal effort:');
    lines.push('');
    for (const item of quickWins) {
      lines.push(`- [ ] **${item.name}** — ${item.recommendation}`);
    }
    lines.push('');
  }

  if (mediumTerm.length > 0) {
    lines.push('### Medium-Term (1-3 months)');
    lines.push('');
    lines.push('Structural improvements that require development work:');
    lines.push('');
    for (const item of mediumTerm.slice(0, 10)) {
      lines.push(`- [ ] **${item.name}** — ${item.recommendation}`);
    }
    lines.push('');
  }

  if (strategic.length > 0) {
    lines.push('### Strategic (3+ months)');
    lines.push('');
    lines.push('Long-term content and authority building:');
    lines.push('');
    for (const item of strategic) {
      lines.push(`- [ ] **${item.name}** — ${item.recommendation}`);
    }
    lines.push('');
  }

  // Projected Impact
  const potentialGain = Math.min(100 - audit.overallScore, quickWins.length * 5 + mediumTerm.length * 3);
  lines.push('### Projected Impact');
  lines.push('');
  lines.push(`Implementing the Quick Wins and Medium-Term actions could improve your GEO score from **${audit.overallScore}** to approximately **${Math.min(100, audit.overallScore + potentialGain)}/100**.`);
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Report generated by [geo-scraper](https://github.com/Karolis332/geo-scraper) on ${date}.*`);
  lines.push('');

  return lines.join('\n');
}
