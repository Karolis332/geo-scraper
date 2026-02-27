/**
 * SQLite job history storage via better-sqlite3.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
        output_dir TEXT
      )
    `);
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
  }

  createJob(job: Pick<JobRow, 'id' | 'url' | 'domain' | 'type' | 'output_dir'>): JobRow {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO jobs (id, url, domain, type, status, created_at, output_dir)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(job.id, job.url, job.domain, job.type, now, job.output_dir);
    return this.getJob(job.id)!;
  }

  getJob(id: string): JobRow | undefined {
    return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  }

  listJobs(): Omit<JobRow, 'result_json'>[] {
    return this.db.prepare(
      'SELECT id, url, domain, type, status, created_at, completed_at, score, grade, error, output_dir FROM jobs ORDER BY created_at DESC'
    ).all() as Omit<JobRow, 'result_json'>[];
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

  updateSchedule(id: string, fields: Partial<Pick<ScheduleRow, 'frequency' | 'enabled' | 'max_pages' | 'concurrency'>>): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.frequency !== undefined) { sets.push('frequency = ?'); values.push(fields.frequency); }
    if (fields.enabled !== undefined) { sets.push('enabled = ?'); values.push(fields.enabled); }
    if (fields.max_pages !== undefined) { sets.push('max_pages = ?'); values.push(fields.max_pages); }
    if (fields.concurrency !== undefined) { sets.push('concurrency = ?'); values.push(fields.concurrency); }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteSchedule(id: string): boolean {
    const result = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getDueSchedules(): ScheduleRow[] {
    return this.db.prepare(
      "SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= datetime('now')"
    ).all() as ScheduleRow[];
  }

  updateScheduleLastRun(id: string, nextRunAt: string): void {
    this.db.prepare(
      "UPDATE schedules SET last_run_at = datetime('now'), next_run_at = ? WHERE id = ?"
    ).run(nextRunAt, id);
  }

  // ── Domain-based job queries ──────────────────────────────────

  getJobsByDomain(domain: string): Omit<JobRow, 'result_json'>[] {
    return this.db.prepare(
      'SELECT id, url, domain, type, status, created_at, completed_at, score, grade, error, output_dir FROM jobs WHERE domain = ? ORDER BY created_at DESC'
    ).all(domain) as Omit<JobRow, 'result_json'>[];
  }

  close(): void {
    this.db.close();
  }
}
