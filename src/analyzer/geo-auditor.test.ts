import { describe, it, expect } from 'vitest';
import { auditSite, MAX_AFFECTED_URLS } from './geo-auditor.js';
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
            keywords: [], robots: null, googleVerification: null, bingVerification: null, yandexVerification: null, viewport: 'width=device-width, initial-scale=1',
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

  describe('SEO checks', () => {
    it('includes seo category in summary', () => {
      const result = auditSite(createMockCrawlResult());
      expect(result.summary).toHaveProperty('seo');
      expect(result.summary.seo.total).toBeGreaterThan(0);
    });

    it('audits title tags', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [
          createMockPageData({ meta: { ...createMockPageData().meta, title: 'A Good Title That Is The Right Length For SEO' } }),
        ],
      }));
      const item = result.items.find(i => i.name === 'Title Tags')!;
      expect(item).toBeDefined();
      expect(item.category).toBe('seo');
      expect(item.score).toBeGreaterThan(0);
    });

    it('flags duplicate title tags', () => {
      const page1 = createMockPageData({ url: 'https://example.com/', meta: { ...createMockPageData().meta, title: 'Same Title' } });
      const page2 = createMockPageData({ url: 'https://example.com/about', meta: { ...createMockPageData().meta, title: 'Same Title' } });
      const result = auditSite(createMockCrawlResult({ pages: [page1, page2] }));
      const item = result.items.find(i => i.name === 'Title Tags')!;
      expect(item.details).toContain('duplicate');
    });

    it('audits image alt text', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          images: [
            { src: '/img1.jpg', alt: 'A descriptive alt text' },
            { src: '/img2.jpg', alt: '' },
          ],
        })],
      }));
      const item = result.items.find(i => i.name === 'Image Alt Text')!;
      expect(item.score).toBe(50); // 1/2 images with alt
    });

    it('scores 100 for image alt when no images exist', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({ images: [] })],
      }));
      const item = result.items.find(i => i.name === 'Image Alt Text')!;
      expect(item.score).toBe(100);
    });

    it('audits internal linking', () => {
      const result = auditSite(createMockCrawlResult());
      const item = result.items.find(i => i.name === 'Internal Linking')!;
      expect(item).toBeDefined();
      expect(item.category).toBe('seo');
    });

    it('audits mobile viewport', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          meta: { ...createMockPageData().meta, viewport: 'width=device-width, initial-scale=1' },
        })],
      }));
      const item = result.items.find(i => i.name === 'Mobile Viewport')!;
      expect(item.score).toBe(100);
    });

    it('scores 0 for mobile viewport when missing', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          meta: { ...createMockPageData().meta, viewport: null },
        })],
      }));
      const item = result.items.find(i => i.name === 'Mobile Viewport')!;
      expect(item.score).toBe(0);
    });

    it('audits HTTPS enforcement', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({ url: 'https://example.com/' })],
      }));
      const item = result.items.find(i => i.name === 'HTTPS Enforcement')!;
      expect(item.score).toBe(100);
    });

    it('flags non-HTTPS pages', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({ url: 'http://example.com/' })],
      }));
      const item = result.items.find(i => i.name === 'HTTPS Enforcement')!;
      expect(item.score).toBe(0);
    });

    it('audits broken pages', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [
          createMockPageData({ statusCode: 200 }),
          createMockPageData({ url: 'https://example.com/broken', statusCode: 404 }),
        ],
      }));
      const item = result.items.find(i => i.name === 'Broken Pages')!;
      expect(item.score).toBe(50); // 1/2 broken
    });

    it('scores 100 when no broken pages', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({ statusCode: 200 })],
      }));
      const item = result.items.find(i => i.name === 'Broken Pages')!;
      expect(item.score).toBe(100);
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

  describe('affectedUrls', () => {
    it('populates affectedUrls for per-page items with failures', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [
          createMockPageData({ url: 'https://example.com/', meta: { ...createMockPageData().meta, viewport: null } }),
          createMockPageData({ url: 'https://example.com/about', meta: { ...createMockPageData().meta, viewport: null } }),
        ],
      }));
      const item = result.items.find(i => i.name === 'Mobile Viewport')!;
      expect(item.affectedUrls).toBeDefined();
      expect(item.affectedUrls).toContain('https://example.com/');
      expect(item.affectedUrls).toContain('https://example.com/about');
    });

    it('does not include affectedUrls when all pages pass', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          url: 'https://example.com/',
          meta: { ...createMockPageData().meta, viewport: 'width=device-width, initial-scale=1' },
        })],
      }));
      const item = result.items.find(i => i.name === 'Mobile Viewport')!;
      expect(item.affectedUrls).toBeUndefined();
    });

    it('caps affectedUrls at MAX_AFFECTED_URLS', () => {
      const pages = Array.from({ length: 30 }, (_, i) =>
        createMockPageData({
          url: `https://example.com/page-${i}`,
          meta: { ...createMockPageData().meta, viewport: null },
        }),
      );
      const result = auditSite(createMockCrawlResult({ pages }));
      const item = result.items.find(i => i.name === 'Mobile Viewport')!;
      expect(item.affectedUrls).toBeDefined();
      expect(item.affectedUrls!.length).toBe(MAX_AFFECTED_URLS);
    });

    it('does not have affectedUrls on site-level items', () => {
      const result = auditSite(createMockCrawlResult());
      const siteItems = ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt',
        'AI Policy (ai.txt / ai.json)', 'security.txt', 'tdmrep.json', 'humans.txt', 'manifest.json'];
      for (const name of siteItems) {
        const item = result.items.find(i => i.name === name)!;
        expect(item.affectedUrls).toBeUndefined();
      }
    });

    it('populates affectedUrls for broken pages', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [
          createMockPageData({ statusCode: 200 }),
          createMockPageData({ url: 'https://example.com/broken', statusCode: 404 }),
        ],
      }));
      const item = result.items.find(i => i.name === 'Broken Pages')!;
      expect(item.affectedUrls).toEqual(['https://example.com/broken']);
    });

    it('populates affectedUrls for non-HTTPS pages', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({ url: 'http://example.com/' })],
      }));
      const item = result.items.find(i => i.name === 'HTTPS Enforcement')!;
      expect(item.affectedUrls).toEqual(['http://example.com/']);
    });

    it('populates affectedUrls for pages missing meta descriptions', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          url: 'https://example.com/no-desc',
          meta: { ...createMockPageData().meta, description: '' },
        })],
      }));
      const item = result.items.find(i => i.name === 'Meta Descriptions')!;
      expect(item.affectedUrls).toContain('https://example.com/no-desc');
    });

    it('populates affectedUrls for pages with missing image alt text', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          url: 'https://example.com/images',
          images: [{ src: '/img.jpg', alt: '' }],
        })],
      }));
      const item = result.items.find(i => i.name === 'Image Alt Text')!;
      expect(item.affectedUrls).toContain('https://example.com/images');
    });

    it('populates affectedUrls for thin content pages', () => {
      const result = auditSite(createMockCrawlResult({
        pages: [createMockPageData({
          url: 'https://example.com/thin',
          content: { headings: [], bodyText: 'short', wordCount: 10, faqItems: [], lists: [], tables: [] },
        })],
      }));
      const item = result.items.find(i => i.name === 'Content Structure & Depth')!;
      expect(item.affectedUrls).toContain('https://example.com/thin');
    });
  });
});
