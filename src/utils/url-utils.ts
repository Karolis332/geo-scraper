/**
 * URL normalization and domain extraction utilities.
 */

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(url, baseUrl);
    // Remove hash fragments and trailing slashes
    resolved.hash = '';
    let normalized = resolved.href;
    if (normalized.endsWith('/') && resolved.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
}

export function isSameDomain(url: string, baseUrl: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(baseUrl);
    return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

export function getPathSlug(url: string): string {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    // Remove leading/trailing slashes
    path = path.replace(/^\/+|\/+$/g, '');
    if (!path) return 'index';
    // Replace slashes with dashes
    return path.replace(/\//g, '-').replace(/\.[^.]+$/, '');
  } catch {
    return 'unknown';
  }
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ensureHttps(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  if (!url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

export function getRelativePath(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    return parsed.pathname;
  } catch {
    return '/';
  }
}

export function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

/**
 * Classify a URL into a site section based on common patterns.
 */
export function classifyPageSection(url: string): string {
  const path = getRelativePath(url, url).toLowerCase();
  if (path === '/' || path === '/index' || path === '/index.html') return 'Main';
  if (/^\/(docs?|documentation|guide|manual|reference|api)/.test(path)) return 'Documentation';
  if (/^\/(blog|news|articles?|posts?)/.test(path)) return 'Blog';
  if (/^\/(about|team|company|who-we-are)/.test(path)) return 'About';
  if (/^\/(products?|shop|store|pricing|plans)/.test(path)) return 'Products';
  if (/^\/(services?|solutions?)/.test(path)) return 'Services';
  if (/^\/(contact|support|help|faq)/.test(path)) return 'Support';
  if (/^\/(legal|privacy|terms|tos|cookie)/.test(path)) return 'Legal';
  if (/^\/(careers?|jobs?)/.test(path)) return 'Careers';
  if (/^\/(examples?|demos?|showcase|gallery|portfolio)/.test(path)) return 'Examples';
  if (/^\/(changelog|releases?|whats-new)/.test(path)) return 'Changelog';
  return 'Pages';
}
