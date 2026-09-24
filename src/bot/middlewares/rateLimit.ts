import type { MiddlewareFn } from 'grammy';
import { MINUTE_MS } from '../../config/constants.js';
import { describeError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import type { BotContext } from '../bot.js';

const log = childLogger('bot:rateLimit');

const SECOND_MS = 1_000;
/** Bir foydalanuvchi uchun 10 sekundda 10 ta update — odatiy foydalanishga yetarli. */
const BUCKET_CAPACITY = 10;
const BUCKET_WINDOW_MS = 10 * SECOND_MS;
/** Bitta tokenni tiklash uchun ketadigan vaqt. */
const REFILL_MS_PER_TOKEN = BUCKET_WINDOW_MS / BUCKET_CAPACITY;
/** Faolsiz yozuvlar shuncha vaqtdan keyin tozalanadi — xotira o'smasligi uchun. */
const BUCKET_TTL_MS = 10 * MINUTE_MS;
const SWEEP_INTERVAL_MS = 5 * MINUTE_MS;

type Bucket = {
  readonly tokens: number;
  readonly updatedAt: number;
  /** Foydalanuvchi ogohlantirildimi — spam qilmaslik uchun faqat bir marta yoziladi. */
  readonly warned: boolean;
};

const buckets = new Map<number, Bucket>();
let lastSweepAt = 0;

const freshBucket = (now: number): Bucket => ({ tokens: BUCKET_CAPACITY, updatedAt: now, warned: false });

/** O'tgan vaqtga qarab tokenlarni tiklaydi va yangi holat qaytaradi. */
const refill = (bucket: Bucket, now: number): Bucket => {
  const restored = Math.floor((now - bucket.updatedAt) / REFILL_MS_PER_TOKEN);
  if (restored <= 0) return bucket;
  const tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + restored);
  return { tokens, updatedAt: now, warned: tokens >= BUCKET_CAPACITY ? false : bucket.warned };
};

/** Eski yozuvlarni davriy tozalaydi (taymersiz — update oqimiga ilashib ketadi). */
const sweep = (now: number): void => {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [userId, bucket] of buckets) {
    if (now - bucket.updatedAt > BUCKET_TTL_MS) buckets.delete(userId);
  }
};

const warnOnce = async (ctx: BotContext): Promise<void> => {
  try {
    if (ctx.callbackQuery !== undefined) {
      await ctx.answerCallbackQuery({ text: t.common.rateLimited });
      return;
    }
    await ctx.reply(t.common.rateLimited);
  } catch (error) {
    log.warn({ userId: ctx.from?.id, reason: describeError(error) }, "Ogohlantirishni yuborib bo'lmadi");
  }
};

/**
 * Oddiy token-bucket: flood va tasodifiy ikki marta bosishdan himoya qiladi.
 * Chegaradan oshgan update zanjirga o'tkazilmaydi.
 */
export const rateLimit = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId === undefined) {
    await next();
    return;
  }

  const now = Date.now();
  sweep(now);

  const current = refill(buckets.get(userId) ?? freshBucket(now), now);

  if (current.tokens < 1) {
    buckets.set(userId, { ...current, warned: true });
    if (!current.warned) {
      log.debug({ userId }, 'Chegaradan oshdi');
      await warnOnce(ctx);
    }
    return;
  }

  // `warned` saqlanadi: u faqat bucket to'liq tiklanganda (refill) o'chadi,
  // shunda uzluksiz flood paytida ogohlantirish takrorlanmaydi.
  buckets.set(userId, { tokens: current.tokens - 1, updatedAt: current.updatedAt, warned: current.warned });
  await next();
};

/** Testlar uchun — holatni tozalaydi. */
export const resetRateLimitState = (): void => {
  buckets.clear();
  lastSweepAt = 0;
};
