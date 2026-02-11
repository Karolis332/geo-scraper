/**
 * Visibility scorer — calculates per-engine and overall scores.
 */

import type { LLMResponse, EngineVisibility } from '../crawler/page-data.js';

export function scoreEngines(responses: LLMResponse[]): EngineVisibility[] {
  const byEngine = new Map<string, LLMResponse[]>();

  for (const r of responses) {
    const list = byEngine.get(r.engine) || [];
    list.push(r);
    byEngine.set(r.engine, list);
  }

  const scores: EngineVisibility[] = [];

  for (const [engine, engineResponses] of byEngine) {
    const queriesRun = engineResponses.filter((r) => !r.error).length;
    let cited = 0;
    let mentioned = 0;
    let absent = 0;

    for (const r of engineResponses) {
      if (r.error) continue;
      if (r.mentionType === 'cited') cited++;
      else if (r.mentionType === 'mentioned') mentioned++;
      else absent++;
    }

    const score = queriesRun > 0
      ? Math.round(((cited * 100) + (mentioned * 50)) / queriesRun)
      : 0;

    scores.push({ engine, queriesRun, cited, mentioned, absent, score });
  }

  return scores;
}

export function calculateOverallScore(engineScores: EngineVisibility[]): number {
  if (engineScores.length === 0) return 0;
  const total = engineScores.reduce((sum, e) => sum + e.score, 0);
  return Math.round(total / engineScores.length);
}

export function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
