import { CarStatus, CheckStatus, type Prisma } from '@prisma/client';

import { prisma } from '../../../db/client.js';
import type { PlacementWithRelations } from '../../../services/checkService.js';

/**
 * Admin panel uchun o'qish so'rovlari va ikkita nuqtali yangilash.
 *
 * Bu yerda faqat servis kontraktlarida ko'zda tutilmagan agregatlar turadi
 * (haydovchi bo'yicha bajarilish foizi, auditoriya chat id lari, kampaniya
 * joylashuvlari). Boshqa hamma narsa `src/services/*` orqali o'tadi.
 */

/** Bir so'rovda olinadigan yozuvlar chegarasi — panel ro'yxatlari qisqa bo'ladi. */
export const RECENT_CHECKS_LIMIT = 5;

export type BroadcastAudience = 'ALL' | 'DRIVERS' | 'ADVERTISERS';

export type DriverCompliance = {
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  readonly expired: number;
  readonly pending: number;
  readonly rate: number;
};

export type RecentCheck = {
  readonly plateNumber: string;
  readonly campaignTitle: string;
  readonly status: CheckStatus;
  readonly requestedAt: Date;
};

export type PlateResolution = {
  readonly carIds: readonly string[];
  readonly missingPlates: readonly string[];
};

export type AdvertiserSummary = {
  readonly campaigns: number;
  readonly activeCampaigns: number;
  readonly cars: number;
};

/** Panel kartochkasi uchun yassilangan mashina ma'lumoti. */
export type CarDetail = {
  readonly id: string;
  readonly plateNumber: string;
  readonly model: string | null;
  readonly color: string | null;
  readonly status: CarStatus;
  readonly createdAt: Date;
  readonly driver: LinkedDriver | null;
  readonly activeCampaigns: number;
  readonly referencePhotos: number;
};

export type LinkedDriver = {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly username: string | null;
  readonly telegramId: string | null;
  readonly isBlocked: boolean;
  readonly pendingUsername: string | null;
  readonly pendingPhone: string | null;
};

export type DriverDetail = {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly username: string | null;
  readonly telegramId: string | null;
  readonly isBlocked: boolean;
  readonly isLinked: boolean;
  readonly plates: readonly string[];
};

const DRIVER_WITH_USER = { include: { user: true } } as const;

const toLinkedDriver = (driver: {
  id: string;
  userId: string;
  fullName: string | null;
  phone: string | null;
  pendingUsername: string | null;
  pendingPhone: string | null;
  user: { username: string | null; telegramId: bigint | null; isBlocked: boolean };
}): LinkedDriver => ({
  id: driver.id,
  userId: driver.userId,
  fullName: driver.fullName,
  phone: driver.phone,
  username: driver.user.username,
  telegramId: driver.user.telegramId?.toString() ?? null,
  isBlocked: driver.user.isBlocked,
  pendingUsername: driver.pendingUsername,
  pendingPhone: driver.pendingPhone,
});

/** Mashina kartochkasi: haydovchi, faol kampaniyalar soni, etalon rasmlar soni. */
export const loadCarDetail = async (carId: string): Promise<CarDetail | null> => {
  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: {
      driver: DRIVER_WITH_USER,
      _count: { select: { photos: true } },
    },
  });
  if (!car) return null;

  const activeCampaigns = await prisma.placement.count({
    where: { carId, status: 'ACTIVE', campaign: { status: 'ACTIVE' } },
  });

  return {
    id: car.id,
    plateNumber: car.plateNumber,
    model: car.model,
    color: car.color,
    status: car.status,
    createdAt: car.createdAt,
    driver: car.driver ? toLinkedDriver(car.driver) : null,
    activeCampaigns,
    referencePhotos: car._count.photos,
  };
};

/** Haydovchi kartochkasi: bog'lanish holati va biriktirilgan mashinalar. */
export const loadDriverDetail = async (driverId: string): Promise<DriverDetail | null> => {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: { user: true, cars: { select: { plateNumber: true } } },
  });
  if (!driver) return null;

  return {
    id: driver.id,
    userId: driver.userId,
    fullName: driver.fullName,
    phone: driver.phone ?? driver.user.phone,
    username: driver.user.username ?? driver.pendingUsername,
    telegramId: driver.user.telegramId?.toString() ?? null,
    isBlocked: driver.user.isBlocked,
    isLinked: driver.user.telegramId !== null,
    plates: driver.cars.map((car) => car.plateNumber),
  };
};

// ─────────────────────────── Haydovchi ───────────────────────────

/**
 * Bloklangan foydalanuvchiga bot xabar yubormaydi (notifyService ham shuni tekshiradi).
 *
 * `Driver.isActive` ham yoziladi — u admin blokining belgisi. Usiz haydovchi
 * botga bitta xabar yuborishi bilan `upsertUserFromTelegram` `isBlocked` ni
 * tozalab, admin qo'ygan cheklovni bekor qilardi.
 */
export const setUserBlocked = async (userId: string, isBlocked: boolean): Promise<void> => {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isBlocked } }),
    prisma.driver.updateMany({ where: { userId }, data: { isActive: !isBlocked } }),
  ]);
};

const countOf = (
  rows: readonly { readonly status: CheckStatus; readonly _count: { readonly _all: number } }[],
  status: CheckStatus,
): number => rows.find((row) => row.status === status)?._count._all ?? 0;

/**
 * Haydovchining intizomi: tasdiqlangan tekshiruvlarning yakunlangan
 * tekshiruvlarga nisbati. Ko'rib chiqilmagan (SUBMITTED) hisobga olinmaydi.
 */
export const driverCompliance = async (driverId: string): Promise<DriverCompliance> => {
  const rows = await prisma.checkRequest.groupBy({
    by: ['status'],
    where: { car: { driverId } },
    _count: { _all: true },
  });

  const approved = countOf(rows, CheckStatus.APPROVED);
  const rejected = countOf(rows, CheckStatus.REJECTED);
  const expired = countOf(rows, CheckStatus.EXPIRED);
  const pending = countOf(rows, CheckStatus.PENDING) + countOf(rows, CheckStatus.SUBMITTED);
  const settled = approved + rejected + expired;

  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    approved,
    rejected,
    expired,
    pending,
    rate: settled === 0 ? 0 : Math.round((approved / settled) * 100),
  };
};

export const recentChecksForDriver = async (
  driverId: string,
  limit: number = RECENT_CHECKS_LIMIT,
): Promise<readonly RecentCheck[]> => {
  const rows = await prisma.checkRequest.findMany({
    where: { car: { driverId } },
    orderBy: { requestedAt: 'desc' },
    take: limit,
    select: {
      status: true,
      requestedAt: true,
      car: { select: { plateNumber: true } },
      campaign: { select: { title: true } },
    },
  });

  return rows.map((row) => ({
    plateNumber: row.car.plateNumber,
    campaignTitle: row.campaign.title,
    status: row.status,
    requestedAt: row.requestedAt,
  }));
};

// ─────────────────────────── Mashinalar ───────────────────────────

/** Kampaniyaga "HAMMASI" tanlanganda ishlatiladi — faqat identifikatorlar olinadi. */
export const activeCarIds = async (): Promise<readonly string[]> => {
  const rows = await prisma.car.findMany({
    where: { status: CarStatus.ACTIVE },
    select: { id: true },
  });
  return rows.map((row) => row.id);
};

/** Davlat raqamlari ro'yxatini mashina id lariga aylantiradi; topilmaganlarini alohida qaytaradi. */
export const resolvePlates = async (plates: readonly string[]): Promise<PlateResolution> => {
  if (plates.length === 0) return { carIds: [], missingPlates: [] };

  const rows = await prisma.car.findMany({
    where: { plateNumber: { in: [...plates] }, status: { not: CarStatus.ARCHIVED } },
    select: { id: true, plateNumber: true },
  });

  const foundPlates = new Set(rows.map((row) => row.plateNumber));
  return {
    carIds: rows.map((row) => row.id),
    missingPlates: plates.filter((plate) => !foundPlates.has(plate)),
  };
};

// ─────────────────────────── Kampaniya joylashuvlari ───────────────────────────

const PLACEMENT_RELATIONS = {
  car: { include: { driver: { include: { user: true } } } },
  campaign: { include: { advertiser: { include: { user: true } } } },
} satisfies Prisma.PlacementInclude;

/**
 * Qo'lda tekshiruv yuborish uchun kampaniyaning faol joylashuvlari.
 * Natija `checkService.createCheckRequest()` kutadigan shaklda qaytadi.
 */
export const activePlacementsForCampaign = async (
  campaignId: string,
  limit: number,
): Promise<readonly PlacementWithRelations[]> => {
  const rows = await prisma.placement.findMany({
    where: { campaignId, status: 'ACTIVE', car: { status: CarStatus.ACTIVE } },
    include: PLACEMENT_RELATIONS,
    orderBy: { installedAt: 'asc' },
    take: limit,
  });
  return rows;
};

// ─────────────────────────── Auditoriya ───────────────────────────

const audienceFilter = (audience: BroadcastAudience): Prisma.UserWhereInput => {
  if (audience === 'DRIVERS') return { driver: { isNot: null } };
  if (audience === 'ADVERTISERS') return { advertiser: { isNot: null } };
  return {};
};

/**
 * Xabar yuboriladigan chat id lari. BigInt satr sifatida qaytadi —
 * suhbat jurnaliga (conversation log) faqat oddiy qiymatlar yoziladi.
 */
export const audienceChatIds = async (audience: BroadcastAudience): Promise<readonly string[]> => {
  const rows = await prisma.user.findMany({
    where: { telegramId: { not: null }, isBlocked: false, ...audienceFilter(audience) },
    select: { telegramId: true },
  });

  return rows.flatMap((row) => (row.telegramId === null ? [] : [row.telegramId.toString()]));
};

// ─────────────────────────── Reklama beruvchi ───────────────────────────

/** Kampaniya yaratishda tanlov tugmalari uchun — ro'yxat qisqa bo'lgani uchun to'liq olinadi. */
export const ADVERTISER_OPTIONS_LIMIT = 100;

export const advertiserOptions = async (
  limit: number = ADVERTISER_OPTIONS_LIMIT,
): Promise<readonly { readonly id: string; readonly companyName: string }[]> => {
  const rows = await prisma.advertiser.findMany({
    where: { isActive: true },
    orderBy: { companyName: 'asc' },
    take: limit,
    select: { id: true, companyName: true },
  });
  return rows;
};

/** Qo'lda tekshiruv yuborishda tanlanadigan kampaniyalar — faqat faollari. */
export const activeCampaignOptions = async (
  limit: number = ADVERTISER_OPTIONS_LIMIT,
): Promise<readonly { readonly id: string; readonly title: string }[]> => {
  const rows = await prisma.campaign.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, title: true },
  });
  return rows;
};

export const advertiserSummary = async (advertiserId: string): Promise<AdvertiserSummary> => {
  const [campaigns, activeCampaigns, cars] = await Promise.all([
    prisma.campaign.count({ where: { advertiserId } }),
    prisma.campaign.count({ where: { advertiserId, status: 'ACTIVE' } }),
    prisma.placement.count({ where: { campaign: { advertiserId }, status: 'ACTIVE' } }),
  ]);
  return { campaigns, activeCampaigns, cars };
};
