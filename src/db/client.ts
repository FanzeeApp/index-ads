import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../config/env.js';
import { logger } from '../core/logger.js';

const createClient = (): PrismaClient =>
  new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

/** Hot-reload paytida ulanishlar ko'payib ketmasligi uchun singleton. */
export const prisma: PrismaClient = globalThis.__prisma__ ?? createClient();

if (!isProduction) globalThis.__prisma__ = prisma;

export const connectDatabase = async (): Promise<void> => {
  await prisma.$connect();
  logger.info("Ma'lumotlar bazasiga ulandi");
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info('Ma\'lumotlar bazasi ulanishi yopildi');
};
