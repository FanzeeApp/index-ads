/**
 * `GET /health` — Railway healthcheck shu manzilni so'raydi.
 *
 * Nima uchun DB ham tekshiriladi: jarayon tirik, lekin baza yo'q bo'lsa bot
 * amalda ishlamaydi — bunday holatni "sog'lom" deb ko'rsatish xavfli.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../db/client.js';
import { describeError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';

const log = childLogger('web:health');

export const HEALTH_ROUTE = '/health';

/** Baza javob bermasa healthcheck osilib qolmasligi kerak. */
const DB_PROBE_TIMEOUT_MS = 3000;
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;

type DbState = 'ok' | 'fail';

type HealthBody = {
  readonly status: 'ok' | 'degraded';
  readonly uptime: number;
  readonly db: DbState;
};

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('DB javob bermadi (timeout)')), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** Eng arzon so'rov — ulanish va autentifikatsiyani tasdiqlash uchun yetarli. */
const probeDatabase = async (): Promise<DbState> => {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS);
    return 'ok';
  } catch (error) {
    log.error({ reason: describeError(error) }, "Healthcheck: bazaga ulanib bo'lmadi");
    return 'fail';
  }
};

const handleHealth = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  const db = await probeDatabase();
  const body: HealthBody = Object.freeze({
    status: db === 'ok' ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    db,
  });

  return reply.code(db === 'ok' ? HTTP_OK : HTTP_SERVICE_UNAVAILABLE).send(body);
};

export const registerHealthRoutes = (app: FastifyInstance): void => {
  // Healthcheck tez-tez so'raladi — umumiy chegara unga taalluqli emas.
  app.get(HEALTH_ROUTE, { config: { rateLimit: false } }, handleHealth);
};
