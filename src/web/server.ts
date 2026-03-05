/**
 * Express server — REST API + auth + activity logging + static UI pages.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readdir, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { JobDatabase, type DomainLifecycleRow, type JobRow, type SafeUserRow, type UserRole } from './database.js';
import { runScanJob, runCheckJob, jobEvents, type ProgressEvent } from './job-runner.js';
import { generateScanDiff } from './diff-engine.js';
import { startScheduler, stopScheduler, calculateNextRun } from './scheduler.js';
import { extractDomain, isValidHttpUrl, ensureHttps } from '../utils/url-utils.js';
import { calculateGeoServiceScore } from '../analyzer/geo-service-score.js';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  parseCookieHeader,
  verifyPassword,
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSION_COOKIE_NAME = 'geo_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type IdParams = { id: string };

type AuthUserContext = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  sessionId: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUserContext;
    }
  }
}

export function createServer(port: number, dbPath: string, host = '127.0.0.1') {
  const db = new JobDatabase(dbPath);
  db.purgeExpiredSessions();
  ensureBootstrapUsers(db);

  const app = express();
  app.use(express.json());

  // Static files live in src/web/public/ during dev and dist/web/public/ after build.
  const publicDir = join(__dirname, 'public');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const token = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE_NAME];
    if (!token) {
      next();
      return;
    }

    const session = db.getAuthSessionByTokenHash(hashSessionToken(token));
    if (!session) {
      res.setHeader('Set-Cookie', buildClearSessionCookie(isSecureRequest(req)));
      next();
      return;
    }

    const expiresAt = Date.parse(session.session_expires_at);
    if (session.session_revoked_at || session.active !== 1 || Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      db.revokeSession(session.session_id);
      res.setHeader('Set-Cookie', buildClearSessionCookie(isSecureRequest(req)));
      next();
      return;
    }

    req.authUser = {
      id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      role: session.role,
      sessionId: session.session_id,
    };
    db.touchSession(session.session_id);
    next();
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
      const user = req.authUser;
      db.createActivityLog({
        actor_user_id: user?.id ?? null,
        actor_username: user?.username ?? null,
        actor_role: user?.role ?? null,
        action: 'api.request',
        method: req.method,
        path: req.path,
        status_code: res.statusCode,
        target_type: null,
        target_id: null,
        job_id: null,
        details_json: JSON.stringify({ durationMs: Date.now() - started }),
      });
    });
    next();
  });

  // ── Auth API ─────────────────────────────────────────────────────────

  app.get('/api/auth/me', (req: Request, res: Response) => {
    if (!req.authUser) {
      res.status(200).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, user: toClientUser(req.authUser) });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username: rawUsername, password } = req.body as { username?: string; password?: string };
    const username = (rawUsername || '').trim().toLowerCase();

    if (!username || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const user = db.getUserByUsername(username);
    const valid = !!user && user.active === 1 && verifyPassword(password, user.password_hash);

    if (!valid || !user) {
      db.createActivityLog({
        actor_user_id: null,
        actor_username: username || null,
        actor_role: null,
        action: 'auth.login.failed',
        method: 'POST',
        path: '/api/auth/login',
        status_code: 401,
        target_type: 'user',
        target_id: user?.id ?? null,
        job_id: null,
        details_json: JSON.stringify({ reason: 'invalid_credentials_or_inactive' }),
      });
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    db.createSession({
      id: randomUUID(),
      user_id: user.id,
      token_hash: hashSessionToken(token),
      expires_at: expiresAt,
      ip: extractIp(req),
      user_agent: req.headers['user-agent'] || null,
    });

    db.touchUserLogin(user.id);

    res.setHeader('Set-Cookie', buildSessionCookie(token, SESSION_TTL_SECONDS, isSecureRequest(req)));

    db.createActivityLog({
      actor_user_id: user.id,
      actor_username: user.username,
      actor_role: user.role,
      action: 'auth.login.success',
      method: 'POST',
      path: '/api/auth/login',
      status_code: 200,
      target_type: 'user',
      target_id: user.id,
      job_id: null,
      details_json: null,
    });

    res.json({ user: toClientUser(user) });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const user = req.authUser;
    if (user) {
      db.revokeSession(user.sessionId);
      db.createActivityLog({
        actor_user_id: user.id,
        actor_username: user.username,
        actor_role: user.role,
        action: 'auth.logout',
        method: 'POST',
        path: '/api/auth/logout',
        status_code: 200,
        target_type: 'session',
        target_id: user.sessionId,
        job_id: null,
        details_json: null,
      });
    }

    res.setHeader('Set-Cookie', buildClearSessionCookie(isSecureRequest(req)));
    res.json({ loggedOut: true });
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/auth/login' || req.path === '/auth/me') {
      next();
      return;
    }
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    next();
  });

  // ── Employee Sales API ───────────────────────────────────────────────

  app.get('/api/sales/playbooks', (req: Request, res: Response) => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const completedScans = db.listCompletedJobsByType('scan');
    const latestByDomain = new Map<string, typeof completedScans[number]>();
    const allowedDomains = user.role === 'admin'
      ? null
      : new Set(db.listSalesDomainsForUser(user.id));

    for (const scan of completedScans) {
      if (allowedDomains && !allowedDomains.has(scan.domain)) {
        continue;
      }
      if (!latestByDomain.has(scan.domain)) {
        latestByDomain.set(scan.domain, scan);
      }
    }

    const playbooks = [...latestByDomain.values()]
      .map((scan) => buildSalesPlaybook(db, scan))
      .filter((item): item is SalesPlaybook => item !== null)
      .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));

    res.json({ playbooks });
  });

  // ── POST /api/sales/scan — salesperson initiated scan for own domains ──
  app.post('/api/sales/scan', (req: Request, res: Response) => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { url: rawUrl, maxPages = 30, concurrency = 2 } = req.body as {
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

    if (user.role !== 'admin') {
      db.upsertSalesDomainAccess({
        user_id: user.id,
        domain,
        url,
        created_by_user_id: user.id,
      });
    }

    const jobId = randomUUID();
    const outputDir = resolve('./geo-output', domain);

    db.createJob({ id: jobId, url, domain, type: 'scan', output_dir: outputDir, created_by: user.id });
    db.createActivityLog({
      actor_user_id: user.id,
      actor_username: user.username,
      actor_role: user.role,
      action: 'job.scan.created',
      method: 'POST',
      path: '/api/sales/scan',
      status_code: 200,
      target_type: 'job',
      target_id: jobId,
      job_id: jobId,
      details_json: JSON.stringify({ domain, maxPages, concurrency, salesInitiated: true }),
    });

    runScanJob(db, jobId, url, {
      maxPages,
      concurrency,
      outputDir,
      onProgress: (event) => {
        db.createActivityLog({
          actor_user_id: user.id,
          actor_username: user.username,
          actor_role: user.role,
          action: 'job.progress',
          method: 'JOB',
          path: event.stage,
          status_code: null,
          target_type: 'job',
          target_id: jobId,
          job_id: jobId,
          details_json: JSON.stringify(event),
        });
      },
    });

    res.json({ jobId, url, domain });
  });

  // ── POST /api/scan ────────────────────────────────────────────────────
  app.post('/api/scan', requireAdmin, (req: Request, res: Response) => {
    const user = req.authUser!;
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

    db.createJob({ id: jobId, url, domain, type: 'scan', output_dir: outputDir, created_by: user.id });
    db.createActivityLog({
      actor_user_id: user.id,
      actor_username: user.username,
      actor_role: user.role,
      action: 'job.scan.created',
      method: 'POST',
      path: '/api/scan',
      status_code: 200,
      target_type: 'job',
      target_id: jobId,
      job_id: jobId,
      details_json: JSON.stringify({ domain, maxPages, concurrency }),
    });

    // Fire and forget
    runScanJob(db, jobId, url, {
      maxPages,
      concurrency,
      outputDir,
      onProgress: (event) => {
        db.createActivityLog({
          actor_user_id: user.id,
          actor_username: user.username,
          actor_role: user.role,
          action: 'job.progress',
          method: 'JOB',
          path: event.stage,
          status_code: null,
          target_type: 'job',
          target_id: jobId,
          job_id: jobId,
          details_json: JSON.stringify(event),
        });
      },
    });

    res.json({ jobId, url, domain });
  });

  // ── POST /api/check ───────────────────────────────────────────────────
  app.post('/api/check', requireAdmin, (req: Request, res: Response) => {
    const user = req.authUser!;
    const { url: rawUrl, maxPages = 20, concurrency = 3, queryCount = 10, region = null } = req.body as {
      url?: string; maxPages?: number; concurrency?: number; queryCount?: number; region?: string | null;
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

    db.createJob({ id: jobId, url, domain, type: 'check', output_dir: outputDir, created_by: user.id });
    db.createActivityLog({
      actor_user_id: user.id,
      actor_username: user.username,
      actor_role: user.role,
      action: 'job.check.created',
      method: 'POST',
      path: '/api/check',
      status_code: 200,
      target_type: 'job',
      target_id: jobId,
      job_id: jobId,
      details_json: JSON.stringify({ domain, maxPages, concurrency, queryCount, region }),
    });

    // Fire and forget
    runCheckJob(db, jobId, url, {
      maxPages,
      concurrency,
      queryCount,
      outputDir,
      region,
      onProgress: (event) => {
        db.createActivityLog({
          actor_user_id: user.id,
          actor_username: user.username,
          actor_role: user.role,
          action: 'job.progress',
          method: 'JOB',
          path: event.stage,
          status_code: null,
          target_type: 'job',
          target_id: jobId,
          job_id: jobId,
          details_json: JSON.stringify(event),
        });
      },
    });

    res.json({ jobId, url, domain });
  });

  // ── GET /api/jobs ─────────────────────────────────────────────────────
  app.get('/api/jobs', (req: Request, res: Response) => {
    const user = req.authUser!;
    const jobs = db.listJobs();

    if (user.role === 'admin') {
      res.json(jobs);
      return;
    }

    const filtered = jobs.filter((job) => canUserAccessJob(db, user, job));
    res.json(filtered);
  });

  // ── GET /api/jobs/:id ─────────────────────────────────────────────────
  app.get('/api/jobs/:id', (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (!canUserAccessJob(db, req.authUser!, job)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const lifecycle = db.getDomainLifecycle(job.domain);
    const parsed = {
      ...job,
      result: job.result_json ? JSON.parse(job.result_json) : null,
      shipment: lifecycle && lifecycle.shipped === 1 ? lifecycle : null,
    };
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

    if (!canUserAccessJob(db, req.authUser!, job)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // If already done, send final event and close.
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
    if (!canUserAccessJob(db, req.authUser!, job)) {
      res.status(403).json({ error: 'Forbidden' });
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
    if (!canUserAccessJob(db, req.authUser!, job)) {
      res.status(403).json({ error: 'Forbidden' });
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
    if (!canUserAccessJob(db, req.authUser!, job)) {
      res.status(403).json({ error: 'Forbidden' });
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
    if (!canUserAccessJob(db, req.authUser!, job)) {
      res.status(403).json({ error: 'Forbidden' });
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

  // ── POST /api/jobs/:id/ship — mark scan as deployed/shipped ───────────
  app.post('/api/jobs/:id/ship', requireAdmin, (req: Request<IdParams>, res: Response) => {
    const job = db.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.type !== 'scan' || job.status !== 'completed') {
      res.status(400).json({ error: 'Only completed scan jobs can be marked as shipped' });
      return;
    }

    const {
      enableWeeklyDiagnostics = true,
      maxPages = 50,
      concurrency = 3,
    } = req.body as {
      enableWeeklyDiagnostics?: boolean;
      maxPages?: number;
      concurrency?: number;
    };

    const existingLifecycle = db.getDomainLifecycle(job.domain);
    let weeklyScheduleId: string | null = existingLifecycle?.weekly_schedule_id ?? null;
    let weeklySchedule = weeklyScheduleId ? db.getSchedule(weeklyScheduleId) : undefined;

    if (enableWeeklyDiagnostics) {
      if (weeklySchedule) {
        db.updateSchedule(weeklySchedule.id, {
          url: job.url,
          frequency: 'weekly',
          enabled: 1,
          max_pages: maxPages,
          concurrency,
        });
        weeklySchedule = db.getSchedule(weeklySchedule.id);
      } else {
        const scheduleId = randomUUID();
        weeklySchedule = db.createSchedule({
          id: scheduleId,
          domain: job.domain,
          url: job.url,
          type: 'scan',
          frequency: 'weekly',
          max_pages: maxPages,
          concurrency,
          next_run_at: calculateNextRun('weekly'),
        });
      }
      weeklyScheduleId = weeklySchedule?.id ?? null;
    } else if (weeklySchedule) {
      db.updateSchedule(weeklySchedule.id, { enabled: 0 });
      weeklySchedule = db.getSchedule(weeklySchedule.id);
      weeklyScheduleId = weeklySchedule?.id ?? null;
    }

    const shippedAt = new Date().toISOString();
    const lifecycle = db.upsertDomainLifecycle({
      domain: job.domain,
      url: job.url,
      shipped: 1,
      shipped_job_id: job.id,
      shipped_at: shippedAt,
      shipped_by_user_id: req.authUser!.id,
      shipped_by_username: req.authUser!.username,
      weekly_diagnostics_enabled: enableWeeklyDiagnostics ? 1 : 0,
      weekly_schedule_id: weeklyScheduleId,
    });

    db.createActivityLog({
      actor_user_id: req.authUser!.id,
      actor_username: req.authUser!.username,
      actor_role: req.authUser!.role,
      action: 'domain.shipped',
      method: 'POST',
      path: `/api/jobs/${job.id}/ship`,
      status_code: 200,
      target_type: 'domain',
      target_id: job.domain,
      job_id: job.id,
      details_json: JSON.stringify({
        shippedAt,
        weeklyDiagnosticsEnabled: enableWeeklyDiagnostics,
        weeklyScheduleId,
        maxPages,
        concurrency,
      }),
    });

    res.json({
      lifecycle,
      weeklySchedule,
      diagnostics: buildDomainDiagnostics(db, lifecycle),
    });
  });

  // ── POST /api/domains/:domain/unship — disable post-ship workflow ─────
  app.post('/api/domains/:domain/unship', requireAdmin, (req: Request<{ domain: string }>, res: Response) => {
    const domain = req.params.domain;
    const lifecycle = db.getDomainLifecycle(domain);
    if (!lifecycle) {
      res.status(404).json({ error: 'Domain lifecycle not found' });
      return;
    }

    if (lifecycle.weekly_schedule_id) {
      const schedule = db.getSchedule(lifecycle.weekly_schedule_id);
      if (schedule) {
        db.updateSchedule(schedule.id, { enabled: 0 });
      }
    }

    const updated = db.updateDomainLifecycle(domain, {
      shipped: 0,
      weekly_diagnostics_enabled: 0,
      shipped_job_id: null,
      shipped_at: null,
      shipped_by_user_id: null,
      shipped_by_username: null,
    });

    db.createActivityLog({
      actor_user_id: req.authUser!.id,
      actor_username: req.authUser!.username,
      actor_role: req.authUser!.role,
      action: 'domain.unshipped',
      method: 'POST',
      path: `/api/domains/${domain}/unship`,
      status_code: 200,
      target_type: 'domain',
      target_id: domain,
      job_id: null,
      details_json: null,
    });

    res.json({ lifecycle: updated ?? null });
  });

  // ── GET /api/diagnostics — confidence and trend view for shipped domains ──
  app.get('/api/diagnostics', requireAdmin, (_req: Request, res: Response) => {
    const lifecycles = db.listDomainLifecycles().filter((item) => item.shipped === 1);
    const diagnostics = lifecycles.map((item) => buildDomainDiagnostics(db, item));
    res.json({ diagnostics });
  });

  // ── GET /api/diagnostics/:domain ───────────────────────────────────────
  app.get('/api/diagnostics/:domain', requireAdmin, (req: Request<{ domain: string }>, res: Response) => {
    const lifecycle = db.getDomainLifecycle(req.params.domain);
    if (!lifecycle || lifecycle.shipped !== 1) {
      res.status(404).json({ error: 'Shipped domain not found' });
      return;
    }
    res.json(buildDomainDiagnostics(db, lifecycle));
  });

  // ── Schedule Endpoints ──────────────────────────────────────────────

  // GET /api/schedules
  app.get('/api/schedules', requireAdmin, (_req: Request, res: Response) => {
    res.json(db.listSchedules());
  });

  // POST /api/schedules
  app.post('/api/schedules', requireAdmin, (req: Request, res: Response) => {
    const { url: rawUrl, frequency, maxPages = 50, concurrency = 3 } = req.body as {
      url?: string; frequency?: string; maxPages?: number; concurrency?: number;
    };

    if (!rawUrl || !frequency) {
      res.status(400).json({ error: 'url and frequency are required' });
      return;
    }

    if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
      res.status(400).json({ error: 'frequency must be daily, weekly, or monthly' });
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
    const id = randomUUID();
    const nextRunAt = calculateNextRun(frequency as 'daily' | 'weekly' | 'monthly');

    const schedule = db.createSchedule({
      id,
      domain,
      url,
      type: 'scan',
      frequency: frequency as 'daily' | 'weekly' | 'monthly',
      max_pages: maxPages,
      concurrency,
      next_run_at: nextRunAt,
    });

    res.json(schedule);
  });

  // PUT /api/schedules/:id
  app.put('/api/schedules/:id', requireAdmin, (req: Request<IdParams>, res: Response) => {
    const schedule = db.getSchedule(req.params.id);
    if (!schedule) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }

    const { frequency, enabled, maxPages, concurrency } = req.body as {
      frequency?: string; enabled?: number; maxPages?: number; concurrency?: number;
    };

    db.updateSchedule(req.params.id, {
      ...(frequency !== undefined ? { frequency: frequency as 'daily' | 'weekly' | 'monthly' } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(maxPages !== undefined ? { max_pages: maxPages } : {}),
      ...(concurrency !== undefined ? { concurrency } : {}),
    });

    res.json({ updated: true });
  });

  // DELETE /api/schedules/:id
  app.delete('/api/schedules/:id', requireAdmin, (req: Request<IdParams>, res: Response) => {
    const deleted = db.deleteSchedule(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // ── GET /api/jobs/domain/:domain — jobs for a specific domain ────────
  app.get('/api/jobs/domain/:domain', (req: Request<{ domain: string }>, res: Response) => {
    const allJobs = db.getJobsByDomain(req.params.domain);
    const user = req.authUser!;
    const jobs = user.role === 'admin'
      ? allJobs
      : allJobs.filter((job) => canUserAccessJob(db, user, job));
    res.json(jobs);
  });

  // ── GET /api/diff/:jobId1/:jobId2 — compare two scans ─────────────
  app.get('/api/diff/:jobId1/:jobId2', (req: Request<{ jobId1: string; jobId2: string }>, res: Response) => {
    const job1 = db.getJob(req.params.jobId1);
    const job2 = db.getJob(req.params.jobId2);

    if (!job1 || !job2) {
      res.status(404).json({ error: 'One or both jobs not found' });
      return;
    }
    if (!canUserAccessJob(db, req.authUser!, job1) || !canUserAccessJob(db, req.authUser!, job2)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (job1.status !== 'completed' || job2.status !== 'completed') {
      res.status(400).json({ error: 'Both jobs must be completed' });
      return;
    }
    if (!job1.result_json || !job2.result_json) {
      res.status(400).json({ error: 'Both jobs must have results' });
      return;
    }

    try {
      const before = JSON.parse(job1.result_json);
      const after = JSON.parse(job2.result_json);

      if (before.type !== 'scan' || after.type !== 'scan') {
        res.status(400).json({ error: 'Both jobs must be scan type' });
        return;
      }

      const diff = generateScanDiff(before, after);
      res.json(diff);
    } catch {
      res.status(500).json({ error: 'Failed to generate diff' });
    }
  });

  // ── DELETE /api/jobs/:id ──────────────────────────────────────────────
  app.delete('/api/jobs/:id', requireAdmin, async (req: Request<IdParams>, res: Response) => {
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

  // ── Admin API ────────────────────────────────────────────────────────

  app.get('/api/admin/overview', requireAdmin, (_req: Request, res: Response) => {
    const users = db.listUsers();
    const jobs = db.listJobs();
    res.json({
      userCount: users.length,
      activeUserCount: users.filter((u) => u.active === 1).length,
      jobCount: jobs.length,
      runningJobCount: jobs.filter((j) => j.status === 'running').length,
      latestJobAt: jobs.length > 0 ? jobs[0].created_at : null,
    });
  });

  app.get('/api/admin/users', requireAdmin, (_req: Request, res: Response) => {
    res.json(db.listUsers());
  });

  app.post('/api/admin/users', requireAdmin, (req: Request, res: Response) => {
    const { username: rawUsername, displayName: rawDisplayName, password, role } = req.body as {
      username?: string;
      displayName?: string;
      password?: string;
      role?: UserRole;
    };

    const username = (rawUsername || '').trim().toLowerCase();
    const displayName = (rawDisplayName || '').trim();

    if (!username || !displayName || !password || !role) {
      res.status(400).json({ error: 'username, displayName, password, and role are required' });
      return;
    }

    if (!['admin', 'sales'].includes(role)) {
      res.status(400).json({ error: 'role must be admin or sales' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'password must be at least 8 characters' });
      return;
    }

    if (db.getUserByUsername(username)) {
      res.status(409).json({ error: 'username already exists' });
      return;
    }

    const created = db.createUser({
      id: randomUUID(),
      username,
      display_name: displayName,
      role,
      password_hash: hashPassword(password),
    });

    res.json(created);
  });

  app.put('/api/admin/users/:id', requireAdmin, (req: Request<IdParams>, res: Response) => {
    const user = db.getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { displayName, role, active } = req.body as {
      displayName?: string;
      role?: UserRole;
      active?: number;
    };

    if (role !== undefined && !['admin', 'sales'].includes(role)) {
      res.status(400).json({ error: 'role must be admin or sales' });
      return;
    }

    if (active !== undefined && ![0, 1].includes(active)) {
      res.status(400).json({ error: 'active must be 0 or 1' });
      return;
    }

    if (req.authUser!.id === user.id && active === 0) {
      res.status(400).json({ error: 'Cannot disable your own account' });
      return;
    }

    if (req.authUser!.id === user.id && role === 'sales') {
      res.status(400).json({ error: 'Cannot remove your own admin role' });
      return;
    }

    db.updateUser(user.id, {
      ...(displayName !== undefined ? { display_name: displayName.trim() } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(active !== undefined ? { active } : {}),
    });

    const updated = db.getSafeUserById(user.id);
    res.json(updated);
  });

  app.put('/api/admin/users/:id/password', requireAdmin, (req: Request<IdParams>, res: Response) => {
    const user = db.getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password } = req.body as { password?: string };
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'password must be at least 8 characters' });
      return;
    }

    db.updateUserPassword(user.id, hashPassword(password));
    db.revokeSessionsForUser(user.id);

    if (req.authUser!.id === user.id) {
      res.setHeader('Set-Cookie', buildClearSessionCookie(isSecureRequest(req)));
    }

    res.json({ updated: true });
  });

  app.delete('/api/admin/users/:id', requireAdmin, (req: Request<IdParams>, res: Response) => {
    if (req.authUser!.id === req.params.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const exists = db.getUserById(req.params.id);
    if (!exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    db.revokeSessionsForUser(req.params.id);
    db.deleteUser(req.params.id);
    res.json({ deleted: true });
  });

  app.get('/api/admin/logs', requireAdmin, (req: Request, res: Response) => {
    const rawLimit = Number.parseInt(String(req.query.limit ?? '200'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 200;
    res.json(db.listActivityLogs(limit));
  });

  // ── Protected static pages ────────────────────────────────────────────

  app.get('/login.html', (_req: Request, res: Response) => {
    res.sendFile(join(publicDir, 'login.html'));
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    if (req.path === '/login.html') {
      next();
      return;
    }

    if (!req.authUser) {
      res.redirect('/login.html');
      return;
    }

    if ((req.path === '/' || req.path === '/index.html') && req.authUser.role !== 'admin') {
      res.redirect('/employee.html');
      return;
    }

    if (req.path === '/admin.html' && req.authUser.role !== 'admin') {
      res.status(403).type('text').send('Forbidden');
      return;
    }

    next();
  });

  app.use(express.static(publicDir));

  // ── Fallback to index.html for SPA ────────────────────────────────────
  app.get('/{*path}', (req: Request, res: Response) => {
    if (!req.authUser) {
      res.redirect('/login.html');
      return;
    }
    if (req.authUser.role !== 'admin') {
      res.redirect('/employee.html');
      return;
    }
    res.sendFile(join(publicDir, 'index.html'));
  });

  // Start scheduler after auth/logging is configured.
  startScheduler(db);

  const server = app.listen(port, host, () => {
    // Server started — caller logs the message.
  });

  // Graceful shutdown
  server.on('close', () => {
    stopScheduler();
  });

  return { app, server, db };
}

function canUserAccessDomain(db: JobDatabase, user: AuthUserContext, domain: string): boolean {
  if (user.role === 'admin') return true;
  return db.hasSalesDomainAccess(user.id, domain);
}

function canUserAccessJob(
  db: JobDatabase,
  user: AuthUserContext,
  job: { domain: string; created_by: string | null },
): boolean {
  if (user.role === 'admin') return true;
  if (job.created_by === user.id) return true;
  return canUserAccessDomain(db, user, job.domain);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

function ensureBootstrapUsers(db: JobDatabase): void {
  if (db.countUsers() > 0) return;

  const adminPassword = process.env.GEO_ADMIN_PASSWORD || 'admin12345';
  const salesPassword = process.env.GEO_SALES_PASSWORD || 'sales12345';

  db.createUser({
    id: randomUUID(),
    username: 'admin',
    display_name: 'Administrator',
    role: 'admin',
    password_hash: hashPassword(adminPassword),
  });

  db.createUser({
    id: randomUUID(),
    username: 'sales',
    display_name: 'Sales Team',
    role: 'sales',
    password_hash: hashPassword(salesPassword),
  });

  db.createActivityLog({
    actor_user_id: null,
    actor_username: null,
    actor_role: null,
    action: 'auth.bootstrap.users_created',
    method: null,
    path: null,
    status_code: null,
    target_type: 'system',
    target_id: null,
    job_id: null,
    details_json: JSON.stringify({
      users: ['admin', 'sales'],
      fromEnv: {
        admin: Boolean(process.env.GEO_ADMIN_PASSWORD),
        sales: Boolean(process.env.GEO_SALES_PASSWORD),
      },
    }),
  });
}

function toClientUser(user: Pick<SafeUserRow, 'id' | 'username' | 'display_name' | 'role'>): {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
} {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0]?.trim() === 'https';
  }
  return false;
}

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return req.ip || null;
}

type ConfidenceLevel = 'low' | 'medium' | 'high';

type ConfidenceSection = {
  level: ConfidenceLevel;
  score: number;
  rationale: string[];
  actions: string[];
};

type DomainDiagnostics = {
  domain: string;
  url: string;
  shippedAt: string | null;
  weeklyDiagnosticsEnabled: boolean;
  weeklyScheduleId: string | null;
  lastScanAt: string | null;
  lastCheckAt: string | null;
  metrics: {
    scans: number;
    checks: number;
    failedJobs: number;
    avgGeoScore: number | null;
    avgVisibilityScore: number | null;
    geoTrend: number | null;
    visibilityTrend: number | null;
    avgPagesCrawled: number | null;
    zeroPageScans: number;
    avgCrawlErrors: number | null;
  };
  confidence: {
    crawlerReliability: ConfidenceSection;
    geoImpact: ConfidenceSection;
  };
  latestPriorityActions: string[];
  recommendedChanges: string[];
};

function buildDomainDiagnostics(db: JobDatabase, lifecycle: DomainLifecycleRow): DomainDiagnostics {
  const completedJobs = db.listCompletedJobsByDomainSince(lifecycle.domain, lifecycle.shipped_at);
  const allJobs = db.listJobsByDomainSince(lifecycle.domain, lifecycle.shipped_at);
  const scanJobs = completedJobs.filter((job) => job.type === 'scan');
  const checkJobs = completedJobs.filter((job) => job.type === 'check');

  const scanScores = scanJobs
    .map((job) => extractGeoServiceScore(job))
    .filter((score): score is number => Number.isFinite(score));
  const visibilityScores = checkJobs
    .map((job) => job.score)
    .filter((score): score is number => Number.isFinite(score));

  const scanPages = scanJobs.map((job) => extractPagesScanned(job));
  const crawlErrors = scanJobs.map((job) => extractCrawlErrorCount(job));
  const zeroPageScans = scanPages.filter((pages) => pages <= 0).length;
  const failedJobs = allJobs.filter((job) => job.status === 'failed').length;
  const failureRate = allJobs.length > 0 ? failedJobs / allJobs.length : 0;
  const weeksObserved = lifecycle.shipped_at
    ? Math.max(0, (Date.now() - Date.parse(lifecycle.shipped_at)) / (7 * 24 * 60 * 60 * 1000))
    : 0;

  const crawlerReliability = assessCrawlerReliability({
    scanCount: scanJobs.length,
    zeroPageRate: scanJobs.length > 0 ? zeroPageScans / scanJobs.length : 1,
    avgPages: average(scanPages) ?? 0,
    failureRate,
    weeksObserved,
  });

  const geoImpact = assessGeoImpactConfidence({
    scanCount: scanJobs.length,
    checkCount: checkJobs.length,
    geoTrend: trend(scanScores),
    visibilityTrend: trend(visibilityScores),
    weeksObserved,
    failureRate,
  });

  const latestScan = scanJobs.length > 0 ? scanJobs[scanJobs.length - 1] : null;
  const latestPriorityActions = extractPriorityActionRecommendations(latestScan);
  const recommendedChanges = dedupeRecommendations([
    ...crawlerReliability.actions,
    ...geoImpact.actions,
    ...latestPriorityActions,
  ]);

  const lastScanAt = scanJobs.length > 0 ? (scanJobs[scanJobs.length - 1]?.completed_at ?? null) : null;
  const lastCheckAt = checkJobs.length > 0 ? (checkJobs[checkJobs.length - 1]?.completed_at ?? null) : null;

  return {
    domain: lifecycle.domain,
    url: lifecycle.url,
    shippedAt: lifecycle.shipped_at,
    weeklyDiagnosticsEnabled: lifecycle.weekly_diagnostics_enabled === 1,
    weeklyScheduleId: lifecycle.weekly_schedule_id,
    lastScanAt,
    lastCheckAt,
    metrics: {
      scans: scanJobs.length,
      checks: checkJobs.length,
      failedJobs,
      avgGeoScore: average(scanScores),
      avgVisibilityScore: average(visibilityScores),
      geoTrend: trend(scanScores),
      visibilityTrend: trend(visibilityScores),
      avgPagesCrawled: average(scanPages),
      zeroPageScans,
      avgCrawlErrors: average(crawlErrors),
    },
    confidence: {
      crawlerReliability,
      geoImpact,
    },
    latestPriorityActions,
    recommendedChanges,
  };
}

function assessCrawlerReliability(input: {
  scanCount: number;
  zeroPageRate: number;
  avgPages: number;
  failureRate: number;
  weeksObserved: number;
}): ConfidenceSection {
  let score = 20;
  const rationale: string[] = [];
  const actions: string[] = [];

  if (input.scanCount >= 4) {
    score += 30;
    rationale.push(`Post-ship scan sample is sufficient (${input.scanCount} scans).`);
  } else if (input.scanCount >= 2) {
    score += 15;
    rationale.push(`Scan sample is moderate (${input.scanCount} scans).`);
    actions.push('Collect at least 4 weekly post-ship scans to raise reliability confidence.');
  } else {
    rationale.push('Scan sample is too small for strong reliability claims.');
    actions.push('Run weekly diagnostics for at least 4 weeks before presenting strong reliability claims.');
  }

  if (input.zeroPageRate === 0) {
    score += 20;
    rationale.push('No zero-page crawls were observed.');
  } else if (input.zeroPageRate <= 0.25) {
    score += 10;
    rationale.push(`Zero-page crawl rate is acceptable (${Math.round(input.zeroPageRate * 100)}%).`);
    actions.push('Reduce zero-page runs further by validating crawlability (robots/firewall/timeouts).');
  } else {
    rationale.push(`Zero-page crawl rate is high (${Math.round(input.zeroPageRate * 100)}%).`);
    actions.push('Fix crawlability first: allow bot access, avoid redirect traps, and increase crawl timeout coverage.');
  }

  if (input.avgPages >= 20) {
    score += 15;
    rationale.push(`Average crawl depth is healthy (${Math.round(input.avgPages)} pages).`);
  } else if (input.avgPages >= 5) {
    score += 8;
    rationale.push(`Average crawl depth is moderate (${Math.round(input.avgPages)} pages).`);
    actions.push('Increase scan max-pages for richer diagnostics history where site size allows.');
  } else {
    rationale.push(`Average crawl depth is low (${Math.round(input.avgPages)} pages).`);
    actions.push('Increase crawl depth and ensure internal links are discoverable to improve diagnostics quality.');
  }

  if (input.failureRate <= 0.1) {
    score += 15;
    rationale.push(`Job failure rate is low (${Math.round(input.failureRate * 100)}%).`);
  } else if (input.failureRate <= 0.25) {
    score += 8;
    rationale.push(`Job failure rate is moderate (${Math.round(input.failureRate * 100)}%).`);
    actions.push('Investigate recurring job failures to stabilize diagnostics automation.');
  } else {
    rationale.push(`Job failure rate is high (${Math.round(input.failureRate * 100)}%).`);
    actions.push('Stabilize scan execution before using these diagnostics as client-facing evidence.');
  }

  if (input.weeksObserved >= 8) {
    score += 10;
    rationale.push(`Observation window is long enough (${Math.floor(input.weeksObserved)} weeks).`);
  } else if (input.weeksObserved < 4) {
    actions.push('Extend post-ship monitoring to at least 4 weeks for stronger confidence.');
  }

  const normalizedScore = clampScore(score);
  return {
    level: toConfidenceLevel(normalizedScore),
    score: normalizedScore,
    rationale,
    actions: dedupeRecommendations(actions, 4),
  };
}

function assessGeoImpactConfidence(input: {
  scanCount: number;
  checkCount: number;
  geoTrend: number | null;
  visibilityTrend: number | null;
  weeksObserved: number;
  failureRate: number;
}): ConfidenceSection {
  let score = 15;
  const rationale: string[] = [];
  const actions: string[] = [];

  if (input.scanCount >= 4) {
    score += 20;
    rationale.push(`Enough GEO scans for trend analysis (${input.scanCount}).`);
  } else if (input.scanCount >= 2) {
    score += 10;
    rationale.push(`Limited GEO scan sample (${input.scanCount}).`);
    actions.push('Keep weekly scans running until at least 4 completed post-ship scans are collected.');
  } else {
    rationale.push('Not enough GEO scans to quantify impact trend.');
    actions.push('Collect at least 2 completed post-ship scans before claiming impact direction.');
  }

  if (input.checkCount >= 2) {
    score += 20;
    rationale.push(`Visibility checks are available (${input.checkCount}).`);
  } else if (input.checkCount === 1) {
    score += 10;
    rationale.push('Only one visibility check exists.');
    actions.push('Run at least one additional visibility check to validate trend consistency.');
  } else {
    rationale.push('No visibility checks available yet.');
    actions.push('Run visibility checks after each major GEO change to validate business impact.');
  }

  if (input.geoTrend != null) {
    const abs = Math.abs(input.geoTrend);
    if (abs >= 8) score += 15;
    else if (abs >= 3) score += 8;
    rationale.push(`GEO score trend since ship: ${input.geoTrend > 0 ? '+' : ''}${input.geoTrend}.`);
  } else {
    actions.push('Need at least two GEO scans to calculate score trend.');
  }

  if (input.visibilityTrend != null) {
    const abs = Math.abs(input.visibilityTrend);
    if (abs >= 10) score += 15;
    else if (abs >= 4) score += 8;
    rationale.push(`Visibility trend since ship: ${input.visibilityTrend > 0 ? '+' : ''}${input.visibilityTrend}.`);
  } else {
    actions.push('Need at least two visibility checks to calculate visibility trend.');
  }

  if (input.weeksObserved >= 4) {
    score += 15;
    rationale.push(`Impact window is acceptable (${Math.floor(input.weeksObserved)} weeks).`);
  } else {
    actions.push('Wait for at least 4 weeks of post-ship data before presenting final impact confidence.');
  }

  if (input.failureRate <= 0.1) {
    score += 10;
  }

  const normalizedScore = clampScore(score);
  return {
    level: toConfidenceLevel(normalizedScore),
    score: normalizedScore,
    rationale,
    actions: dedupeRecommendations(actions, 4),
  };
}

function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(values: number[]): number | null {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) return null;
  const total = filtered.reduce((sum, value) => sum + value, 0);
  return Math.round((total / filtered.length) * 10) / 10;
}

function trend(values: number[]): number | null {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length < 2) return null;
  return Math.round((filtered[filtered.length - 1] - filtered[0]) * 10) / 10;
}

function parseJobResult(job: JobRow | null): Record<string, unknown> | null {
  if (!job?.result_json) return null;
  try {
    return JSON.parse(job.result_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractPagesScanned(job: JobRow): number {
  const parsed = parseJobResult(job);
  const value = parsed?.pagesScanned;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function extractGeoServiceScore(job: JobRow): number | null {
  const parsed = parseJobResult(job);
  const value = parsed?.geoServiceScore;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof job.score === 'number' && Number.isFinite(job.score)) return job.score;
  return null;
}

function extractCrawlErrorCount(job: JobRow): number {
  const parsed = parseJobResult(job);
  const value = parsed?.crawlErrors;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return job.status === 'failed' ? 1 : 0;
}

function extractPriorityActionRecommendations(job: JobRow | null): string[] {
  const parsed = parseJobResult(job);
  const actions = parsed?.priorityActions;
  if (!Array.isArray(actions)) return [];

  return actions
    .map((action) => {
      if (!action || typeof action !== 'object') return null;
      const recommendation = (action as { recommendation?: unknown }).recommendation;
      return typeof recommendation === 'string' ? recommendation.trim() : null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function dedupeRecommendations(items: string[], max: number = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawItem of items) {
    const item = rawItem.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }

  return result;
}

type SalesPlaybook = {
  domain: string;
  url: string;
  generatedAt: string;
  geoScore: number;
  overallScore: number;
  grade: string;
  pagesScanned: number | null;
  visibilityScore: number | null;
  categoryScores: Array<{ key: string; label: string; score: number | null }>;
  sellingPointsLt: string[];
  actionPointsLt: string[];
  quickPitchLt: string[];
  reportUrl: string;
};

type SalesAuditItem = {
  name: string;
  category?: string;
  score: number;
  maxScore: number;
  status: string;
  details?: string;
  recommendation?: string;
};

const SALES_ITEM_NAMES_LT: Record<string, string> = {
  'robots.txt': 'robots.txt',
  'sitemap.xml': 'sitemap.xml',
  'llms.txt': 'llms.txt',
  'llms-full.txt': 'llms-full.txt',
  'Structured Data (JSON-LD)': 'struktūriniai duomenys',
  'Server-side Rendering': 'serverio pusės atvaizdavimas',
  'AI Bot Blocking': 'DI robotų blokavimas',
  'AI Policy (ai.txt / ai.json)': 'DI politika',
  'Meta Descriptions': 'meta aprašymai',
  'Heading Hierarchy': 'antraščių struktūra',
  'Content Freshness': 'turinio aktualumas',
  'Content Structure & Depth': 'turinio struktūra ir gilumas',
  'security.txt': 'security.txt',
  'tdmrep.json': 'tdmrep.json',
  'Open Graph Tags': 'Open Graph žymės',
  'AI Content Directives': 'DI turinio direktyvos',
  'manifest.json': 'manifest.json',
  'humans.txt': 'humans.txt',
  'FAQ Content': 'DUK turinys',
  'Search Engine Indexing': 'indeksavimo parengtis',
  'Title Tags': 'pavadinimo žymės',
  'Image Alt Text': 'paveikslėlių aprašymai',
  'Internal Linking': 'vidinis susiejimas',
  'Mobile Viewport': 'mobilus rodymas',
  'HTTPS Enforcement': 'HTTPS užtikrinimas',
  'Broken Pages': 'neveikiantys puslapiai',
  'Author & Expertise Signals': 'autoriaus ir ekspertiškumo signalai',
  'Trust Signals': 'pasitikėjimo signalai',
  'Social Proof & Authority': 'socialinis įrodymas ir autoritetas',
  'Citation Quality': 'citavimo kokybė',
  'Featured Snippet Readiness': 'ištraukų parengtis',
  'Voice Search Optimization': 'balso paieškos optimizavimas',
  'Answer Format Diversity': 'atsakymų formatų įvairovė',
  'Schema Markup Diversity': 'schemų įvairovė',
  'Duplicate Titles': 'pasikartojantys pavadinimai',
  'Duplicate Meta Descriptions': 'pasikartojantys meta aprašymai',
  'URL Structure Quality': 'URL struktūros kokybė',
  'Canonical Link Issues': 'canonical nuorodų problemos',
  'Semantic HTML Usage': 'semantinio HTML naudojimas',
  'Page Response Time': 'puslapio atsako laikas',
  'Redirect Chains': 'peradresavimo grandinės',
  'Security Headers': 'saugumo antraštės',
  'Compression': 'suspaudimas',
  'Temporary Redirects': 'laikini peradresavimai',
};

function toLithuanianAuditItemName(name: string): string {
  return SALES_ITEM_NAMES_LT[name] || name;
}

type GeoSalesComponent = {
  auditName: string;
  files: string[];
  labelLt: string;
  impactLt: string;
  getMissingFiles?: (item: SalesAuditItem | undefined) => string[];
};

const GEO_SALES_COMPONENTS: GeoSalesComponent[] = [
  {
    auditName: 'robots.txt',
    files: ['robots.txt'],
    labelLt: 'robots.txt',
    impactLt: 'be robots.txt DI robotai gali gauti neaiškias ar neteisingas nuskaitymo taisykles.',
  },
  {
    auditName: 'sitemap.xml',
    files: ['sitemap.xml'],
    labelLt: 'sitemap.xml',
    impactLt: 'be sitemap.xml DI agentai lėčiau aptinka svarbius puslapius ir naujinimus.',
  },
  {
    auditName: 'llms.txt',
    files: ['llms.txt'],
    labelLt: 'llms.txt',
    impactLt: 'be llms.txt DI sistemoms trūksta aiškaus svetainės turinio žemėlapio ir prioritetų.',
  },
  {
    auditName: 'llms-full.txt',
    files: ['llms-full.txt'],
    labelLt: 'llms-full.txt',
    impactLt: 'be llms-full.txt mažėja tikimybė, kad DI modeliai pilnai supras visą turinio kontekstą.',
  },
  {
    auditName: 'AI Policy (ai.txt / ai.json)',
    files: ['ai.txt', 'ai.json'],
    labelLt: 'ai.txt / ai.json',
    impactLt: 'be ai politikos failų DI platformoms neaiškios naudojimo taisyklės ir turinio interpretavimas.',
    getMissingFiles: (item) => {
      if (!item) return ['ai.txt', 'ai.json'];
      const details = item.details || '';
      if (/No ai\.txt or ai\.json found/i.test(details)) return ['ai.txt', 'ai.json'];

      const missing: string[] = [];
      if (/ai\.txt:\s*missing/i.test(details)) missing.push('ai.txt');
      if (/ai\.json:\s*missing/i.test(details)) missing.push('ai.json');

      if (missing.length > 0) return missing;
      if (item.status === 'fail') return ['ai.txt', 'ai.json'];
      return [];
    },
  },
  {
    auditName: 'security.txt',
    files: ['.well-known/security.txt'],
    labelLt: 'security.txt',
    impactLt: 'be security.txt prastėja pasitikėjimo signalai ir techninis patikimumo vaizdas.',
  },
  {
    auditName: 'tdmrep.json',
    files: ['.well-known/tdmrep.json'],
    labelLt: 'tdmrep.json',
    impactLt: 'be tdmrep.json neapibrėžtas duomenų gavybos politikos signalas AI ekosistemai.',
  },
  {
    auditName: 'manifest.json',
    files: ['manifest.json'],
    labelLt: 'manifest.json',
    impactLt: 'be manifest.json silpnesni svetainės identiteto signalai įvairiems agentams ir platformoms.',
  },
  {
    auditName: 'agent-card.json',
    files: ['.well-known/agent-card.json'],
    labelLt: 'agent-card.json',
    impactLt: 'be agent-card.json DI agentams sudėtingiau automatiškai atrasti jūsų svetainės galimybes.',
  },
  {
    auditName: 'agents.json',
    files: ['agents.json'],
    labelLt: 'agents.json',
    impactLt: 'be agents.json trūksta aiškių agentų API sutarčių, todėl silpnėja automatizuoto integravimo signalai.',
  },
];

const GEO_CONFIGURATION_COMPONENTS: GeoSalesComponent[] = [
  {
    auditName: 'robots.txt',
    files: ['robots.txt'],
    labelLt: 'robots.txt direktyvos',
    impactLt: 'kai robots.txt nėra tikslių DI robotų direktyvų, prastėja nuskaitymo kontrolė ir indeksavimo aiškumas.',
    getMissingFiles: () => [],
  },
  {
    auditName: 'AI Content Directives',
    files: ['<meta name="robots" ...>'],
    labelLt: 'DI turinio direktyvos',
    impactLt: 'be max-snippet ir max-image-preview direktyvų DI sistemos gali naudoti ribotą arba nukirptą turinio versiją.',
    getMissingFiles: () => [],
  },
  {
    auditName: 'Training vs Retrieval Bot Strategy',
    files: ['robots.txt'],
    labelLt: 'mokymo ir paieškos robotų strategija',
    impactLt: 'neskiriant mokymo ir paieškos robotų, sunkiau valdyti turinio panaudojimą ir išlaikyti DI matomumą.',
    getMissingFiles: () => [],
  },
];

function getDefaultMissingFiles(component: GeoSalesComponent, item: SalesAuditItem | undefined): string[] {
  if (!item) return component.files;
  if (item.status === 'pass') return [];

  const details = (item.details || '').toLowerCase();
  if (
    details.startsWith('no ')
    || details.startsWith('nerasta')
    || details.startsWith('nerastas')
    || details.startsWith('nerasti')
    || details.includes(' nerasta')
    || details.includes(' nerastas')
    || details.includes(' nerasti')
  ) {
    return component.files;
  }

  return [];
}

function getMissingFilesForComponent(component: GeoSalesComponent, item: SalesAuditItem | undefined): string[] {
  if (component.getMissingFiles) return component.getMissingFiles(item);
  return getDefaultMissingFiles(component, item);
}

function buildGeoSalesGaps(
  auditItems: SalesAuditItem[],
): {
  totalFiles: number;
  missingFiles: string[];
  incompleteComponents: GeoSalesComponent[];
  missingComponents: GeoSalesComponent[];
} {
  const itemByName = new Map<string, SalesAuditItem>();
  for (const item of auditItems) {
    itemByName.set(item.name, item);
  }

  const missingComponents: GeoSalesComponent[] = [];
  const incompleteComponents: GeoSalesComponent[] = [];
  const missingFilesAccumulator: string[] = [];

  for (const component of GEO_SALES_COMPONENTS) {
    const item = itemByName.get(component.auditName);
    const missingFilesForComponent = getMissingFilesForComponent(component, item);
    if (missingFilesForComponent.length > 0) {
      missingComponents.push(component);
      missingFilesAccumulator.push(...missingFilesForComponent);
      continue;
    }
    if (item && item.status !== 'pass') {
      incompleteComponents.push(component);
    }
  }

  for (const component of GEO_CONFIGURATION_COMPONENTS) {
    const item = itemByName.get(component.auditName);
    if (item && item.status !== 'pass') {
      incompleteComponents.push(component);
    }
  }

  const totalFiles = GEO_SALES_COMPONENTS.reduce((sum, component) => sum + component.files.length, 0);
  const missingFiles = Array.from(
    new Set(missingFilesAccumulator)
  );

  return { totalFiles, missingFiles, incompleteComponents, missingComponents };
}

function buildSalesCategoryScores(
  geoScore: number,
  overallScore: number,
  auditItems: SalesAuditItem[],
): Array<{ key: string; label: string; score: number | null }> {
  const calc = (category: string): number | null => {
    const items = auditItems.filter((item) => item.category === category && item.status !== 'not_applicable' && item.maxScore > 0);
    if (items.length === 0) return null;
    const total = items.reduce((sum, item) => sum + item.score, 0);
    const max = items.reduce((sum, item) => sum + item.maxScore, 0);
    if (max <= 0) return null;
    return Math.round((total / max) * 100);
  };

  return [
    { key: 'geo_service', label: 'GEO paslaugos balas', score: geoScore },
    { key: 'overall', label: 'Bendras balas (GEO + SEO)', score: overallScore },
    { key: 'seo', label: 'SEO pamatai', score: calc('foundational_seo') },
    { key: 'discoverability', label: 'DI aptinkamumas', score: calc('ai_discoverability') },
    { key: 'content', label: 'Turinio kokybė', score: calc('content_quality') },
    { key: 'infra', label: 'DI infrastruktūra', score: calc('ai_infrastructure') },
  ];
}

function buildSalesPlaybook(db: JobDatabase, scanJob: { id: string; domain: string; url: string; score: number | null; grade: string | null; result_json: string | null; completed_at: string | null; created_at: string }): SalesPlaybook | null {
  if (!scanJob.result_json) return null;

  let result: {
    geoServiceScore?: number;
    pagesScanned?: number;
    auditItems?: SalesAuditItem[];
    priorityActions?: Array<{ name: string; recommendation: string; scoreImpact: number }>;
  };

  try {
    result = JSON.parse(scanJob.result_json) as {
      geoServiceScore?: number;
      pagesScanned?: number;
      auditItems?: SalesAuditItem[];
      priorityActions?: Array<{ name: string; recommendation: string; scoreImpact: number }>;
    };
  } catch {
    return null;
  }

  const pagesScanned = Number.isFinite(result.pagesScanned) ? Number(result.pagesScanned) : null;
  const completedAt = scanJob.completed_at || scanJob.created_at;
  const overallScore = scanJob.score ?? 0;
  const grade = scanJob.grade ?? 'N/A';

  const auditItems = Array.isArray(result.auditItems) ? result.auditItems : [];
  const geoScore = Number.isFinite(result.geoServiceScore)
    ? Number(result.geoServiceScore)
    : calculateGeoServiceScore(auditItems);
  const categoryScores = buildSalesCategoryScores(geoScore, overallScore, auditItems);
  const geoGaps = buildGeoSalesGaps(auditItems);
  const implementedFileCount = Math.max(0, geoGaps.totalFiles - geoGaps.missingFiles.length);
  const incompleteLabels = Array.from(new Set(geoGaps.incompleteComponents.map((component) => component.labelLt)));

  const sellingPointsLt = [
    `GEO paslaugos balas: ${geoScore}/100. Bendras balas (GEO + SEO): ${overallScore}/100.`,
    `Iš ${geoGaps.totalFiles} esminių GEO failų šiuo metu įdiegta ${implementedFileCount}, trūksta ${geoGaps.missingFiles.length}.`,
    geoGaps.missingFiles.length > 0
      ? `Trūkstami failai: ${geoGaps.missingFiles.join(', ')}.`
      : 'Kritinių GEO failų trūkumų šiuo metu nefiksuota.',
    incompleteLabels.length > 0
      ? `Papildomai reikia sutvarkyti ${incompleteLabels.length} jau įdiegtą komponentą(-us): ${incompleteLabels.join(', ')}.`
      : 'Įdiegti GEO komponentai neturi papildomų konfigūracijos trūkumų.',
    pagesScanned == null
      ? 'Audito aprėpties duomenys šiame įraše nepasiekiami (senesnis rezultatas). Rekomenduojama paleisti naują skenavimą su didesniu puslapių limitu.'
      : pagesScanned <= 1
        ? `Audito aprėptis maža (${pagesScanned} puslapis). Prieš klientinį pristatymą verta pakartoti su didesniu puslapių limitu, kad argumentai būtų tvirtesni.`
        : `Auditas apėmė ${pagesScanned} puslapių, todėl galima pagrįstai kalbėti apie techninę būklę.`,
  ];

  const actionPointsLt = geoGaps.missingComponents.slice(0, 4).map((component) => {
    return `Trūksta „${component.files.join(' + ')}“. Poveikis: ${component.impactLt}`;
  });

  for (const component of geoGaps.incompleteComponents) {
    if (actionPointsLt.length >= 4) break;
    actionPointsLt.push(`„${component.labelLt}“ yra, bet nepilnai sukonfigūruotas. Poveikis: ${component.impactLt}`);
  }

  if (actionPointsLt.length === 0) {
    actionPointsLt.push('Kritinių GEO failų trūkumų nėra. Tolimesnė vertė klientui: periodinis stebėjimas ir turinio plėtra pagal DI matomumo pokytį.');
  }

  const latestCheck = db.getLatestCompletedJobForDomain(scanJob.domain, 'check');
  let visibilityScore: number | null = latestCheck?.score ?? null;

  if (latestCheck?.result_json) {
    try {
      const checkResult = JSON.parse(latestCheck.result_json) as { score?: number };
      visibilityScore = typeof checkResult.score === 'number' ? checkResult.score : visibilityScore;
    } catch {
      // Ignore malformed JSON from legacy runs.
    }
  }

  const quickPitchLt = [
    geoGaps.missingFiles.length > 0
      ? `Trūksta ${geoGaps.missingFiles.length} GEO failų: ${geoGaps.missingFiles.join(', ')}.`
      : 'Esminiai GEO failai įdiegti; toliau akcentuojame nuolatinį matomumo augimą.',
    geoGaps.incompleteComponents.length > 0
      ? `Papildomai tvarkome konfigūraciją: ${Array.from(new Set(geoGaps.incompleteComponents.slice(0, 3).map((c) => c.labelLt))).join(', ')}.`
      : 'Papildomų konfigūracijos trūkumų įdiegtuose GEO komponentuose šiuo metu nefiksuota.',
    geoGaps.missingComponents.length > 0 || geoGaps.incompleteComponents.length > 0
      ? `Kodėl tai svarbu: ${Array.from(new Set([...geoGaps.missingComponents, ...geoGaps.incompleteComponents].slice(0, 2).map((c) => c.impactLt))).join(' ')}`
      : 'Kodėl tai svarbu: palaikomas stabilus DI indeksavimas ir aiškūs techniniai signalai paieškos sistemoms.',
    visibilityScore != null
      ? `Papildomas DI matomumo rodiklis: ${visibilityScore}/100. Po diegimo galima objektyviai matuoti pokytį.`
      : 'Papildomas DI matomumo testas dar neatliktas; rekomenduojama jį paleisti po diegimo, kad matytųsi realus pokytis.',
  ];

  return {
    domain: scanJob.domain,
    url: scanJob.url,
    generatedAt: completedAt,
    geoScore,
    overallScore,
    grade,
    pagesScanned,
    visibilityScore,
    categoryScores,
    sellingPointsLt,
    actionPointsLt,
    quickPitchLt,
    reportUrl: `/api/jobs/${scanJob.id}/report`,
  };
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
