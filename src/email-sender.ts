import nodemailer, { Transporter } from 'nodemailer';
import { SmtpConfig } from './config';
import { DailyReport } from './report-generator';
import logger from './logger';

export class EmailSender {
  private transporter: Transporter;
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email connection verified');
      return true;
    } catch (error) {
      logger.error('Email connection failed', { error: (error as Error).message });
      return false;
    }
  }

  async sendDailyReport(report: DailyReport, htmlContent: string): Promise<boolean> {
    try {
      const subject = `Opel CSI QA Report – ${report.date}`;
      const textContent = `
Opel CSI QA Report – ${report.date}

Summary:
- Total submissions attempted: ${report.totalAttempted}
- Successful: ${report.successful}
- Failed: ${report.failed}
- Success Rate: ${report.successRate.toFixed(2)}%

Failures:
${report.failed > 0 ? report.failureDetails : 'None'}

Please see the attached HTML report for full details.
      `.trim();

      const mailOptions = {
        from: this.config.user,
        to: this.config.reportTo,
        subject,
        text: textContent,
        html: htmlContent,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Daily report email sent', {
        messageId: info.messageId,
        to: this.config.reportTo,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send daily report email', { error: (error as Error).message });
      return false;
    }
  }

  async sendAlertEmail(subject: string, message: string): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.config.user,
        to: this.config.reportTo,
        subject: `ALERT: ${subject}`,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Alert email sent', {
        messageId: info.messageId,
        subject,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send alert email', { error: (error as Error).message });
      return false;
    }
  }
}
