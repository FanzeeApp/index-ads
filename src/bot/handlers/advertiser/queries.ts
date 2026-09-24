/**
 * Kabinet uchun faqat o'qiydigan so'rovlar.
 * Nima uchun alohida: har bir so'rov `campaign: { advertiserId }` sharti bilan
 * cheklanadi — begona ma'lumot tuzilmaviy ravishda bazadan ham qaytmaydi.
 * Shuningdek `select` da haydovchining shaxsiy maydonlari (telefon, username,
 * ism) umuman so'ralmaydi — reklama beruvchi ularni ko'rmasligi shart.
 */
import type { PhotoSide } from '@prisma/client';
import { prisma } from '../../../db/client.js';
import { REQUIRED_SIDES } from '../../../config/constants.js';
import { addDays } from '../../../utils/time.js';
import { MISSED_PLATES_LIMIT } from './constants.js';

/** Tomonlarni doimo bir xil tartibda ko'rsatish uchun (orqa → chap → o'ng). */
const SIDE_ORDER: ReadonlyMap<string, number> = new Map(REQUIRED_SIDES.map((side, index) => [side, index]));

export type FeedEntry = {
  readonly checkId: string;
  readonly plateNumber: string;
  readonly confirmedAt: Date;
};

export type CheckPhoto = {
  readonly side: PhotoSide;
  readonly fileId: string;
};

export type CheckPhotoSet = {
  readonly plateNumber: string;
  readonly confirmedAt: Date;
  readonly photos: readonly CheckPhoto[];
};

export type PeriodReport = {
  readonly days: number;
  readonly cars: number;
  readonly approved: number;
  readonly missed: number;
  readonly rate: number;
  readonly missedPlates: readonly string[];
  readonly missedCars: number;
};

/** Oxirgi tasdiqlangan tekshiruvlar — eng yangisi birinchi. */
export const findRecentApprovedChecks = async (
  advertiserId: string,
  campaignId: string,
  limit: number,
): Promise<readonly FeedEntry[]> => {
  const rows = await prisma.checkRequest.findMany({
    where: { campaignId, status: 'APPROVED', campaign: { advertiserId } },
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      reviewedAt: true,
      submittedAt: true,
      createdAt: true,
      car: { select: { plateNumber: true } },
    },
  });

  return rows.map((row) => ({
    checkId: row.id,
    plateNumber: row.car.plateNumber,
    confirmedAt: row.reviewedAt ?? row.submittedAt ?? row.createdAt,
  }));
};

/** Bitta tasdiqlangan tekshiruvning rasmlari. Begona yoki tasdiqlanmagan bo'lsa — null. */
export const findCheckPhotos = async (
  advertiserId: string,
  checkId: string,
): Promise<CheckPhotoSet | null> => {
  const row = await prisma.checkRequest.findFirst({
    where: { id: checkId, status: 'APPROVED', campaign: { advertiserId } },
    select: {
      reviewedAt: true,
      submittedAt: true,
      createdAt: true,
      car: { select: { plateNumber: true } },
      photos: { select: { side: true, telegramFileId: true } },
    },
  });

  if (!row) return null;

  const photos: readonly CheckPhoto[] = row.photos
    .filter((photo): photo is typeof photo & { telegramFileId: string } => Boolean(photo.telegramFileId))
    .map((photo) => ({ side: photo.side, fileId: photo.telegramFileId }))
    .sort((left, right) => (SIDE_ORDER.get(left.side) ?? 0) - (SIDE_ORDER.get(right.side) ?? 0));

  return {
    plateNumber: row.car.plateNumber,
    confirmedAt: row.reviewedAt ?? row.submittedAt ?? row.createdAt,
    photos,
  };
};

/**
 * Davr bo'yicha hisobot. "Javobsiz" — muddati o'tgan (EXPIRED) tekshiruvlar;
 * bajarilish foizi shu davrda yakunlangan (tasdiqlangan + javobsiz) tekshiruvlardan
 * hisoblanadi, hali kutilayotganlari natijani buzmaydi.
 */
export const buildPeriodReport = async (advertiserId: string, days: number): Promise<PeriodReport> => {
  const since = addDays(new Date(), -days);
  const periodScope = { campaign: { advertiserId }, requestedAt: { gte: since } } as const;

  const [carGroups, approved, missedGroups] = await Promise.all([
    prisma.placement.groupBy({
      by: ['carId'],
      where: { campaign: { advertiserId }, status: 'ACTIVE' },
    }),
    prisma.checkRequest.count({ where: { ...periodScope, status: 'APPROVED' } }),
    prisma.checkRequest.groupBy({
      by: ['carId'],
      where: { ...periodScope, status: 'EXPIRED' },
      _count: { _all: true },
    }),
  ]);

  // Javobsiz tekshiruvlar soni ham, mashinalar ro'yxati ham bitta guruhlashdan olinadi.
  const missed = missedGroups.reduce((total, group) => total + group._count._all, 0);
  const missedCarIds: readonly string[] = missedGroups.map((group) => group.carId);
  const missedPlates = await loadPlates(missedCarIds);

  const finished = approved + missed;
  const rate = finished === 0 ? 0 : Math.round((approved / finished) * 100);

  return {
    days,
    cars: carGroups.length,
    approved,
    missed,
    rate,
    missedPlates,
    missedCars: missedCarIds.length,
  };
};

const loadPlates = async (carIds: readonly string[]): Promise<readonly string[]> => {
  if (carIds.length === 0) return [];
  const cars = await prisma.car.findMany({
    where: { id: { in: [...carIds] } },
    select: { plateNumber: true },
    orderBy: { plateNumber: 'asc' },
    take: MISSED_PLATES_LIMIT,
  });
  return cars.map((car) => car.plateNumber);
};
