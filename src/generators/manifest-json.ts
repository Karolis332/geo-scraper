/**
 * Generate manifest.json — Web app manifest with site identity.
 */

import type { SiteCrawlResult } from '../crawler/page-data.js';
import { resolveUrl } from '../utils/url-utils.js';

export function generateManifestJson(crawlResult: SiteCrawlResult): string {
  const { siteIdentity, baseUrl, domain } = crawlResult;
  const siteName = siteIdentity.name || domain;

  const manifest: Record<string, unknown> = {
    name: siteName,
    short_name: siteName.length > 12 ? siteName.substring(0, 12) : siteName,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    ...(siteIdentity.tagline && { description: siteIdentity.tagline }),
  };

  // Add icons if we found a logo/favicon
  const icons: Record<string, string>[] = [];
  if (siteIdentity.faviconUrl) {
    const faviconUrl = resolveUrl(siteIdentity.faviconUrl, baseUrl);
    icons.push({
      src: faviconUrl,
      sizes: '48x48',
      type: guessImageType(faviconUrl),
    });
  }
  if (siteIdentity.logoUrl) {
    const logoUrl = resolveUrl(siteIdentity.logoUrl, baseUrl);
    icons.push({
      src: logoUrl,
      sizes: '192x192',
      type: guessImageType(logoUrl),
    });
    icons.push({
      src: logoUrl,
      sizes: '512x512',
      type: guessImageType(logoUrl),
    });
  }

  if (icons.length > 0) {
    manifest.icons = icons;
  }

  return JSON.stringify(manifest, null, 2) + '\n';
}


function guessImageType(url: string): string {
  if (url.endsWith('.svg')) return 'image/svg+xml';
  if (url.endsWith('.png')) return 'image/png';
  if (url.endsWith('.ico')) return 'image/x-icon';
  if (url.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}
