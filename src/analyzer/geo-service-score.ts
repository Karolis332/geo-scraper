/**
 * GEO service score — focuses on deliverables directly tied to GEO deployment
 * (AI crawler files, policies, indexing/discoverability signals).
 */

export interface GeoServiceAuditItem {
  name: string;
  score: number;
  maxScore: number;
  status: string;
}

const GEO_SERVICE_WEIGHTS: Record<string, number> = {
  'robots.txt': 2,
  'AI Bot Blocking': 2,
  'sitemap.xml': 2,
  'llms.txt': 2,
  'llms-full.txt': 1.5,
  'AI Policy (ai.txt / ai.json)': 1.5,
  'AI Content Directives': 1,
  'Training vs Retrieval Bot Strategy': 1.5,
  'Search Engine Indexing': 2,
  'Structured Data (JSON-LD)': 1.5,
  'security.txt': 0.5,
  'tdmrep.json': 0.5,
  'agent-card.json': 0.5,
  'agents.json': 0.5,
};

export function calculateGeoServiceScore(items: GeoServiceAuditItem[]): number {
  let totalWeightedScore = 0;
  let totalWeightedMax = 0;

  for (const item of items) {
    const weight = GEO_SERVICE_WEIGHTS[item.name];
    if (weight === undefined) continue;
    if (item.status === 'not_applicable') continue;
    totalWeightedScore += item.score * weight;
    totalWeightedMax += item.maxScore * weight;
  }

  return totalWeightedMax > 0
    ? Math.round((totalWeightedScore / totalWeightedMax) * 100)
    : 0;
}

