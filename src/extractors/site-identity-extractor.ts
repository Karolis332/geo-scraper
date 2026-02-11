/**
 * Extract organization name, logo, contact info, social links, tech stack.
 */

import type { CheerioAPI } from 'cheerio';
import type { SiteIdentity } from '../crawler/page-data.js';

const SOCIAL_PLATFORMS: Record<string, RegExp> = {
  twitter: /twitter\.com|x\.com/i,
  facebook: /facebook\.com/i,
  linkedin: /linkedin\.com/i,
  instagram: /instagram\.com/i,
  youtube: /youtube\.com/i,
  github: /github\.com/i,
  tiktok: /tiktok\.com/i,
  pinterest: /pinterest\.com/i,
  mastodon: /mastodon\.|mstdn\./i,
  bluesky: /bsky\.app/i,
  threads: /threads\.net/i,
};

export function extractSiteIdentity($: CheerioAPI, url: string): SiteIdentity {
  return {
    name: extractOrgName($, url),
    tagline: extractTagline($),
    logoUrl: extractLogo($),
    faviconUrl: extractFavicon($),
    contactEmail: extractEmail($),
    contactPhone: extractPhone($),
    address: extractAddress($),
    socialLinks: extractSocialLinks($),
    copyright: extractCopyright($),
    techStack: detectTechStack($),
  };
}

function extractOrgName($: CheerioAPI, url: string): string | null {
  // Priority: og:site_name > Organization JSON-LD > title tag > domain
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName) return ogSiteName;

  // Check JSON-LD for Organization
  let orgName: string | null = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (orgName) return false; // stop iterating
    try {
      const data = JSON.parse($(el).html() || '');
      if (data?.['@type'] === 'Organization' && data?.name) {
        orgName = data.name;
      }
      // Also check @graph arrays
      if (Array.isArray(data?.['@graph'])) {
        for (const item of data['@graph']) {
          if (item?.['@type'] === 'Organization' && item?.name) {
            orgName = item.name;
          }
        }
      }
    } catch { /* skip */ }
  });
  if (orgName) return orgName;

  const title = $('title').text().trim();
  if (title) {
    // Strip common suffixes like " | Company Name" or " - Company Name"
    const parts = title.split(/\s*[|–—-]\s*/);
    if (parts.length > 1) return parts[parts.length - 1].trim();
    return title;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function extractTagline($: CheerioAPI): string | null {
  return (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null
  );
}

function extractLogo($: CheerioAPI): string | null {
  // JSON-LD Organization logo
  let logo: string | null = null;
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (data?.logo) {
        logo = typeof data.logo === 'string' ? data.logo : data.logo?.url;
      }
    } catch { /* skip */ }
  });
  if (logo) return logo;

  // Common selectors
  const logoSelectors = [
    'a[class*="logo"] img',
    '[class*="logo"] img',
    'header img[alt*="logo" i]',
    'img[class*="logo"]',
    'img[id*="logo"]',
  ];

  for (const sel of logoSelectors) {
    const src = $(sel).first().attr('src');
    if (src) return src;
  }

  // og:image as last resort
  return $('meta[property="og:image"]').attr('content') || null;
}

function extractFavicon($: CheerioAPI): string | null {
  return (
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href') ||
    null
  );
}

function extractEmail($: CheerioAPI): string | null {
  // Look for mailto: links
  let email: string | null = null;
  $('a[href^="mailto:"]').each((_i, el) => {
    if (!email) {
      const href = $(el).attr('href') || '';
      email = href.replace('mailto:', '').split('?')[0].trim();
    }
  });
  if (email) return email;

  // Look for email patterns in text
  const bodyText = $('body').text();
  const emailMatch = bodyText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  return emailMatch ? emailMatch[0] : null;
}

function extractPhone($: CheerioAPI): string | null {
  let phone: string | null = null;
  $('a[href^="tel:"]').each((_i, el) => {
    if (!phone) {
      phone = $(el).attr('href')?.replace('tel:', '').trim() || null;
    }
  });
  return phone;
}

function extractAddress($: CheerioAPI): string | null {
  const address = $('address').first().text().trim();
  if (address && address.length > 5) return address.replace(/\s+/g, ' ');

  // Check for Schema.org PostalAddress
  const streetAddress = $('[itemprop="streetAddress"]').text().trim();
  const locality = $('[itemprop="addressLocality"]').text().trim();
  const region = $('[itemprop="addressRegion"]').text().trim();
  const postalCode = $('[itemprop="postalCode"]').text().trim();

  if (streetAddress || locality) {
    return [streetAddress, locality, region, postalCode].filter(Boolean).join(', ');
  }

  return null;
}

function extractSocialLinks($: CheerioAPI): { platform: string; url: string }[] {
  const links: { platform: string; url: string }[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    for (const [platform, pattern] of Object.entries(SOCIAL_PLATFORMS)) {
      if (pattern.test(href) && !seen.has(platform)) {
        seen.add(platform);
        links.push({ platform, url: href });
        break;
      }
    }
  });

  return links;
}

function extractCopyright($: CheerioAPI): string | null {
  const footerText = $('footer').text();
  const copyMatch = footerText.match(/(?:©|\(c\)|copyright)\s*\d{4}[^.]*\./i);
  if (copyMatch) return copyMatch[0].trim();

  const pageText = $('body').text();
  const globalMatch = pageText.match(/(?:©|\(c\)|copyright)\s*\d{4}[^.]*\./i);
  return globalMatch ? globalMatch[0].trim() : null;
}

function detectTechStack($: CheerioAPI): string[] {
  const stack: string[] = [];

  // Check meta generator
  const generator = $('meta[name="generator"]').attr('content');
  if (generator) stack.push(generator);

  // Check for common framework signatures
  const html = $.html();
  if (html.includes('__next') || html.includes('_next/static')) stack.push('Next.js');
  if (html.includes('__nuxt')) stack.push('Nuxt.js');
  if (html.includes('__gatsby')) stack.push('Gatsby');
  if ($('[data-reactroot], [data-reactid]').length) stack.push('React');
  if ($('[ng-app], [ng-controller], [data-ng-app]').length) stack.push('Angular');
  if ($('[data-v-]').length || html.includes('__vue')) stack.push('Vue.js');
  if ($('[data-svelte]').length) stack.push('Svelte');
  if (html.includes('wp-content') || html.includes('wp-includes')) stack.push('WordPress');
  if (html.includes('Shopify.theme')) stack.push('Shopify');
  if (html.includes('squarespace')) stack.push('Squarespace');
  if (html.includes('wixsite.com') || html.includes('wix-code')) stack.push('Wix');
  if ($('link[href*="bootstrap"]').length || $('script[src*="bootstrap"]').length) stack.push('Bootstrap');
  if ($('link[href*="tailwind"]').length || html.includes('tailwindcss')) stack.push('Tailwind CSS');

  return [...new Set(stack)];
}
