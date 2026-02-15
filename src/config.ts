import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  passwordDE: string;      // Password for .de domains
  passwordNonDE: string;   // Password for non-.de domains
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  reportTo: string;
}

export interface AppConfig {
  proxy: ProxyConfig;
  smtp: SmtpConfig;
  runsPerDay: number;
  reportTime: string;
  nodeEnv: string;
  logLevel: string;
  useIntervalScheduling: boolean;
  intervalMinutes: number;
  useDirectAPI: boolean;
}

export interface UrlsConfig {
  urls: string[];
}

export interface FormValuesConfig {
  [key: string]: any;
}

function loadJsonConfig<T>(filePath: string): T {
  const fullPath = path.resolve(filePath);
  const data = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(data);
}

export function getConfig(url?: string): AppConfig {
  // Determine proxy password based on URL domain
  let proxyPassword = process.env.PROXY_PASS_DE || '';
  if (url && !url.includes('.de')) {
    proxyPassword = process.env.PROXY_PASS_NON_DE || '';
  }

  return {
    proxy: {
      host: process.env.PROXY_HOST || 'geo.iproyal.com',
      port: parseInt(process.env.PROXY_PORT || '12321', 10),
      username: process.env.PROXY_USER || '',
      passwordDE: process.env.PROXY_PASS_DE || '',
      passwordNonDE: process.env.PROXY_PASS_NON_DE || '',
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      reportTo: process.env.REPORT_TO || '',
    },
    runsPerDay: parseInt(process.env.RUNS_PER_DAY || '3', 10),
    reportTime: process.env.REPORT_TIME || '22:00',
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    useIntervalScheduling: process.env.USE_INTERVAL_SCHEDULING === 'true' || false,
    intervalMinutes: parseInt(process.env.INTERVAL_MINUTES || '5', 10),
    useDirectAPI: process.env.USE_DIRECT_API === 'true' || true,
  };
}

export function getUrlsConfig(): UrlsConfig {
  return loadJsonConfig<UrlsConfig>('./config/urls.json');
}

export function getFormValuesConfig(): FormValuesConfig {
  return loadJsonConfig<FormValuesConfig>('./config/form-values.json');
}
