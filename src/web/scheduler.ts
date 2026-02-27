/**
 * Scheduler — runs due scheduled scans on an interval loop.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import type { JobDatabase } from './database.js';
import { runScanJob } from './job-runner.js';
import { extractDomain } from '../utils/url-utils.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function calculateNextRun(frequency: 'daily' | 'weekly' | 'monthly', from?: Date): string {
  const base = from || new Date();
  const next = new Date(base.getTime());

  switch (frequency) {
    case 'daily':
      next.setTime(next.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      next.setTime(next.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      next.setTime(next.getTime() + 30 * 24 * 60 * 60 * 1000);
      break;
  }

  return next.toISOString();
}

export function startScheduler(db: JobDatabase, intervalMs: number = 60_000): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    try {
      const due = db.getDueSchedules();
      for (const schedule of due) {
        const jobId = randomUUID();
        const outputDir = resolve('./geo-output', schedule.domain);

        db.createJob({
          id: jobId,
          url: schedule.url,
          domain: schedule.domain,
          type: 'scan',
          output_dir: outputDir,
        });

        runScanJob(db, jobId, schedule.url, {
          maxPages: schedule.max_pages,
          concurrency: schedule.concurrency,
          outputDir,
        });

        const nextRunAt = calculateNextRun(schedule.frequency);
        db.updateScheduleLastRun(schedule.id, nextRunAt);
      }
    } catch {
      // Silently continue on scheduler errors
    }
  }, intervalMs);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
