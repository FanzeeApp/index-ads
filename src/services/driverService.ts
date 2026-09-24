import { Prisma, Role } from '@prisma/client';
import type { Car, Driver, User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { PAGE_SIZE } from '../config/constants.js';
import { ValidationError } from '../core/errors.js';
import { t } from '../i18n/index.js';
import { normalizePhone, normalizeUsername } from '../utils/phone.js';
import { normalizePlate } from '../utils/plate.js';
import { buildPage, toSkip, type Page } from '../utils/pagination.js';
import { recordAudit } from './auditService.js';

export type DriverWithUser = Driver & { user: User; cars: Car[] };

export type TelegramUserInput = {
  readonly id: number;
  readonly username?: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly language_code?: string;
};

export type CreatePendingDriverInput = {
  readonly fullName?: string;
  readonly username?: string;
  readonly phone?: string;
};

export type ListDriversOptions = {
  readonly page?: number;
  readonly query?: string;
  readonly linkedOnly?: boolean;
};

const DRIVER_INCLUDE = { user: true, cars: true } satisfies Prisma.DriverInclude;

/** Telegramga hali ulanmagan (admin oldindan kiritgan) yozuvlar shu shart bilan topiladi. */
const PENDING_USER: Prisma.DriverWhereInput = { user: { telegramId: null } };

const isSuperAdmin = (telegramId: number): boolean => env.SUPER_ADMIN_IDS.includes(telegramId);

/** Rolni faqat ko'taramiz: mavjud ADMIN/OPERATOR huquqi /start bosilganda pasaymasligi kerak. */
const resolveRoleUpgrade = (current: Role | undefined, superAdmin: boolean): { role?: Role } =>
  superAdmin && current !== Role.SUPERADMIN ? { role: Role.SUPERADMIN } : {};

type ExistingUser = (User & { driver: { isActive: boolean } | null }) | null;

/**
 * `isBlocked` ikki xil holatni bildiradi: foydalanuvchi botni bloklagan yoki
 * ADMIN uni bloklagan. Birinchisi foydalanuvchi qaytib kelishi bilan o'zi
 * yechiladi, ikkinchisi esa YECHILMASLIGI shart — aks holda haydovchi istalgan
 * tugmani bosib admin qo'ygan cheklovni o'zi bekor qilardi. Admin bloki
 * `Driver.isActive = false` bilan belgilanadi (`setUserBlocked` shuni yozadi).
 */
const isAdminBlocked = (existing: ExistingUser): boolean =>
  existing !== null && existing.isBlocked && existing.driver !== null && !existing.driver.isActive;

export const upsertUserFromTelegram = async (tg: TelegramUserInput): Promise<User> => {
  const telegramId = BigInt(tg.id);
  const superAdmin = isSuperAdmin(tg.id);
  const existing: ExistingUser = await prisma.user.findUnique({
    where: { telegramId },
    include: { driver: { select: { isActive: true } } },
  });
  const adminBlocked = isAdminBlocked(existing);
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: tg.username ?? null,
      firstName: tg.first_name ?? null,
      lastName: tg.last_name ?? null,
      languageCode: tg.language_code ?? 'uz',
      role: superAdmin ? Role.SUPERADMIN : Role.DRIVER,
      lastSeenAt: now,
    },
    update: {
      username: tg.username ?? null,
      firstName: tg.first_name ?? null,
      lastName: tg.last_name ?? null,
      ...(tg.language_code ? { languageCode: tg.language_code } : {}),
      // Foydalanuvchi qaytib kelgani — botni qayta ochgani belgisi.
      // Admin bloki bundan mustasno: uni faqat admin yecha oladi.
      ...(adminBlocked ? {} : { isBlocked: false }),
      lastSeenAt: now,
      ...resolveRoleUpgrade(existing?.role, superAdmin),
    },
  });

  // Faqat yangi yozuvni audit qilamiz — har bir /start uchun log yozish jurnalni to'ldirib yuboradi.
  if (!existing) {
    await recordAudit({ actorId: user.id, action: 'user.create', entity: 'User', entityId: user.id, meta: { telegramId } });
  }
  return user;
};

export const ensureDriver = async (userId: string): Promise<Driver> =>
  prisma.driver.upsert({ where: { userId }, create: { userId }, update: {} });

export const findDriverByTelegramId = async (telegramId: number | bigint): Promise<DriverWithUser | null> =>
  prisma.driver.findFirst({
    where: { user: { telegramId: BigInt(telegramId) } },
    include: DRIVER_INCLUDE,
  });

export const findDriverByUsername = async (username: string): Promise<DriverWithUser | null> => {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  return prisma.driver.findFirst({
    where: {
      OR: [{ pendingUsername: normalized }, { user: { username: { equals: normalized, mode: 'insensitive' } } }],
    },
    include: DRIVER_INCLUDE,
  });
};

export const findDriverByPhone = async (phone: string): Promise<DriverWithUser | null> => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  return prisma.driver.findFirst({
    where: { OR: [{ phone: normalized }, { pendingPhone: normalized }, { user: { phone: normalized } }] },
    include: DRIVER_INCLUDE,
  });
};

/**
 * Admin haydovchini oldindan kiritadi. Driver.userId majburiy bo'lgani uchun
 * vaqtinchalik (telegramId=null) User yaratiladi — haydovchi /start bosganda u almashtiriladi.
 */
export const createPendingDriver = async (input: CreatePendingDriverInput): Promise<Driver> => {
  const username = input.username ? normalizeUsername(input.username) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;

  if (input.phone && !phone) throw new ValidationError(t.admin.driverPhoneInvalid, { phone: input.phone });
  if (!username && !phone) throw new ValidationError(t.admin.driverIdentifierRequired);

  const fullName = input.fullName?.trim() || null;
  const driver = await prisma.driver.create({
    data: {
      fullName,
      phone,
      pendingUsername: username,
      pendingPhone: phone,
      user: { create: { role: Role.DRIVER, username, phone, firstName: fullName } },
    },
  });

  await recordAudit({
    action: 'driver.createPending',
    entity: 'Driver',
    entityId: driver.id,
    meta: { username, hasPhone: phone !== null },
  });
  return driver;
};

const buildPendingMatchers = (username: string | null, phone: string | null): readonly Prisma.DriverWhereInput[] => [
  ...(username ? [{ pendingUsername: username }] : []),
  ...(phone ? [{ pendingPhone: phone }] : []),
];

/** Kutilayotgan yozuvni haqiqiy foydalanuvchiga ko'chiradi, vaqtinchalik User o'chiriladi. */
const linkPendingDriver = async (tx: Prisma.TransactionClient, pending: Driver, user: User): Promise<Driver> => {
  const linked = await tx.driver.update({
    where: { id: pending.id },
    data: { userId: user.id, pendingUsername: null, pendingPhone: null },
  });
  await tx.user.deleteMany({ where: { id: pending.userId, telegramId: null } });
  return linked;
};

/** Foydalanuvchida Driver allaqachon bor — kutilayotgan yozuvdagi mashinalar unga o'tkaziladi. */
const mergePendingDriver = async (tx: Prisma.TransactionClient, pending: Driver, own: Driver): Promise<Driver> => {
  if (pending.id === own.id) return own;

  await tx.car.updateMany({ where: { driverId: pending.id }, data: { driverId: own.id } });
  const merged = await tx.driver.update({
    where: { id: own.id },
    data: {
      fullName: own.fullName ?? pending.fullName,
      phone: own.phone ?? pending.phone,
      notes: own.notes ?? pending.notes,
    },
  });
  await tx.driver.delete({ where: { id: pending.id } });
  await tx.user.deleteMany({ where: { id: pending.userId, telegramId: null } });
  return merged;
};

export const claimPendingDriver = async (user: User): Promise<Driver | null> => {
  const username = user.username ? normalizeUsername(user.username) : null;
  const phone = user.phone ? normalizePhone(user.phone) : null;
  const matchers = buildPendingMatchers(username, phone);
  if (matchers.length === 0) return null;

  // Ikki /start bir vaqtda kelsa bitta yozuv ikki marta ulanmasligi uchun tranzaksiya.
  const claimed = await prisma.$transaction(async (tx) => {
    const pending = await tx.driver.findFirst({
      where: { AND: [PENDING_USER, { OR: [...matchers] }] },
      orderBy: { createdAt: 'asc' },
    });
    if (!pending) return null;

    const own = await tx.driver.findUnique({ where: { userId: user.id } });
    return own ? mergePendingDriver(tx, pending, own) : linkPendingDriver(tx, pending, user);
  });

  if (claimed) {
    await recordAudit({ actorId: user.id, action: 'driver.claim', entity: 'Driver', entityId: claimed.id });
  }
  return claimed;
};

export const setPhone = async (userId: string, phone: string): Promise<User> => {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new ValidationError(t.admin.driverPhoneInvalid, { userId });

  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { phone: normalized } }),
    prisma.driver.updateMany({ where: { userId }, data: { phone: normalized } }),
  ]);

  await recordAudit({ actorId: userId, action: 'user.setPhone', entity: 'User', entityId: userId });
  return user;
};

const buildDriverWhere = (opts: ListDriversOptions): Prisma.DriverWhereInput => {
  const linked: Prisma.DriverWhereInput = opts.linkedOnly ? { user: { telegramId: { not: null } } } : {};
  const search = opts.query?.trim();
  if (!search) return linked;

  const phone = normalizePhone(search);
  const username = normalizeUsername(search);
  return {
    ...linked,
    OR: [
      { fullName: { contains: search, mode: 'insensitive' } },
      { user: { username: { contains: search, mode: 'insensitive' } } },
      { user: { firstName: { contains: search, mode: 'insensitive' } } },
      { cars: { some: { plateNumber: { contains: normalizePlate(search) } } } },
      ...(phone ? [{ phone }, { pendingPhone: phone }, { user: { phone } }] : []),
      ...(username ? [{ pendingUsername: username }] : []),
    ],
  };
};

export const listDrivers = async (opts: ListDriversOptions): Promise<Page<DriverWithUser>> => {
  const page = opts.page ?? 1;
  const where = buildDriverWhere(opts);

  const [items, total] = await prisma.$transaction([
    prisma.driver.findMany({
      where,
      include: DRIVER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(page),
      take: PAGE_SIZE,
    }),
    prisma.driver.count({ where }),
  ]);

  return buildPage<DriverWithUser>(items, total, page);
};

/** linked — Telegramga ulangan (haqiqatan xabar oladigan) haydovchilar soni. */
export const countDrivers = async (): Promise<{ total: number; linked: number }> => {
  const [total, linked] = await prisma.$transaction([
    prisma.driver.count(),
    prisma.driver.count({ where: { user: { telegramId: { not: null } } } }),
  ]);
  return { total, linked };
};
