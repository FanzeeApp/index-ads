import pino from 'pino';
import { env, isProduction } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: {
    paths: ['botToken', 'token', '*.token', 'initData', '*.initData', 'WEBHOOK_SECRET'],
    censor: '[maxfiy]',
  },
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});

export type Logger = typeof logger;

export const childLogger = (scope: string): Logger => logger.child({ scope });
