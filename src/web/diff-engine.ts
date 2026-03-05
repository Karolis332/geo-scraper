/**
 * Scan comparison engine — generates diffs between two audit results.
 */

import type { AuditResult, AuditItem } from '../analyzer/geo-auditor.js';

export interface DiffItem {
  name: string;
  category: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
  beforeStatus: string;
  afterStatus: string;
  details: string;
}

export interface ScanDiff {
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  beforeGrade: string;
  afterGrade: string;
  pageCountChange: { before: number; after: number; delta: number };
  categorySummary: Array<{
    category: string;
    beforePassed: number;
    afterPassed: number;
    total: number;
  }>;
  improved: DiffItem[];
  regressed: DiffItem[];
  resolved: DiffItem[];
  newIssues: DiffItem[];
  unchanged: DiffItem[];
}

interface StoredResult {
  type: string;
  score: number;
  grade: string;
  pagesScanned: number;
  auditItems: AuditItem[];
  summary: Record<string, { passed: number; total: number }>;
}

export function generateScanDiff(beforeResult: StoredResult, afterResult: StoredResult): ScanDiff {
  const beforeItems = beforeResult.auditItems;
  const afterItems = afterResult.auditItems;

  // Build lookup by name
  const beforeMap = new Map<string, AuditItem>();
  for (const item of beforeItems) {
    beforeMap.set(item.name, item);
  }

  const afterMap = new Map<string, AuditItem>();
  for (const item of afterItems) {
    afterMap.set(item.name, item);
  }

  const improved: DiffItem[] = [];
  const regressed: DiffItem[] = [];
  const resolved: DiffItem[] = [];
  const newIssues: DiffItem[] = [];
  const unchanged: DiffItem[] = [];

  // Compare all items that exist in either scan
  const allNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const name of allNames) {
    const before = beforeMap.get(name);
    const after = afterMap.get(name);

    if (!before && after) {
      // New item in after scan
      if (after.status !== 'pass') {
        newIssues.push(makeDiffItem(name, null, after));
      } else {
        unchanged.push(makeDiffItem(name, null, after));
      }
      continue;
    }

    if (before && !after) {
      // Item removed in after scan — treat as unchanged
      unchanged.push(makeDiffItem(name, before, null));
      continue;
    }

    if (before && after) {
      const delta = after.score - before.score;

      if (before.status !== 'pass' && after.status === 'pass') {
        resolved.push(makeDiffItem(name, before, after));
      } else if (before.status === 'pass' && after.status !== 'pass') {
        newIssues.push(makeDiffItem(name, before, after));
      } else if (delta > 0) {
        improved.push(makeDiffItem(name, before, after));
      } else if (delta < 0) {
        regressed.push(makeDiffItem(name, before, after));
      } else {
        unchanged.push(makeDiffItem(name, before, after));
      }
    }
  }

  // Sort each by absolute delta descending
  improved.sort((a, b) => b.delta - a.delta);
  regressed.sort((a, b) => a.delta - b.delta);

  // Category summary — support both old and new category names for backward compat
  const OLD_TO_NEW: Record<string, string> = {
    critical: 'ai_infrastructure',
    high: 'content_quality',
    medium: 'ai_discoverability',
    low: 'non_scored',
    seo: 'foundational_seo',
    eeat: 'ai_discoverability',
    aeo: 'content_quality',
  };
  const categories = ['ai_infrastructure', 'content_quality', 'ai_discoverability', 'foundational_seo', 'non_scored'];
  const categorySummary = categories.map(cat => {
    // Try new category name first, fall back to looking up old names
    const bSummary = beforeResult.summary[cat];
    const aSummary = afterResult.summary[cat];
    return {
      category: cat,
      beforePassed: bSummary?.passed ?? 0,
      afterPassed: aSummary?.passed ?? 0,
      total: aSummary?.total ?? bSummary?.total ?? 0,
    };
  });

  return {
    beforeScore: beforeResult.score,
    afterScore: afterResult.score,
    scoreDelta: afterResult.score - beforeResult.score,
    beforeGrade: beforeResult.grade,
    afterGrade: afterResult.grade,
    pageCountChange: {
      before: beforeResult.pagesScanned,
      after: afterResult.pagesScanned,
      delta: afterResult.pagesScanned - beforeResult.pagesScanned,
    },
    categorySummary,
    improved,
    regressed,
    resolved,
    newIssues,
    unchanged,
  };
}

function makeDiffItem(name: string, before: AuditItem | null, after: AuditItem | null): DiffItem {
  const beforeScore = before?.score ?? 0;
  const afterScore = after?.score ?? 0;

  return {
    name,
    category: after?.category ?? before?.category ?? 'unknown',
    beforeScore,
    afterScore,
    delta: afterScore - beforeScore,
    beforeStatus: before?.status ?? 'n/a',
    afterStatus: after?.status ?? 'n/a',
    details: after?.details ?? before?.details ?? '',
  };
}
