/**
 * SQLite storage for jobs, schedules, users, sessions, and activity logs.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type UserRole = 'admin' | 'sales';

export interface ScheduleRow {
  id: string;
  domain: string;
  url: string;
  type: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  max_pages: number;
  concurrency: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
}

export interface JobRow {
  id: string;
  url: string;
  domain: string;
  type: 'scan' | 'check';
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
  score: number | null;
  grade: string | null;
  result_json: string | null;
  error: string | null;
  output_dir: string | null;
  created_by: string | null;
}

export interface DomainLifecycleRow {
  domain: string;
  url: string;
  shipped: number;
  shipped_job_id: string | null;
  shipped_at: string | null;
  shipped_by_user_id: string | null;
  shipped_by_username: string | null;
  weekly_diagnostics_enabled: number;
  weekly_schedule_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesDomainAccessRow {
  id: string;
  user_id: string;
  domain: string;
  url: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  active: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export type SafeUserRow = Omit<UserRow, 'password_hash'>;

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface AuthSessionRow {
  session_id: string;
  session_expires_at: string;
  session_revoked_at: string | null;
  user_id: string;
  username: string;
  display_name: string;
  role: UserRole;
  active: number;
}

export interface ActivityLogRow {
  id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  actor_role: UserRole | null;
  action: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  target_type: string | null;
  target_id: string | null;
  job_id: string | null;
  details_json: string | null;
  created_at: string;
}

export class JobDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        completed_at TEXT,
        score INTEGER,
        grade TEXT,
        result_json TEXT,
        error TEXT,
        output_dir TEXT,
        created_by TEXT
      )
    `);

    // Backward compatible migration for existing DBs.
    this.ensureColumn('jobs', 'created_by', 'TEXT');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'scan',
        frequency TEXT NOT NULL,
        max_pages INTEGER DEFAULT 50,
        concurrency INTEGER DEFAULT 3,
        enabled INTEGER DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domain_lifecycle (
        domain TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        shipped INTEGER NOT NULL DEFAULT 0,
        shipped_job_id TEXT,
        shipped_at TEXT,
        shipped_by_user_id TEXT,
        shipped_by_username TEXT,
        weekly_diagnostics_enabled INTEGER NOT NULL DEFAULT 0,
        weekly_schedule_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sales_domain_access (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        url TEXT NOT NULL,
        created_by_user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, domain)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT,
        ip TEXT,
        user_agent TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        actor_username TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        method TEXT,
        path TEXT,
        status_code INTEGER,
        target_type TEXT,
        target_id TEXT,
        job_id TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_domain_created_at ON jobs(domain, created_at DESC)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_type_status_created_at ON jobs(type, status, created_at DESC)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_domain_lifecycle_shipped ON domain_lifecycle(shipped, updated_at DESC)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sales_domain_access_user ON sales_domain_access(user_id, updated_at DESC)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_logs_created_at ON activity_logs(created_at DESC)');
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((col) => col.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // ── Jobs ─────────────────────────────────────────────────────────────

  createJob(job: Pick<JobRow, 'id' | 'url' | 'domain' | 'type' | 'output_dir'> & { created_by?: string | null }): JobRow {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO jobs (id, url, domain, type, status, created_at, output_dir, created_by)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(job.id, job.url, job.domain, job.type, now, job.output_dir, job.created_by ?? null);
    return this.getJob(job.id)!;
  }

  getJob(id: string): JobRow | undefined {
    return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  }

  listJobs(): Omit<JobRow, 'result_json'>[] {
    return this.db.prepare(
      'SELECT id, url, domain, type, status, created_at, completed_at, score, grade, error, output_dir, created_by FROM jobs ORDER BY created_at DESC'
    ).all() as Omit<JobRow, 'result_json'>[];
  }

  listCompletedJobsByType(type: 'scan' | 'check'): JobRow[] {
    return this.db.prepare(
      "SELECT * FROM jobs WHERE type = ? AND status = 'completed' ORDER BY created_at DESC"
    ).all(type) as JobRow[];
  }

  getLatestCompletedJobForDomain(domain: string, type: 'scan' | 'check'): JobRow | undefined {
    return this.db.prepare(
      "SELECT * FROM jobs WHERE domain = ? AND type = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1"
    ).get(domain, type) as JobRow | undefined;
  }

  updateJobRunning(id: string): void {
    this.db.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(id);
  }

  updateJobCompleted(id: string, score: number, grade: string, resultJson: string): void {
    this.db.prepare(
      "UPDATE jobs SET status = 'completed', completed_at = ?, score = ?, grade = ?, result_json = ? WHERE id = ?"
    ).run(new Date().toISOString(), score, grade, resultJson, id);
  }

  updateJobFailed(id: string, error: string): void {
    this.db.prepare(
      "UPDATE jobs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?"
    ).run(new Date().toISOString(), error, id);
  }

  deleteJob(id: string): boolean {
    const result = this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ── Schedule CRUD ───────────────────────────────────────────────

  createSchedule(schedule: Pick<ScheduleRow, 'id' | 'domain' | 'url' | 'type' | 'frequency' | 'max_pages' | 'concurrency' | 'next_run_at'>): ScheduleRow {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO schedules (id, domain, url, type, frequency, max_pages, concurrency, enabled, next_run_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(schedule.id, schedule.domain, schedule.url, schedule.type, schedule.frequency, schedule.max_pages, schedule.concurrency, schedule.next_run_at, now);
    return this.getSchedule(schedule.id)!;
  }

  listSchedules(): ScheduleRow[] {
    return this.db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as ScheduleRow[];
  }

  getSchedule(id: string): ScheduleRow | undefined {
    return this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | undefined;
  }

  updateSchedule(id: string, fields: Partial<Pick<ScheduleRow, 'url' | 'frequency' | 'enabled' | 'max_pages' | 'concurrency'>>): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.url !== undefined) { sets.push('url = ?'); values.push(fields.url); }
    if (fields.frequency !== undefined) { sets.push('frequency = ?'); values.push(fields.frequency); }
    if (fields.enabled !== undefined) { sets.push('enabled = ?'); values.push(fields.enabled); }
    if (fields.max_pages !== undefined) { sets.push('max_pages = ?'); values.push(fields.max_pages); }
    if (fields.concurrency !== undefined) { sets.push('concurrency = ?'); values.push(fields.concurrency); }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...(values as []));
  }

  deleteSchedule(id: string): boolean {
    const result = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getDueSchedules(): ScheduleRow[] {
    return this.db.prepare(
      'SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ?'
    ).all(new Date().toISOString()) as ScheduleRow[];
  }

  updateScheduleLastRun(id: string, nextRunAt: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?'
    ).run(now, nextRunAt, id);
  }

  // ── Domain-based job queries ──────────────────────────────────

  getJobsByDomain(domain: string): Omit<JobRow, 'result_json'>[] {
    return this.db.prepare(
      'SELECT id, url, domain, type, status, created_at, completed_at, score, grade, error, output_dir, created_by FROM jobs WHERE domain = ? ORDER BY created_at DESC'
    ).all(domain) as Omit<JobRow, 'result_json'>[];
  }

  listCompletedJobsByDomainSince(domain: string, sinceIso: string | null): JobRow[] {
    if (sinceIso) {
      return this.db.prepare(
        "SELECT * FROM jobs WHERE domain = ? AND status = 'completed' AND completed_at IS NOT NULL AND completed_at >= ? ORDER BY completed_at ASC"
      ).all(domain, sinceIso) as JobRow[];
    }

    return this.db.prepare(
      "SELECT * FROM jobs WHERE domain = ? AND status = 'completed' ORDER BY completed_at ASC"
    ).all(domain) as JobRow[];
  }

  listJobsByDomainSince(domain: string, sinceIso: string | null): JobRow[] {
    if (sinceIso) {
      return this.db.prepare(
        'SELECT * FROM jobs WHERE domain = ? AND created_at >= ? ORDER BY created_at ASC'
      ).all(domain, sinceIso) as JobRow[];
    }

    return this.db.prepare(
      'SELECT * FROM jobs WHERE domain = ? ORDER BY created_at ASC'
    ).all(domain) as JobRow[];
  }

  // ── Domain lifecycle ───────────────────────────────────────────

  getDomainLifecycle(domain: string): DomainLifecycleRow | undefined {
    return this.db.prepare('SELECT * FROM domain_lifecycle WHERE domain = ?').get(domain) as DomainLifecycleRow | undefined;
  }

  listDomainLifecycles(): DomainLifecycleRow[] {
    return this.db.prepare('SELECT * FROM domain_lifecycle ORDER BY updated_at DESC').all() as DomainLifecycleRow[];
  }

  upsertDomainLifecycle(domainLifecycle: {
    domain: string;
    url: string;
    shipped?: number;
    shipped_job_id?: string | null;
    shipped_at?: string | null;
    shipped_by_user_id?: string | null;
    shipped_by_username?: string | null;
    weekly_diagnostics_enabled?: number;
    weekly_schedule_id?: string | null;
  }): DomainLifecycleRow {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO domain_lifecycle (
        domain, url, shipped, shipped_job_id, shipped_at, shipped_by_user_id, shipped_by_username,
        weekly_diagnostics_enabled, weekly_schedule_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET
        url = excluded.url,
        shipped = excluded.shipped,
        shipped_job_id = excluded.shipped_job_id,
        shipped_at = excluded.shipped_at,
        shipped_by_user_id = excluded.shipped_by_user_id,
        shipped_by_username = excluded.shipped_by_username,
        weekly_diagnostics_enabled = excluded.weekly_diagnostics_enabled,
        weekly_schedule_id = excluded.weekly_schedule_id,
        updated_at = excluded.updated_at
    `).run(
      domainLifecycle.domain,
      domainLifecycle.url,
      domainLifecycle.shipped ?? 0,
      domainLifecycle.shipped_job_id ?? null,
      domainLifecycle.shipped_at ?? null,
      domainLifecycle.shipped_by_user_id ?? null,
      domainLifecycle.shipped_by_username ?? null,
      domainLifecycle.weekly_diagnostics_enabled ?? 0,
      domainLifecycle.weekly_schedule_id ?? null,
      now,
      now,
    );

    return this.getDomainLifecycle(domainLifecycle.domain)!;
  }

  updateDomainLifecycle(
    domain: string,
    fields: Partial<Pick<DomainLifecycleRow, 'url' | 'shipped' | 'shipped_job_id' | 'shipped_at' | 'shipped_by_user_id' | 'shipped_by_username' | 'weekly_diagnostics_enabled' | 'weekly_schedule_id'>>
  ): DomainLifecycleRow | undefined {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (fields.url !== undefined) { sets.push('url = ?'); values.push(fields.url); }
    if (fields.shipped !== undefined) { sets.push('shipped = ?'); values.push(fields.shipped); }
    if (fields.shipped_job_id !== undefined) { sets.push('shipped_job_id = ?'); values.push(fields.shipped_job_id); }
    if (fields.shipped_at !== undefined) { sets.push('shipped_at = ?'); values.push(fields.shipped_at); }
    if (fields.shipped_by_user_id !== undefined) { sets.push('shipped_by_user_id = ?'); values.push(fields.shipped_by_user_id); }
    if (fields.shipped_by_username !== undefined) { sets.push('shipped_by_username = ?'); values.push(fields.shipped_by_username); }
    if (fields.weekly_diagnostics_enabled !== undefined) { sets.push('weekly_diagnostics_enabled = ?'); values.push(fields.weekly_diagnostics_enabled); }
    if (fields.weekly_schedule_id !== undefined) { sets.push('weekly_schedule_id = ?'); values.push(fields.weekly_schedule_id); }

    if (sets.length === 0) return this.getDomainLifecycle(domain);

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(domain);

    this.db.prepare(`UPDATE domain_lifecycle SET ${sets.join(', ')} WHERE domain = ?`).run(...(values as []));
    return this.getDomainLifecycle(domain);
  }

  // ── Sales domain access ────────────────────────────────────────

  upsertSalesDomainAccess(access: {
    user_id: string;
    domain: string;
    url: string;
    created_by_user_id?: string | null;
  }): SalesDomainAccessRow {
    const now = new Date().toISOString();
    const existing = this.getSalesDomainAccess(access.user_id, access.domain);
    const id = existing?.id ?? cryptoRandomId();

    this.db.prepare(`
      INSERT INTO sales_domain_access (
        id, user_id, domain, url, created_by_user_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, domain) DO UPDATE SET
        url = excluded.url,
        created_by_user_id = excluded.created_by_user_id,
        updated_at = excluded.updated_at
    `).run(
      id,
      access.user_id,
      access.domain,
      access.url,
      access.created_by_user_id ?? null,
      existing?.created_at ?? now,
      now,
    );

    return this.getSalesDomainAccess(access.user_id, access.domain)!;
  }

  getSalesDomainAccess(userId: string, domain: string): SalesDomainAccessRow | undefined {
    return this.db.prepare(
      'SELECT * FROM sales_domain_access WHERE user_id = ? AND domain = ? LIMIT 1'
    ).get(userId, domain) as SalesDomainAccessRow | undefined;
  }

  hasSalesDomainAccess(userId: string, domain: string): boolean {
    return Boolean(this.getSalesDomainAccess(userId, domain));
  }

  listSalesDomainAccessForUser(userId: string): SalesDomainAccessRow[] {
    return this.db.prepare(
      'SELECT * FROM sales_domain_access WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(userId) as SalesDomainAccessRow[];
  }

  listSalesDomainsForUser(userId: string): string[] {
    return this.db.prepare(
      'SELECT domain FROM sales_domain_access WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(userId).map((row) => (row as { domain: string }).domain);
  }

  deleteSalesDomainAccess(userId: string, domain: string): boolean {
    const result = this.db.prepare('DELETE FROM sales_domain_access WHERE user_id = ? AND domain = ?').run(userId, domain);
    return result.changes > 0;
  }

  // ── Users ──────────────────────────────────────────────────────

  countUsers(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  }

  createUser(user: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role' | 'password_hash'> & { active?: number }): SafeUserRow {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, user.username, user.display_name, user.role, user.password_hash, user.active ?? 1, now, now);
    return this.getSafeUserById(user.id)!;
  }

  getUserByUsername(username: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  }

  getUserById(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  getSafeUserById(id: string): SafeUserRow | undefined {
    return this.db.prepare('SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at FROM users WHERE id = ?').get(id) as SafeUserRow | undefined;
  }

  listUsers(): SafeUserRow[] {
    return this.db.prepare(
      'SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at FROM users ORDER BY created_at ASC'
    ).all() as SafeUserRow[];
  }

  updateUser(id: string, fields: Partial<Pick<UserRow, 'display_name' | 'role' | 'active'>>): void {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (fields.display_name !== undefined) { sets.push('display_name = ?'); values.push(fields.display_name); }
    if (fields.role !== undefined) { sets.push('role = ?'); values.push(fields.role); }
    if (fields.active !== undefined) { sets.push('active = ?'); values.push(fields.active); }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...(values as []));
  }

  updateUserPassword(id: string, passwordHash: string): void {
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, new Date().toISOString(), id);
  }

  touchUserLogin(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  }

  deleteUser(id: string): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ── Sessions ───────────────────────────────────────────────────

  createSession(session: Pick<SessionRow, 'id' | 'user_id' | 'token_hash' | 'expires_at' | 'ip' | 'user_agent'>): SessionRow {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(session.id, session.user_id, session.token_hash, now, session.expires_at, now, session.ip, session.user_agent);

    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id) as SessionRow;
  }

  getAuthSessionByTokenHash(tokenHash: string): AuthSessionRow | undefined {
    return this.db.prepare(`
      SELECT
        s.id AS session_id,
        s.expires_at AS session_expires_at,
        s.revoked_at AS session_revoked_at,
        u.id AS user_id,
        u.username,
        u.display_name,
        u.role,
        u.active
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `).get(tokenHash) as AuthSessionRow | undefined;
  }

  touchSession(id: string): void {
    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  revokeSession(id: string): void {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  revokeSessionsForUser(userId: string): void {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), userId);
  }

  purgeExpiredSessions(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(new Date().toISOString());
  }

  // ── Activity Logs ──────────────────────────────────────────────

  createActivityLog(log: Omit<ActivityLogRow, 'id' | 'created_at'> & { id?: string; created_at?: string }): ActivityLogRow {
    const id = log.id ?? cryptoRandomId();
    const createdAt = log.created_at ?? new Date().toISOString();

    this.db.prepare(`
      INSERT INTO activity_logs (
        id, actor_user_id, actor_username, actor_role, action, method, path, status_code,
        target_type, target_id, job_id, details_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.actor_user_id,
      log.actor_username,
      log.actor_role,
      log.action,
      log.method,
      log.path,
      log.status_code,
      log.target_type,
      log.target_id,
      log.job_id,
      log.details_json,
      createdAt,
    );

    return this.db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id) as ActivityLogRow;
  }

  listActivityLogs(limit: number = 200): ActivityLogRow[] {
    return this.db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit) as ActivityLogRow[];
  }

  close(): void {
    this.db.close();
  }
}

function cryptoRandomId(): string {
  return randomUUID();
}
