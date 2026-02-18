/**
 * Extract meta tags, Open Graph, Twitter Cards from HTML.
 */

import type { CheerioAPI } from 'cheerio';
import type { PageMeta } from '../crawler/page-data.js';

export function extractMeta($: CheerioAPI, url: string): PageMeta {
  const getMeta = (name: string): string | null => {
    return (
      $(`meta[name="${name}"]`).attr('content') ||
      $(`meta[property="${name}"]`).attr('content') ||
      null
    );
  };

  const title =
    $('title').first().text().trim() ||
    getMeta('og:title') ||
    $('h1').first().text().trim() ||
    '';

  const description =
    getMeta('description') ||
    getMeta('og:description') ||
    '';

  const canonical =
    $('link[rel="canonical"]').attr('href') || null;

  const language =
    $('html').attr('lang') ||
    getMeta('language') ||
    null;

  const keywords = (getMeta('keywords') || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  const publishedDate =
    getMeta('article:published_time') ||
    getMeta('datePublished') ||
    getMeta('date') ||
    $('time[datetime]').first().attr('datetime') ||
    null;

  const modifiedDate =
    getMeta('article:modified_time') ||
    getMeta('dateModified') ||
    null;

  return {
    title,
    description,
    canonical,
    language,
    ogTitle: getMeta('og:title'),
    ogDescription: getMeta('og:description'),
    ogImage: getMeta('og:image'),
    ogType: getMeta('og:type'),
    ogSiteName: getMeta('og:site_name'),
    twitterCard: getMeta('twitter:card'),
    twitterTitle: getMeta('twitter:title'),
    twitterDescription: getMeta('twitter:description'),
    twitterImage: getMeta('twitter:image'),
    author: getMeta('author') || $('meta[name="author"]').attr('content') || null,
    publishedDate,
    modifiedDate,
    keywords,
    robots: getMeta('robots'),
    googleVerification: getMeta('google-site-verification'),
    bingVerification: getMeta('msvalidate.01'),
    yandexVerification: getMeta('yandex-verification'),
  };
}
