import { SurveyResult } from './survey-runner';
import logger from './logger';

export interface DailyReport {
  date: string;
  totalAttempted: number;
  successful: number;
  failed: number;
  successRate: number;
  details: SurveyResult[];
  failureDetails: string;
  averageDuration: number;
}

export class ReportGenerator {
  private results: SurveyResult[] = [];

  addResult(result: SurveyResult): void {
    this.results.push(result);
  }

  addResults(results: SurveyResult[]): void {
    this.results.push(...results);
  }

  generateDailyReport(): DailyReport {
    const date = new Date().toISOString().split('T')[0];
    const totalAttempted = this.results.length;
    const successful = this.results.filter((r) => r.status === 'success').length;
    const failed = totalAttempted - successful;
    const successRate = totalAttempted > 0 ? (successful / totalAttempted) * 100 : 0;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = totalAttempted > 0 ? Math.round(totalDuration / totalAttempted) : 0;

    const failureDetails = this.results
      .filter((r) => r.status === 'failed')
      .map(
        (r) =>
          `${r.timestamp} ${r.url}: ${r.error || 'Unknown error'}`
      )
      .join('\n');

    return {
      date,
      totalAttempted,
      successful,
      failed,
      successRate: Math.round(successRate * 100) / 100,
      details: this.results,
      failureDetails,
      averageDuration,
    };
  }

  generateHtmlReport(report: DailyReport): string {
    const successRowStyle = 'background-color: #f0f9ff;';
    const failureRowStyle = 'background-color: #fef2f2;';

    const tableRows = report.details
      .map((result) => {
        const rowStyle = result.status === 'success' ? successRowStyle : failureRowStyle;
        const statusBadge =
          result.status === 'success'
            ? '<span style="background-color: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">OK</span>'
            : '<span style="background-color: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">FAIL</span>';

        const duration = `${(result.duration / 1000).toFixed(1)}s`;
        const time = new Date(result.timestamp).toLocaleTimeString();

        return `
          <tr style="${rowStyle}">
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${result.url}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${statusBadge}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${time}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${duration}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #666;">${result.error || '-'}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Opel CSI QA Report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              color: #1f2937;
              background-color: #f9fafb;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 900px;
              margin: 0 auto;
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background-color: #0066cc;
              color: white;
              padding: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 600;
            }
            .header p {
              margin: 5px 0 0 0;
              opacity: 0.9;
              font-size: 14px;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 0;
              padding: 0;
            }
            .stat {
              padding: 20px;
              border-right: 1px solid #e5e7eb;
              text-align: center;
            }
            .stat:last-child {
              border-right: none;
            }
            .stat-value {
              font-size: 28px;
              font-weight: bold;
              color: #0066cc;
            }
            .stat-label {
              font-size: 12px;
              color: #6b7280;
              margin-top: 5px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .content {
              padding: 20px;
            }
            .section {
              margin-bottom: 20px;
            }
            .section-title {
              font-size: 14px;
              font-weight: 600;
              color: #111827;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 10px;
              padding-bottom: 10px;
              border-bottom: 2px solid #e5e7eb;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
            }
            table th {
              background-color: #f3f4f6;
              padding: 12px;
              text-align: left;
              font-weight: 600;
              border-bottom: 1px solid #e5e7eb;
            }
            .failures {
              background-color: #fef2f2;
              border-left: 4px solid #dc2626;
              padding: 12px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              color: #7f1d1d;
              white-space: pre-wrap;
              word-break: break-word;
            }
            .footer {
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
              padding: 12px 20px;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Opel CSI QA Report</h1>
              <p>Daily Survey Submission Status – ${report.date}</p>
            </div>

            <div class="stats">
              <div class="stat">
                <div class="stat-value">${report.totalAttempted}</div>
                <div class="stat-label">Total Attempted</div>
              </div>
              <div class="stat">
                <div class="stat-value" style="color: #10b981;">${report.successful}</div>
                <div class="stat-label">Successful</div>
              </div>
              <div class="stat">
                <div class="stat-value" style="color: #ef4444;">${report.failed}</div>
                <div class="stat-label">Failed</div>
              </div>
              <div class="stat">
                <div class="stat-value" style="color: #06b6d4;">${report.successRate.toFixed(1)}%</div>
                <div class="stat-label">Success Rate</div>
              </div>
            </div>

            <div class="content">
              <div class="section">
                <div class="section-title">Submission Details</div>
                <table>
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>Status</th>
                      <th>Time</th>
                      <th>Duration</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRows}
                  </tbody>
                </table>
              </div>

              ${
                report.failed > 0
                  ? `
                <div class="section">
                  <div class="section-title">Failures</div>
                  <div class="failures">${report.failureDetails}</div>
                </div>
              `
                  : ''
              }
            </div>

            <div class="footer">
              Generated on ${new Date().toLocaleString()} | Average Duration: ${report.averageDuration}ms
            </div>
          </div>
        </body>
      </html>
    `;
  }

  generateTextReport(report: DailyReport): string {
    const header = `╔══════════════════════════════════════════════════════════╗
║         Opel CSI QA Report – ${report.date}              ║
╚══════════════════════════════════════════════════════════╝

SUMMARY:
  Total Submissions Attempted: ${report.totalAttempted}
  Successful:                  ${report.successful}
  Failed:                      ${report.failed}
  Success Rate:                ${report.successRate.toFixed(2)}%
  Average Duration:            ${report.averageDuration}ms

DETAILS:
`;

    const table = `┌─────────────────────────────────────────────────┬────────┬───────┬────────────┐
│ URL                                             │ Status │ Time  │ Duration   │
├─────────────────────────────────────────────────┼────────┼───────┼────────────┤
${report.details
  .map((result) => {
    const status = result.status === 'success' ? 'OK' : 'FAIL';
    const time = new Date(result.timestamp).toLocaleTimeString();
    const url = result.url.substring(0, 45).padEnd(45);
    const duration = `${(result.duration / 1000).toFixed(1)}s`.padEnd(10);
    return `│ ${url} │ ${status.padEnd(6)} │ ${time} │ ${duration} │`;
  })
  .join('\n')}
└─────────────────────────────────────────────────┴────────┴───────┴────────────┘
`;

    const failures =
      report.failed > 0
        ? `\nFAILURES:\n${report.failureDetails}\n`
        : '';

    return header + table + failures;
  }

  clear(): void {
    this.results = [];
    logger.info('Report generator cleared');
  }
}
