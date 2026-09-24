/**
 * Telegramga xabar yuborishning yagona darvozasi.
 *
 * Nima uchun kerak: 1000+ haydovchiga xabar yuborilganda Telegram limiti
 * (~30 xabar/sekund) oshib ketsa hisob vaqtincha bloklanadi. Barcha yuborishlar
 * p-queue orqali sekundiga BROADCAST_RATE_PER_SECOND tezlikda o'tadi.
 *
 * Bu yerdagi funksiyalar HECH QACHON xato tashlamaydi — natija boolean.
 * Xabar yuborilmagani biznes jarayonini to'xtatmasligi kerak.
 */

import PQueue from 'p-queue';
import { GrammyError, HttpError, type Bot } from 'grammy';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { BROADCAST_CONCURRENCY, BROADCAST_RATE_PER_SECOND } from '../config/constants.js';
import { describeError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { CAPTION_LIMIT, MESSAGE_LIMIT, truncate } from '../utils/html.js';
import type { BotContext } from '../bot/bot.js';

const log = childLogger('notify');

/** Telegram xato kodlari. */
const ERROR_CODE_FORBIDDEN = 403;
const ERROR_CODE_TOO_MANY_REQUESTS = 429;
/** 429 javobida retry_after bo'lmasa — shuncha kutamiz. */
const DEFAULT_RETRY_AFTER_SECONDS = 3;
/** Qancha kutsak ham shundan oshmaydi (tsikl tiqilib qolmasligi uchun). */
const MAX_RETRY_WAIT_MS = 60_000;
/** Bitta xabar uchun urinishlar soni (1 ta qayta urinish). */
const MAX_SEND_ATTEMPTS = 2;
/** Telegram bitta albomda 10 tagacha rasm qabul qiladi. */
const MEDIA_GROUP_LIMIT = 10;
const RATE_INTERVAL_MS = 1000;

export type SendExtra = Readonly<Record<string, unknown>>;

export type MediaItem = {
  readonly fileId: string;
  readonly caption?: string;
};

export type BroadcastResult = {
  readonly sent: number;
  readonly failed: number;
};

const queue = new PQueue({
  concurrency: BROADCAST_CONCURRENCY,
  intervalCap: BROADCAST_RATE_PER_SECOND,
  interval: RATE_INTERVAL_MS,
});

let botRef: Bot<BotContext> | null = null;

/** index.ts bot yaratilgandan so'ng chaqiradi. */
export const setBotForNotify = (bot: Bot<BotContext>): void => {
  botRef = bot;
};

const requireBot = (): Bot<BotContext> | null => {
  if (!botRef) log.error('Bot instansiyasi berilmagan — xabar yuborilmadi');
  return botRef;
};

/** Telegram chat_id doim number oralig'ida; BigInt faqat bazada saqlanadi. */
const toChatId = (chatId: number | bigint): number => Number(chatId);

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * grammY payload turlari juda tor — chaqiruvchidan kelgan qo'shimcha maydonlarni
 * shu yagona joyda moslashtiramiz.
 */
const withDefaults = <T>(extra: SendExtra, defaults: SendExtra): T => ({ ...defaults, ...extra }) as T;

const markBlocked = async (chatId: number | bigint): Promise<void> => {
  try {
    await prisma.user.updateMany({ where: { telegramId: BigInt(chatId) }, data: { isBlocked: true } });
    log.info({ chatId: String(chatId) }, 'Foydalanuvchi botni bloklagan — belgilandi');
  } catch (error) {
    log.error({ reason: describeError(error) }, 'isBlocked belgilanmadi');
  }
};

/**
 * Xatoni tahlil qiladi. null — qayta urinmaymiz; son — shuncha ms kutib qayta urinamiz.
 */
const inspectSendError = async (
  chatId: number | bigint,
  error: unknown,
  method: string,
  canRetry: boolean,
): Promise<number | null> => {
  if (error instanceof GrammyError) {
    if (error.error_code === ERROR_CODE_FORBIDDEN) {
      await markBlocked(chatId);
      return null;
    }

    if (error.error_code === ERROR_CODE_TOO_MANY_REQUESTS && canRetry) {
      const waitMs = (error.parameters.retry_after ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000;
      log.warn({ chatId: String(chatId), method, waitMs }, 'Telegram limiti — kutib qayta urinamiz');
      return Math.min(waitMs, MAX_RETRY_WAIT_MS);
    }

    log.error(
      { chatId: String(chatId), method, code: error.error_code, description: error.description },
      'Telegram xatosi',
    );
    return null;
  }

  if (error instanceof HttpError) {
    log.error({ chatId: String(chatId), method, reason: describeError(error.error) }, 'Tarmoq xatosi');
    return null;
  }

  log.error({ chatId: String(chatId), method, reason: describeError(error) }, "Noma'lum yuborish xatosi");
  return null;
};

/** Navbat orqali yuboradi va xatoni yutmasdan, lekin tashqariga chiqarmasdan qayd etadi. */
const dispatch = async (
  chatId: number | bigint,
  task: () => Promise<unknown>,
  method: string,
): Promise<boolean> => {
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      await queue.add(task);
      return true;
    } catch (error) {
      const waitMs = await inspectSendError(chatId, error, method, attempt < MAX_SEND_ATTEMPTS);
      if (waitMs === null) return false;
      await delay(waitMs);
    }
  }

  return false;
};

export const sendMessageSafe = async (
  chatId: number | bigint,
  text: string,
  extra: SendExtra = {},
): Promise<boolean> => {
  const bot = requireBot();
  if (!bot) return false;

  const payload = withDefaults<Parameters<typeof bot.api.sendMessage>[2]>(extra, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });

  return dispatch(chatId, () => bot.api.sendMessage(toChatId(chatId), truncate(text, MESSAGE_LIMIT), payload), 'sendMessage');
};

export const sendPhotoSafe = async (
  chatId: number | bigint,
  fileId: string,
  extra: SendExtra = {},
): Promise<boolean> => {
  const bot = requireBot();
  if (!bot) return false;

  const payload = withDefaults<Parameters<typeof bot.api.sendPhoto>[2]>(extra, { parse_mode: 'HTML' });
  return dispatch(chatId, () => bot.api.sendPhoto(toChatId(chatId), fileId, payload), 'sendPhoto');
};

const toChunks = (media: readonly MediaItem[]): readonly (readonly MediaItem[])[] => {
  const chunks: MediaItem[][] = [];
  for (let index = 0; index < media.length; index += MEDIA_GROUP_LIMIT) {
    chunks.push(media.slice(index, index + MEDIA_GROUP_LIMIT));
  }
  return chunks;
};

const toInputMedia = (item: MediaItem) => ({
  type: 'photo' as const,
  media: item.fileId,
  ...(item.caption ? { caption: truncate(item.caption, CAPTION_LIMIT), parse_mode: 'HTML' as const } : {}),
});

/** Albom sifatida yuboradi. Bitta rasm bo'lsa — oddiy sendPhoto (Telegram albomga 2+ talab qiladi). */
export const sendMediaGroupSafe = async (
  chatId: number | bigint,
  media: readonly MediaItem[],
): Promise<boolean> => {
  const bot = requireBot();
  if (!bot) return false;

  const [first] = media;
  if (!first) return false;
  if (media.length === 1) {
    return sendPhotoSafe(chatId, first.fileId, first.caption ? { caption: truncate(first.caption, CAPTION_LIMIT) } : {});
  }

  const results = await Promise.all(
    toChunks(media).map((chunk) =>
      dispatch(chatId, () => bot.api.sendMediaGroup(toChatId(chatId), chunk.map(toInputMedia)), 'sendMediaGroup'),
    ),
  );

  return results.every(Boolean);
};

/** Ommaviy yuborish — navbat tezlikni o'zi ushlab turadi. */
export const broadcast = async (
  chatIds: readonly (number | bigint)[],
  text: string,
  extra: SendExtra = {},
): Promise<BroadcastResult> => {
  const results = await Promise.all(chatIds.map((chatId) => sendMessageSafe(chatId, text, extra)));
  const sent = results.filter((ok) => ok).length;

  log.info({ total: results.length, sent, failed: results.length - sent }, 'Ommaviy yuborish yakunlandi');
  return { sent, failed: results.length - sent };
};

/** Sozlamadagi super-adminlar + bazadagi ADMIN/SUPERADMIN rollari. */
const collectAdminChatIds = async (): Promise<readonly bigint[]> => {
  const fromEnv = env.SUPER_ADMIN_IDS.map((id) => BigInt(id));

  try {
    const rows = await prisma.user.findMany({
      where: { role: { in: ['SUPERADMIN', 'ADMIN'] }, isBlocked: false, telegramId: { not: null } },
      select: { telegramId: true },
    });
    const fromDb = rows
      .map((row) => row.telegramId)
      .filter((id): id is bigint => id !== null);

    const unique = new Set<string>([...fromEnv, ...fromDb].map((id) => id.toString()));
    return [...unique].map((id) => BigInt(id));
  } catch (error) {
    log.error({ reason: describeError(error) }, 'Adminlar ro\'yxati o\'qilmadi — sozlamadagilar ishlatiladi');
    return fromEnv;
  }
};

export const notifyAdmins = async (text: string, extra: SendExtra = {}): Promise<void> => {
  const chatIds = await collectAdminChatIds();
  if (chatIds.length === 0) {
    log.warn('Xabar yuborish uchun admin topilmadi');
    return;
  }

  await broadcast(chatIds, text, extra);
};
