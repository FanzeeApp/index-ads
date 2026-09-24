/**
 * Fastify server: Mini App sahifasi, rasm yuklash API si, healthcheck va webhook.
 *
 * Railway bitta jarayonni ishga tushiradi — shu server bot bilan yonma-yon yashaydi.
 * Shuning uchun server hech qachon o'zi `process.exit` qilmaydi, faqat xato qaytaradi.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimitPlugin from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/bot.js';
import { MAX_UPLOAD_BYTES, MINUTE_MS } from '../config/constants.js';
import { env, isProduction } from '../config/env.js';
import { AppError, describeError } from '../core/errors.js';
import { childLogger, logger } from '../core/logger.js';
import { t } from '../i18n/index.js';
import { toApiError } from './httpError.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMiniAppRoutes } from './routes/miniapp.js';
import { registerUploadRoutes } from './routes/upload.js';
import { registerWebhookRoutes } from './routes/webhook.js';

const log = childLogger('web:server');

const STATIC_PREFIX = '/static/';
const STATIC_MAX_AGE_MS = MINUTE_MS;

/** Umumiy chegara: bitta IP uchun daqiqasiga 100 so'rov. */
const GLOBAL_RATE_LIMIT_MAX = 100;
const GLOBAL_RATE_LIMIT_WINDOW_MS = MINUTE_MS;

/** JSON tanalar faqat webhook uchun keladi — katta bo'lishi shart emas. */
const JSON_BODY_LIMIT_BYTES = 1024 * 1024;

/** Multipart chegaralari: bitta rasm + bir nechta kichik matn maydoni. */
const MULTIPART_MAX_FIELDS = 12;
const MULTIPART_MAX_PARTS = 16;
/** initData ~4 KB bo'lishi mumkin, shuning uchun maydon chegarasi kengroq. */
const MULTIPART_FIELD_SIZE_BYTES = 16 * 1024;

const SLOW_REQUEST_MS = 2000;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * `tsc` faqat `.ts` fayllarni ko'chiradi — `public/` papkasi `dist/` ga tushmaydi.
 * Shuning uchun avval yig'ilgan joyni, keyin manba papkani tekshiramiz.
 */
const resolvePublicDir = (): string => {
  const candidates = [
    join(currentDir, 'public'),
    resolve(currentDir, '..', '..', 'src', 'web', 'public'),
    resolve(process.cwd(), 'src', 'web', 'public'),
  ];

  const found = candidates.find((candidate) => existsSync(join(candidate, 'index.html')));
  if (!found) {
    throw new AppError('CONFIG', 'Mini App fayllari topilmadi (src/web/public/index.html)', {
      statusCode: HTTP_SERVER_ERROR,
      meta: { candidates },
    });
  }
  return found;
};

/**
 * Telegram Mini App uchun CSP:
 *  • `script-src https://telegram.org` — rasmiy `telegram-web-app.js` shu yerdan yuklanadi;
 *  • `'unsafe-inline'` — Telegram webview sahifaga o'z bootstrap skriptini kirita oladi,
 *    ularsiz Mini App API si (MainButton, themeParams) ishlamaydi;
 *  • `blob:` — kameradan olingan rasmni yuborishdan oldin ko'rsatish (createObjectURL);
 *  • `frame-ancestors` — Mini App web.telegram.org ichidagi iframe da ochiladi,
 *    shu sabab `frameguard` (X-Frame-Options) o'chirilgan.
 */
const buildHelmetOptions = () => ({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'script-src': ["'self'", 'https://telegram.org', "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'blob:'],
      'connect-src': ["'self'"],
      'font-src': ["'self'"],
      'object-src': ["'none'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'", 'https://telegram.org', 'https://*.telegram.org'],
      ...(isProduction ? { 'upgrade-insecure-requests': [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' as const },
  frameguard: false,
});

/**
 * Webhook yo'lining ikkinchi bo'lagi — WEBHOOK_SECRET ning o'zi
 * (`/webhook/<secret>`), shuning uchun u logga hech qachon to'liq yozilmaydi.
 */
const WEBHOOK_PATH_PREFIX = '/webhook/';
const REDACTED = '[maxfiy]';

/** Query ham, webhook siri ham olib tashlangan xavfsiz yo'l. */
const safeLogPath = (url: string): string => {
  const path = url.split('?')[0] ?? url;
  return path.startsWith(WEBHOOK_PATH_PREFIX) ? `${WEBHOOK_PATH_PREFIX}${REDACTED}` : path;
};

/**
 * So'rov loglari: `/app?token=...` dagi bir martalik token va webhook siri
 * logga tushmasligi uchun Fastify ning standart log qilishi o'chirilgan.
 */
const registerRequestLogging = (app: FastifyInstance): void => {
  app.addHook('onResponse', async (request, reply) => {
    const path = safeLogPath(request.url);
    const payload = {
      method: request.method,
      path,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
    };

    if (reply.statusCode >= HTTP_SERVER_ERROR) log.error(payload, "So'rov xato bilan tugadi");
    else if (reply.elapsedTime > SLOW_REQUEST_MS) log.warn(payload, "So'rov sekin bajarildi");
    else log.debug(payload, "So'rov bajarildi");
  });
};

const registerErrorHandlers = (app: FastifyInstance): void => {
  app.setNotFoundHandler(async (_request, reply) => {
    await reply.code(HTTP_NOT_FOUND).send({ ok: false, code: 'NOT_FOUND', message: t.common.notFound });
  });

  // Marshrut handleri ushlamagan xato ham foydalanuvchiga tushunarli JSON qaytarsin.
  // Bu yerga chegara (rate-limit) xatosi ham tushadi — u `AppError` sifatida tashlanadi.
  app.setErrorHandler(async (error, _request, reply) => {
    const mapped = toApiError(error);
    const payload = { status: mapped.status, code: mapped.body.code, reason: describeError(error) };

    if (mapped.status >= HTTP_SERVER_ERROR) log.error(payload, 'Ushlanmagan HTTP xatosi');
    else log.warn(payload, "So'rov rad etildi");

    await reply.code(mapped.status).send(mapped.body);
  });
};

/**
 * Server instansiyasini yig'adi (hali tinglamaydi) — testlarda ham shu ishlatiladi.
 * `bot` berilsa webhook shu instansiyaga ulanadi; berilmasa `createBot()` chaqiriladi.
 */
export const createServer = async (bot?: Bot<BotContext>): Promise<FastifyInstance> => {
  // Logger turini aniq ko'rsatamiz: aks holda pino turi Fastify ning standart
  // `FastifyInstance` turi bilan mos kelmay qoladi (marshrutlarni ulashda xato beradi).
  const app = Fastify<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    FastifyBaseLogger
  >({
    logger,
    // So'rov loglarini o'zimiz yozamiz (token sizib chiqmasligi uchun).
    disableRequestLogging: true,
    // Railway proksi orqasida — haqiqiy IP `X-Forwarded-For` da keladi.
    trustProxy: true,
    bodyLimit: JSON_BODY_LIMIT_BYTES,
  });

  await app.register(helmet, buildHelmetOptions());

  await app.register(rateLimitPlugin, {
    global: true,
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindow: GLOBAL_RATE_LIMIT_WINDOW_MS,
    // Plagin bu qiymatni TASHLAYDI — shuning uchun oddiy obyekt emas, xato qaytariladi.
    // `AppError` bo'lgani uchun umumiy xato ishlovchisi uni to'g'ri JSON ga aylantiradi.
    errorResponseBuilder: () =>
      new AppError('RATE_LIMITED', t.common.rateLimited, {
        userFacing: true,
        statusCode: HTTP_TOO_MANY_REQUESTS,
      }),
  });

  await app.register(multipart, {
    throwFileSizeLimit: true,
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: MULTIPART_MAX_FIELDS,
      fieldSize: MULTIPART_FIELD_SIZE_BYTES,
      parts: MULTIPART_MAX_PARTS,
    },
  });

  await app.register(fastifyStatic, {
    root: resolvePublicDir(),
    prefix: STATIC_PREFIX,
    index: false,
    cacheControl: true,
    maxAge: STATIC_MAX_AGE_MS,
  });

  registerRequestLogging(app);
  registerErrorHandlers(app);

  registerHealthRoutes(app);
  registerMiniAppRoutes(app);
  registerUploadRoutes(app);
  await registerWebhookRoutes(app, bot);

  return app;
};

/** Ishga tushgan server — `stopServer()` uchun yagona havola. */
let runningServer: FastifyInstance | null = null;

export const startServer = async (bot?: Bot<BotContext>): Promise<FastifyInstance> => {
  if (runningServer) return runningServer;

  const app = await createServer(bot);
  await app.listen({ port: env.PORT, host: env.HOST });
  runningServer = app;

  log.info({ host: env.HOST, port: env.PORT, mode: env.BOT_MODE }, 'Web server ishga tushdi');
  return app;
};

export const stopServer = async (): Promise<void> => {
  if (!runningServer) return;

  const app = runningServer;
  runningServer = null;
  await app.close();
  log.info('Web server to\'xtatildi');
};
