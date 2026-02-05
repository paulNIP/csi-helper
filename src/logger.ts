import winston from 'winston';
import { getConfig } from './config';

const config = getConfig();

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let metaStr = '';
      if (Object.keys(meta).length > 0) {
        metaStr = ` ${JSON.stringify(meta)}`;
      }
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

export default logger;
