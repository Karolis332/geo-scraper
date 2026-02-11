/**
 * Before/After GEO Comparison Report — shows current state vs projected state
 * after deploying all generated files. The money shot for client presentations.
 */

import type { AuditResult, AuditItem } from '../analyzer/geo-auditor.js';
import type { SiteCrawlResult } from '../crawler/page-data.js';

/** Items that improve to specific scores after deploying generated files */
const PROJECTED_IMPROVEMENTS: Record<string, { score: number; note: string }> = {
  'robots.txt':                   { score: 100, note: 'AI crawler directives for 13 bots' },
  'AI Bot Blocking':              { score: 100, note: 'Explicit Allow directives for all AI crawlers' },
  'sitemap.xml':                  { score: 100, note: 'Generated sitemap with all discovered URLs' },
  'llms.txt':                     { score: 100, note: 'Site structure per llmstxt.org spec' },
  'llms-full.txt':                { score: 100, note: 'Full content dump for LLM ingestion' },
  'AI Policy (ai.txt / ai.json)': { score: 100, note: 'Machine + human-readable AI policy' },
  'security.txt':                 { score: 100, note: 'RFC 9116 security contact file' },
  'tdmrep.json':                  { score: 100, note: 'Text & data mining rights reservation' },
  'humans.txt':                   { score: 100, note: 'Team and technology credits' },
  'manifest.json':                { score: 100, note: 'Web app identity manifest' },
  'Structured Data (JSON-LD)':    { score: 85,  note: 'Organization + WebSite schemas' },
};

/**
 * Creates a projected "after" audit by simulating what changes when all
 * generated files are deployed. Content-dependent items stay unchanged.
 */
export function generateProjectedAudit(before: AuditResult): AuditResult {
  const projectedItems: AuditItem[] = before.items.map(item => {
    const improvement = PROJECTED_IMPROVEMENTS[item.name];
    if (improvement && item.score < improvement.score) {
      return {
        ...item,
        score: improvement.score,
        status: improvement.score >= 70 ? 'pass' as const : 'partial' as const,
        details: improvement.note,
        recommendation: 'Included in generated package',
      };
    }
    return { ...item };
  });

  // Recalculate scores with same weighting as geo-auditor
  const weights: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0.5 };
  let totalWeightedScore = 0;
  let totalWeightedMax = 0;

  const summary = {
    critical: { passed: 0, total: 0 },
    high: { passed: 0, total: 0 },
    medium: { passed: 0, total: 0 },
    low: { passed: 0, total: 0 },
  };

  for (const item of projectedItems) {
    const weight = weights[item.category] ?? 1;
    totalWeightedScore += item.score * weight;
    totalWeightedMax += item.maxScore * weight;
    summary[item.category].total++;
    if (item.status === 'pass' || item.status === 'partial') summary[item.category].passed++;
  }

  const overallScore = totalWeightedMax > 0
    ? Math.round((totalWeightedScore / totalWeightedMax) * 100)
    : 0;

  return {
    overallScore,
    maxPossibleScore: 100,
    grade: scoreToGrade(overallScore),
    items: projectedItems,
    summary,
  };
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#22c55e';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#eab308';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function priorityLabel(cat: string): string {
  if (cat === 'critical') return 'Critical';
  if (cat === 'high') return 'High Priority';
  if (cat === 'medium') return 'Medium';
  return 'Low';
}

export function generateComparisonHtml(
  before: AuditResult,
  after: AuditResult,
  crawlResult: SiteCrawlResult,
): string {
  const { domain, baseUrl, siteIdentity } = crawlResult;
  const siteName = siteIdentity.name || domain;
  const beforeColor = getGradeColor(before.grade);
  const afterColor = getGradeColor(after.grade);
  const scoreDelta = after.overallScore - before.overallScore;

  // Split items into "we fix" vs "client fixes"
  const weFixItems: Array<{ before: AuditItem; after: AuditItem }> = [];
  const clientFixItems: Array<{ before: AuditItem; after: AuditItem }> = [];
  const alreadyGoodItems: Array<{ before: AuditItem; after: AuditItem }> = [];

  for (let i = 0; i < before.items.length; i++) {
    const b = before.items[i];
    const a = after.items[i];
    if (a.score > b.score) {
      weFixItems.push({ before: b, after: a });
    } else if (b.score < 100) {
      clientFixItems.push({ before: b, after: a });
    } else {
      alreadyGoodItems.push({ before: b, after: a });
    }
  }

  // Summary sentence
  const summaryText = `By deploying the generated files, your GEO score jumps from <strong style="color:${beforeColor}">${before.overallScore}</strong> to <strong style="color:${afterColor}">${after.overallScore}</strong> &mdash; fixing <strong>${weFixItems.length} items</strong> automatically.`
    + (clientFixItems.length > 0 ? ` ${clientFixItems.length} items still need your attention.` : '');

  function renderItemCard(b: AuditItem, a: AuditItem, showImprovement: boolean): string {
    const delta = a.score - b.score;
    const improvement = PROJECTED_IMPROVEMENTS[b.name];
    const note = showImprovement && improvement ? improvement.note : b.recommendation;
    const beforeBarColor = getScoreColor(b.score);
    const afterBarColor = getScoreColor(a.score);

    return `
      <div class="item-card${showImprovement ? ' improved' : ''}">
        <div class="item-header">
          <div class="item-name">${b.name}</div>
          <div class="item-meta">
            <span class="priority priority-${b.category}">${priorityLabel(b.category)}</span>
            ${delta > 0 ? `<span class="delta-pill">+${delta}</span>` : ''}
          </div>
        </div>
        <div class="bars">
          <div class="bar-row">
            <span class="bar-label">Now</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${b.score}%;background:${beforeBarColor}"></div>
            </div>
            <span class="bar-value" style="color:${beforeBarColor}">${b.score}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">After</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${a.score}%;background:${afterBarColor}"></div>
            </div>
            <span class="bar-value" style="color:${afterBarColor}">${a.score}</span>
          </div>
        </div>
        <div class="item-note">${note}</div>
      </div>`;
  }

  const weFixHtml = weFixItems.map(({ before: b, after: a }) => renderItemCard(b, a, true)).join('\n');
  const clientFixHtml = clientFixItems.map(({ before: b, after: a }) => renderItemCard(b, a, false)).join('\n');
  const alreadyGoodHtml = alreadyGoodItems.map(({ before: b, after: a }) => renderItemCard(b, a, false)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GEO Comparison Report — ${siteName}</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --surface: #141414;
      --surface2: #1e1e1e;
      --border: #2a2a2a;
      --text: #e5e5e5;
      --text-dim: #888;
      --accent: #6366f1;
      --green: #22c55e;
      --yellow: #eab308;
      --red: #ef4444;
      --blue: #3b82f6;
      --orange: #f97316;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
      max-width: 960px;
      margin: 0 auto;
    }

    /* === Hero === */
    .hero {
      text-align: center;
      padding: 3rem 0 2.5rem;
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
    }
    .hero h1 {
      font-size: 1.1rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--text-dim);
      margin-bottom: 0.25rem;
    }
    .hero .site-name {
      font-size: 1.8rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    .hero .site-url {
      font-size: 0.9rem;
      color: var(--text-dim);
      margin-bottom: 2.5rem;
    }
    .hero .site-url a { color: var(--text-dim); }
    .score-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2.5rem;
    }
    .score-block { text-align: center; }
    .score-block .circle-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-dim);
      margin-bottom: 0.5rem;
    }
    .score-circle {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 5px solid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
    }
    .score-circle .grade { font-size: 3rem; font-weight: 800; line-height: 1; }
    .score-circle .score-num { font-size: 1rem; color: var(--text-dim); margin-top: 4px; }
    .arrow-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .arrow-icon {
      font-size: 2rem;
      color: var(--text-dim);
    }
    .delta-pill-hero {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--green);
      background: rgba(34, 197, 94, 0.12);
      padding: 0.3rem 1.2rem;
      border-radius: 24px;
    }
    .hero-summary {
      margin-top: 2rem;
      font-size: 1.05rem;
      color: var(--text-dim);
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.7;
    }

    /* === Section Headers === */
    .section {
      margin-bottom: 2.5rem;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .section-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      flex-shrink: 0;
    }
    .section-icon.green { background: rgba(34,197,94,0.15); color: var(--green); }
    .section-icon.yellow { background: rgba(234,179,8,0.15); color: var(--yellow); }
    .section-icon.blue { background: rgba(99,102,241,0.15); color: var(--accent); }
    .section-title { font-size: 1.25rem; font-weight: 700; }
    .section-count {
      font-size: 0.8rem;
      color: var(--text-dim);
      background: var(--surface2);
      padding: 2px 10px;
      border-radius: 10px;
    }

    /* === Item Cards === */
    .item-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 0.75rem;
    }
    .item-card.improved {
      border-left: 3px solid var(--green);
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .item-name {
      font-size: 1rem;
      font-weight: 600;
    }
    .item-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .priority {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .priority-critical { background: rgba(239,68,68,0.12); color: var(--red); }
    .priority-high { background: rgba(234,179,8,0.12); color: var(--yellow); }
    .priority-medium { background: rgba(59,130,246,0.12); color: var(--blue); }
    .priority-low { background: rgba(136,136,136,0.12); color: var(--text-dim); }
    .delta-pill {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--green);
      background: rgba(34,197,94,0.12);
      padding: 2px 10px;
      border-radius: 10px;
    }

    /* === Bars === */
    .bars {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 0.75rem;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .bar-label {
      font-size: 0.75rem;
      color: var(--text-dim);
      width: 36px;
      text-align: right;
      flex-shrink: 0;
    }
    .bar-track {
      flex: 1;
      height: 10px;
      background: var(--surface2);
      border-radius: 5px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 5px;
      transition: width 0.6s ease;
    }
    .bar-value {
      font-size: 0.85rem;
      font-weight: 700;
      width: 30px;
      flex-shrink: 0;
    }

    /* === Note === */
    .item-note {
      font-size: 0.85rem;
      color: var(--text-dim);
      line-height: 1.5;
    }

    /* === Footer === */
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-dim);
      text-align: center;
    }
    .footer strong { color: var(--text); }
    .date-line {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-top: 0.25rem;
    }

    @media (max-width: 640px) {
      body { padding: 1rem; }
      .score-row { flex-direction: column; gap: 1.5rem; }
      .arrow-icon { transform: rotate(90deg); }
      .score-circle { width: 120px; height: 120px; }
      .score-circle .grade { font-size: 2.2rem; }
    }
  </style>
</head>
<body>

  <!-- Hero -->
  <div class="hero">
    <h1>GEO Compliance</h1>
    <div class="site-name">${siteName}</div>
    <div class="site-url"><a href="${baseUrl}">${baseUrl}</a></div>

    <div class="score-row">
      <div class="score-block">
        <div class="circle-label">Current</div>
        <div class="score-circle" style="border-color:${beforeColor}">
          <span class="grade" style="color:${beforeColor}">${before.grade}</span>
          <span class="score-num">${before.overallScore}/100</span>
        </div>
      </div>

      <div class="arrow-block">
        <span class="arrow-icon">&#10132;</span>
        <span class="delta-pill-hero">+${scoreDelta}</span>
      </div>

      <div class="score-block">
        <div class="circle-label">After Deploy</div>
        <div class="score-circle" style="border-color:${afterColor}">
          <span class="grade" style="color:${afterColor}">${after.grade}</span>
          <span class="score-num">${after.overallScore}/100</span>
        </div>
      </div>
    </div>

    <div class="hero-summary">${summaryText}</div>
  </div>

  <!-- We Fix These -->
  ${weFixItems.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-icon green">&#10003;</div>
      <div class="section-title">We Fix These</div>
      <span class="section-count">${weFixItems.length} items</span>
    </div>
    <p style="color:var(--text-dim);font-size:0.9rem;margin:-0.75rem 0 1.25rem 0;">Deploy the generated files and these items are solved instantly.</p>
${weFixHtml}
  </div>` : ''}

  <!-- Client Needs To Fix -->
  ${clientFixItems.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-icon yellow">&#9888;</div>
      <div class="section-title">Needs Your Attention</div>
      <span class="section-count">${clientFixItems.length} items</span>
    </div>
    <p style="color:var(--text-dim);font-size:0.9rem;margin:-0.75rem 0 1.25rem 0;">These require content or configuration changes on your website.</p>
${clientFixHtml}
  </div>` : ''}

  <!-- Already Good -->
  ${alreadyGoodItems.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="section-icon blue">&#10003;</div>
      <div class="section-title">Already Good</div>
      <span class="section-count">${alreadyGoodItems.length} items</span>
    </div>
${alreadyGoodHtml}
  </div>` : ''}

  <div class="footer">
    Generated by <strong>geo-scraper</strong> &mdash; Generative Engine Optimization
    <div class="date-line">${new Date().toISOString().split('T')[0]}</div>
  </div>

</body>
</html>`;
}
