/**
 * Scheduler — runs due scheduled scans on an interval loop.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import type { JobDatabase } from './database.js';
import { runScanJob } from './job-runner.js';

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
          created_by: null,
        });

        runScanJob(db, jobId, schedule.url, {
          maxPages: schedule.max_pages,
          concurrency: schedule.concurrency,
          outputDir,
          onProgress: (event) => {
            db.createActivityLog({
              actor_user_id: null,
              actor_username: 'scheduler',
              actor_role: null,
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

        db.createActivityLog({
          actor_user_id: null,
          actor_username: 'scheduler',
          actor_role: null,
          action: 'job.scan.created',
          method: 'SCHEDULER',
          path: null,
          status_code: null,
          target_type: 'job',
          target_id: jobId,
          job_id: jobId,
          details_json: JSON.stringify({
            scheduleId: schedule.id,
            domain: schedule.domain,
            maxPages: schedule.max_pages,
            concurrency: schedule.concurrency,
          }),
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
