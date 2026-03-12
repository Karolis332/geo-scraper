/**
 * Google PageSpeed Insights integration for real Core Web Vitals data.
 * Uses the free PSI API (25k queries/day with API key, limited without).
 */

export interface PageSpeedResult {
  performanceScore: number;
  metrics: {
    fcp: number;       // First Contentful Paint (ms)
    lcp: number;       // Largest Contentful Paint (ms)
    tbt: number;       // Total Blocking Time (ms)
    cls: number;       // Cumulative Layout Shift
    si: number;        // Speed Index (ms)
    tti: number;       // Time to Interactive (ms)
  };
  displayValues: {
    fcp: string;
    lcp: string;
    tbt: string;
    cls: string;
    si: string;
    tti: string;
  };
  opportunities: { title: string; savings: string }[];
}

export async function probePageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
  apiKey?: string | null,
): Promise<PageSpeedResult | null> {
  try {
    let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
    if (apiKey) {
      apiUrl += `&key=${apiKey}`;
    }

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(60000), // PSI can take up to 60s
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as Record<string, unknown>;
    const lh = data.lighthouseResult as Record<string, unknown> | undefined;
    if (!lh) return null;

    const categories = lh.categories as Record<string, { score: number }>;
    const audits = lh.audits as Record<string, {
      score?: number;
      numericValue?: number;
      displayValue?: string;
    }>;

    const performanceScore = Math.round((categories?.performance?.score ?? 0) * 100);

    const metric = (key: string) => audits[key]?.numericValue ?? 0;
    const display = (key: string) => audits[key]?.displayValue ?? 'N/A';

    // Extract top savings opportunities
    const opportunities: { title: string; savings: string }[] = [];
    const oppKeys = [
      'render-blocking-resources', 'unused-javascript', 'unused-css-rules',
      'offscreen-images', 'unminified-javascript', 'unminified-css',
      'efficient-animated-content', 'uses-responsive-images', 'uses-text-compression',
      'uses-optimized-images', 'modern-image-formats',
    ];
    for (const key of oppKeys) {
      const audit = audits[key];
      if (audit && audit.score !== undefined && audit.score < 1 && audit.displayValue) {
        opportunities.push({
          title: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          savings: audit.displayValue,
        });
      }
    }

    return {
      performanceScore,
      metrics: {
        fcp: Math.round(metric('first-contentful-paint')),
        lcp: Math.round(metric('largest-contentful-paint')),
        tbt: Math.round(metric('total-blocking-time')),
        cls: Math.round(metric('cumulative-layout-shift') * 1000) / 1000,
        si: Math.round(metric('speed-index')),
        tti: Math.round(metric('interactive')),
      },
      displayValues: {
        fcp: display('first-contentful-paint'),
        lcp: display('largest-contentful-paint'),
        tbt: display('total-blocking-time'),
        cls: display('cumulative-layout-shift'),
        si: display('speed-index'),
        tti: display('interactive'),
      },
      opportunities: opportunities.slice(0, 5),
    };
  } catch {
    return null;
  }
}
