import { describe, it, expect } from 'vitest';
import { auditSite } from './geo-auditor.js';
import { createMockCrawlResult, createMockPageData } from '../__tests__/fixtures.js';

describe('auditSite', () => {
  it('returns correct structure', () => {
    const result = auditSite(createMockCrawlResult());
    expect(result).toHaveProperty('overallScore');
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('critical');
    expect(result.summary).toHaveProperty('high');
    expect(result.summary).toHaveProperty('medium');
    expect(result.summary).toHaveProperty('low');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('scores low for empty site with no GEO files', () => {
    const crawl = createMockCrawlResult({
      pages: [createMockPageData({ content: { headings: [], bodyText: '', wordCount: 0, faqItems: [], lists: [], tables: [] } })],
    });
    const result = auditSite(crawl);
    expect(result.overallScore).toBeLessThan(50);
    expect(result.grade).toBe('F');
  });

  it('scores higher with populated existingGeoFiles', () => {
    const empty = auditSite(createMockCrawlResult());
    const populated = auditSite(createMockCrawlResult({
      existingGeoFiles: {
        robotsTxt: 'User-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /',
        sitemapXml: '<urlset><url><loc>https://example.com/</loc><lastmod>2025-01-01</lastmod></url></urlset>',
        llmsTxt: '# Example\n> A site\n## Pages\n- [Home](https://example.com)',
        llmsFullTxt: 'Full content here',
        aiTxt: 'AI policy',
        aiJson: '{"policy":"allow"}',
        securityTxt: 'Contact: security@example.com',
        tdmrepJson: '{"policy":[]}',
        humansTxt: 'Team info',
        manifestJson: '{"name":"Example"}',
        bingSiteAuth: null,
      },
    }));
    expect(populated.overallScore).toBeGreaterThan(empty.overallScore);
  });

  describe('robots.txt audit', () => {
    it('scores 0 when no file exists', () => {
      const result = auditSite(createMockCrawlResult());
      const item = result.items.find(i => i.name === 'robots.txt')!;
      expect(item.score).toBe(0);
    });

    it('scores 30 for robots.txt without AI crawlers', () => {
      const result = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: 'User-agent: *\nAllow: /',
          sitemapXml: null, llmsTxt: null, llmsFullTxt: null,
          aiTxt: null, aiJson: null, securityTxt: null,
          tdmrepJson: null, humansTxt: null, manifestJson: null, bingSiteAuth: null,
        },
      }));
      const item = result.items.find(i => i.name === 'robots.txt')!;
      expect(item.score).toBe(30);
    });

    it('scores higher with AI crawler directives', () => {
      const result = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: 'User-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /',
          sitemapXml: null, llmsTxt: null, llmsFullTxt: null,
          aiTxt: null, aiJson: null, securityTxt: null,
          tdmrepJson: null, humansTxt: null, manifestJson: null, bingSiteAuth: null,
        },
      }));
      const item = result.items.find(i => i.name === 'robots.txt')!;
      expect(item.score).toBeGreaterThan(30);
    });
  });

  describe('sitemap.xml audit', () => {
    it('scores 0 when no file exists', () => {
      const result = auditSite(createMockCrawlResult());
      const item = result.items.find(i => i.name === 'sitemap.xml')!;
      expect(item.score).toBe(0);
    });

    it('scores 75 with URLs but no lastmod', () => {
      const result = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: null, sitemapXml: '<urlset><url><loc>https://example.com/</loc></url></urlset>',
          llmsTxt: null, llmsFullTxt: null, aiTxt: null, aiJson: null,
          securityTxt: null, tdmrepJson: null, humansTxt: null, manifestJson: null,
          bingSiteAuth: null,
        },
      }));
      const item = result.items.find(i => i.name === 'sitemap.xml')!;
      expect(item.score).toBe(75);
    });

    it('scores 100 with URLs and lastmod', () => {
      const result = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: null,
          sitemapXml: '<urlset><url><loc>https://example.com/</loc><lastmod>2025-01-01</lastmod></url></urlset>',
          llmsTxt: null, llmsFullTxt: null, aiTxt: null, aiJson: null,
          securityTxt: null, tdmrepJson: null, humansTxt: null, manifestJson: null,
          bingSiteAuth: null,
        },
      }));
      const item = result.items.find(i => i.name === 'sitemap.xml')!;
      expect(item.score).toBe(100);
    });
  });

  describe('llms.txt audit', () => {
    it('validates H1, blockquote, H2, links', () => {
      const full = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: null, sitemapXml: null,
          llmsTxt: '# My Site\n> A great site\n## Pages\n- [Home](https://example.com)',
          llmsFullTxt: null, aiTxt: null, aiJson: null,
          securityTxt: null, tdmrepJson: null, humansTxt: null, manifestJson: null,
          bingSiteAuth: null,
        },
      }));
      const item = full.items.find(i => i.name === 'llms.txt')!;
      // 40 base + 15 (H1) + 15 (blockquote) + 15 (H2) + 15 (links) = 100
      expect(item.score).toBe(100);
    });

    it('gives partial score for incomplete llms.txt', () => {
      const partial = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: null, sitemapXml: null,
          llmsTxt: '# My Site\nSome content without blockquote or sections',
          llmsFullTxt: null, aiTxt: null, aiJson: null,
          securityTxt: null, tdmrepJson: null, humansTxt: null, manifestJson: null,
          bingSiteAuth: null,
        },
      }));
      const item = partial.items.find(i => i.name === 'llms.txt')!;
      // 40 base + 15 (H1) = 55
      expect(item.score).toBe(55);
      expect(item.score).toBeLessThan(100);
    });
  });

  describe('grade boundaries', () => {
    // We can't easily control exact scores via crawlResult, so we test the grading
    // indirectly by checking known boundaries
    it('assigns F for low scores', () => {
      const result = auditSite(createMockCrawlResult());
      expect(result.overallScore).toBeLessThan(50);
      expect(result.grade).toBe('F');
    });

    it('assigns higher grades with more GEO files', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          meta: {
            title: 'Test', description: 'A good meta description for this page',
            canonical: null, language: 'en', ogTitle: 'Test', ogDescription: 'Test desc',
            ogImage: null, ogType: null, ogSiteName: null, twitterCard: null,
            twitterTitle: null, twitterDescription: null, twitterImage: null,
            author: null, publishedDate: null, modifiedDate: '2025-06-01',
            keywords: [], robots: null, googleVerification: null, bingVerification: null, yandexVerification: null,
          },
          content: {
            headings: [{ level: 1, text: 'Main' }, { level: 2, text: 'Sub' }, { level: 3, text: 'Detail' }],
            bodyText: 'word '.repeat(600),
            wordCount: 600,
            faqItems: [{ question: 'Q?', answer: 'A.' }],
            lists: [], tables: [],
          },
          existingStructuredData: {
            jsonLd: [{ '@type': 'Organization' }, { '@type': 'WebSite' }, { '@type': 'FAQPage' }],
            microdata: [], rdfa: [],
          },
        })],
        existingGeoFiles: {
          robotsTxt: 'User-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Applebot-Extended\nAllow: /',
          sitemapXml: '<urlset><url><loc>https://example.com/</loc><lastmod>2025-01-01</lastmod></url></urlset>',
          llmsTxt: '# Site\n> Summary\n## Docs\n- [Page](https://example.com)',
          llmsFullTxt: 'Full content',
          aiTxt: 'AI policy text',
          aiJson: '{"policy":"allow"}',
          securityTxt: 'Contact: sec@example.com',
          tdmrepJson: '{"policy":[]}',
          humansTxt: 'Team info',
          manifestJson: '{"name":"Site"}',
          bingSiteAuth: null,
        },
      }));
      expect(result.overallScore).toBeGreaterThan(70);
      // Should be at least B
      expect(['A+', 'A', 'B']).toContain(result.grade);
    });
  });

  describe('AI Bot Blocking audit', () => {
    it('scores 100 when no robots.txt exists', () => {
      const result = auditSite(createMockCrawlResult());
      const item = result.items.find(i => i.name === 'AI Bot Blocking')!;
      expect(item.score).toBe(100);
    });

    it('scores lower when bots are blocked with Disallow: /', () => {
      const result = auditSite(createMockCrawlResult({
        existingGeoFiles: {
          robotsTxt: 'User-agent: GPTBot\nDisallow: /\nUser-agent: ClaudeBot\nDisallow: /',
          sitemapXml: null, llmsTxt: null, llmsFullTxt: null,
          aiTxt: null, aiJson: null, securityTxt: null,
          tdmrepJson: null, humansTxt: null, manifestJson: null, bingSiteAuth: null,
        },
      }));
      const item = result.items.find(i => i.name === 'AI Bot Blocking')!;
      expect(item.score).toBeLessThan(100);
    });
  });
});
