/**
 * Telegram webhook. Faqat `BOT_MODE=webhook` bo'lganda ro'yxatdan o'tadi.
 *
 * Ikki qatlamli himoya:
 *   1) yo'lning o'zida maxfiy satr — manzilni bilmagan hech kim so'rov yubora olmaydi;
 *   2) `X-Telegram-Bot-Api-Secret-Token` sarlavhasi — yo'l loglardan sizib chiqsa ham
 *      qalbaki update qabul qilinmaydi. Taqqoslash vaqt bo'yicha barqaror.
 */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { webhookCallback, type Bot } from 'grammy';
// Faqat tur: kompilyatsiyada o'chadi, shuning uchun bot moduli yuklanmaydi.
import type { BotContext } from '../../bot/bot.js';
import { env } from '../../config/env.js';
import { childLogger } from '../../core/logger.js';

const log = childLogger('web:webhook');

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

/** grammY update ni qayta ishlashga shuncha vaqt beradi (Telegram 60s kutadi). */
const WEBHOOK_TIMEOUT_MS = 20_000;

export const buildWebhookPath = (secret: string): string => `/webhook/${secret}`;

/**
 * Bot odatda `index.ts` dan beriladi. Berilmagan holatda (masalan, testda) bot
 * moduli DINAMIK yuklanadi — shunda web qatlami butun handler daraxtiga bog'lanmaydi.
 */
const resolveBot = async (bot?: Bot<BotContext>): Promise<Bot<BotContext>> => {
  if (bot) return bot;
  const { createBot } = await import('../../bot/bot.js');
  return createBot();
};

const secretMatches = (provided: unknown, expected: string): boolean => {
  if (typeof provided !== 'string') return false;
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

export const registerWebhookRoutes = async (app: FastifyInstance, bot?: Bot<BotContext>): Promise<void> => {
  const secret = env.WEBHOOK_SECRET;
  if (env.BOT_MODE !== 'webhook' || !secret) {
    log.info({ mode: env.BOT_MODE }, "Webhook yo'li ro'yxatdan o'tkazilmadi (polling rejimi)");
    return;
  }

  const handleUpdate = webhookCallback(await resolveBot(bot), 'fastify', {
    secretToken: secret,
    timeoutMilliseconds: WEBHOOK_TIMEOUT_MS,
  });

  app.post(
    buildWebhookPath(secret),
    { config: { rateLimit: false } },
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!secretMatches(request.headers[SECRET_HEADER], secret)) {
        log.warn('Webhook so\'rovida maxfiy sarlavha mos emas');
        await reply.code(HTTP_UNAUTHORIZED).send({ ok: false });
        return;
      }
      await handleUpdate(request, reply);
    },
  );

  /**
   * Diagnostika: Telegram ESKI yo'lga (masalan, sir o'zgartirilgandan keyin
   * qayd etilgan havolaga) kelsa, Fastify jimgina 404 qaytarardi va sabab
   * loglarda umuman qolmasdi. Bu yo'nalish shu holatni ko'rinadigan qiladi.
   * Statik yo'l (haqiqiy sir) parametrli yo'ldan ustun turadi, shuning uchun
   * qonuniy so'rovlar bu yerga tushmaydi.
   */
  app.post(
    '/webhook/:candidate',
    { config: { rateLimit: false } },
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      log.error(
        { hasSecretHeader: typeof request.headers[SECRET_HEADER] === 'string' },
        "Webhook NOTO'G'RI yo'lga keldi — Telegram'dagi havola eskirgan. " +
          'PUBLIC_URL yoki WEBHOOK_SECRET o\'zgargan bo\'lsa, botni qayta ishga tushiring.',
      );
      await reply.code(HTTP_NOT_FOUND).send({ ok: false });
    },
  );

  log.info('Webhook yo\'li ro\'yxatdan o\'tdi');
};
