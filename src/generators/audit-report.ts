/**
 * Generate HTML audit report and summary.json.
 */

import type { AuditResult, AuditItem } from '../analyzer/geo-auditor.js';
import type { SiteCrawlResult } from '../crawler/page-data.js';

export function generateAuditReportHtml(
  audit: AuditResult,
  crawlResult: SiteCrawlResult,
): string {
  const { domain, baseUrl, crawlStats, siteIdentity, pages } = crawlResult;
  const siteName = siteIdentity.name || domain;
  const gradeColor = getGradeColor(audit.grade);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GEO Audit Report — ${siteName}</title>
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
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; margin: 2rem 0 1rem; color: var(--accent); }
    h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    .header-info { flex: 1; }
    .header-info p { color: var(--text-dim); margin: 0.25rem 0; }
    .grade-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 4px solid ${gradeColor};
      flex-shrink: 0;
      margin-left: 2rem;
    }
    .grade-letter { font-size: 2.5rem; font-weight: 700; color: ${gradeColor}; }
    .grade-score { font-size: 0.9rem; color: var(--text-dim); }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }
    .stat-card .label { font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; }
    .stat-card .value { font-size: 1.5rem; font-weight: 600; margin-top: 0.25rem; }
    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 1.5rem 0 0.75rem;
    }
    .category-badge {
      font-size: 0.7rem;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .badge-critical { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge-high { background: rgba(234,179,8,0.15); color: var(--yellow); }
    .badge-medium { background: rgba(59,130,246,0.15); color: var(--blue); }
    .badge-low { background: rgba(136,136,136,0.15); color: var(--text-dim); }
    .audit-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }
    .status-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .status-pass { background: rgba(34,197,94,0.15); color: var(--green); }
    .status-partial { background: rgba(234,179,8,0.15); color: var(--yellow); }
    .status-fail { background: rgba(239,68,68,0.15); color: var(--red); }
    .item-content { flex: 1; }
    .item-name { font-weight: 600; margin-bottom: 0.25rem; }
    .item-details { font-size: 0.85rem; color: var(--text-dim); margin-bottom: 0.25rem; }
    .item-rec { font-size: 0.85rem; color: var(--accent); }
    .score-bar {
      width: 80px;
      height: 6px;
      background: var(--surface2);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 8px;
      flex-shrink: 0;
    }
    .score-fill { height: 100%; border-radius: 3px; }
    .files-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-top: 2rem;
    }
    .file-list { list-style: none; }
    .file-list li {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
    }
    .file-list li:last-child { border-bottom: none; }
    .file-status { font-size: 0.8rem; }
    .existing { color: var(--green); }
    .generated { color: var(--accent); }
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-dim);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-info">
      <h1>GEO Audit Report</h1>
      <p><strong>${siteName}</strong> &mdash; <a href="${baseUrl}">${baseUrl}</a></p>
      <p>Generated: ${new Date().toISOString().split('T')[0]} | Pages crawled: ${crawlStats.totalPages} | Time: ${(crawlStats.totalTime / 1000).toFixed(1)}s</p>
    </div>
    <div class="grade-circle">
      <span class="grade-letter">${audit.grade}</span>
      <span class="grade-score">${audit.overallScore}/100</span>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">Overall Score</div>
      <div class="value" style="color:${gradeColor}">${audit.overallScore}%</div>
    </div>
    <div class="stat-card">
      <div class="label">Critical Checks</div>
      <div class="value">${audit.summary.critical.passed}/${audit.summary.critical.total}</div>
    </div>
    <div class="stat-card">
      <div class="label">High Priority</div>
      <div class="value">${audit.summary.high.passed}/${audit.summary.high.total}</div>
    </div>
    <div class="stat-card">
      <div class="label">Pages Crawled</div>
      <div class="value">${crawlStats.totalPages}</div>
    </div>
  </div>

  <h2>Audit Results</h2>

${renderCategory('Critical', 'critical', audit.items)}
${renderCategory('High Priority', 'high', audit.items)}
${renderCategory('Medium Priority', 'medium', audit.items)}
${renderCategory('Low Priority', 'low', audit.items)}

  <div class="files-section">
    <h2 style="margin-top:0">Generated Files</h2>
    <p style="color:var(--text-dim);margin-bottom:1rem">The following GEO compliance files have been generated and are ready for deployment.</p>
    <ul class="file-list">
      <li><code>llms.txt</code> <span class="generated">Generated</span></li>
      <li><code>llms-full.txt</code> <span class="generated">Generated</span></li>
      <li><code>robots.txt</code> <span class="generated">Generated</span></li>
      <li><code>sitemap.xml</code> <span class="generated">Generated</span></li>
      <li><code>ai.txt</code> <span class="generated">Generated</span></li>
      <li><code>ai.json</code> <span class="generated">Generated</span></li>
      <li><code>.well-known/security.txt</code> <span class="generated">Generated</span></li>
      <li><code>.well-known/tdmrep.json</code> <span class="generated">Generated</span></li>
      <li><code>humans.txt</code> <span class="generated">Generated</span></li>
      <li><code>manifest.json</code> <span class="generated">Generated</span></li>
      <li><code>structured-data/*.json</code> <span class="generated">Generated</span></li>
    </ul>
  </div>

  <div class="files-section">
    <h2 style="margin-top:0">Deployment Instructions</h2>
    <ol style="padding-left:1.5rem;color:var(--text-dim)">
      <li>Copy all generated files to your web server's root directory</li>
      <li>Ensure <code>.well-known/</code> directory is served correctly (not blocked by server config)</li>
      <li>Add JSON-LD from <code>structured-data/</code> to your page templates' <code>&lt;head&gt;</code> sections</li>
      <li>Update <code>security.txt</code> contact email and add your PGP key if available</li>
      <li>Review <code>robots.txt</code> AI crawler directives — adjust Allow/Disallow per your policy</li>
      <li>Validate sitemap.xml at <a href="https://www.xml-sitemaps.com/validate-xml-sitemap.html">xml-sitemaps.com</a></li>
      <li>Test structured data at <a href="https://search.google.com/test/rich-results">Google Rich Results Test</a></li>
    </ol>
  </div>

  <div class="footer">
    Generated by <strong>geo-scraper</strong> | Generative Engine Optimization Compliance Tool
  </div>
</body>
</html>`;
}

function renderCategory(title: string, category: string, items: AuditItem[]): string {
  const filtered = items.filter(i => i.category === category);
  if (filtered.length === 0) return '';

  const badgeClass = `badge-${category}`;

  let html = `  <div class="category-header">
    <h3>${title}</h3>
    <span class="category-badge ${badgeClass}">${category}</span>
  </div>\n`;

  for (const item of filtered) {
    const statusIcon = item.status === 'pass' ? '&#10003;' : item.status === 'partial' ? '~' : '&#10005;';
    const statusClass = `status-${item.status === 'not_applicable' ? 'partial' : item.status}`;
    const fillColor = item.score >= 70 ? 'var(--green)' : item.score >= 40 ? 'var(--yellow)' : 'var(--red)';

    html += `  <div class="audit-item">
    <div class="status-icon ${statusClass}">${statusIcon}</div>
    <div class="item-content">
      <div class="item-name">${item.name}</div>
      <div class="item-details">${item.details}</div>
      <div class="item-rec">${item.recommendation}</div>
    </div>
    <div>
      <div style="font-size:0.8rem;color:var(--text-dim);text-align:right">${item.score}/${item.maxScore}</div>
      <div class="score-bar"><div class="score-fill" style="width:${item.score}%;background:${fillColor}"></div></div>
    </div>
  </div>\n`;
  }

  return html;
}

function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#22c55e';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#eab308';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

export function generateSummaryJson(
  audit: AuditResult,
  crawlResult: SiteCrawlResult,
): string {
  const summary = {
    site: {
      url: crawlResult.baseUrl,
      domain: crawlResult.domain,
      name: crawlResult.siteIdentity.name,
      pagesCrawled: crawlResult.crawlStats.totalPages,
      crawlTimeMs: crawlResult.crawlStats.totalTime,
    },
    audit: {
      overallScore: audit.overallScore,
      grade: audit.grade,
      summary: audit.summary,
      items: audit.items.map(i => ({
        name: i.name,
        category: i.category,
        score: i.score,
        status: i.status,
        details: i.details,
        recommendation: i.recommendation,
      })),
    },
    generated: new Date().toISOString(),
  };

  return JSON.stringify(summary, null, 2) + '\n';
}
