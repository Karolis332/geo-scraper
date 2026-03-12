/**
 * Citability Scorer — passage-level analysis of how likely AI engines will cite content.
 *
 * Research-backed scoring: optimal AI-cited passages are 134-167 words,
 * self-contained, fact-rich, and answer questions in the first 1-2 sentences.
 *
 * Scores 5 dimensions:
 *   Answer Block Quality (30%), Self-Containment (25%),
 *   Structural Readability (20%), Statistical Density (15%),
 *   Uniqueness Signals (10%).
 */

import type { PageData, PageContent, HeadingNode } from '../crawler/page-data.js';

export interface PassageScore {
  text: string;
  wordCount: number;
  overall: number;           // 0-100
  dimensions: {
    answerBlockQuality: number;
    selfContainment: number;
    structuralReadability: number;
    statisticalDensity: number;
    uniquenessSignals: number;
  };
  suggestion: string | null;
}

export interface CitabilityScore {
  pageUrl: string;
  overallScore: number;          // 0-100
  passageCount: number;
  highCitabilityCount: number;   // passages scoring >= 70
  citabilityCoverage: number;    // ratio of high-citability passages
  dimensions: {
    answerBlockQuality: number;
    selfContainment: number;
    structuralReadability: number;
    statisticalDensity: number;
    uniquenessSignals: number;
  };
  topPassages: PassageScore[];
  weakPassages: PassageScore[];
}

export interface SiteCitabilityResult {
  siteScore: number;
  pageScores: CitabilityScore[];
  totalPassages: number;
  totalHighCitability: number;
}

// ===== Dimension weights =====
const WEIGHTS = {
  answerBlockQuality: 0.30,
  selfContainment: 0.25,
  structuralReadability: 0.20,
  statisticalDensity: 0.15,
  uniquenessSignals: 0.10,
};

// ===== Dependent clause starters (passage depends on prior context) =====
const DEPENDENT_STARTERS = /^\s*(however|but|also|additionally|furthermore|moreover|nevertheless|consequently|therefore|thus|hence|meanwhile|still|yet|besides|likewise|similarly|in addition|as a result|on the other hand|in contrast|for this reason)\b/i;

// ===== Assertive / definitive patterns =====
const DEFINITIVE_PATTERNS = [
  /\b(?:is|are|was|were)\s+(?:a|an|the|one of)\b/i,       // "X is a ..."
  /\b(?:provides?|offers?|delivers?|enables?|ensures?)\b/i, // assertive verbs
  /\b(?:refers? to|means?|defined? as|known as)\b/i,        // definition patterns
  /\b(?:according to|research shows?|studies? (?:show|indicate|suggest))\b/i, // authority
];

// ===== Question-answer patterns =====
const QA_PATTERNS = [
  /^(?:what|how|why|when|where|who|which|can|does|do|is|are|should)\b/i,
];

// ===== Statistical patterns =====
const STAT_PATTERNS = [
  /\d+(?:\.\d+)?%/,                           // percentages
  /\$[\d,]+(?:\.\d{2})?/,                     // dollar amounts
  /€[\d,]+(?:\.\d{2})?/,                      // euro amounts
  /\b\d{4}\b/,                                 // years
  /\b\d+(?:\.\d+)?x\b/i,                      // multipliers (2x, 3.5x)
  /\b\d+(?:,\d{3})+\b/,                       // large numbers
  /\b(?:increased|decreased|grew|dropped|rose|fell)\s+(?:by\s+)?\d/i, // change indicators
];

// ===== Uniqueness / first-party signals =====
const UNIQUENESS_PATTERNS = [
  /\b(?:our|we)\s+(?:research|data|findings|analysis|study|survey|team|experience)\b/i,
  /\b(?:we\s+(?:found|discovered|tested|measured|observed|implemented|built|developed))\b/i,
  /\b(?:proprietary|exclusive|original|first-party|in-house)\b/i,
  /\bcase\s+stud(?:y|ies)\b/i,
  /\bclient\s+results?\b/i,
  /\b(?:I've|we've|I\s+have|we\s+have)\s+(?:been|worked|spent|tested)\b/i,
];

/**
 * Split body text into passages (double-newline separated paragraphs).
 */
function extractPassages(bodyText: string): string[] {
  return bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => {
      const words = p.split(/\s+/).length;
      return words >= 15 && words <= 300; // filter out very short/long blocks
    });
}

/**
 * Score Answer Block Quality (0-100).
 * Measures: definitive statements, question-answer patterns, quotable sentences.
 */
function scoreAnswerBlockQuality(text: string, headings: HeadingNode[], url: string): number {
  let score = 0;

  // Definitive statement patterns (up to 40pts)
  const definitiveCount = DEFINITIVE_PATTERNS.filter(p => p.test(text)).length;
  score += Math.min(40, definitiveCount * 15);

  // First sentence is assertive / answers a question (30pts)
  const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0] ?? '';
  const words = firstSentence.split(/\s+/).length;
  if (words >= 5 && words <= 30) {
    // Short, direct first sentence
    score += 15;
    if (DEFINITIVE_PATTERNS.some(p => p.test(firstSentence))) {
      score += 15; // Assertive first sentence
    }
  }

  // Preceding heading is a question (20pts) — check headings for nearby Q patterns
  const hasQuestionHeading = headings.some(h => /\?$/.test(h.text.trim()));
  if (hasQuestionHeading) score += 20;

  // Contains a direct answer pattern within first 60 words (10pts)
  const first60 = text.split(/\s+/).slice(0, 60).join(' ');
  if (DEFINITIVE_PATTERNS.some(p => p.test(first60))) score += 10;

  return Math.min(100, score);
}

/**
 * Score Self-Containment (0-100).
 * Measures: no dependent starters, no unresolved pronouns, complete sentences.
 */
function scoreSelfContainment(text: string): number {
  let score = 100;

  // Starts with dependent conjunction (-30)
  if (DEPENDENT_STARTERS.test(text)) score -= 30;

  // Starts with a pronoun referring to prior context (-15)
  if (/^\s*(?:it|this|that|these|those|they|he|she)\s/i.test(text)) score -= 15;

  // Very short — likely needs context (-15)
  const words = text.split(/\s+/).length;
  if (words < 25) score -= 15;

  // No complete sentence (no period/exclamation/question mark) (-20)
  if (!/[.!?]/.test(text)) score -= 20;

  // Ends mid-sentence (no terminal punctuation) (-10)
  if (!/[.!?:]\s*$/.test(text.trim())) score -= 10;

  // Bonus: has a colon or semicolon (structured explanation) (+10)
  if (/[:;]/.test(text)) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score Structural Readability (0-100).
 * Measures: lists, tables, formatting that aids extraction.
 */
function scoreStructuralReadability(text: string, content: PageContent): number {
  let score = 30; // baseline

  // Contains a list (bullet/number markers) (+25)
  if (/(?:^|\n)\s*(?:[-•*]|\d+[.)]) /m.test(text)) score += 25;

  // Page has tables (+20)
  if (content.tables.length > 0) score += 20;

  // Contains bold/strong markers (often preserved in extracted text) (+10)
  if (/\*\*[^*]+\*\*/.test(text)) score += 10;

  // Moderate length (optimal 134-167 words) (+15)
  const words = text.split(/\s+/).length;
  if (words >= 100 && words <= 200) score += 15;
  else if (words >= 50 && words <= 250) score += 8;

  // Multiple sentences (structured explanation) (+10)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
  if (sentences >= 2 && sentences <= 5) score += 10;

  return Math.min(100, score);
}

/**
 * Score Statistical Density (0-100).
 * Measures: numbers, percentages, dollar amounts, data points.
 */
function scoreStatisticalDensity(text: string, citations: { statistics: string[] }): number {
  let score = 0;

  // Count stat pattern matches (up to 60pts)
  const matchCount = STAT_PATTERNS.filter(p => p.test(text)).length;
  score += Math.min(60, matchCount * 15);

  // Has citations.statistics from page-level extraction (+20)
  if (citations.statistics.length > 0) score += 20;

  // Contains comparison words with numbers (+20)
  if (/\b(?:more|less|higher|lower|faster|slower|better|worse|compared|versus|vs)\b.*\d/i.test(text)) {
    score += 20;
  }

  return Math.min(100, score);
}

/**
 * Score Uniqueness Signals (0-100).
 * Measures: first-party data, proprietary insights, experience markers.
 */
function scoreUniquenessSignals(text: string): number {
  let score = 0;

  const matchCount = UNIQUENESS_PATTERNS.filter(p => p.test(text)).length;
  score += Math.min(70, matchCount * 20);

  // Contains quoted material (shows sourcing) (+15)
  if (/[""][^""]+[""]/.test(text) || /"[^"]+"/g.test(text)) score += 15;

  // Contains specific brand/product names (capitalized proper nouns) (+15)
  const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [];
  if (properNouns.length >= 2) score += 15;

  return Math.min(100, score);
}

/**
 * Generate improvement suggestion for a passage.
 */
function generateSuggestion(passage: PassageScore): string | null {
  if (passage.overall >= 70) return null;

  const suggestions: string[] = [];
  const d = passage.dimensions;

  if (d.answerBlockQuality < 50) {
    suggestions.push('Start with a direct, definitive statement that answers a question');
  }
  if (d.selfContainment < 50) {
    suggestions.push('Make this passage self-contained — avoid starting with "however", "but", or pronouns referring to prior text');
  }
  if (d.structuralReadability < 50) {
    suggestions.push('Add structure — use a list, table, or keep to 100-200 words');
  }
  if (d.statisticalDensity < 30) {
    suggestions.push('Add specific data: percentages, costs, timeframes, or comparisons');
  }
  if (d.uniquenessSignals < 30) {
    suggestions.push('Include first-party data, case study results, or original research');
  }

  // Word count optimization
  if (passage.wordCount < 100) {
    suggestions.push(`Expand to 134-167 words (currently ${passage.wordCount})`);
  } else if (passage.wordCount > 200) {
    suggestions.push(`Split into focused passages of 134-167 words (currently ${passage.wordCount})`);
  }

  return suggestions.length > 0 ? suggestions.join('. ') + '.' : null;
}

/**
 * Score a single page's citability.
 */
export function scorePageCitability(page: PageData): CitabilityScore {
  const passages = extractPassages(page.content.bodyText);

  if (passages.length === 0) {
    return {
      pageUrl: page.url,
      overallScore: 0,
      passageCount: 0,
      highCitabilityCount: 0,
      citabilityCoverage: 0,
      dimensions: {
        answerBlockQuality: 0,
        selfContainment: 0,
        structuralReadability: 0,
        statisticalDensity: 0,
        uniquenessSignals: 0,
      },
      topPassages: [],
      weakPassages: [],
    };
  }

  const scored: PassageScore[] = passages.map(text => {
    const dims = {
      answerBlockQuality: scoreAnswerBlockQuality(text, page.content.headings, page.url),
      selfContainment: scoreSelfContainment(text),
      structuralReadability: scoreStructuralReadability(text, page.content),
      statisticalDensity: scoreStatisticalDensity(text, page.content.citations),
      uniquenessSignals: scoreUniquenessSignals(text),
    };

    const overall = Math.round(
      dims.answerBlockQuality * WEIGHTS.answerBlockQuality +
      dims.selfContainment * WEIGHTS.selfContainment +
      dims.structuralReadability * WEIGHTS.structuralReadability +
      dims.statisticalDensity * WEIGHTS.statisticalDensity +
      dims.uniquenessSignals * WEIGHTS.uniquenessSignals
    );

    const ps: PassageScore = {
      text: text.slice(0, 300), // truncate for storage
      wordCount: text.split(/\s+/).length,
      overall,
      dimensions: dims,
      suggestion: null,
    };
    ps.suggestion = generateSuggestion(ps);
    return ps;
  });

  const highCitability = scored.filter(s => s.overall >= 70);

  // Aggregate dimension averages
  const dimAvg = {
    answerBlockQuality: Math.round(scored.reduce((s, p) => s + p.dimensions.answerBlockQuality, 0) / scored.length),
    selfContainment: Math.round(scored.reduce((s, p) => s + p.dimensions.selfContainment, 0) / scored.length),
    structuralReadability: Math.round(scored.reduce((s, p) => s + p.dimensions.structuralReadability, 0) / scored.length),
    statisticalDensity: Math.round(scored.reduce((s, p) => s + p.dimensions.statisticalDensity, 0) / scored.length),
    uniquenessSignals: Math.round(scored.reduce((s, p) => s + p.dimensions.uniquenessSignals, 0) / scored.length),
  };

  const overallScore = Math.round(scored.reduce((s, p) => s + p.overall, 0) / scored.length);

  // Top 5 and bottom 5 passages
  const sorted = [...scored].sort((a, b) => b.overall - a.overall);
  const topPassages = sorted.slice(0, 5);
  const weakPassages = sorted.filter(p => p.overall < 50).slice(-5).reverse();

  return {
    pageUrl: page.url,
    overallScore,
    passageCount: scored.length,
    highCitabilityCount: highCitability.length,
    citabilityCoverage: scored.length > 0 ? highCitability.length / scored.length : 0,
    dimensions: dimAvg,
    topPassages,
    weakPassages,
  };
}

/**
 * Score citability across all pages in a site.
 */
export function scoreSiteCitability(pages: PageData[]): SiteCitabilityResult {
  const contentPages = pages.filter(p => p.content.wordCount > 100);

  if (contentPages.length === 0) {
    return { siteScore: 0, pageScores: [], totalPassages: 0, totalHighCitability: 0 };
  }

  const pageScores = contentPages.map(p => scorePageCitability(p));
  const totalPassages = pageScores.reduce((s, p) => s + p.passageCount, 0);
  const totalHighCitability = pageScores.reduce((s, p) => s + p.highCitabilityCount, 0);

  // Site score = weighted average (pages with more passages count more)
  const weightedSum = pageScores.reduce((s, p) => s + p.overallScore * p.passageCount, 0);
  const siteScore = totalPassages > 0 ? Math.round(weightedSum / totalPassages) : 0;

  return { siteScore, pageScores, totalPassages, totalHighCitability };
}
