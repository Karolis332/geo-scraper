/**
 * Express server — REST API + SSE progress + static serving for the dashboard.
 */

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readdir, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { JobDatabase } from './database.js';
import { runScanJob, runCheckJob, jobEvents, type ProgressEvent } from './job-runner.js';
import { extractDomain, isValidHttpUrl, ensureHttps } from '../utils/url-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type IdParams = { id: string };

export function createServer(port: number, dbPath: string) {
  const db = new JobDatabase(dbPath);
  const app = express();

  app.use(express.json());

  // Static files — serve src/web/public/ in dev, dist/web/public/ in prod
  const publicDir = join(__dirname, 'public');
  app.use(express.static(publicDir));

  // ── POST /api/scan ────────────────────────────────────────────────────
  app.post('/api/scan', (req: Request, res: Response) => {
    const { url: rawUrl, maxPages = 50, concurrency = 3 } = req.body as {
      url?: string; maxPages?: number; concurrency?: number;
    };

    if (!rawUrl) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    let url = rawUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    url = ensureHttps(url);

    if (!isValidHttpUrl(url)) {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    const domain = extractDomain(url);
    const jobId = randomUUID();
    const outputDir = resolve('./geo-output', domain);

    db.createJob({ id: jobId, url, domain, type: 'scan', output_dir: outputDir });

    // Fire and forget
    runScanJob(db, jobId, url, { maxPages, concurrency, outputDir });

    res.json({ jobId, url, domain });
  });

  // ── POST /api/check ───────────────────────────────────────────────────
  app.post('/api/check', (req: Request, res: Response) => {
    const { url: rawUrl, maxPages = 20, concurrency = 3, queryCount = 10 } = req.body as {
      url?: string; maxPages?: number; concurrency?: number; queryCount?: number;
    };

    if (!rawUrl) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    let url = rawUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    url = ensureHttps(url);

    if (!isValidHttpUrl(url)) {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    const domain = extractDomain(url);
    const jobId = randomUUID();
    const outputDir = resolve('./geo-output', domain);

    db.createJob({ id: jobId, url, domain, type: 'check', output_dir: outputDir });

    // Fire and forget
    runCheckJob(db, jobId, url, { maxPages, concurrency, queryCount, outputDir });

    res.json({ jobId, url, domain });
  });

  // ── GET /api/jobs ─────────────────────────────────────────────────────
  app.get('/api/jobs', (_req: Request, res: Response) => {
    res.json(db.listJobs());
  });

  // ── GET /api/jobs/:id ─────────────────────────────────────────────────
  app.get('/api/jobs/:id', (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const parsed = { ...job, result: job.result_json ? JSON.parse(job.result_json) : null };
    res.json(parsed);
  });

  // ── GET /api/jobs/:id/progress — SSE stream ───────────────────────────
  app.get('/api/jobs/:id/progress', (req: Request<IdParams>, res: Response) => {
    const jobId = req.params.id;
    const job = db.getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // If already done, send final event and close
    if (job.status === 'completed' || job.status === 'failed') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const event = job.status === 'completed'
        ? { stage: 'done', message: 'Job complete', percent: 100 }
        : { stage: 'error', message: job.error || 'Job failed', percent: 100 };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const onProgress = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.stage === 'done' || event.stage === 'error') {
        cleanup();
        res.end();
      }
    };

    jobEvents.on(jobId, onProgress);

    const cleanup = () => {
      jobEvents.removeListener(jobId, onProgress);
    };

    req.on('close', cleanup);
  });

  // ── GET /api/jobs/:id/files — list generated files ────────────────────
  app.get('/api/jobs/:id/files', async (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (!job.output_dir) {
      res.json([]);
      return;
    }

    try {
      const files = await listFilesRecursive(job.output_dir, job.output_dir);
      res.json(files);
    } catch {
      res.json([]);
    }
  });

  // ── GET /api/jobs/:id/files/* — serve a specific generated file ────────
  app.get('/api/jobs/:id/files/{*filepath}', async (req: Request<{ id: string; filepath: string[] }>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job || !job.output_dir) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // path-to-regexp v8 returns wildcard as array of segments
    const segments = req.params.filepath;
    const filePath = Array.isArray(segments) ? segments.join('/') : String(segments);
    if (!filePath) {
      res.status(400).json({ error: 'File path required' });
      return;
    }
    const fullPath = resolve(job.output_dir, filePath);

    // Prevent path traversal
    if (!fullPath.startsWith(resolve(job.output_dir))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const content = await readFile(fullPath, 'utf-8');
      if (fullPath.endsWith('.html')) res.type('html');
      else if (fullPath.endsWith('.json')) res.type('json');
      else if (fullPath.endsWith('.xml')) res.type('xml');
      else res.type('text');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // ── GET /api/jobs/:id/report — serve the HTML report ──────────────────
  app.get('/api/jobs/:id/report', async (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job || !job.output_dir) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const reportFile = job.type === 'scan' ? 'audit-report.html' : 'visibility-report.html';
    const fullPath = join(job.output_dir, reportFile);

    try {
      const content = await readFile(fullPath, 'utf-8');
      res.type('html').send(content);
    } catch {
      res.status(404).json({ error: 'Report not found' });
    }
  });

  // ── GET /api/jobs/:id/comparison — serve the comparison report ────────
  app.get('/api/jobs/:id/comparison', async (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job || !job.output_dir) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const fullPath = join(job.output_dir, 'comparison-report.html');

    try {
      const content = await readFile(fullPath, 'utf-8');
      res.type('html').send(content);
    } catch {
      res.status(404).json({ error: 'Comparison report not found' });
    }
  });

  // ── DELETE /api/jobs/:id ──────────────────────────────────────────────
  app.delete('/api/jobs/:id', async (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.output_dir) {
      try {
        await rm(job.output_dir, { recursive: true, force: true });
      } catch {
        // Ignore file deletion errors
      }
    }

    db.deleteJob(req.params.id);
    res.json({ deleted: true });
  });

  // ── Fallback to index.html for SPA ────────────────────────────────────
  app.get('/{*path}', (_req: Request, res: Response) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  const server = app.listen(port, () => {
    // Server started — caller logs the message
  });

  return { app, server, db };
}

async function listFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      files.push(fullPath.slice(baseDir.length + 1).replace(/\\/g, '/'));
    }
  }

  return files;
}
