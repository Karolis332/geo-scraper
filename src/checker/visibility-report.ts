/**
 * Visibility report generator — HTML + JSON output.
 */

import type { VisibilityResult, LLMResponse, EngineVisibility } from '../crawler/page-data.js';

export function generateVisibilityJson(result: VisibilityResult): string {
  return JSON.stringify(result, null, 2) + '\n';
}

export function generateVisibilityHtml(result: VisibilityResult): string {
  const gradeColor = result.overallScore >= 70 ? '#22c55e' : result.overallScore >= 40 ? '#eab308' : '#ef4444';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Visibility Report — ${escHtml(result.site.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; padding: 2rem; }
  .container { max-width: 900px; margin: 0 auto; }
  h1 { color: #818cf8; font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { color: #94a3b8; font-size: 1.2rem; margin: 2rem 0 1rem; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }
  .subtitle { color: #64748b; margin-bottom: 2rem; }
  .score-card { background: #1e293b; border-radius: 12px; padding: 2rem; text-align: center; margin-bottom: 2rem; }
  .score-number { font-size: 4rem; font-weight: 700; color: ${gradeColor}; }
  .score-grade { font-size: 1.5rem; color: ${gradeColor}; }
  .score-label { color: #64748b; margin-top: 0.5rem; }
  .context-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem; }
  .context-item { background: #1e293b; padding: 1rem; border-radius: 8px; }
  .context-label { color: #64748b; font-size: 0.85rem; }
  .context-value { color: #e2e8f0; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; margin-bottom: 1.5rem; }
  th { background: #334155; color: #94a3b8; text-align: left; padding: 0.75rem 1rem; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
  td { padding: 0.75rem 1rem; border-top: 1px solid #334155; }
  .cited { color: #22c55e; font-weight: 600; }
  .mentioned { color: #eab308; font-weight: 600; }
  .absent { color: #ef4444; }
  .error { color: #f87171; font-style: italic; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge-brand { background: #312e81; color: #a5b4fc; }
  .badge-service { background: #164e63; color: #67e8f9; }
  .badge-product { background: #3f2a1c; color: #fbbf24; }
  .badge-location { background: #1a2e1a; color: #86efac; }
  .badge-industry { background: #2e1a2e; color: #d8b4fe; }
  .badge-competitor { background: #2e1a1a; color: #fca5a5; }
  .badge-longtail { background: #1a2e2e; color: #5eead4; }
  .platform-tips { margin-bottom: 2rem; }
  .tip-card { background: #1e293b; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; border-left: 3px solid #818cf8; }
  .tip-card h3 { color: #e2e8f0; font-size: 1rem; margin-bottom: 0.5rem; }
  .tip-card .tip-score { font-size: 0.85rem; margin-bottom: 0.5rem; }
  .tip-card ul { padding-left: 1.25rem; color: #94a3b8; font-size: 0.9rem; }
  .tip-card ul li { margin-bottom: 0.35rem; }
  .context-snippet { font-size: 0.85rem; color: #94a3b8; max-width: 400px; word-break: break-word; }
  .footer { margin-top: 2rem; text-align: center; color: #475569; font-size: 0.85rem; }
  .export-toolbar {
    position: sticky; top: 0; z-index: 50;
    background: #1e293b; border-bottom: 1px solid #334155;
    padding: 10px 16px; margin: -2rem -2rem 2rem -2rem;
    display: flex; gap: 10px; align-items: center;
  }
  .export-toolbar button {
    padding: 6px 16px; border-radius: 6px; border: 1px solid #334155;
    background: #818cf8; color: white; font-weight: 500; font-size: 13px;
    cursor: pointer; font-family: inherit;
  }
  .export-toolbar button:hover { opacity: 0.85; }
  .export-toolbar button.secondary { background: #334155; color: #e2e8f0; }
  .export-toolbar span { color: #64748b; font-size: 13px; margin-left: auto; }
  @media print {
    .export-toolbar { display: none !important; }
    body { background: #fff; color: #111; }
    .container { max-width: 100%; }
    .score-card, .context-item, .tip-card { background: #f8f8f8; }
    table { background: #fff; }
    th { background: #eee; color: #333; }
    td { border-color: #ddd; }
    .score-number, .score-grade, .cited, .mentioned, .absent { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .subtitle, .footer, .context-label, .tip-card ul { color: #555; }
    h1 { color: #4f46e5; }
    h2 { color: #666; border-color: #ddd; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="export-toolbar">
    <button onclick="window.print()">Download PDF</button>
    <button class="secondary" onclick="exportCsv()">Export CSV</button>
    <span>Use browser "Save as PDF" in the print dialog</span>
  </div>
  <h1>AI Visibility Report</h1>
  <p class="subtitle">${escHtml(result.site.url)} — Generated ${escHtml(result.generated)}</p>

  <div class="score-card">
    <div class="score-number">${result.overallScore}</div>
    <div class="score-grade">Grade: ${escHtml(result.grade)}</div>
    <div class="score-label">Overall AI Visibility Score</div>
  </div>

  <h2>Business Context</h2>
  <div class="context-grid">
    <div class="context-item"><div class="context-label">Name</div><div class="context-value">${escHtml(result.businessContext.name)}</div></div>
    <div class="context-item"><div class="context-label">Domain</div><div class="context-value">${escHtml(result.businessContext.domain)}</div></div>
    <div class="context-item"><div class="context-label">Industry</div><div class="context-value">${escHtml(result.businessContext.industry)}</div></div>
    <div class="context-item"><div class="context-label">Location</div><div class="context-value">${escHtml(result.businessContext.location || 'N/A')}</div></div>
    <div class="context-item"><div class="context-label">Language</div><div class="context-value">${escHtml(result.businessContext.language)}</div></div>
    <div class="context-item"><div class="context-label">Services</div><div class="context-value">${escHtml(result.businessContext.services.join(', ') || 'N/A')}</div></div>
  </div>

  <h2>Engine Scores</h2>
  <table>
    <tr><th>Engine</th><th>Cited</th><th>Mentioned</th><th>Absent</th><th>Score</th></tr>
    ${result.engineScores.map((e) => `<tr>
      <td>${escHtml(engineDisplayName(e.engine))}</td>
      <td class="cited">${e.cited}</td>
      <td class="mentioned">${e.mentioned}</td>
      <td class="absent">${e.absent}</td>
      <td><strong>${e.score}/100</strong></td>
    </tr>`).join('\n    ')}
  </table>

  <h2>Queries & Results</h2>
  <table>
    <tr><th>Query</th><th>Category</th><th>Engine</th><th>Result</th><th>Context</th></tr>
    ${result.responses.map((r) => `<tr>
      <td>${escHtml(r.query)}</td>
      <td>${categoryBadge(findQueryCategory(r.query, result))}</td>
      <td>${escHtml(engineDisplayName(r.engine))}</td>
      <td>${r.error ? `<span class="error">Error</span>` : mentionBadge(r)}</td>
      <td class="context-snippet">${escHtml(r.mentionContext?.slice(0, 150) || (r.error || '—'))}</td>
    </tr>`).join('\n    ')}
  </table>

  ${renderPlatformTips(result)}

  <div class="footer">
    Generated by geo-scraper v1.0.0
  </div>
</div>
<script>
function exportCsv() {
  const tables = document.querySelectorAll('table');
  // First table is Engine Scores
  const engineTable = tables[0];
  if (!engineTable) return;
  const rows = [];
  engineTable.querySelectorAll('tr').forEach(tr => {
    const cells = [];
    tr.querySelectorAll('th, td').forEach(td => cells.push(td.textContent?.trim() || ''));
    if (cells.length) rows.push(cells);
  });
  const csv = rows.map(r => r.map(c => '"' + c.replace(/"/g, '""') + '"').join(',')).join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ai-visibility-report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
if (new URLSearchParams(location.search).get('export') === 'pdf') window.print();
if (new URLSearchParams(location.search).get('export') === 'csv') exportCsv();
</script>
</body>
</html>
`;
}

function renderPlatformTips(result: VisibilityResult): string {
  const tips: string[] = [];
  const threshold = 40; // Show tips for engines scoring below this

  for (const engine of result.engineScores) {
    if (engine.score >= threshold) continue;

    const name = engineDisplayName(engine.engine);
    const engineTips = getPlatformTips(engine.engine);
    const scoreColor = engine.score >= 40 ? '#eab308' : '#ef4444';

    tips.push(`<div class="tip-card">
      <h3>${escHtml(name)} — Platform-Specific Tips</h3>
      <div class="tip-score">Score: <strong style="color: ${scoreColor}">${engine.score}/100</strong> (${engine.cited} cited, ${engine.mentioned} mentioned, ${engine.absent} absent)</div>
      <ul>${engineTips.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>
    </div>`);
  }

  if (tips.length === 0) return '';

  return `<h2>Platform-Specific Recommendations</h2>
  <div class="platform-tips">
    <p style="color: #94a3b8; margin-bottom: 1rem; font-size: 0.9rem;">Only 7 of the top 50 domains appear across all 3 major AI platforms — 86% of visibility is platform-specific. Focus on the tips below for engines where you scored low.</p>
    ${tips.join('\n    ')}
  </div>`;
}

function getPlatformTips(engine: string): string[] {
  const tips: Record<string, string[]> = {
    openai: [
      'ChatGPT favors publishers and news outlets — publish authoritative, well-cited content',
      'Ensure your site is not blocking GPTBot, OAI-SearchBot, or ChatGPT-User in robots.txt',
      'Add structured data (JSON-LD) — ChatGPT uses it for entity disambiguation',
      'Publish comprehensive FAQ pages — ChatGPT frequently cites Q&A-style content',
      'Keep content fresh — ChatGPT ranks citations by recency',
    ],
    perplexity: [
      'Perplexity favors niche and regional sites — focus on deep, specialized content',
      'Ensure PerplexityBot is not blocked in robots.txt',
      'Add detailed citations and sources to your content — Perplexity values well-referenced material',
      'Create long-form, comprehensive guides on your niche topics',
      'Structured data and clean HTML hierarchy help Perplexity extract accurate answers',
    ],
    gemini: [
      'Google AI Overviews heavily favor YouTube, Reddit, and Quora — consider creating video content and engaging in community discussions',
      'Ensure Google-Extended is not blocked in robots.txt',
      'Use clear heading hierarchy (H1>H2>H3) — Google AI uses a tree walking algorithm on semantic HTML',
      'Add dateModified to JSON-LD — freshness is a key signal for AI Overviews',
      'Target long-tail, conversational queries — AI overviews appear far more on 7+ word queries',
    ],
    claude: [
      'Ensure ClaudeBot and Claude-SearchBot are not blocked in robots.txt',
      'Provide llms.txt and llms-full.txt for optimal Claude ingestion',
      'Well-structured markdown-friendly content is easier for Claude to process',
      'Add clear attribution and authorship signals for credibility',
    ],
  };

  return tips[engine] || [
    'Ensure your AI policy files (ai.txt, ai.json) explicitly allow this engine',
    'Add structured data (JSON-LD) for better content understanding',
    'Keep content fresh and well-structured with clear headings',
  ];
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function engineDisplayName(engine: string): string {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    perplexity: 'Perplexity',
    gemini: 'Gemini',
    claude: 'Claude',
  };
  return names[engine] || engine;
}

function categoryBadge(category: string): string {
  return `<span class="badge badge-${category}">${category}</span>`;
}

function mentionBadge(r: LLMResponse): string {
  if (r.mentionType === 'cited') return `<span class="cited">Cited</span>`;
  if (r.mentionType === 'mentioned') return `<span class="mentioned">Mentioned</span>`;
  return `<span class="absent">Absent</span>`;
}

function findQueryCategory(query: string, result: VisibilityResult): string {
  const sq = result.queries.find((q) => q.query === query);
  return sq?.category || 'industry';
}
