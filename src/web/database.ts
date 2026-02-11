/**
 * SQLite job history storage via better-sqlite3.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

  close(): void {
    this.db.close();
  }
}
