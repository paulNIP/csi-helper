import logger from './logger';

export interface SurveyEntry {
  url: string;
  status: 'success' | 'failed';
  timestamp: string;
  duration: number; // milliseconds
  error?: string;
  responseDetails?: {
    mood?: number | string;
    satisfaction?: Record<string, number | string>;
    efficiency?: number | string;
    vehicleType?: string;
    visitGoal?: string;
  };
}

export interface DailyReport {
  date: string;
  totalAttempted: number;
  successful: number;
  failed: number;
  successRate: number;
  failureDetails: string;
  entries: SurveyEntry[];
  averageDuration: number;
  startTime: string;
  endTime: string;
}

export class ReportGenerator {
  private entries: SurveyEntry[] = [];
  private startTime: Date = new Date();

  /**
   * Add a survey result to the report
   */
  addSurveyResult(entry: SurveyEntry): void {
    this.entries.push(entry);
    logger.info(`📊 Survey result recorded: ${entry.url} - ${entry.status}`, {
      duration: `${entry.duration}ms`,
      error: entry.error,
    });
  }

  /**
   * Generate daily report with aggregated statistics
   */
  generateDailyReport(): DailyReport {
    const successful = this.entries.filter((e) => e.status === 'success').length;
    const failed = this.entries.filter((e) => e.status === 'failed').length;
    const totalAttempted = this.entries.length;
    const successRate = totalAttempted > 0 ? (successful / totalAttempted) * 100 : 0;

    const failureDetails = this.entries
      .filter((e) => e.status === 'failed')
      .map(
        (e) =>
          `- ${e.url}: ${e.error || 'Unknown error'} (${new Date(e.timestamp).toLocaleTimeString()})`
      )
      .join('\n');

    const totalDuration = this.entries.reduce((sum, e) => sum + e.duration, 0);
    const averageDuration = totalAttempted > 0 ? totalDuration / totalAttempted : 0;

    const report: DailyReport = {
      date: new Date().toISOString().split('T')[0],
      totalAttempted,
      successful,
      failed,
      successRate,
      failureDetails: failureDetails || 'None',
      entries: this.entries,
      averageDuration: Math.round(averageDuration),
      startTime: this.startTime.toISOString(),
      endTime: new Date().toISOString(),
    };

    return report;
  }

  /**
   * Generate detailed HTML report with all survey entries
   */
  generateHtmlReport(report: DailyReport): string {
    const successBg = '#10b981';
    const failedBg = '#ef4444';

    const entryRows = report.entries
      .map(
        (entry) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; color: #1f2937;">${entry.url}</td>
      <td style="padding: 12px; text-align: center;">
        <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-weight: bold; background-color: ${
          entry.status === 'success' ? successBg : failedBg
        };">
          ${entry.status.toUpperCase()}
        </span>
      </td>
      <td style="padding: 12px; text-align: center; color: #6b7280;">${new Date(entry.timestamp).toLocaleTimeString()}</td>
      <td style="padding: 12px; text-align: center; color: #6b7280;">${(entry.duration / 1000).toFixed(2)}s</td>
      <td style="padding: 12px; color: #6b7280;">${entry.error || '-'}</td>
    </tr>
      `
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Opel CSI QA Report – ${report.date}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; background-color: #f9fafb; margin: 0; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #111827; margin-top: 0; }
    h2 { color: #374151; font-size: 18px; margin-top: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .stat-card { background-color: #f3f4f6; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .stat-value { font-size: 28px; font-weight: bold; color: #111827; }
    .stat-label { font-size: 14px; color: #6b7280; margin-top: 5px; }
    .success { border-left-color: ${successBg}; }
    .failed { border-left-color: ${failedBg}; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background-color: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #d1d5db; }
    .failures { background-color: #fef2f2; padding: 15px; border-radius: 4px; border-left: 4px solid ${failedBg}; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Opel CSI QA Helper Report</h1>
    <p><strong>Report Date:</strong> ${report.date}</p>
    <p><strong>Report Period:</strong> ${report.startTime} to ${report.endTime}</p>

    <h2>Summary Statistics</h2>
    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-value">${report.totalAttempted}</div>
        <div class="stat-label">Total Submissions</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${report.successful}</div>
        <div class="stat-label">Successful</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">${report.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.successRate.toFixed(2)}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${(report.averageDuration / 1000).toFixed(2)}s</div>
        <div class="stat-label">Avg Duration</div>
      </div>
    </div>

    ${
      report.failed > 0
        ? `
    <div class="failures">
      <h3 style="margin-top: 0; color: ${failedBg};">Failures</h3>
      <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 12px;">${report.failureDetails}</pre>
    </div>
    `
        : ''
    }

    <h2>Detailed Results</h2>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th style="text-align: center;">Status</th>
          <th style="text-align: center;">Time</th>
          <th style="text-align: center;">Duration</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <div class="footer">
      <p>This report was automatically generated by Opel CSI QA Helper.</p>
      <p>Generated: ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    return html;
  }

  /**
   * Get current report entries
   */
  getEntries(): SurveyEntry[] {
    return [...this.entries];
  }

  /**
   * Clear all entries (typically after sending report)
   */
  clear(): void {
    this.entries = [];
    this.startTime = new Date();
    logger.info('Report entries cleared');
  }

  /**
   * Get statistics for a specific URL
   */
  getUrlStats(url: string): { total: number; successful: number; failed: number; successRate: number } {
    const urlEntries = this.entries.filter((e) => e.url === url);
    const successful = urlEntries.filter((e) => e.status === 'success').length;
    const failed = urlEntries.filter((e) => e.status === 'failed').length;
    const total = urlEntries.length;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    return { total, successful, failed, successRate };
  }
}
