#!/usr/bin/env node

/**
 * geo-scraper CLI — Scrape a website and generate all GEO compliance files.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { crawlSite } from './crawler/site-crawler.js';
import { auditSite } from './analyzer/geo-auditor.js';
import { generateLlmsTxt } from './generators/llms-txt.js';
import { generateLlmsFullTxt } from './generators/llms-full-txt.js';
import { generateRobotsTxt } from './generators/robots-txt.js';
import { generateSitemapXml } from './generators/sitemap-xml.js';
import { generateStructuredData } from './generators/structured-data.js';
import { generateAiTxt, generateAiJson } from './generators/ai-txt.js';
import { generateSecurityTxt } from './generators/security-txt.js';
import { generateTdmrepJson } from './generators/tdmrep-json.js';
import { generateHumansTxt } from './generators/humans-txt.js';
import { generateManifestJson } from './generators/manifest-json.js';
import { generateAuditReportHtml, generateSummaryJson } from './generators/audit-report.js';
import { generateProjectedAudit, generateComparisonHtml } from './generators/comparison-report.js';
import { extractDomain, isValidHttpUrl, ensureHttps } from './utils/url-utils.js';
import type { CLIOptions, GeneratorOptions, CheckOptions, SearchQuery } from './crawler/page-data.js';

const program = new Command();

program
  .name('geo-scraper')
  .description('Scrape a website and generate all GEO (Generative Engine Optimization) compliance files')
  .version('1.0.0');

// === SCAN command (default behavior) ===
const scanCmd = new Command('scan')
  .description('Crawl and audit a website for GEO compliance')
  .argument('<url>', 'Website URL to scrape')
  .option('-o, --output <dir>', 'Output directory', './geo-output')
  .option('-m, --max-pages <n>', 'Maximum pages to crawl', '500')
  .option('-c, --concurrency <n>', 'Concurrent requests', '3')
  .option('--audit-only', 'Only audit existing GEO compliance, do not generate files', false)
  .option('--allow-training', 'Allow AI training in generated policies (default)', true)
  .option('--deny-training', 'Deny AI training in generated policies', false)
  .option('--contact-email <email>', 'Contact email for security.txt and ai.txt')
  .option('--brand-scan', 'Scan brand mentions on YouTube, Reddit, Wikipedia, LinkedIn', false)
  .option('--pdf', 'Also generate PDF versions of reports', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (url: string, opts: Record<string, unknown>) => {
    try {
      await runScan(url, opts);
    } catch (err) {
      console.error(chalk.red(`\nFatal error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program.addCommand(scanCmd, { isDefault: true });

// === CHECK command ===
const checkCmd = new Command('check')
  .description('Check website visibility across AI search engines')
  .argument('<url>', 'Website URL to check')
  .option('-o, --output <dir>', 'Output directory', './geo-output')
  .option('-m, --max-pages <n>', 'Max pages to crawl', '20')
  .option('-c, --concurrency <n>', 'Concurrent requests', '3')
  .option('-q, --queries <n>', 'Number of queries to generate', '10')
  .option('--engines <list>', 'Comma-separated engines: openai,perplexity,gemini,claude')
  .option('--query-file <path>', 'File with custom queries (one per line)')
  .option('-r, --region <region>', 'Geographic region for targeted queries')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (url: string, opts: Record<string, unknown>) => {
    try {
      await runCheck(url, opts);
    } catch (err) {
      console.error(chalk.red(`\nFatal error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program.addCommand(checkCmd);

// === WEB command ===
const webCmd = new Command('web')
  .description('Start the web dashboard for running scans and viewing history')
  .option('-p, --port <n>', 'Port to listen on', '3000')
  .option('--host <host>', 'Host to bind (use 0.0.0.0 for external access)', '127.0.0.1')
  .action(async (opts: Record<string, unknown>) => {
    try {
      const port = parseInt(opts.port as string, 10) || 3000;
      const host = (opts.host as string) || '127.0.0.1';
      // Dynamic import so express/better-sqlite3 only load when needed
      const { createServer } = await import('./web/server.js');
      const dbPath = join(opts.output as string || './geo-output', 'geo-scraper.db');
      const { server } = createServer(port, dbPath, host);

      console.log('');
      console.log(chalk.bold.hex('#6366f1')('  geo-scraper web'));
      console.log(chalk.dim('  Dashboard running at:'));
      console.log('');
      if (host === '0.0.0.0') {
        console.log(`  ${chalk.white(`http://localhost:${port}`)}`);
      } else {
        console.log(`  ${chalk.white(`http://${host}:${port}`)}`);
      }
      console.log('');
      console.log(chalk.dim('  Press Ctrl+C to stop.'));
      console.log('');

      // Keep the action pending so Commander doesn't exit the process
      await new Promise<void>(() => {
        // Never resolves — the server keeps the event loop alive.
        // Process exits on SIGINT (Ctrl+C).
      });
    } catch (err) {
      console.error(chalk.red(`\nFatal error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// Copy output option for web command
webCmd.option('-o, --output <dir>', 'Output / database directory', './geo-output');
program.addCommand(webCmd);

// No default command — use `scan` subcommand as default via Commander
// Users can run either `geo-scraper scan <url>` or `geo-scraper <url>`

program.parse();

// ============================================================================
// SCAN implementation (existing functionality)
// ============================================================================

async function runScan(rawUrl: string, opts: Record<string, unknown>): Promise<void> {
  // Validate and normalize URL
  let url = rawUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  url = ensureHttps(url);

  if (!isValidHttpUrl(url)) {
    console.error(chalk.red('Invalid URL. Please provide a valid HTTP/HTTPS URL.'));
    process.exit(1);
  }

  const domain = extractDomain(url);
  const options: CLIOptions = {
    maxPages: parseInt(opts.maxPages as string, 10) || 500,
    concurrency: parseInt(opts.concurrency as string, 10) || 3,
    jsRender: false,
    verbose: !!opts.verbose,
    auditOnly: !!opts.auditOnly,
    allowTraining: !opts.denyTraining,
    denyTraining: !!opts.denyTraining,
    contactEmail: (opts.contactEmail as string) || null,
    outputDir: join(opts.output as string || './geo-output', domain),
  };

  console.log('');
  console.log(chalk.bold.hex('#6366f1')('  geo-scraper'));
  console.log(chalk.dim('  Generative Engine Optimization Compliance Tool'));
  console.log('');
  console.log(`  ${chalk.dim('Target:')}  ${chalk.white(url)}`);
  console.log(`  ${chalk.dim('Output:')}  ${chalk.white(options.outputDir)}`);
  console.log(`  ${chalk.dim('Pages:')}   ${chalk.white(String(options.maxPages))}`);
  console.log(`  ${chalk.dim('Training:')} ${options.denyTraining ? chalk.red('denied') : chalk.green('allowed')}`);
  console.log('');

  // Step 1: Crawl
  const spinner = ora({ text: 'Crawling site...', color: 'cyan' }).start();
  const crawlResult = await crawlSite(url, options, (msg: string) => {
    spinner.text = msg;
  });
  spinner.succeed(
    `Crawled ${chalk.bold(String(crawlResult.crawlStats.totalPages))} pages in ${(crawlResult.crawlStats.totalTime / 1000).toFixed(1)}s` +
    (crawlResult.crawlStats.errors > 0 ? chalk.yellow(` (${crawlResult.crawlStats.errors} errors)`) : '')
  );

  // Warn when crawl returns 0 pages
  if (crawlResult.crawlStats.totalPages === 0) {
    const sitemapUrls = crawlResult.existingGeoFiles.sitemapXml
      ? (crawlResult.existingGeoFiles.sitemapXml.match(/<loc>/g) || []).length
      : 0;

    if (sitemapUrls > 0) {
      console.log(chalk.yellow(`\n  ⚠ Found ${sitemapUrls} URLs in sitemap but crawled 0 pages. The site may be blocking automated requests.`));
    } else if (crawlResult.crawlStats.errors > 0) {
      console.log(chalk.yellow('\n  ⚠ No pages could be fetched. Results may be incomplete. Check site accessibility.'));
      for (const fp of crawlResult.crawlStats.failedPages.slice(0, 3)) {
        console.log(chalk.dim(`    ${fp.url} — ${fp.error}`));
      }
    } else {
      console.log(chalk.yellow('\n  ⚠ No pages found to crawl.'));
    }
    console.log('');
  }

  // Step 1.5: Brand Scan (optional)
  let brandResult: import('./analyzer/brand-scanner.js').BrandMentionResult | undefined;
  if (opts.brandScan) {
    const brandSpinner = ora({ text: 'Scanning brand mentions (YouTube, Reddit, Wikipedia, LinkedIn)...', color: 'cyan' }).start();
    try {
      const { scanBrandMentions } = await import('./analyzer/brand-scanner.js');
      brandResult = await scanBrandMentions(crawlResult.siteIdentity, domain);
      const found = brandResult.platforms.filter(p => p.found).length;
      const brandColor = brandResult.overallScore >= 50 ? 'green' : brandResult.overallScore >= 25 ? 'yellow' : 'red';
      brandSpinner.succeed(
        `Brand Authority: ${chalk[brandColor].bold(`${brandResult.overallScore}/100`)} (found on ${found}/4 platforms)`
      );
    } catch (err) {
      brandSpinner.warn(`Brand scan failed: ${(err as Error).message}`);
    }
  }

  // Step 2: Audit
  const auditSpinner = ora({ text: 'Auditing GEO compliance...', color: 'cyan' }).start();
  const audit = auditSite(crawlResult, brandResult);
  const gradeColor = audit.overallScore >= 70 ? 'green' : audit.overallScore >= 40 ? 'yellow' : 'red';
  auditSpinner.succeed(
    `GEO Score: ${chalk[gradeColor].bold(`${audit.overallScore}/100`)} (Grade: ${chalk[gradeColor].bold(audit.grade)})`
  );

  // Step 2.5: Platform Optimization, Citability, AI Content Detection, Schema Templates
  const { analyzePlatformReadiness } = await import('./analyzer/platform-optimizer.js');
  const platformResult = analyzePlatformReadiness(audit, crawlResult, brandResult);

  const { scoreSiteCitability } = await import('./analyzer/citability-scorer.js');
  const citabilityResult = scoreSiteCitability(crawlResult.pages);

  const { detectSiteAIContent } = await import('./analyzer/ai-content-detector.js');
  const aiContentResult = detectSiteAIContent(crawlResult.pages);

  const { generateSchemaTemplates } = await import('./generators/schema-templates.js');
  const schemaResult = generateSchemaTemplates(crawlResult);

  if (options.auditOnly) {
    printAuditSummary(audit, platformResult, citabilityResult);
    return;
  }

  // Step 3: Generate files
  const genSpinner = ora({ text: 'Generating GEO files...', color: 'cyan' }).start();

  const generatorOpts: GeneratorOptions = {
    allowTraining: options.allowTraining,
    denyTraining: options.denyTraining,
    contactEmail: options.contactEmail,
    outputDir: options.outputDir,
  };

  // Create output directories
  await mkdir(options.outputDir, { recursive: true });
  await mkdir(join(options.outputDir, '.well-known'), { recursive: true });
  await mkdir(join(options.outputDir, 'structured-data'), { recursive: true });

  // Generate all files
  const files: { path: string; content: string }[] = [];

  files.push({ path: 'llms.txt', content: generateLlmsTxt(crawlResult) });
  files.push({ path: 'llms-full.txt', content: generateLlmsFullTxt(crawlResult) });
  files.push({ path: 'robots.txt', content: generateRobotsTxt(crawlResult, generatorOpts) });
  files.push({ path: 'sitemap.xml', content: generateSitemapXml(crawlResult) });
  files.push({ path: 'ai.txt', content: generateAiTxt(crawlResult, generatorOpts) });
  files.push({ path: 'ai.json', content: generateAiJson(crawlResult, generatorOpts) });
  files.push({ path: join('.well-known', 'security.txt'), content: generateSecurityTxt(crawlResult, generatorOpts) });
  files.push({ path: join('.well-known', 'tdmrep.json'), content: generateTdmrepJson(crawlResult, generatorOpts) });
  files.push({ path: 'humans.txt', content: generateHumansTxt(crawlResult, generatorOpts) });
  files.push({ path: 'manifest.json', content: generateManifestJson(crawlResult) });

  // Structured data per page
  const structuredData = generateStructuredData(crawlResult);

  // Site-level structured data
  files.push({
    path: join('structured-data', '_site.json'),
    content: JSON.stringify(structuredData.siteLevel, null, 2) + '\n',
  });

  // Per-page structured data
  for (const [slug, schemas] of structuredData.perPage) {
    files.push({
      path: join('structured-data', `${slug}.json`),
      content: JSON.stringify(schemas, null, 2) + '\n',
    });
  }

  // Audit report
  files.push({ path: 'audit-report.html', content: generateAuditReportHtml(audit, crawlResult, {
    eeatScore: audit.subScores.eeatScore,
    citabilityResult,
    platformResult,
    brandResult,
  }) });
  files.push({ path: 'summary.json', content: generateSummaryJson(audit, crawlResult) });

  // Before/After comparison report
  const projected = generateProjectedAudit(audit);
  files.push({ path: 'comparison-report.html', content: generateComparisonHtml(audit, projected, crawlResult) });

  // Schema templates
  if (schemaResult.templates.length > 0) {
    await mkdir(join(options.outputDir, 'schema-templates'), { recursive: true });
    for (const t of schemaResult.templates) {
      files.push({
        path: join('schema-templates', t.filename),
        content: JSON.stringify(t.schema, null, 2) + '\n',
      });
    }
  }

  // Client report (markdown)
  const { generateClientReport } = await import('./generators/client-report.js');
  files.push({ path: 'client-report.md', content: generateClientReport({
    audit, crawlResult,
    eeatScore: audit.subScores.eeatScore,
    citabilityResult, platformResult, brandResult,
    aiContentResult, schemaResult,
  }) });

  // Write all files
  let written = 0;
  for (const file of files) {
    await writeFile(join(options.outputDir, file.path), file.content, 'utf-8');
    written++;
  }

  genSpinner.succeed(`Generated ${chalk.bold(String(written))} files`);

  // Print summary
  console.log('');
  console.log(chalk.bold('  Generated Files:'));
  console.log('');

  const mainFiles = [
    'llms.txt', 'llms-full.txt', 'robots.txt', 'sitemap.xml',
    'ai.txt', 'ai.json', '.well-known/security.txt', '.well-known/tdmrep.json',
    'humans.txt', 'manifest.json',
  ];
  for (const f of mainFiles) {
    console.log(`    ${chalk.green('+')} ${f}`);
  }

  const sdCount = structuredData.perPage.size + 1;
  console.log(`    ${chalk.green('+')} structured-data/ (${sdCount} files)`);
  if (schemaResult.templates.length > 0) {
    console.log(`    ${chalk.green('+')} schema-templates/ (${schemaResult.templates.length} files)`);
  }
  console.log(`    ${chalk.green('+')} audit-report.html`);
  console.log(`    ${chalk.green('+')} comparison-report.html`);
  console.log(`    ${chalk.green('+')} client-report.md`);
  console.log(`    ${chalk.green('+')} summary.json`);

  // PDF generation (optional)
  if (opts.pdf) {
    const pdfSpinner = ora({ text: 'Generating PDF reports...', color: 'cyan' }).start();
    try {
      const { generatePdfFromHtml } = await import('./generators/pdf-report.js');
      const auditHtmlForPdf = files.find(f => f.path === 'audit-report.html')?.content;
      const compHtmlForPdf = files.find(f => f.path === 'comparison-report.html')?.content;
      if (auditHtmlForPdf) {
        await generatePdfFromHtml(auditHtmlForPdf, join(options.outputDir, 'audit-report.pdf'));
      }
      if (compHtmlForPdf) {
        await generatePdfFromHtml(compHtmlForPdf, join(options.outputDir, 'comparison-report.pdf'));
      }
      pdfSpinner.succeed('PDF reports generated');
      console.log(`    ${chalk.green('+')} audit-report.pdf`);
      console.log(`    ${chalk.green('+')} comparison-report.pdf`);
    } catch (err) {
      pdfSpinner.warn(`PDF generation failed: ${(err as Error).message}`);
    }
  }

  console.log('');
  printAuditSummary(audit, platformResult, citabilityResult, aiContentResult);

  console.log('');
  console.log(`  ${chalk.dim('Output directory:')} ${chalk.white(options.outputDir)}`);
  console.log(`  ${chalk.dim('Open report:')}      ${chalk.white(join(options.outputDir, 'audit-report.html'))}`);
  console.log(`  ${chalk.dim('Client report:')}    ${chalk.white(join(options.outputDir, 'client-report.md'))}`);
  console.log('');
}

function printAuditSummary(
  audit: import('./analyzer/geo-auditor.js').AuditResult,
  platformResult?: import('./analyzer/platform-optimizer.js').PlatformOptimizationResult,
  citabilityResult?: import('./analyzer/citability-scorer.js').SiteCitabilityResult,
  aiContentResult?: import('./analyzer/ai-content-detector.js').SiteAIContentResult,
): void {
  console.log(chalk.bold('  Audit Summary:'));

  // Issue counts header
  const { errors, warnings, notices } = audit.issueCounts;
  const countParts: string[] = [];
  if (errors > 0) countParts.push(chalk.red(`${errors} errors`));
  if (warnings > 0) countParts.push(chalk.yellow(`${warnings} warnings`));
  if (notices > 0) countParts.push(chalk.blue(`${notices} notices`));
  if (countParts.length > 0) {
    console.log(`  ${countParts.join(chalk.dim(' · '))}`);
  }
  console.log('');

  for (const item of audit.items) {
    // Severity-based icon
    let icon: string;
    if (item.status === 'pass') {
      icon = chalk.green('  ✓');
    } else if (item.status === 'not_applicable') {
      icon = chalk.gray('  —');
    } else if (item.severity === 'error') {
      icon = chalk.red('  ●');
    } else if (item.severity === 'warning') {
      icon = chalk.yellow('  ▲');
    } else if (item.severity === 'notice') {
      icon = chalk.blue('  ℹ');
    } else {
      icon = chalk.gray('  ○');
    }

    const score = item.status === 'not_applicable'
      ? '  N/A'
      : `${String(item.score).padStart(3)}/${item.maxScore}`;
    const category = item.category.padEnd(20);
    console.log(`  ${icon} ${chalk.dim(`[${category}]`)} ${item.name.padEnd(38)} ${score}  ${chalk.dim(item.details)}`);
  }

  console.log('');
  const gradeColor = audit.overallScore >= 70 ? 'green' : audit.overallScore >= 40 ? 'yellow' : 'red';
  console.log(`  ${chalk.bold('Overall:')} ${chalk[gradeColor].bold(`${audit.overallScore}/100`)} (Grade: ${chalk[gradeColor].bold(audit.grade)})`);

  // AI Search Health sub-score
  const aiHealth = audit.subScores.aiSearchHealth;
  const aiColor = aiHealth >= 70 ? 'green' : aiHealth >= 40 ? 'yellow' : 'red';
  console.log(`  ${chalk.bold('AI Search Health:')} ${chalk[aiColor].bold(`${aiHealth}/100`)}`);

  // E-E-A-T sub-score
  const eeat = audit.subScores.eeatScore;
  const eeatColor = eeat.total >= 70 ? 'green' : eeat.total >= 40 ? 'yellow' : 'red';
  console.log(`  ${chalk.bold('E-E-A-T Score:')} ${chalk[eeatColor].bold(`${eeat.total}/100`)} ${chalk.dim(`(E:${eeat.experience} E:${eeat.expertise} A:${eeat.authoritativeness} T:${eeat.trustworthiness})`)}`);

  // Citability score
  if (citabilityResult && citabilityResult.totalPassages > 0) {
    const citColor = citabilityResult.siteScore >= 70 ? 'green' : citabilityResult.siteScore >= 40 ? 'yellow' : 'red';
    console.log(`  ${chalk.bold('Citability:')} ${chalk[citColor].bold(`${citabilityResult.siteScore}/100`)} ${chalk.dim(`(${citabilityResult.totalHighCitability}/${citabilityResult.totalPassages} passages highly citable)`)}`);
  }

  // AI Content Detection
  if (aiContentResult && aiContentResult.pages.length > 0) {
    const aiColor = aiContentResult.averageScore >= 60 ? 'red' : aiContentResult.averageScore >= 30 ? 'yellow' : 'green';
    console.log(`  ${chalk.bold('AI Content Risk:')} ${chalk[aiColor].bold(`${aiContentResult.averageScore}/100`)} ${chalk.dim(`(${aiContentResult.pagesLikelyAI} pages flagged, ${aiContentResult.pagesLikelyHuman} human)`)}`);
  }

  // Platform readiness
  if (platformResult) {
    console.log('');
    console.log(chalk.bold('  AI Platform Readiness:'));
    for (const p of platformResult.platforms) {
      const pColor = p.score >= 70 ? 'green' : p.score >= 40 ? 'yellow' : 'red';
      console.log(`    ${p.displayName.padEnd(22)} ${chalk[pColor].bold(`${p.score}/100`)} (${p.grade})`);
    }
  }
}

// ============================================================================
// CHECK implementation (new visibility checker)
// ============================================================================

async function runCheck(rawUrl: string, opts: Record<string, unknown>): Promise<void> {
  // Load .env for API keys
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv optional
  }

  // Validate and normalize URL
  let url = rawUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  url = ensureHttps(url);

  if (!isValidHttpUrl(url)) {
    console.error(chalk.red('Invalid URL. Please provide a valid HTTP/HTTPS URL.'));
    process.exit(1);
  }

  const domain = extractDomain(url);

  const options: CheckOptions = {
    maxPages: parseInt(opts.maxPages as string, 10) || 20,
    concurrency: parseInt(opts.concurrency as string, 10) || 3,
    verbose: !!opts.verbose,
    queryCount: parseInt(opts.queries as string, 10) || 10,
    engines: opts.engines ? (opts.engines as string).split(',').map((e) => e.trim()) : [],
    queryFile: (opts.queryFile as string) || null,
    outputDir: join(opts.output as string || './geo-output', domain),
    region: (opts.region as string) || null,
  };

  // Import checker modules
  const { extractBusinessContext, generateQueries, generatePageQueries } = await import('./checker/query-generator.js');
  const { detectCitation } = await import('./checker/citation-detector.js');
  const { scoreEngines, calculateOverallScore, scoreToGrade } = await import('./checker/visibility-scorer.js');
  const { generateVisibilityHtml, generateVisibilityJson } = await import('./checker/visibility-report.js');
  const { OpenAIClient } = await import('./checker/llm-clients/openai-client.js');
  const { PerplexityClient } = await import('./checker/llm-clients/perplexity-client.js');
  const { GeminiClient } = await import('./checker/llm-clients/gemini-client.js');
  const { ClaudeClient } = await import('./checker/llm-clients/claude-client.js');
  // Initialize clients
  const allClients = [
    new OpenAIClient(),
    new PerplexityClient(),
    new GeminiClient(),
    new ClaudeClient(),
  ];

  // Filter to requested engines (or all available)
  let clients = options.engines.length > 0
    ? allClients.filter((c) => options.engines.includes(c.name))
    : allClients;

  clients = clients.filter((c) => c.isAvailable());

  if (clients.length === 0) {
    console.error('');
    console.error(chalk.red('  No API keys found. Set at least one of these environment variables:'));
    console.error('');
    console.error(`    ${chalk.yellow('OPENAI_API_KEY')}      — OpenAI (gpt-4o-mini with web search)`);
    console.error(`    ${chalk.yellow('PERPLEXITY_API_KEY')}  — Perplexity (sonar with citations)`);
    console.error(`    ${chalk.yellow('GOOGLE_API_KEY')}      — Google Gemini (with grounding)`);
    console.error(`    ${chalk.yellow('ANTHROPIC_API_KEY')}   — Anthropic Claude (with web search)`);
    console.error('');
    console.error(chalk.dim('  You can also create a .env file in the project root.'));
    console.error('');
    process.exit(1);
  }

  // Header
  console.log('');
  console.log(chalk.bold.hex('#6366f1')('  geo-scraper check'));
  console.log(chalk.dim('  AI Visibility Checker'));
  console.log('');
  console.log(`  ${chalk.dim('Target:')}   ${chalk.white(url)}`);
  console.log(`  ${chalk.dim('Engines:')}  ${chalk.white(clients.map((c) => c.name).join(', '))}`);
  console.log(`  ${chalk.dim('Queries:')}  ${chalk.white(String(options.queryCount))}`);
  if (options.region) {
    console.log(`  ${chalk.dim('Region:')}   ${chalk.white(options.region)}`);
  }
  console.log('');

  // Stage 1: Crawl
  const crawlSpinner = ora({ text: 'Crawling site...', color: 'cyan' }).start();
  const crawlResult = await crawlSite(url, {
    maxPages: options.maxPages,
    concurrency: options.concurrency,
    jsRender: false,
    verbose: options.verbose,
  }, (msg: string) => {
    crawlSpinner.text = msg;
  });
  crawlSpinner.succeed(
    `Crawled ${chalk.bold(String(crawlResult.crawlStats.totalPages))} pages in ${(crawlResult.crawlStats.totalTime / 1000).toFixed(1)}s`
  );

  // Stage 2: Extract business context
  const contextSpinner = ora({ text: 'Extracting business context...', color: 'cyan' }).start();
  const businessContext = extractBusinessContext(crawlResult);
  if (options.region) {
    businessContext.location = options.region;
  }
  contextSpinner.succeed('Business context extracted');

  if (options.verbose) {
    console.log('');
    console.log(chalk.bold('  Business Context:'));
    console.log(`    ${chalk.dim('Name:')}     ${chalk.white(businessContext.name)}`);
    console.log(`    ${chalk.dim('Industry:')} ${chalk.white(businessContext.industry)}`);
    console.log(`    ${chalk.dim('Location:')} ${chalk.white(businessContext.location || 'N/A')}`);
    console.log(`    ${chalk.dim('Services:')} ${chalk.white(businessContext.services.join(', ') || 'N/A')}`);
    console.log(`    ${chalk.dim('Language:')} ${chalk.white(businessContext.language)}`);
    console.log('');
  }

  // Stage 3: Generate queries
  const querySpinner = ora({ text: 'Generating search queries...', color: 'cyan' }).start();

  let queries: SearchQuery[];

  // Determine which API to use for query generation (prefer cheapest available)
  let genApiKey: string | null = null;
  let genProvider: 'openai' | 'anthropic' | 'gemini' | null = null;
  if (process.env.OPENAI_API_KEY) { genApiKey = process.env.OPENAI_API_KEY; genProvider = 'openai'; }
  else if (process.env.GOOGLE_API_KEY) { genApiKey = process.env.GOOGLE_API_KEY; genProvider = 'gemini'; }
  else if (process.env.ANTHROPIC_API_KEY) { genApiKey = process.env.ANTHROPIC_API_KEY; genProvider = 'anthropic'; }

  if (options.queryFile) {
    // Load custom queries from file
    const fileContent = await readFile(options.queryFile, 'utf-8');
    queries = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((query) => ({
        query,
        category: 'generic_faq' as const,
        intent: 'Custom query from file',
      }));
  } else {
    queries = await generateQueries(businessContext, options.queryCount, genApiKey, genProvider);
  }

  const siteWideCount = queries.length;

  // Generate page-specific queries (additive, on top of site-wide)
  const pageQueries = await generatePageQueries(crawlResult.pages, businessContext, genApiKey, genProvider);
  queries.push(...pageQueries);

  querySpinner.succeed(
    `Generated ${chalk.bold(String(queries.length))} search queries` +
    (pageQueries.length > 0 ? ` (${siteWideCount} site-wide + ${pageQueries.length} page-specific)` : '')
  );

  if (options.verbose) {
    console.log('');
    console.log(chalk.bold('  Queries:'));
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const targetInfo = q.targetPage ? ` ${chalk.dim('→')} ${chalk.dim(q.targetPage)}` : '';
      console.log(`    ${chalk.dim(`${i + 1}.`)} ${chalk.dim(`[${q.category}]`.padEnd(14))} ${chalk.white(q.query)}${targetInfo}`);
    }
    console.log('');
  }

  // Stage 4: Run queries against all engines
  const searchSpinner = ora({ text: 'Running queries against AI engines...', color: 'cyan' }).start();
  const allResponses: import('./crawler/page-data.js').LLMResponse[] = [];

  let completed = 0;
  const total = queries.length * clients.length;

  // Run queries per engine in parallel, queries within each engine sequentially to avoid rate limits
  const enginePromises = clients.map(async (client) => {
    const responses: import('./crawler/page-data.js').LLMResponse[] = [];
    for (const query of queries) {
      searchSpinner.text = `Querying ${client.name}: "${query.query.slice(0, 40)}..." (${++completed}/${total})`;
      const response = await client.query(query.query);

      // Run citation detection
      const detection = detectCitation(
        response.response,
        response.citations,
        domain,
        businessContext.name,
      );
      response.mentioned = detection.mentioned;
      response.mentionType = detection.mentionType;
      response.mentionContext = detection.context;

      responses.push(response);
    }
    return responses;
  });

  const engineResults = await Promise.all(enginePromises);
  for (const responses of engineResults) {
    allResponses.push(...responses);
  }

  const errors = allResponses.filter((r) => r.error).length;
  searchSpinner.succeed(
    `Completed ${chalk.bold(String(total))} queries across ${chalk.bold(String(clients.length))} engines` +
    (errors > 0 ? chalk.yellow(` (${errors} errors)`) : '')
  );

  // Stage 5: Score results
  const scoreSpinner = ora({ text: 'Calculating visibility scores...', color: 'cyan' }).start();
  const engineScores = scoreEngines(allResponses);
  const overallScore = calculateOverallScore(engineScores);
  const grade = scoreToGrade(overallScore);
  scoreSpinner.succeed('Scoring complete');

  // Print results table
  console.log('');
  console.log(chalk.bold('  Results:'));
  console.log('');
  console.log(`    ${chalk.dim('Engine'.padEnd(14))} ${chalk.dim('Cited'.padStart(7))} ${chalk.dim('Mentioned'.padStart(11))} ${chalk.dim('Absent'.padStart(8))} ${chalk.dim('Score'.padStart(8))}`);
  console.log(`    ${'─'.repeat(14)} ${'─'.repeat(7)} ${'─'.repeat(11)} ${'─'.repeat(8)} ${'─'.repeat(8)}`);

  const engineNames: Record<string, string> = { openai: 'OpenAI', perplexity: 'Perplexity', gemini: 'Gemini', claude: 'Claude' };
  for (const es of engineScores) {
    const name = (engineNames[es.engine] || es.engine).padEnd(14);
    const cited = chalk.green(String(es.cited).padStart(7));
    const mentioned = chalk.yellow(String(es.mentioned).padStart(11));
    const absent = chalk.red(String(es.absent).padStart(8));
    const scoreColor = es.score >= 70 ? 'green' : es.score >= 40 ? 'yellow' : 'red';
    const scoreStr = chalk[scoreColor](`${es.score}/100`.padStart(8));
    console.log(`    ${name} ${cited} ${mentioned} ${absent} ${scoreStr}`);
  }

  console.log('');
  const overallColor = overallScore >= 70 ? 'green' : overallScore >= 40 ? 'yellow' : 'red';
  console.log(`  ${chalk.bold('Overall Visibility:')} ${chalk[overallColor].bold(`${overallScore}/100`)} (Grade: ${chalk[overallColor].bold(grade)})`);

  // Stage 6: Generate reports
  const reportSpinner = ora({ text: 'Generating reports...', color: 'cyan' }).start();

  const result: import('./crawler/page-data.js').VisibilityResult = {
    site: { url, domain, name: businessContext.name },
    businessContext,
    queries,
    responses: allResponses,
    engineScores,
    overallScore,
    grade,
    generated: new Date().toISOString(),
  };

  await mkdir(options.outputDir, { recursive: true });
  await writeFile(join(options.outputDir, 'visibility-report.html'), generateVisibilityHtml(result), 'utf-8');
  await writeFile(join(options.outputDir, 'visibility.json'), generateVisibilityJson(result), 'utf-8');

  reportSpinner.succeed('Reports generated');

  console.log('');
  console.log(`  ${chalk.dim('Output directory:')} ${chalk.white(options.outputDir)}`);
  console.log(`  ${chalk.dim('Open report:')}      ${chalk.white(join(options.outputDir, 'visibility-report.html'))}`);
  console.log('');
}
