import cron from 'node-cron';
import logger from './logger';
import { SurveyRunner } from './survey-runner';
import { ProxyManager } from './proxy-manager';
import { ReportGenerator, SurveyEntry } from './report-generator';
import { delay } from './utils';

export interface ScheduledTask {
  url: string;
  hour?: number;
  minute?: number;
  cronExpression?: string;
  taskId?: string;
  intervalMinutes?: number;
  isInterval?: boolean;
}

export class Scheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private intervalTasks: Map<string, NodeJS.Timeout> = new Map();
  private proxyManager: ProxyManager;
  private reportGenerator: ReportGenerator;

  constructor(proxyManager: ProxyManager, reportGenerator: ReportGenerator) {
    this.proxyManager = proxyManager;
    this.reportGenerator = reportGenerator;
  }

  /**
   * Schedule a URL for survey submission at specific time
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
   * Schedule a URL for survey submission at interval (e.g., every 5 minutes)
   */
  scheduleUrlAtInterval(url: string, intervalMinutes: number): string {
    const taskId = `${url}-interval-${intervalMinutes}m-${Date.now()}`;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Execute immediately on first schedule
    logger.info(`Starting immediate execution for interval task: ${taskId}`);
    this.executeTask(url).catch((error) => {
      logger.error(`Initial execution failed for ${taskId}`, { error: (error as Error).message });
    });

    // Then schedule at interval
    const intervalTask = setInterval(() => {
      logger.info(`Interval task triggered: ${taskId} (every ${intervalMinutes} minutes)`);
      this.executeTask(url).catch((error) => {
        logger.error(`Interval execution failed for ${taskId}`, { error: (error as Error).message });
      });
    }, intervalMs);

    this.intervalTasks.set(taskId, intervalTask);
    logger.info(`Scheduled interval task: ${taskId} every ${intervalMinutes} minute(s)`);

    return taskId;
  }

  /**
   * Schedule URLs for immediate execution with 5-minute intervals
   */
  scheduleImmediateWithIntervals(urls: string[], intervalMinutes: number = 5): string[] {
    const taskIds: string[] = [];

    for (const url of urls) {
      const taskId = this.scheduleUrlAtInterval(url, intervalMinutes);
      taskIds.push(taskId);
    }

    logger.info(`Scheduled ${urls.length} URL(s) at ${intervalMinutes}-minute intervals`);
    return taskIds;
  }

  /**
   * Stop a specific interval task
   */
  stopIntervalTask(taskId: string): boolean {
    const intervalTask = this.intervalTasks.get(taskId);
    if (intervalTask) {
      clearInterval(intervalTask);
      this.intervalTasks.delete(taskId);
      logger.info(`Stopped interval task: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * Stop all interval tasks
   */
  stopAllIntervalTasks(): void {
    for (const [taskId, intervalTask] of this.intervalTasks.entries()) {
      clearInterval(intervalTask);
      logger.info(`Stopped interval task: ${taskId}`);
    }
    this.intervalTasks.clear();
    logger.info('All interval tasks stopped');
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
   * Execute survey task for URL with proxy and smart link navigation
   */
  private async executeTask(url: string): Promise<void> {
    try {
      const runner = new SurveyRunner(this.proxyManager);
      await runner.initialize();

      logger.info(`Executing survey for ${url}`);
      const result = await runner.runSurvey(url);

      // Record result in report generator
      const surveyEntry: SurveyEntry = {
        url: result.url,
        status: result.status,
        timestamp: result.timestamp,
        duration: result.duration,
        error: result.error,
      };

      this.reportGenerator.addSurveyResult(surveyEntry);

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

      // Record failure in report generator
      const failureEntry: SurveyEntry = {
        url,
        status: 'failed',
        timestamp: new Date().toISOString(),
        duration: 0,
        error: (error as Error).message,
      };

      this.reportGenerator.addSurveyResult(failureEntry);
    }
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): { cron: string[]; interval: string[] } {
    return {
      cron: Array.from(this.tasks.keys()),
      interval: Array.from(this.intervalTasks.keys()),
    };
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    for (const [taskId, task] of this.tasks.entries()) {
      task.stop();
      logger.info(`Stopped cron task: ${taskId}`);
    }
    this.tasks.clear();

    for (const [taskId, intervalTask] of this.intervalTasks.entries()) {
      clearInterval(intervalTask);
      logger.info(`Stopped interval task: ${taskId}`);
    }
    this.intervalTasks.clear();

    logger.info('All tasks stopped');
  }

  /**
   * Start all cron scheduled tasks
   */
  startAll(): void {
    for (const task of this.tasks.values()) {
      task.start();
    }
    logger.info('All cron tasks started');
  }

  /**
   * Get task statistics
   */
  getTaskStats(): {
    cronTaskCount: number;
    intervalTaskCount: number;
    totalTasks: number;
  } {
    return {
      cronTaskCount: this.tasks.size,
      intervalTaskCount: this.intervalTasks.size,
      totalTasks: this.tasks.size + this.intervalTasks.size,
    };
  }
}
