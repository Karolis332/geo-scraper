/**
 * Async job runner — reuses existing crawl/audit/generate/check pipeline
 * with progress streaming via EventEmitter.
 */

import { EventEmitter } from 'node:events';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { crawlSite } from '../crawler/site-crawler.js';
import { auditSite } from '../analyzer/geo-auditor.js';
import { generateLlmsTxt } from '../generators/llms-txt.js';
import { generateLlmsFullTxt } from '../generators/llms-full-txt.js';
import { generateRobotsTxt } from '../generators/robots-txt.js';
import { generateSitemapXml } from '../generators/sitemap-xml.js';
import { generateStructuredData } from '../generators/structured-data.js';
import { generateAiTxt, generateAiJson } from '../generators/ai-txt.js';
import { generateSecurityTxt } from '../generators/security-txt.js';
import { generateTdmrepJson } from '../generators/tdmrep-json.js';
import { generateHumansTxt } from '../generators/humans-txt.js';
import { generateManifestJson } from '../generators/manifest-json.js';
import { generateAuditReportHtml, generateSummaryJson } from '../generators/audit-report.js';
import { generateProjectedAudit, generateComparisonHtml } from '../generators/comparison-report.js';

import type { JobDatabase } from './database.js';
import type {
  GeneratorOptions,
  SiteCrawlResult,
  LLMResponse,
  VisibilityResult,
  SearchQuery,
} from '../crawler/page-data.js';

export interface ProgressEvent {
  stage: string;
  message: string;
  percent: number;
}

/** Global event emitter — listeners keyed by jobId */
export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100);

function emit(jobId: string, stage: string, message: string, percent: number): void {
  jobEvents.emit(jobId, { stage, message, percent } as ProgressEvent);
}

// ============================================================================
// SCAN JOB
// ============================================================================

export async function runScanJob(
  db: JobDatabase,
  jobId: string,
  url: string,
  opts: { maxPages: number; concurrency: number; outputDir: string },
): Promise<void> {
  try {
    db.updateJobRunning(jobId);

    // Stage 1: Crawl
    emit(jobId, 'crawl', 'Crawling site...', 0);
    const crawlResult = await crawlSite(url, {
      maxPages: opts.maxPages,
      concurrency: opts.concurrency,
      jsRender: false,
      verbose: false,
    }, (msg: string) => {
      emit(jobId, 'crawl', msg, 10);
    });
    emit(jobId, 'crawl', `Crawled ${crawlResult.crawlStats.totalPages} pages`, 30);

    // Stage 2: Audit
    emit(jobId, 'audit', 'Auditing GEO compliance...', 35);
    const audit = auditSite(crawlResult);
    emit(jobId, 'audit', `Score: ${audit.overallScore}/100 (${audit.grade})`, 50);

    // Stage 3: Generate files
    emit(jobId, 'generate', 'Generating GEO files...', 55);

    const generatorOpts: GeneratorOptions = {
      allowTraining: true,
      denyTraining: false,
      contactEmail: null,
      outputDir: opts.outputDir,
    };

    await mkdir(opts.outputDir, { recursive: true });
    await mkdir(join(opts.outputDir, '.well-known'), { recursive: true });
    await mkdir(join(opts.outputDir, 'structured-data'), { recursive: true });

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

    const structuredData = generateStructuredData(crawlResult);
    files.push({
      path: join('structured-data', '_site.json'),
      content: JSON.stringify(structuredData.siteLevel, null, 2) + '\n',
    });
    for (const [slug, schemas] of structuredData.perPage) {
      files.push({
        path: join('structured-data', `${slug}.json`),
        content: JSON.stringify(schemas, null, 2) + '\n',
      });
    }

    files.push({ path: 'audit-report.html', content: generateAuditReportHtml(audit, crawlResult) });
    files.push({ path: 'summary.json', content: generateSummaryJson(audit, crawlResult) });

    const projected = generateProjectedAudit(audit);
    files.push({ path: 'comparison-report.html', content: generateComparisonHtml(audit, projected, crawlResult) });

    emit(jobId, 'generate', 'Writing files...', 80);
    for (const file of files) {
      await writeFile(join(opts.outputDir, file.path), file.content, 'utf-8');
    }
    emit(jobId, 'generate', `Generated ${files.length} files`, 95);

    // Build result JSON for storage
    const resultJson = JSON.stringify({
      type: 'scan',
      score: audit.overallScore,
      grade: audit.grade,
      pagesScanned: crawlResult.crawlStats.totalPages,
      filesGenerated: files.length,
      auditItems: audit.items,
      summary: audit.summary,
      domain: crawlResult.domain,
    });

    db.updateJobCompleted(jobId, audit.overallScore, audit.grade, resultJson);
    emit(jobId, 'done', 'Scan complete', 100);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.updateJobFailed(jobId, message);
    emit(jobId, 'error', message, 100);
  }
}

// ============================================================================
// CHECK JOB
// ============================================================================

export async function runCheckJob(
  db: JobDatabase,
  jobId: string,
  url: string,
  opts: { maxPages: number; concurrency: number; queryCount: number; outputDir: string },
): Promise<void> {
  try {
    db.updateJobRunning(jobId);

    // Load .env for API keys
    try {
      const { config } = await import('dotenv');
      config();
    } catch {
      // dotenv optional
    }

    // Dynamic imports for checker modules
    const { extractBusinessContext, generateQueries } = await import('../checker/query-generator.js');
    const { detectCitation } = await import('../checker/citation-detector.js');
    const { scoreEngines, calculateOverallScore, scoreToGrade } = await import('../checker/visibility-scorer.js');
    const { generateVisibilityHtml, generateVisibilityJson } = await import('../checker/visibility-report.js');
    const { OpenAIClient } = await import('../checker/llm-clients/openai-client.js');
    const { PerplexityClient } = await import('../checker/llm-clients/perplexity-client.js');
    const { GeminiClient } = await import('../checker/llm-clients/gemini-client.js');
    const { ClaudeClient } = await import('../checker/llm-clients/claude-client.js');

    const { extractDomain } = await import('../utils/url-utils.js');
    const domain = extractDomain(url);

    // Initialize clients
    const allClients = [
      new OpenAIClient(),
      new PerplexityClient(),
      new GeminiClient(),
      new ClaudeClient(),
    ];
    const clients = allClients.filter((c) => c.isAvailable());

    if (clients.length === 0) {
      throw new Error('No API keys found. Set at least one: OPENAI_API_KEY, PERPLEXITY_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY');
    }

    // Stage 1: Crawl
    emit(jobId, 'crawl', 'Crawling site...', 0);
    const crawlResult = await crawlSite(url, {
      maxPages: opts.maxPages,
      concurrency: opts.concurrency,
      jsRender: false,
      verbose: false,
    }, (msg: string) => {
      emit(jobId, 'crawl', msg, 5);
    });
    emit(jobId, 'crawl', `Crawled ${crawlResult.crawlStats.totalPages} pages`, 15);

    // Stage 2: Extract business context
    emit(jobId, 'context', 'Extracting business context...', 20);
    const businessContext = extractBusinessContext(crawlResult);
    emit(jobId, 'context', `Context: ${businessContext.name}`, 25);

    // Stage 3: Generate queries
    emit(jobId, 'queries', 'Generating search queries...', 30);
    let genApiKey: string | null = null;
    let genProvider: 'openai' | 'anthropic' | 'gemini' | null = null;
    if (process.env.OPENAI_API_KEY) { genApiKey = process.env.OPENAI_API_KEY; genProvider = 'openai'; }
    else if (process.env.GOOGLE_API_KEY) { genApiKey = process.env.GOOGLE_API_KEY; genProvider = 'gemini'; }
    else if (process.env.ANTHROPIC_API_KEY) { genApiKey = process.env.ANTHROPIC_API_KEY; genProvider = 'anthropic'; }

    const queries = await generateQueries(businessContext, opts.queryCount, genApiKey, genProvider);
    emit(jobId, 'queries', `Generated ${queries.length} queries`, 35);

    // Stage 4: Run queries
    emit(jobId, 'search', 'Querying AI engines...', 40);
    const allResponses: LLMResponse[] = [];
    let completed = 0;
    const total = queries.length * clients.length;

    const enginePromises = clients.map(async (client) => {
      const responses: LLMResponse[] = [];
      for (const query of queries) {
        completed++;
        const pct = 40 + Math.round((completed / total) * 40);
        emit(jobId, 'search', `${client.name}: "${query.query.slice(0, 40)}..." (${completed}/${total})`, pct);

        const response = await client.query(query.query);
        const detection = detectCitation(response.response, response.citations, domain, businessContext.name);
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

    // Stage 5: Score
    emit(jobId, 'scoring', 'Calculating visibility scores...', 85);
    const engineScores = scoreEngines(allResponses);
    const overallScore = calculateOverallScore(engineScores);
    const grade = scoreToGrade(overallScore);

    // Stage 6: Generate reports
    emit(jobId, 'report', 'Generating reports...', 90);

    const result: VisibilityResult = {
      site: { url, domain, name: businessContext.name },
      businessContext,
      queries,
      responses: allResponses,
      engineScores,
      overallScore,
      grade,
      generated: new Date().toISOString(),
    };

    await mkdir(opts.outputDir, { recursive: true });
    await writeFile(join(opts.outputDir, 'visibility-report.html'), generateVisibilityHtml(result), 'utf-8');
    await writeFile(join(opts.outputDir, 'visibility.json'), generateVisibilityJson(result), 'utf-8');

    // Build result JSON for storage
    const resultJson = JSON.stringify({
      type: 'check',
      score: overallScore,
      grade,
      engineScores,
      queriesRun: queries.length,
      enginesUsed: clients.map((c) => c.name),
      domain,
    });

    db.updateJobCompleted(jobId, overallScore, grade, resultJson);
    emit(jobId, 'done', 'Check complete', 100);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.updateJobFailed(jobId, message);
    emit(jobId, 'error', message, 100);
  }
}
