/**
 * AI Content Detection — analyzes text for patterns typical of AI-generated content.
 *
 * Signals checked:
 * - Overuse of transitional/filler phrases ("Furthermore", "Additionally", "It's worth noting")
 * - Formulaic sentence starters ("In today's", "When it comes to", "It is important")
 * - Generic hedging language ("generally", "typically", "in many cases")
 * - Uniform paragraph lengths (AI tends to write paragraphs of similar size)
 * - Low lexical diversity (type-token ratio)
 * - Lack of first-person / personal voice
 */

import type { PageData } from '../crawler/page-data.js';

export interface PageAIContentResult {
  url: string;
  aiScore: number;         // 0-100 (higher = more likely AI-generated)
  signals: string[];
  wordCount: number;
}

export interface SiteAIContentResult {
  pages: PageAIContentResult[];
  averageScore: number;
  pagesLikelyAI: number;   // score >= 60
  pagesLikelyHuman: number; // score < 30
  overallAssessment: string;
}

const AI_TRANSITION_PHRASES = [
  'furthermore', 'additionally', 'moreover', 'in addition',
  'it\'s worth noting', 'it is worth noting', 'it\'s important to note',
  'it is important to note', 'it should be noted',
  'in conclusion', 'to summarize', 'in summary',
  'as mentioned earlier', 'as previously mentioned',
  'that being said', 'with that in mind', 'having said that',
  'on the other hand', 'by the same token',
  'needless to say', 'it goes without saying',
  'at the end of the day', 'when all is said and done',
  'in the realm of', 'in the world of',
  'plays a crucial role', 'plays a vital role', 'plays an important role',
  'stands as a testament', 'serves as a reminder',
];

const AI_SENTENCE_STARTERS = [
  'in today\'s', 'when it comes to', 'it is important to',
  'it\'s important to', 'whether you\'re', 'if you\'re looking',
  'one of the most', 'there are many', 'there are several',
  'in this article', 'in this guide', 'in this post',
  'let\'s dive', 'let\'s explore', 'let\'s take a look',
  'here are some', 'here\'s what you need', 'here\'s everything',
  'are you looking for', 'have you ever wondered',
  'the importance of', 'the benefits of', 'the advantages of',
  'this comprehensive', 'this ultimate', 'this definitive',
];

const HEDGING_PHRASES = [
  'generally speaking', 'in many cases', 'in most cases',
  'it depends on', 'can vary depending', 'may vary',
  'typically', 'essentially', 'basically', 'arguably',
  'it\'s no secret that', 'it comes as no surprise',
  'not surprisingly', 'unsurprisingly',
  'a wide range of', 'a variety of', 'numerous',
  'various aspects', 'key considerations',
  'robust', 'leverage', 'utilize', 'facilitate',
  'cutting-edge', 'state-of-the-art', 'best-in-class',
  'seamless', 'seamlessly', 'holistic', 'synergy',
];

function countPhraseMatches(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const phrase of phrases) {
    let idx = 0;
    while ((idx = lower.indexOf(phrase, idx)) !== -1) {
      count++;
      idx += phrase.length;
    }
  }
  return count;
}

function calculateLexicalDiversity(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g);
  if (!words || words.length < 50) return 1; // too short to measure
  const uniqueWords = new Set(words);
  return uniqueWords.size / words.length; // type-token ratio
}

function calculateParagraphUniformity(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  if (paragraphs.length < 3) return 0;

  const lengths = paragraphs.map(p => p.trim().split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (avg === 0) return 0;

  // Coefficient of variation — lower = more uniform = more AI-like
  const variance = lengths.reduce((s, l) => s + Math.pow(l - avg, 2), 0) / lengths.length;
  const cv = Math.sqrt(variance) / avg;

  // CV < 0.3 is very uniform (suspicious), CV > 0.7 is varied (human-like)
  if (cv < 0.2) return 100;
  if (cv < 0.3) return 70;
  if (cv < 0.5) return 30;
  return 0;
}

function hasPersonalVoice(text: string): boolean {
  const lower = text.toLowerCase();
  const personalMarkers = [
    /\bi ('|a)m\b/, /\bmy\b/, /\bwe ('|a)re\b/, /\bour\b/,
    /\bi think\b/, /\bi believe\b/, /\bin my experience\b/,
    /\bi've\b/, /\bwe've\b/, /\bi found\b/,
  ];
  return personalMarkers.some(r => r.test(lower));
}

export function detectPageAIContent(page: PageData): PageAIContentResult {
  const text = page.content.bodyText;
  const wordCount = page.content.wordCount;

  if (wordCount < 100) {
    return { url: page.url, aiScore: 0, signals: ['Too short to analyze'], wordCount };
  }

  const signals: string[] = [];
  let totalScore = 0;

  // 1. AI transition phrases (0-25 points)
  const transitionCount = countPhraseMatches(text, AI_TRANSITION_PHRASES);
  const transitionDensity = (transitionCount / wordCount) * 1000; // per 1000 words
  if (transitionDensity > 8) {
    totalScore += 25;
    signals.push(`High AI transition phrase density (${transitionDensity.toFixed(1)}/1000 words)`);
  } else if (transitionDensity > 4) {
    totalScore += 12;
    signals.push(`Moderate AI transition phrases (${transitionDensity.toFixed(1)}/1000 words)`);
  }

  // 2. Formulaic sentence starters (0-20 points)
  const starterCount = countPhraseMatches(text, AI_SENTENCE_STARTERS);
  const starterDensity = (starterCount / wordCount) * 1000;
  if (starterDensity > 5) {
    totalScore += 20;
    signals.push(`Formulaic sentence starters detected (${starterCount})`);
  } else if (starterDensity > 2) {
    totalScore += 10;
    signals.push(`Some formulaic openings (${starterCount})`);
  }

  // 3. Hedging/corporate phrases (0-20 points)
  const hedgeCount = countPhraseMatches(text, HEDGING_PHRASES);
  const hedgeDensity = (hedgeCount / wordCount) * 1000;
  if (hedgeDensity > 6) {
    totalScore += 20;
    signals.push(`Heavy hedging/buzzword usage (${hedgeCount})`);
  } else if (hedgeDensity > 3) {
    totalScore += 10;
    signals.push(`Moderate hedging language (${hedgeCount})`);
  }

  // 4. Paragraph uniformity (0-15 points)
  const uniformity = calculateParagraphUniformity(text);
  if (uniformity >= 70) {
    totalScore += 15;
    signals.push('Suspiciously uniform paragraph lengths');
  } else if (uniformity >= 30) {
    totalScore += 7;
    signals.push('Somewhat uniform paragraph structure');
  }

  // 5. Lexical diversity (0-10 points)
  const diversity = calculateLexicalDiversity(text);
  if (diversity < 0.35) {
    totalScore += 10;
    signals.push(`Low lexical diversity (${(diversity * 100).toFixed(0)}%)`);
  } else if (diversity < 0.45) {
    totalScore += 5;
    signals.push(`Below-average lexical diversity (${(diversity * 100).toFixed(0)}%)`);
  }

  // 6. Lack of personal voice (0-10 points)
  if (!hasPersonalVoice(text) && wordCount > 300) {
    totalScore += 10;
    signals.push('No first-person or personal voice detected');
  }

  const aiScore = Math.min(100, totalScore);

  return { url: page.url, aiScore, signals, wordCount };
}

export function detectSiteAIContent(pages: PageData[]): SiteAIContentResult {
  const contentPages = pages.filter(p => p.content.wordCount >= 100);

  if (contentPages.length === 0) {
    return {
      pages: [],
      averageScore: 0,
      pagesLikelyAI: 0,
      pagesLikelyHuman: 0,
      overallAssessment: 'No content pages to analyze',
    };
  }

  const results = contentPages.map(p => detectPageAIContent(p));
  const avgScore = Math.round(results.reduce((s, r) => s + r.aiScore, 0) / results.length);
  const likelyAI = results.filter(r => r.aiScore >= 60).length;
  const likelyHuman = results.filter(r => r.aiScore < 30).length;

  let assessment: string;
  if (avgScore >= 60) {
    assessment = 'Content shows strong AI-generation patterns. AI search engines may deprioritize it.';
  } else if (avgScore >= 40) {
    assessment = 'Some content shows AI-like patterns. Review flagged pages for originality.';
  } else {
    assessment = 'Content appears largely human-written. Good for E-E-A-T signals.';
  }

  return {
    pages: results.sort((a, b) => b.aiScore - a.aiScore),
    averageScore: avgScore,
    pagesLikelyAI: likelyAI,
    pagesLikelyHuman: likelyHuman,
    overallAssessment: assessment,
  };
}
