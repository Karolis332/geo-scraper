/**
 * E-E-A-T Scorer — Experience, Expertise, Authoritativeness, Trustworthiness.
 *
 * Based on Google's Quality Rater Guidelines (Dec 2025 update).
 * Each dimension scored 0-25, total 0-100.
 */

import type { SiteCrawlResult, PageData, SiteIdentity } from '../crawler/page-data.js';
import type { BrandMentionResult } from './brand-scanner.js';

export interface EEATSignal {
  dimension: 'experience' | 'expertise' | 'authoritativeness' | 'trustworthiness';
  signal: string;
  found: boolean;
  contribution: number; // points contributed
}

export interface EEATScore {
  total: number;                // 0-100
  experience: number;           // 0-25
  expertise: number;            // 0-25
  authoritativeness: number;    // 0-25
  trustworthiness: number;      // 0-25
  signals: EEATSignal[];
}

/**
 * Calculate E-E-A-T score from crawl results.
 */
export function calculateEEAT(
  crawlResult: SiteCrawlResult,
  brandResult?: BrandMentionResult,
): EEATScore {
  const signals: EEATSignal[] = [];
  const { pages, siteIdentity } = crawlResult;
  // Test per-page with early exit to avoid building a multi-MB string
  const anyPageMatches = (pattern: RegExp) => pages.some(p => pattern.test(p.content.bodyText));
  const getPathname = (url: string) => { try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); } };

  // ===== EXPERIENCE (0-25) =====
  let experience = 0;

  // First-person experience content (8pts)
  const expPatterns = /\b(?:our experience|we've worked|I've been|we implemented|we tested|we found|in my experience|from our work)\b/i;
  const hasFirstPerson = anyPageMatches(expPatterns);
  signals.push({ dimension: 'experience', signal: 'First-person experience content', found: hasFirstPerson, contribution: hasFirstPerson ? 8 : 0 });
  if (hasFirstPerson) experience += 8;

  // Case study pages (7pts)
  const caseStudyPages = pages.filter(p =>
    /case.?stud/i.test(p.url) ||
    p.content.headings.some(h => /case.?stud/i.test(h.text)) ||
    /\bcase\s+stud(?:y|ies)\b/i.test(p.content.bodyText.slice(0, 500))
  );
  const hasCaseStudies = caseStudyPages.length > 0;
  signals.push({ dimension: 'experience', signal: 'Case study pages', found: hasCaseStudies, contribution: hasCaseStudies ? 7 : 0 });
  if (hasCaseStudies) experience += 7;

  // Original research indicators (5pts)
  const researchPattern = /\b(?:our research|we surveyed|our findings|our data shows?|we measured|we analyzed|our analysis)\b/i;
  const hasResearch = anyPageMatches(researchPattern);
  signals.push({ dimension: 'experience', signal: 'Original research indicators', found: hasResearch, contribution: hasResearch ? 5 : 0 });
  if (hasResearch) experience += 5;

  // Testimonials/reviews section (5pts)
  const hasTestimonials = pages.some(p =>
    /testimon|reviews?|feedback/i.test(p.url) ||
    p.content.headings.some(h => /testimon|reviews?|feedback|what.*(clients?|customers?).*(say|think)/i.test(h.text))
  );
  signals.push({ dimension: 'experience', signal: 'Testimonials/reviews section', found: hasTestimonials, contribution: hasTestimonials ? 5 : 0 });
  if (hasTestimonials) experience += 5;

  // ===== EXPERTISE (0-25) =====
  let expertise = 0;

  // Author attribution on content pages (8pts)
  const pagesWithAuthor = pages.filter(p => p.meta.author && p.meta.author.trim().length > 0);
  const hasAuthors = pagesWithAuthor.length > 0;
  const authorCoverage = pages.length > 0 ? pagesWithAuthor.length / pages.length : 0;
  const authorPts = hasAuthors ? Math.min(8, Math.round(authorCoverage * 8)) : 0;
  signals.push({ dimension: 'expertise', signal: 'Author attribution', found: hasAuthors, contribution: authorPts });
  expertise += authorPts;

  // Author bios present (5pts)
  const hasAuthorBios = pages.some(p => p.meta.authorBio && p.meta.authorBio.trim().length > 20);
  signals.push({ dimension: 'expertise', signal: 'Author bios present', found: hasAuthorBios, contribution: hasAuthorBios ? 5 : 0 });
  if (hasAuthorBios) expertise += 5;

  // Technical depth — average word count > 800 on content pages (4pts)
  const contentPages = pages.filter(p => p.content.wordCount > 100);
  const avgWordCount = contentPages.length > 0
    ? contentPages.reduce((s, p) => s + p.content.wordCount, 0) / contentPages.length
    : 0;
  const hasTechDepth = avgWordCount > 800;
  signals.push({ dimension: 'expertise', signal: 'Technical depth (avg >800 words)', found: hasTechDepth, contribution: hasTechDepth ? 4 : 0 });
  if (hasTechDepth) expertise += 4;

  // Methodology/process pages (4pts)
  const hasMethodology = pages.some(p =>
    /(?:methodology|process|how.?we.?work|our.?approach|our.?method)/i.test(getPathname(p.url)) ||
    p.content.headings.some(h => /(?:methodology|our process|how we work|our approach)/i.test(h.text))
  );
  signals.push({ dimension: 'expertise', signal: 'Methodology/process pages', found: hasMethodology, contribution: hasMethodology ? 4 : 0 });
  if (hasMethodology) expertise += 4;

  // Credentials patterns (4pts)
  const credPattern = /\b(?:certified|licensed|accredited|PhD|Ph\.D|master'?s|degree|years? of experience|\d+\+?\s*years?)\b/i;
  const hasCredentials = anyPageMatches(credPattern);
  signals.push({ dimension: 'expertise', signal: 'Credentials/qualifications mentioned', found: hasCredentials, contribution: hasCredentials ? 4 : 0 });
  if (hasCredentials) expertise += 4;

  // ===== AUTHORITATIVENESS (0-25) =====
  let authoritativeness = 0;

  // Social media presence (6pts)
  const socialCount = siteIdentity.socialLinks.length;
  const hasSocial = socialCount >= 2;
  const socialPts = Math.min(6, socialCount * 2);
  signals.push({ dimension: 'authoritativeness', signal: `Social media presence (${socialCount} platforms)`, found: hasSocial, contribution: socialPts });
  authoritativeness += socialPts;

  // External citations in content (6pts)
  const totalCitations = pages.reduce((s, p) => s + p.content.citations.sources.length + p.content.citations.quotes.length, 0);
  const hasCitations = totalCitations >= 3;
  const citationPts = Math.min(6, Math.round(totalCitations / 2));
  signals.push({ dimension: 'authoritativeness', signal: `External citations (${totalCitations} found)`, found: hasCitations, contribution: citationPts });
  authoritativeness += citationPts;

  // Awards/recognition patterns (5pts)
  const awardPattern = /\b(?:award|recognized|featured in|as seen in|winner|nominated|top \d+|best (?:of|in))\b/i;
  const hasAwards = anyPageMatches(awardPattern);
  signals.push({ dimension: 'authoritativeness', signal: 'Awards/recognition mentioned', found: hasAwards, contribution: hasAwards ? 5 : 0 });
  if (hasAwards) authoritativeness += 5;

  // Media/press page (4pts)
  const hasPress = pages.some(p =>
    /(?:press|media|news|in.?the.?news|coverage)/i.test(getPathname(p.url)) ||
    p.content.headings.some(h => /(?:press|media|in the news|coverage|featured)/i.test(h.text))
  );
  signals.push({ dimension: 'authoritativeness', signal: 'Press/media page', found: hasPress, contribution: hasPress ? 4 : 0 });
  if (hasPress) authoritativeness += 4;

  // Brand mentions on external platforms (4pts, requires brand scan)
  if (brandResult) {
    const hasExtBrand = brandResult.overallScore >= 30;
    const brandPts = Math.min(4, Math.round(brandResult.overallScore / 25));
    signals.push({ dimension: 'authoritativeness', signal: `External brand presence (${brandResult.overallScore}/100)`, found: hasExtBrand, contribution: brandPts });
    authoritativeness += brandPts;
  }

  // ===== TRUSTWORTHINESS (0-25) =====
  let trustworthiness = 0;

  // Contact information (7pts)
  const hasEmail = !!siteIdentity.contactEmail;
  const hasPhone = !!siteIdentity.contactPhone;
  const hasAddress = !!siteIdentity.address;
  const contactPts = (hasEmail ? 3 : 0) + (hasPhone ? 2 : 0) + (hasAddress ? 2 : 0);
  signals.push({ dimension: 'trustworthiness', signal: 'Contact information', found: contactPts > 0, contribution: contactPts });
  trustworthiness += contactPts;

  // Privacy policy page (4pts)
  const hasPrivacy = pages.some(p => /(?:privacy|privat)/i.test(getPathname(p.url)));
  signals.push({ dimension: 'trustworthiness', signal: 'Privacy policy page', found: hasPrivacy, contribution: hasPrivacy ? 4 : 0 });
  if (hasPrivacy) trustworthiness += 4;

  // Terms page (3pts)
  const hasTerms = pages.some(p => /(?:terms|conditions|tos|legal)/i.test(getPathname(p.url)));
  signals.push({ dimension: 'trustworthiness', signal: 'Terms & conditions page', found: hasTerms, contribution: hasTerms ? 3 : 0 });
  if (hasTerms) trustworthiness += 3;

  // About page (4pts)
  const hasAbout = pages.some(p => /(?:about|apie|about.?us)/i.test(getPathname(p.url)));
  signals.push({ dimension: 'trustworthiness', signal: 'About page', found: hasAbout, contribution: hasAbout ? 4 : 0 });
  if (hasAbout) trustworthiness += 4;

  // HTTPS enforcement (3pts)
  const allHttps = pages.every(p => p.url.startsWith('https://'));
  signals.push({ dimension: 'trustworthiness', signal: 'HTTPS enforcement', found: allHttps, contribution: allHttps ? 3 : 0 });
  if (allHttps) trustworthiness += 3;

  // Organization schema completeness (4pts)
  const orgSchemas = pages.flatMap(p =>
    p.existingStructuredData.jsonLd.filter((s: Record<string, unknown>) =>
      s['@type'] === 'Organization' || s['@type'] === 'LocalBusiness'
    )
  );
  const hasOrgSchema = orgSchemas.length > 0;
  const orgComplete = hasOrgSchema && orgSchemas.some((s: Record<string, unknown>) =>
    s.name && s.url && (s.logo || s.image)
  );
  const orgPts = orgComplete ? 4 : hasOrgSchema ? 2 : 0;
  signals.push({ dimension: 'trustworthiness', signal: 'Organization schema completeness', found: hasOrgSchema, contribution: orgPts });
  trustworthiness += orgPts;

  // Cap each dimension at 25
  experience = Math.min(25, experience);
  expertise = Math.min(25, expertise);
  authoritativeness = Math.min(25, authoritativeness);
  trustworthiness = Math.min(25, trustworthiness);

  return {
    total: experience + expertise + authoritativeness + trustworthiness,
    experience,
    expertise,
    authoritativeness,
    trustworthiness,
    signals,
  };
}
