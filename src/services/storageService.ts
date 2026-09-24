/**
 * Rasmlarni saqlash. Alohida S3 o'rniga Telegram arxiv chati ishlatiladi:
 * file_id bilan rasmni istalgan chatga qayta yuborish mumkin va bu bepul.
 *
 * Bot instansiyasi setter orqali beriladi — index.ts bot yaratilgach chaqiradi.
 * To'g'ridan-to'g'ri import qilinsa halqa bog'lanish paydo bo'lardi.
 */

import { createHash } from 'node:crypto';
import { InputFile, type Bot } from 'grammy';
import type { BotContext } from '../bot/bot.js';
import { env } from '../config/env.js';
import { MAX_UPLOAD_BYTES } from '../config/constants.js';
import { ValidationError, describeError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { t } from '../i18n/index.js';
import { CAPTION_LIMIT, truncate } from '../utils/html.js';

const log = childLogger('storage');

export type StoredPhoto = {
  readonly telegramFileId: string | null;
  readonly fileUniqueId: string | null;
  readonly sizeBytes: number;
  readonly sha256: string;
};

export type StorePhotoInput = {
  readonly buffer: Buffer;
  readonly filename: string;
  readonly caption?: string;
};

type PhotoSizeLike = { readonly file_id: string; readonly file_unique_id: string; readonly width: number; readonly height: number };

let botRef: Bot<BotContext> | null = null;

/** index.ts bot yaratilgandan so'ng chaqiradi. */
export const setBotForStorage = (bot: Bot<BotContext>): void => {
  botRef = bot;
};

export const sha256Of = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

/** Telegram bir nechta o'lchamni qaytaradi — bizga eng kattasi (asl sifat) kerak. */
const pickLargest = (sizes: readonly PhotoSizeLike[] | undefined): PhotoSizeLike | undefined =>
  (sizes ?? []).reduce<PhotoSizeLike | undefined>(
    (best, current) => (!best || current.width * current.height > best.width * best.height ? current : best),
    undefined,
  );

/**
 * Buferni arxiv chatiga yuboradi. Arxiv sozlanmagan yoki yuborish muvaffaqiyatsiz
 * bo'lsa ham xato tashlamaydi: rasm baribir tekshiruvga biriktirilishi kerak,
 * shunchaki file_id bo'lmaydi (bu logda aniq ko'rinadi).
 */
export const storePhotoBuffer = async (input: StorePhotoInput): Promise<StoredPhoto> => {
  const sizeBytes = input.buffer.byteLength;
  if (sizeBytes === 0) throw new ValidationError(t.miniapp.errorPhotoEmpty);
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new ValidationError(t.miniapp.errorPhotoTooLarge, { sizeBytes, limit: MAX_UPLOAD_BYTES });
  }

  const sha256 = sha256Of(input.buffer);
  const fallback: StoredPhoto = { telegramFileId: null, fileUniqueId: null, sizeBytes, sha256 };

  if (!botRef) {
    log.warn('Bot instansiyasi berilmagan — rasm arxivga yuborilmadi');
    return fallback;
  }
  if (env.ARCHIVE_CHAT_ID === undefined) {
    log.warn('ARCHIVE_CHAT_ID sozlanmagan — rasm arxivga yuborilmadi');
    return fallback;
  }

  try {
    const message = await botRef.api.sendPhoto(
      env.ARCHIVE_CHAT_ID,
      new InputFile(input.buffer, input.filename),
      input.caption ? { caption: truncate(input.caption, CAPTION_LIMIT) } : {},
    );

    const largest = pickLargest(message.photo);
    if (!largest) {
      log.warn({ messageId: message.message_id }, 'Arxiv javobida rasm o\'lchamlari yo\'q');
      return fallback;
    }

    return { telegramFileId: largest.file_id, fileUniqueId: largest.file_unique_id, sizeBytes, sha256 };
  } catch (error) {
    log.error({ reason: describeError(error), filename: input.filename }, 'Rasmni arxivga yuborib bo\'lmadi');
    return fallback;
  }
};
