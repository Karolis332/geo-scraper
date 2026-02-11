import { describe, it, expect } from 'vitest';
import { generateProjectedAudit, generateComparisonHtml } from './comparison-report.js';
import { createMockAuditResult, createMockAuditItem, createMockCrawlResult } from '../__tests__/fixtures.js';

describe('generateProjectedAudit', () => {
  it('boosts improvable items to their projected scores', () => {
    const before = createMockAuditResult();
    const after = generateProjectedAudit(before);

    const robotsAfter = after.items.find(i => i.name === 'robots.txt')!;
    expect(robotsAfter.score).toBe(100);

    const sitemapAfter = after.items.find(i => i.name === 'sitemap.xml')!;
    expect(sitemapAfter.score).toBe(100);

    const llmsAfter = after.items.find(i => i.name === 'llms.txt')!;
    expect(llmsAfter.score).toBe(100);

    const llmsFullAfter = after.items.find(i => i.name === 'llms-full.txt')!;
    expect(llmsFullAfter.score).toBe(100);

    const aiPolicyAfter = after.items.find(i => i.name === 'AI Policy (ai.txt / ai.json)')!;
    expect(aiPolicyAfter.score).toBe(100);

    const securityAfter = after.items.find(i => i.name === 'security.txt')!;
    expect(securityAfter.score).toBe(100);

    const structuredAfter = after.items.find(i => i.name === 'Structured Data (JSON-LD)')!;
    expect(structuredAfter.score).toBe(85);
  });

  it('leaves items already at max unchanged', () => {
    const before = createMockAuditResult({
      items: [
        createMockAuditItem({ name: 'robots.txt', category: 'critical', score: 100, status: 'pass' }),
        createMockAuditItem({ name: 'sitemap.xml', category: 'critical', score: 100, status: 'pass' }),
        createMockAuditItem({ name: 'llms.txt', category: 'critical', score: 100, status: 'pass' }),
        createMockAuditItem({ name: 'Structured Data (JSON-LD)', category: 'critical', score: 100, status: 'pass' }),
        createMockAuditItem({ name: 'Server-side Rendering', category: 'critical', score: 80, status: 'pass' }),
        createMockAuditItem({ name: 'AI Bot Blocking', category: 'critical', score: 100, status: 'pass' }),
      ],
    });
    const after = generateProjectedAudit(before);

    // Already at 100 — should stay 100
    expect(after.items.find(i => i.name === 'robots.txt')!.score).toBe(100);
    expect(after.items.find(i => i.name === 'sitemap.xml')!.score).toBe(100);
  });

  it('does not touch content-dependent items (meta descriptions, headings, SSR)', () => {
    const before = createMockAuditResult({
      items: [
        createMockAuditItem({ name: 'Meta Descriptions', category: 'high', score: 40 }),
        createMockAuditItem({ name: 'Heading Hierarchy', category: 'high', score: 30 }),
        createMockAuditItem({ name: 'Server-side Rendering', category: 'critical', score: 60 }),
      ],
    });
    const after = generateProjectedAudit(before);

    expect(after.items.find(i => i.name === 'Meta Descriptions')!.score).toBe(40);
    expect(after.items.find(i => i.name === 'Heading Hierarchy')!.score).toBe(30);
    expect(after.items.find(i => i.name === 'Server-side Rendering')!.score).toBe(60);
  });

  it('recalculates overall score with correct category weights', () => {
    const before = createMockAuditResult({
      items: [
        createMockAuditItem({ name: 'robots.txt', category: 'critical', score: 0 }),
        createMockAuditItem({ name: 'humans.txt', category: 'low', score: 0 }),
      ],
    });
    const after = generateProjectedAudit(before);

    // robots.txt: 100 * 3 = 300, humans.txt: 100 * 0.5 = 50
    // max: 100*3 + 100*0.5 = 350
    // score: 350/350 = 100
    expect(after.overallScore).toBe(100);
  });

  it('updates grade based on new score', () => {
    // All items fail → F grade
    const before = createMockAuditResult();
    expect(before.grade).toBe('F');

    const after = generateProjectedAudit(before);
    // Many items boosted, score should increase significantly
    expect(after.overallScore).toBeGreaterThan(before.overallScore);
    expect(after.grade).not.toBe('F');
  });

  it('updates summary passed/total counts', () => {
    const before = createMockAuditResult();
    expect(before.summary.critical.passed).toBe(0);

    const after = generateProjectedAudit(before);
    // robots.txt, sitemap.xml, llms.txt, structured data, AI bot blocking all get boosted
    expect(after.summary.critical.passed).toBeGreaterThan(before.summary.critical.passed);
  });
});

describe('generateComparisonHtml', () => {
  const before = createMockAuditResult();
  const after = generateProjectedAudit(before);
  const crawlResult = createMockCrawlResult();

  it('returns valid HTML with doctype and closing tag', () => {
    const html = generateComparisonHtml(before, after, crawlResult);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
  });

  it('contains site name and URL', () => {
    const html = generateComparisonHtml(before, after, crawlResult);
    expect(html).toContain('Test Site');
    expect(html).toContain('https://example.com');
  });

  it('contains before and after scores', () => {
    const html = generateComparisonHtml(before, after, crawlResult);
    expect(html).toContain(`${before.overallScore}/100`);
    expect(html).toContain(`${after.overallScore}/100`);
  });

  it('has "We Fix These" section when items improve', () => {
    const html = generateComparisonHtml(before, after, crawlResult);
    expect(html).toContain('We Fix These');
  });

  it('has "Needs Your Attention" section for client items', () => {
    const html = generateComparisonHtml(before, after, crawlResult);
    expect(html).toContain('Needs Your Attention');
  });

  it('shows correct +N delta', () => {
    const html = generateComparisonHtml(before, after, crawlResult);
    const delta = after.overallScore - before.overallScore;
    expect(html).toContain(`+${delta}`);
  });
});
