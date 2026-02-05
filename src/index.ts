import fs from 'fs';
import path from 'path';
import logger from './logger';
import { getConfig, getUrlsConfig } from './config';
import { ProxyManager } from './proxy-manager';
import { SurveyRunner } from './survey-runner';
import { ReportGenerator } from './report-generator';
import { EmailSender } from './email-sender';
import { Scheduler } from './scheduler';
import { generateDailySchedule } from './utils';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

interface AppState {
  config: ReturnType<typeof getConfig>;
  proxyManager: ProxyManager;
  scheduler: Scheduler;
  reportGenerator: ReportGenerator;
  emailSender: EmailSender;
  startTime: Date;
}

let appState: AppState;

async function initializeApp(): Promise<void> {
  logger.info('Initializing Opel CSI QA Helper...');

  const config = getConfig();
  const proxyManager = new ProxyManager(config.proxy);
  const scheduler = new Scheduler(proxyManager);
  const reportGenerator = new ReportGenerator();
  const emailSender = new EmailSender(config.smtp);

  appState = {
    config,
    proxyManager,
    scheduler,
    reportGenerator,
    emailSender,
    startTime: new Date(),
  };

  logger.info('Testing proxy connection...');
  const proxyOk = await proxyManager.testProxy();
  if (!proxyOk) {
    logger.warn('Proxy test failed, continuing anyway');
  }

  logger.info('Testing email connection...');
  const emailOk = await emailSender.testConnection();
  if (!emailOk) {
    logger.warn('Email test failed, continuing anyway');
  }

  logger.info('Initialization complete');
}

async function scheduleAllTasks(): Promise<void> {
  logger.info('Scheduling tasks...');

  const urlsConfig = getUrlsConfig();
  const schedule = generateDailySchedule(urlsConfig.urls, appState.config.runsPerDay);

  logger.info(`Generated schedule for ${schedule.length} tasks`);

  for (const entry of schedule) {
    appState.scheduler.scheduleUrl(entry.url, entry.hour, entry.minute);
    // Add delay to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info('All tasks scheduled');
}

async function setupDailyReporting(): Promise<void> {
  appState.scheduler.scheduleDailyReport(appState.config.reportTime, async () => {
    try {
      const report = appState.reportGenerator.generateDailyReport();
      const htmlReport = appState.reportGenerator.generateHtmlReport(report);

      const sent = await appState.emailSender.sendDailyReport(report, htmlReport);
      if (sent) {
        logger.info('Daily report sent successfully');
        appState.reportGenerator.clear();
      } else {
        logger.error('Failed to send daily report');
      }
    } catch (error) {
      logger.error('Daily reporting failed', { error: (error as Error).message });
    }
  });
}

async function monitorFailures(): Promise<void> {
  setInterval(() => {
    const report = appState.reportGenerator.generateDailyReport();

    if (report.failed > 0 && report.totalAttempted > 0) {
      const failureRate = (report.failed / report.totalAttempted) * 100;

      // Alert if more than 50% failed
      if (failureRate > 50) {
        logger.warn(`High failure rate detected: ${failureRate.toFixed(1)}%`);
        appState.emailSender
          .sendAlertEmail(
            'High Failure Rate Detected',
            `Current failure rate is ${failureRate.toFixed(1)}% (${report.failed}/${report.totalAttempted}).\n\nDetails:\n${report.failureDetails}`
          )
          .catch((error) => {
            logger.error('Failed to send alert', { error: (error as Error).message });
          });
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
}

async function handleShutdown(): Promise<void> {
  logger.info('Shutting down...');
  appState.scheduler.stopAll();
  process.exit(0);
}

async function main(): Promise<void> {
  try {
    logger.info('='.repeat(60));
    logger.info('Opel CSI Survey QA Helper');
    logger.info(`Started at ${new Date().toISOString()}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info('='.repeat(60));

    await initializeApp();
    await scheduleAllTasks();
    await setupDailyReporting();
    await monitorFailures();

    const scheduledTasks = appState.scheduler.getScheduledTasks();
    logger.info(`Ready! Monitoring ${scheduledTasks.length} scheduled tasks`);
    logger.info('Press Ctrl+C to stop');

    // Handle graceful shutdown
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  } catch (error) {
    logger.error('Fatal error during initialization', { error: (error as Error).message });
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
