import cron from 'node-cron';
import logger from './logger';
import { SurveyRunner } from './survey-runner';
import { ProxyManager } from './proxy-manager';
import { getConfig } from './config';
import { delay } from './utils';

export interface ScheduledTask {
  url: string;
  hour: number;
  minute: number;
  cronExpression: string;
  taskId?: string;
}

export class Scheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private proxyManager: ProxyManager;

  constructor(proxyManager: ProxyManager) {
    this.proxyManager = proxyManager;
  }

  /**
   * Schedule a URL for survey submission
   */
  scheduleUrl(url: string, hour: number, minute: number): void {
    const cronExpression = `${minute} ${hour} * * *`;
    const taskId = `${url}-${hour}:${minute}`;

    const existingTask = this.tasks.get(taskId);
    if (existingTask) {
      existingTask.stop();
    }

    const task = cron.schedule(cronExpression, () => {
      logger.info(`Task triggered: ${taskId}`);
      this.executeTask(url);
    });

    this.tasks.set(taskId, task);
    logger.info(`Scheduled task: ${taskId} at ${hour}:${String(minute).padStart(2, '0')}`);
  }

  /**
   * Schedule daily report email at specified time
   */
  scheduleDailyReport(time: string, callback: () => Promise<void>): void {
    const [hour, minute] = time.split(':').map((t) => parseInt(t, 10));
    const cronExpression = `${minute} ${hour} * * *`;

    const existingTask = this.tasks.get('daily-report');
    if (existingTask) {
      existingTask.stop();
    }

    const task = cron.schedule(cronExpression, () => {
      logger.info('Daily report task triggered');
      callback().catch((error) => {
        logger.error('Daily report task failed', { error: (error as Error).message });
      });
    });

    this.tasks.set('daily-report', task);
    logger.info(`Scheduled daily report at ${time}`);
  }

  /**
   * Execute survey task for URL
   */
  private async executeTask(url: string): Promise<void> {
    try {
      const runner = new SurveyRunner(this.proxyManager);
      await runner.initialize();

      logger.info(`Executing survey for ${url}`);
      const result = await runner.runSurvey(url);

      logger.info(`Survey result: ${result.status}`, {
        url,
        duration: result.duration,
        error: result.error,
      });

      await runner.cleanup();
    } catch (error) {
      logger.error(`Task execution failed for ${url}`, {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    for (const [taskId, task] of this.tasks.entries()) {
      task.stop();
      logger.info(`Stopped task: ${taskId}`);
    }
    this.tasks.clear();
  }

  /**
   * Start all scheduled tasks
   */
  startAll(): void {
    for (const task of this.tasks.values()) {
      task.start();
    }
    logger.info('All tasks started');
  }
}
