/**
 * Referal havolalar: admin mashina uchun bir martalik havola yaratadi, haydovchi
 * uni bosib /start qilganda mashinaga avtomatik biriktiriladi.
 *
 * Asosiy xavf — bitta havolani ikki kishi bir vaqtda ishlatishi. Shuning uchun
 * barcha o'zgarishlar tranzaksiya ichida va shartli updateMany orqali bajariladi.
 */

import type { Car, Driver, Referral, User } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { REFERRAL_TTL_MS } from '../config/constants.js';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { t } from '../i18n/index.js';
import { formatPlate } from '../utils/plate.js';

const log = childLogger('referral');

/** Token uzunligi: taxmin qilishga chidamli, lekin havola qisqa qoladi. */
const REFERRAL_TOKEN_LENGTH = 16;

export type ReferralCreated = {
  readonly referral: Referral;
  readonly link: string;
};

export const buildReferralLink = (token: string): string =>
  `https://t.me/${env.BOT_USERNAME}?start=ref_${token}`;

/** "ref_<token>" ko'rinishidagi start payload dan tokenni ajratadi. */
export const parseReferralPayload = (payload: string): string | null => {
  const match = /^ref_([A-Za-z0-9_-]{8,64})$/.exec(payload.trim());
  return match?.[1] ?? null;
};

const buildFullName = (user: User): string | null => {
  const parts = [user.firstName, user.lastName].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
};

/** Mashinaga havola yaratadi. Havola egasi yo'q — kim birinchi bossa, o'sha biriktiriladi. */
export const createCarReferral = async (
  carId: string,
  createdByUserId?: string,
  now: Date = new Date(),
): Promise<ReferralCreated> => {
  const car = await prisma.car.findUnique({ where: { id: carId }, select: { id: true, status: true } });
  if (!car) throw new NotFoundError(t.common.notFound, { carId });
  if (car.status === 'ARCHIVED') {
    throw new ValidationError(t.common.notFound, { carId, reason: 'archived' });
  }

  const token = nanoid(REFERRAL_TOKEN_LENGTH);
  const referral = await prisma.referral.create({
    data: {
      token,
      carId,
      createdById: createdByUserId ?? null,
      status: 'ACTIVE',
      expiresAt: new Date(now.getTime() + REFERRAL_TTL_MS),
    },
  });

  log.info({ carId, referralId: referral.id }, 'Referal havola yaratildi');
  return { referral, link: buildReferralLink(token) };
};

/**
 * Havolani ishlatadi: haydovchini yaratadi/topadi va mashinaga biriktiradi.
 * ensureDriver o'rniga tx.driver.upsert ishlatilgan — haydovchi yaratilishi ham
 * biriktirish bilan bitta atomik amalda bo'lishi shart.
 */
export const consumeReferral = async (
  token: string,
  user: User,
  now: Date = new Date(),
): Promise<{ car: Car; driver: Driver }> => {
  const cleanToken = token.trim();
  if (cleanToken.length === 0) throw new ValidationError(t.referral.invalid);

  return prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({ where: { token: cleanToken }, include: { car: true } });
    if (!referral || !referral.car) throw new ValidationError(t.referral.invalid);
    if (referral.status !== 'ACTIVE') throw new ValidationError(t.referral.alreadyUsed);

    if (referral.expiresAt && referral.expiresAt.getTime() <= now.getTime()) {
      await tx.referral.updateMany({ where: { id: referral.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
      throw new ValidationError(t.referral.invalid, { referralId: referral.id, reason: 'expired' });
    }

    const car = referral.car;
    if (car.status === 'ARCHIVED') {
      throw new ValidationError(t.referral.invalid, { carId: car.id, reason: 'archived' });
    }

    const driver = await tx.driver.upsert({
      where: { userId: user.id },
      create: { userId: user.id, fullName: buildFullName(user), phone: user.phone ?? null },
      update: {},
    });

    if (car.driverId !== null && car.driverId !== driver.id) {
      throw new ConflictError(t.referral.carTaken(formatPlate(car.plateNumber)), { carId: car.id });
    }

    const claimed = await tx.referral.updateMany({
      where: { id: referral.id, status: 'ACTIVE' },
      data: {
        status: 'USED',
        usedAt: now,
        usedByTelegramId: user.telegramId,
        driverId: driver.id,
      },
    });
    if (claimed.count === 0) throw new ValidationError(t.referral.alreadyUsed, { referralId: referral.id });

    const linkedCar = await tx.car.update({ where: { id: car.id }, data: { driverId: driver.id } });
    log.info({ carId: linkedCar.id, driverId: driver.id }, 'Haydovchi mashinaga biriktirildi');

    return { car: linkedCar, driver };
  });
};

export const revokeReferral = async (referralId: string): Promise<Referral> => {
  const existing = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!existing) throw new NotFoundError(t.common.notFound, { referralId });
  if (existing.status === 'USED') {
    throw new ConflictError(t.referral.alreadyUsed, { referralId });
  }

  return prisma.referral.update({ where: { id: referralId }, data: { status: 'REVOKED' } });
};

/** Muddati o'tgan havolalarni yopadi (rejalashtiruvchi chaqiradi). */
export const expireStaleReferrals = async (now: Date = new Date()): Promise<number> => {
  const result = await prisma.referral.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });

  if (result.count > 0) log.info({ expired: result.count }, "Muddati o'tgan havolalar yopildi");
  return result.count;
};
