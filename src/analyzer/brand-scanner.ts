/**
 * Brand Mention Scanner — checks external platforms for brand presence.
 *
 * Brand mentions correlate 3x more strongly with AI visibility than backlinks.
 * YouTube has the strongest correlation (~0.737) with AI citation likelihood.
 *
 * Platforms: YouTube, Reddit, Wikipedia, LinkedIn.
 */

import type { SiteIdentity } from '../crawler/page-data.js';

export interface BrandMentionPlatform {
  platform: 'youtube' | 'reddit' | 'wikipedia' | 'linkedin';
  found: boolean;
  score: number;        // 0-100
  details: string;
  url: string | null;
}

export interface BrandMentionResult {
  brandName: string;
  domain: string;
  platforms: BrandMentionPlatform[];
  overallScore: number; // 0-100, weighted by platform importance
  scannedAt: string;
}

// Platform weights based on Ahrefs Dec 2025 research
const PLATFORM_WEIGHTS = {
  youtube: 0.35,     // strongest AI visibility correlation (0.737)
  reddit: 0.25,
  wikipedia: 0.25,
  linkedin: 0.15,
};

const REQUEST_TIMEOUT = 10_000; // 10s per request

/**
 * Fetch with timeout and error handling.
 */
async function safeFetch(url: string, options?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; geo-scraper/1.0)',
        ...(options?.headers ?? {}),
      },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check YouTube for brand channel and video mentions.
 */
async function scanYouTube(brandName: string): Promise<BrandMentionPlatform> {
  const result: BrandMentionPlatform = {
    platform: 'youtube',
    found: false,
    score: 0,
    details: '',
    url: null,
  };

  try {
    // Search YouTube for brand
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(brandName)}`;
    const res = await safeFetch(searchUrl);
    if (!res || !res.ok) {
      result.details = 'Could not reach YouTube';
      return result;
    }

    const html = await res.text();

    // Check if brand name appears in search results
    const brandLower = brandName.toLowerCase();
    const htmlLower = html.toLowerCase();
    const mentionCount = (htmlLower.match(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    if (mentionCount > 0) {
      result.found = true;
      result.url = searchUrl;

      // Channel detected (appears multiple times = likely has a channel)
      if (mentionCount >= 5) {
        result.score = 80;
        result.details = `Brand prominently present on YouTube (${mentionCount}+ mentions in results)`;
      } else if (mentionCount >= 2) {
        result.score = 50;
        result.details = `Brand mentioned on YouTube (${mentionCount} mentions in results)`;
      } else {
        result.score = 25;
        result.details = 'Brand has minimal YouTube presence';
      }

      // Check for brand channel link pattern (case-insensitive)
      if (htmlLower.includes(`/@${brandLower}`)) {
        result.score = Math.min(100, result.score + 20);
      }
    } else {
      result.details = 'No YouTube presence detected';
    }
  } catch {
    result.details = 'YouTube scan failed';
  }

  return result;
}

/**
 * Check Reddit for brand discussions and subreddit.
 */
async function scanReddit(brandName: string): Promise<BrandMentionPlatform> {
  const result: BrandMentionPlatform = {
    platform: 'reddit',
    found: false,
    score: 0,
    details: '',
    url: null,
  };

  try {
    // Search Reddit JSON API (no auth needed)
    const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(brandName)}&type=link&limit=10&sort=relevance`;
    const res = await safeFetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res || !res.ok) {
      result.details = 'Could not reach Reddit API';
      return result;
    }

    const data = await res.json() as { data?: { children?: { data: { title: string; subreddit: string; created_utc: number; url: string } }[] } };
    const posts = data?.data?.children ?? [];

    if (posts.length > 0) {
      result.found = true;
      result.url = `https://www.reddit.com/search/?q=${encodeURIComponent(brandName)}`;

      // Check recency
      const now = Date.now() / 1000;
      const sixMonthsAgo = now - 180 * 24 * 3600;
      const recentPosts = posts.filter(p => p.data.created_utc > sixMonthsAgo);

      if (recentPosts.length >= 3) {
        result.score = 85;
        result.details = `Active Reddit discussions: ${posts.length} posts found, ${recentPosts.length} recent`;
      } else if (posts.length >= 3) {
        result.score = 55;
        result.details = `Reddit discussions found: ${posts.length} posts (${recentPosts.length} recent)`;
      } else {
        result.score = 30;
        result.details = `Minimal Reddit presence: ${posts.length} post(s) found`;
      }
    } else {
      result.details = 'No Reddit discussions found';
    }

    // Also check for subreddit
    const subRes = await safeFetch(`https://www.reddit.com/r/${brandName.toLowerCase().replace(/\s+/g, '')}/about.json`);
    if (subRes && subRes.ok) {
      result.score = Math.min(100, result.score + 15);
      result.found = true;
      result.details += '. Dedicated subreddit exists';
    }
  } catch {
    result.details = 'Reddit scan failed';
  }

  return result;
}

/**
 * Check Wikipedia for brand article and Wikidata entity.
 */
async function scanWikipedia(brandName: string): Promise<BrandMentionPlatform> {
  const result: BrandMentionPlatform = {
    platform: 'wikipedia',
    found: false,
    score: 0,
    details: '',
    url: null,
  };

  try {
    // Check Wikipedia article
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(brandName)}&format=json&origin=*`;
    const res = await safeFetch(wikiUrl);

    if (res && res.ok) {
      const data = await res.json() as { query?: { pages?: Record<string, { missing?: string; pageid?: number; title?: string }> } };
      const pages = data?.query?.pages ?? {};
      const page = Object.values(pages)[0];

      if (page && !page.missing && page.pageid) {
        result.found = true;
        result.score = 60;
        result.url = `https://en.wikipedia.org/wiki/${encodeURIComponent(brandName.replace(/\s+/g, '_'))}`;
        result.details = 'Wikipedia article exists';
      }
    }

    // Check Wikidata entity
    const wdUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&format=json&language=en&limit=3&origin=*`;
    const wdRes = await safeFetch(wdUrl);

    if (wdRes && wdRes.ok) {
      const wdData = await wdRes.json() as { search?: { id: string; label: string; description?: string }[] };
      const entities = wdData?.search ?? [];

      if (entities.length > 0) {
        result.found = true;
        result.score = Math.min(100, result.score + 40);
        result.details += result.details ? '. Wikidata entity found' : 'Wikidata entity found (no Wikipedia article)';
        if (!result.url) {
          result.url = `https://www.wikidata.org/wiki/${entities[0].id}`;
        }
      }
    }

    if (!result.found) {
      result.details = 'No Wikipedia or Wikidata presence';
    }
  } catch {
    result.details = 'Wikipedia scan failed';
  }

  return result;
}

/**
 * Check LinkedIn for company page.
 */
async function scanLinkedIn(brandName: string, socialLinks: { platform: string; url: string }[]): Promise<BrandMentionPlatform> {
  const result: BrandMentionPlatform = {
    platform: 'linkedin',
    found: false,
    score: 0,
    details: '',
    url: null,
  };

  // First check if we already have a LinkedIn URL from site's social links
  const linkedinLink = socialLinks.find(s =>
    s.platform.toLowerCase() === 'linkedin' || s.url.includes('linkedin.com')
  );

  if (linkedinLink) {
    result.found = true;
    result.score = 70;
    result.url = linkedinLink.url;
    result.details = 'LinkedIn company page linked from website';

    // Try to verify the page exists
    const res = await safeFetch(linkedinLink.url);
    if (res && res.ok) {
      result.score = 100;
      result.details = 'LinkedIn company page verified and active';
    }
  } else {
    // Try to find by brand name slug
    const slug = brandName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const linkedinUrl = `https://www.linkedin.com/company/${slug}/`;
    const res = await safeFetch(linkedinUrl);

    if (res && (res.ok || res.status === 200)) {
      const html = await res.text();
      // LinkedIn returns 200 for valid pages
      if (html.includes('linkedin.com') && !html.includes('Page not found')) {
        result.found = true;
        result.score = 60;
        result.url = linkedinUrl;
        result.details = 'LinkedIn company page found via name search';
      } else {
        result.details = 'No LinkedIn company page found';
      }
    } else {
      result.details = 'No LinkedIn company page found';
    }
  }

  return result;
}

/**
 * Scan all platforms for brand mentions.
 */
export async function scanBrandMentions(
  identity: SiteIdentity,
  domain: string,
): Promise<BrandMentionResult> {
  const brandName = identity.name || domain.replace(/^www\./, '').split('.')[0];

  // Run all platform scans in parallel
  const [youtube, reddit, wikipedia, linkedin] = await Promise.allSettled([
    scanYouTube(brandName),
    scanReddit(brandName),
    scanWikipedia(brandName),
    scanLinkedIn(brandName, identity.socialLinks),
  ]);

  const platforms: BrandMentionPlatform[] = [
    youtube.status === 'fulfilled' ? youtube.value : { platform: 'youtube' as const, found: false, score: 0, details: 'Scan failed', url: null },
    reddit.status === 'fulfilled' ? reddit.value : { platform: 'reddit' as const, found: false, score: 0, details: 'Scan failed', url: null },
    wikipedia.status === 'fulfilled' ? wikipedia.value : { platform: 'wikipedia' as const, found: false, score: 0, details: 'Scan failed', url: null },
    linkedin.status === 'fulfilled' ? linkedin.value : { platform: 'linkedin' as const, found: false, score: 0, details: 'Scan failed', url: null },
  ];

  // Weighted overall score
  const overallScore = Math.round(
    platforms.reduce((sum, p) => sum + p.score * PLATFORM_WEIGHTS[p.platform], 0)
  );

  return {
    brandName,
    domain,
    platforms,
    overallScore,
    scannedAt: new Date().toISOString(),
  };
}
