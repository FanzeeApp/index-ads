/**
 * Mini App yuklash sessiyalari.
 *
 * Nima uchun: Mini App brauzerda ochiladi va u yerdan kelgan so'rovga ishonib
 * bo'lmaydi. Har bir tekshiruv uchun qisqa muddatli, bitta Telegram foydalanuvchiga
 * bog'langan token beriladi — token initData tekshiruvidan keyin ham qo'shimcha
 * himoya qatlami bo'lib xizmat qiladi.
 */

import type { UploadSession } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { UPLOAD_SESSION_TTL_MS } from '../config/constants.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { t } from '../i18n/index.js';
import { checkRequestInclude, type CheckRequestFull } from './checkService.js';

const log = childLogger('upload-session');

/** Token uzunligi — brute-force ga amalda chidamli. */
const UPLOAD_TOKEN_LENGTH = 32;

export type IssuedSession = {
  readonly token: string;
  readonly url: string;
};

export type UploadSessionResolved = {
  readonly session: UploadSession;
  readonly check: CheckRequestFull;
};

const buildAppUrl = (token: string): string => {
  if (!env.PUBLIC_URL) {
    throw new AppError('CONFIG', "PUBLIC_URL sozlanmagan — Mini App havolasi yaratib bo'lmaydi", {
      statusCode: 500,
    });
  }
  return `${env.PUBLIC_URL.replace(/\/+$/, '')}/app?token=${encodeURIComponent(token)}`;
};

/** Tekshiruv uchun yangi sessiya ochadi. Eskisi bekor qilinmaydi — TTL o'zi yopadi. */
export const issueSession = async (
  checkRequestId: string,
  telegramId: number | bigint,
  now: Date = new Date(),
): Promise<IssuedSession> => {
  const check = await prisma.checkRequest.findUnique({
    where: { id: checkRequestId },
    select: { id: true, status: true },
  });
  if (!check) throw new NotFoundError(t.common.notFound, { checkRequestId });
  if (check.status !== 'PENDING') {
    throw new ConflictError(
      check.status === 'EXPIRED' ? t.driver.checkExpired : t.driver.checkAlreadyDone,
      { checkRequestId, status: check.status },
    );
  }

  const token = nanoid(UPLOAD_TOKEN_LENGTH);
  const url = buildAppUrl(token);

  await prisma.uploadSession.create({
    data: {
      token,
      checkRequestId,
      telegramId: BigInt(telegramId),
      expiresAt: new Date(now.getTime() + UPLOAD_SESSION_TTL_MS),
    },
  });

  return { token, url };
};

/**
 * Tokenni tekshiradi va tegishli tekshiruvni qaytaradi.
 * Boshqa foydalanuvchi urinsa — ForbiddenError (bu jiddiy signal, logga yoziladi).
 */
export const resolveSession = async (
  token: string,
  telegramId: number | bigint,
  now: Date = new Date(),
): Promise<UploadSessionResolved> => {
  const cleanToken = token.trim();
  if (cleanToken.length === 0) throw new ValidationError(t.miniapp.errorSession);

  const session = await prisma.uploadSession.findUnique({ where: { token: cleanToken } });
  if (!session) throw new ValidationError(t.miniapp.errorSession);

  if (session.consumedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
    throw new ValidationError(t.miniapp.errorSession, { sessionId: session.id, reason: 'stale' });
  }

  if (session.telegramId !== BigInt(telegramId)) {
    log.warn(
      { sessionId: session.id, expected: session.telegramId.toString(), actual: String(telegramId) },
      'Sessiya boshqa foydalanuvchi tomonidan ishlatilmoqchi',
    );
    throw new ForbiddenError(t.common.forbidden, { sessionId: session.id });
  }

  const check = await prisma.checkRequest.findUnique({
    where: { id: session.checkRequestId },
    include: checkRequestInclude,
  });
  if (!check) throw new ValidationError(t.miniapp.errorSession, { sessionId: session.id });

  if (check.status !== 'PENDING') {
    throw new ValidationError(
      check.status === 'EXPIRED' ? t.driver.checkExpired : t.driver.checkAlreadyDone,
      { checkId: check.id, status: check.status },
    );
  }

  return { session, check };
};

/** Sessiyani yopadi (barcha rasmlar yuborilgandan keyin). */
export const consumeSession = async (token: string, now: Date = new Date()): Promise<void> => {
  const result = await prisma.uploadSession.updateMany({
    where: { token: token.trim(), consumedAt: null },
    data: { consumedAt: now },
  });

  if (result.count === 0) {
    log.warn('Yopilishi kerak bo\'lgan sessiya topilmadi yoki allaqachon yopilgan');
  }
};

/** Muddati o'tgan sessiyalarni tozalaydi (rejalashtiruvchi chaqiradi). */
export const purgeExpired = async (now: Date = new Date()): Promise<number> => {
  const result = await prisma.uploadSession.deleteMany({ where: { expiresAt: { lt: now } } });
  if (result.count > 0) log.debug({ purged: result.count }, 'Eski yuklash sessiyalari tozalandi');
  return result.count;
};
