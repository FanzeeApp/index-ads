/**
 * Tekshiruv yadrosi: reklama joylashtirilgan mashinalardan davriy foto-hisobot
 * so'rash, kelgan rasmlarni biriktirish va tekshiruv holatini boshqarish.
 *
 * Bu modul faqat ma'lumotlar bilan ishlaydi — xabar yuborish notifyService/
 * reportService zimmasida (halqa bog'lanish bo'lmasligi uchun).
 */

import type {
  Advertiser,
  Campaign,
  Car,
  CheckRequest,
  CheckStatus,
  Driver,
  Photo,
  PhotoOrigin,
  PhotoSide,
  Placement,
  Prisma,
  User,
  ValidationVerdict,
} from '@prisma/client';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { DAY_MS, PAGE_SIZE, REQUIRED_SIDES } from '../config/constants.js';
import { ConflictError, NotFoundError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { t } from '../i18n/index.js';
import { addDays, addHours } from '../utils/time.js';
import { buildPage, toSkip, type Page } from '../utils/pagination.js';
import { truncate } from '../utils/html.js';

const log = childLogger('check');

/** Bir xil rasm qayta yuborilganini shuncha kun ichida qidiramiz. */
const DUPLICATE_LOOKBACK_DAYS = 30;
/** Hukm izohi cheksiz o'smasligi uchun chegara. */
const VERDICT_NOTE_LIMIT = 300;

const carInclude = { driver: { include: { user: true } } } as const;
const campaignInclude = { advertiser: { include: { user: true } } } as const;

const placementInclude = {
  car: { include: carInclude },
  campaign: { include: campaignInclude },
} satisfies Prisma.PlacementInclude;

/** Rasmlar har doim yuborilish tartibida — "joriy" rasm eng oxirgisi. */
export const checkRequestInclude = {
  photos: { orderBy: { createdAt: 'asc' } },
  car: { include: carInclude },
  campaign: { include: campaignInclude },
} satisfies Prisma.CheckRequestInclude;

export type PlacementWithRelations = Placement & {
  car: Car & { driver: (Driver & { user: User }) | null };
  campaign: Campaign & { advertiser: Advertiser & { user: User | null } };
};

export type CheckRequestFull = CheckRequest & {
  photos: Photo[];
  car: Car & { driver: (Driver & { user: User }) | null };
  campaign: Campaign & { advertiser: Advertiser & { user: User | null } };
};

export type AttachPhotoInput = {
  readonly side: PhotoSide;
  readonly origin: PhotoOrigin;
  readonly telegramFileId?: string;
  readonly fileUniqueId?: string;
  readonly storageUrl?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly sha256?: string;
  readonly takenAt?: Date;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly accuracyM?: number;
  readonly verdict: ValidationVerdict;
  readonly verdictNote?: string;
};

export type ListChecksOptions = {
  readonly page?: number;
  readonly status?: CheckStatus;
  readonly campaignId?: string;
  readonly carId?: string;
};

export type CheckStats = {
  readonly pending: number;
  readonly submitted: number;
  readonly approved: number;
  readonly rejected: number;
  readonly expired: number;
  readonly complianceRate: number;
};

const mergeNotes = (...parts: readonly (string | undefined)[]): string | undefined => {
  const meaningful = parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  if (meaningful.length === 0) return undefined;
  return truncate(meaningful.join(' · '), VERDICT_NOTE_LIMIT);
};

const toInt = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;

/**
 * Har bir tomon bo'yicha eng oxirgi rasm — hisobotda va ko'rikda shular ishlatiladi.
 * Eski rasmlar o'chirilmaydi (audit izi saqlanadi), shunchaki "joriy" emas.
 */
export const currentPhotos = (check: CheckRequestFull): readonly Photo[] =>
  REQUIRED_SIDES.map((side) => {
    const forSide = check.photos.filter((photo) => photo.side === side);
    return forSide.length > 0 ? forSide[forSide.length - 1] : undefined;
  }).filter((photo): photo is Photo => photo !== undefined);

/**
 * Muddati kelgan joylashtirishlar. Ochiq (PENDING) tekshiruvi borlar chetlab
 * o'tiladi — bitta mashinaga ikkita so'rov yubormaslik uchun.
 * nextCheckAt=null — hali bir marta ham tekshirilmagan, ular birinchi navbatda.
 */
export const duePlacements = async (now: Date, limit: number): Promise<PlacementWithRelations[]> =>
  prisma.placement.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ nextCheckAt: { lte: now } }, { nextCheckAt: null }],
      campaign: { status: 'ACTIVE' },
      car: { driverId: { not: null }, status: { not: 'ARCHIVED' } },
      checks: { none: { status: 'PENDING' } },
    },
    include: placementInclude,
    orderBy: { nextCheckAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
  });

/** Kontraktdagi nom bilan moslik uchun taxallus. */
export const dueePlacements = duePlacements;

/**
 * Tekshiruv so'rovini yaratadi va joylashtirishning keyingi muddatini siljitadi.
 * Ikkalasi bitta tranzaksiyada: shartli updateMany ikki parallel tsikl bir xil
 * joylashtirishni olib ketishining oldini oladi.
 */
export const createCheckRequest = async (
  placement: PlacementWithRelations,
  now: Date = new Date(),
): Promise<CheckRequestFull> => {
  const intervalDays = placement.campaign.checkIntervalDays ?? env.CHECK_INTERVAL_DAYS;
  const dueAt = addHours(now, env.CHECK_DEADLINE_HOURS);
  const nextCheckAt = addDays(now, intervalDays);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.placement.updateMany({
      where: {
        id: placement.id,
        status: 'ACTIVE',
        OR: [{ nextCheckAt: { lte: now } }, { nextCheckAt: null }],
      },
      data: { lastCheckAt: now, nextCheckAt },
    });

    if (claimed.count === 0) {
      throw new ConflictError(t.common.error, { placementId: placement.id, reason: 'already-claimed' });
    }

    return tx.checkRequest.create({
      data: {
        placementId: placement.id,
        carId: placement.carId,
        campaignId: placement.campaignId,
        status: 'PENDING',
        requestedAt: now,
        dueAt,
      },
      include: checkRequestInclude,
    });
  });
};

export const getCheckById = async (id: string): Promise<CheckRequestFull> => {
  const check = await prisma.checkRequest.findUnique({ where: { id }, include: checkRequestInclude });
  if (!check) throw new NotFoundError(t.common.notFound, { checkId: id });
  return check;
};

/** Haydovchining hozir javob kutayotgan tekshiruvi (eng yangisi). */
export const getActiveCheckForDriver = async (telegramId: number | bigint): Promise<CheckRequestFull | null> =>
  prisma.checkRequest.findFirst({
    where: {
      status: 'PENDING',
      car: { driver: { user: { telegramId: BigInt(telegramId) } } },
    },
    include: checkRequestInclude,
    orderBy: { requestedAt: 'desc' },
  });

/**
 * Shu xesh bilan rasm avval kelganmi — galereyadan qayta yuborishning aniq belgisi.
 * Rad etmaymiz, faqat adminga ko'rinadigan izoh qo'shamiz.
 */
const findDuplicateNote = async (
  tx: Prisma.TransactionClient,
  params: { checkRequestId: string; carId: string; sha256?: string; now: Date },
): Promise<string | undefined> => {
  if (!params.sha256) return undefined;

  const duplicate = await tx.photo.findFirst({
    where: {
      sha256: params.sha256,
      createdAt: { gte: new Date(params.now.getTime() - DUPLICATE_LOOKBACK_DAYS * DAY_MS) },
      OR: [{ checkRequestId: params.checkRequestId }, { checkRequest: { carId: params.carId } }],
    },
    select: { id: true },
  });

  return duplicate ? t.note.duplicatePhoto : undefined;
};

/**
 * Rasmni tekshiruvga biriktiradi. Barcha talab qilingan tomonlar to'lsa —
 * tekshiruv SUBMITTED holatiga o'tadi va chaqiruvchi hisobot yuboradi.
 */
export const attachPhoto = async (
  checkRequestId: string,
  input: AttachPhotoInput,
  now: Date = new Date(),
): Promise<{ check: CheckRequestFull; allSidesReceived: boolean }> =>
  prisma.$transaction(async (tx) => {
    const existing = await tx.checkRequest.findUnique({
      where: { id: checkRequestId },
      select: { id: true, carId: true, status: true },
    });
    if (!existing) throw new NotFoundError(t.common.notFound, { checkRequestId });
    if (existing.status !== 'PENDING') {
      throw new ConflictError(
        existing.status === 'EXPIRED' ? t.driver.checkExpired : t.driver.checkAlreadyDone,
        { checkRequestId, status: existing.status },
      );
    }

    const duplicateNote = await findDuplicateNote(tx, {
      checkRequestId,
      carId: existing.carId,
      sha256: input.sha256,
      now,
    });

    await tx.photo.create({
      data: {
        checkRequestId,
        side: input.side,
        origin: input.origin,
        telegramFileId: input.telegramFileId ?? null,
        fileUniqueId: input.fileUniqueId ?? null,
        storageUrl: input.storageUrl ?? null,
        width: toInt(input.width) ?? null,
        height: toInt(input.height) ?? null,
        sizeBytes: toInt(input.sizeBytes) ?? null,
        sha256: input.sha256 ?? null,
        takenAt: input.takenAt ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyM: input.accuracyM ?? null,
        verdict: input.verdict,
        verdictNote: mergeNotes(input.verdictNote, duplicateNote) ?? null,
      },
    });

    const received = await tx.photo.findMany({ where: { checkRequestId }, select: { side: true } });
    const coveredSides = new Set(received.map((photo) => photo.side));
    const allSidesReceived = REQUIRED_SIDES.every((side) => coveredSides.has(side));

    if (allSidesReceived) {
      await tx.checkRequest.updateMany({
        where: { id: checkRequestId, status: 'PENDING' },
        data: { status: 'SUBMITTED', submittedAt: now },
      });
    }

    const check = await tx.checkRequest.findUniqueOrThrow({
      where: { id: checkRequestId },
      include: checkRequestInclude,
    });

    return { check, allSidesReceived };
  });

/** Holat o'tishlari uchun yagona xavfsiz yo'l — poygada ikkinchi urinish rad etiladi. */
const transitionCheck = async (
  checkId: string,
  from: CheckStatus,
  data: Prisma.CheckRequestUncheckedUpdateManyInput,
): Promise<CheckRequestFull> => {
  const current = await getCheckById(checkId);
  if (current.status !== from) {
    throw new ConflictError(t.driver.checkAlreadyDone, { checkId, status: current.status, expected: from });
  }

  const updated = await prisma.checkRequest.updateMany({ where: { id: checkId, status: from }, data });
  if (updated.count === 0) {
    throw new ConflictError(t.driver.checkAlreadyDone, { checkId, reason: 'race' });
  }

  return getCheckById(checkId);
};

export const approveCheck = async (checkId: string, reviewerUserId: string): Promise<CheckRequestFull> =>
  transitionCheck(checkId, 'SUBMITTED', {
    status: 'APPROVED',
    reviewedAt: new Date(),
    reviewerId: reviewerUserId,
    rejectReason: null,
  });

export const rejectCheck = async (
  checkId: string,
  reviewerUserId: string,
  reason: string,
): Promise<CheckRequestFull> =>
  transitionCheck(checkId, 'SUBMITTED', {
    status: 'REJECTED',
    reviewedAt: new Date(),
    reviewerId: reviewerUserId,
    rejectReason: truncate(reason.trim(), VERDICT_NOTE_LIMIT),
  });

/**
 * Muddati o'tgan so'rovlarni EXPIRED qiladi va ularning to'liq nusxasini qaytaradi —
 * chaqiruvchi haydovchi va reklama beruvchini xabardor qiladi.
 */
export const expireOverdueChecks = async (now: Date, limit: number): Promise<CheckRequestFull[]> => {
  const overdue = await prisma.checkRequest.findMany({
    where: { status: 'PENDING', dueAt: { lt: now } },
    include: checkRequestInclude,
    orderBy: { dueAt: 'asc' },
    take: limit,
  });

  if (overdue.length === 0) return [];

  const result = await prisma.checkRequest.updateMany({
    where: { id: { in: overdue.map((check) => check.id) }, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });
  log.info({ expired: result.count }, "Muddati o'tgan tekshiruvlar yopildi");

  return overdue.map((check) => ({ ...check, status: 'EXPIRED' as const }));
};

/**
 * Eslatma yuborish vaqti kelgan so'rovlar: navbatdagi eslatma chegarasidan
 * o'tgan, lekin hali muddati tugamaganlar.
 */
export const pendingRemindable = async (
  now: Date,
  reminderHours: readonly number[],
  limit: number,
): Promise<CheckRequestFull[]> => {
  const thresholds = reminderHours.filter((hours) => Number.isFinite(hours) && hours >= 0);
  if (thresholds.length === 0) return [];

  const clauses = thresholds.map((hours, index) => ({
    remindersSent: index,
    requestedAt: { lte: addHours(now, -hours) },
  }));

  return prisma.checkRequest.findMany({
    where: { status: 'PENDING', dueAt: { gt: now }, OR: clauses },
    include: checkRequestInclude,
    orderBy: { requestedAt: 'asc' },
    take: limit,
  });
};

export const markReminderSent = async (checkId: string): Promise<void> => {
  await prisma.checkRequest.update({ where: { id: checkId }, data: { remindersSent: { increment: 1 } } });
};

export const markReported = async (checkId: string): Promise<void> => {
  await prisma.checkRequest.update({ where: { id: checkId }, data: { reportedAt: new Date() } });
};

export const listChecks = async (opts: ListChecksOptions = {}): Promise<Page<CheckRequestFull>> => {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.CheckRequestWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
    ...(opts.carId ? { carId: opts.carId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.checkRequest.findMany({
      where,
      include: checkRequestInclude,
      orderBy: { requestedAt: 'desc' },
      skip: toSkip(page),
      take: PAGE_SIZE,
    }),
    prisma.checkRequest.count({ where }),
  ]);

  return buildPage(items, total, page);
};

/**
 * Oxirgi N kunlik kesim. complianceRate — yakun topgan tekshiruvlarning
 * qanchasi rasm bilan yopilgani (rad etilgan va muddati o'tganlar maxrajda).
 */
export const checkStats = async (sinceDays: number): Promise<CheckStats> => {
  const since = new Date(Date.now() - Math.max(1, sinceDays) * DAY_MS);
  const rows = await prisma.checkRequest.groupBy({
    by: ['status'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const countOf = (status: CheckStatus): number =>
    rows.find((row) => row.status === status)?._count._all ?? 0;

  const approved = countOf('APPROVED');
  const submitted = countOf('SUBMITTED');
  const rejected = countOf('REJECTED');
  const expired = countOf('EXPIRED');
  const completed = approved + submitted;
  const resolved = completed + rejected + expired;

  return {
    pending: countOf('PENDING'),
    submitted,
    approved,
    rejected,
    expired,
    complianceRate: resolved === 0 ? 0 : Math.round((completed / resolved) * 100),
  };
};
