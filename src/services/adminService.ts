import { Role, type Prisma, type User } from '@prisma/client';

import { PAGE_SIZE } from '../config/constants.js';
import { isEnvSuperAdmin } from '../config/superAdmins.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors.js';
import { prisma } from '../db/client.js';
import { t } from '../i18n/index.js';
import { buildPage, toSkip, type Page } from '../utils/pagination.js';
import { normalizePhone, normalizeUsername } from '../utils/phone.js';
import { recordAudit } from './auditService.js';

/**
 * Bot ichidan admin qo'shish/olib tashlash.
 *
 * Xavfsizlik modeli (har bir qoida shu faylda MAJBURLANADI — handler qatlamiga
 * ishonilmaydi, bu ikkinchi mudofaa chizig'i):
 *  R1. Faqat SUPERADMIN boshqara oladi.
 *  R2. UI orqali faqat ADMIN yoki OPERATOR beriladi; SUPERADMIN — hech qachon.
 *  R3. env.SUPER_ADMIN_IDS dagi (va DB dagi SUPERADMIN) huquqi olinmaydi.
 *  R4. Foydalanuvchi o'zidan huquqni ola olmaydi.
 *  R5. Huquq faqat botga kirgan (telegramId != null) odamga beriladi.
 *  R6. Har bir o'zgarish audit jurnaliga yoziladi.
 */

/** UI orqali beriladigan rollar. SUPERADMIN bu ro'yxatda ATAYLAB yo'q (R2). */
export type GrantableRole = 'ADMIN' | 'OPERATOR';

export const GRANTABLE_ROLES: readonly GrantableRole[] = Object.freeze(['ADMIN', 'OPERATOR']);

/** Panelga kiradigan rollar — "adminlar" ro'yxati shular bo'yicha yig'iladi. */
const STAFF_ROLES: readonly Role[] = Object.freeze([Role.SUPERADMIN, Role.ADMIN, Role.OPERATOR]);

/** Huquq olib tashlangach foydalanuvchi oddiy haydovchiga qaytadi. */
const REVOKED_ROLE: Role = Role.DRIVER;

/** Telegram ID — faqat raqamlar. Telefon raqamdan farqlash uchun "+" qabul qilinmaydi. */
const TELEGRAM_ID_PATTERN = /^\d{5,15}$/;

const STAFF_WHERE: Prisma.UserWhereInput = { role: { in: [...STAFF_ROLES] } };

export type AdminWithMeta = User & {
  /** true — superadminlik env.SUPER_ADMIN_IDS dan keladi, bot orqali o'zgartirilmaydi. */
  readonly isEnvSuperAdmin: boolean;
};

export type AdminCounts = {
  readonly superadmins: number;
  readonly admins: number;
  readonly operators: number;
};

export type GrantAdminInput = {
  readonly actor: User;
  readonly targetUserId: string;
  readonly role: GrantableRole;
};

export type RevokeAdminInput = {
  readonly actor: User;
  readonly targetUserId: string;
};

/** Yozuv o'zgartirilmaydi — yangi nusxaga belgi qo'shiladi. */
const withEnvFlag = (user: User): AdminWithMeta => ({
  ...user,
  isEnvSuperAdmin: isEnvSuperAdmin(user.telegramId),
});

/** Haqiqiy superadminmi? env ro'yxati ham, DB dagi rol ham hisobga olinadi. */
export const isSuperAdminActor = (user: User | null | undefined): boolean =>
  user !== null &&
  user !== undefined &&
  (isEnvSuperAdmin(user.telegramId) || user.role === Role.SUPERADMIN);

/**
 * Superadminlik bot orqali o'zgartirilmaydi: env ro'yxatidagi foydalanuvchi ham,
 * DB da SUPERADMIN bo'lgan foydalanuvchi ham qulflangan hisoblanadi (R3).
 * Aks holda /start dagi rol ko'tarilishi huquqni baribir qaytarardi — bu esa
 * foydalanuvchini aldash bo'lardi.
 */
const isLocked = (user: User): boolean => isEnvSuperAdmin(user.telegramId) || user.role === Role.SUPERADMIN;

const assertSuperAdmin = (actor: User): void => {
  if (!isSuperAdminActor(actor)) {
    throw new ForbiddenError(t.common.forbidden, { actorId: actor.id, role: actor.role });
  }
};

/** R2 ni ish vaqtida majburlaydi — tip tekshiruvi kompilyatsiyadan keyin qolmaydi. */
const assertGrantableRole = (role: GrantableRole): void => {
  if (!GRANTABLE_ROLES.includes(role)) {
    throw new ForbiddenError(t.admin.adminEnvLocked, { role });
  }
};

const requireTarget = (target: User | null): User => {
  if (target === null) throw new NotFoundError(t.admin.adminNotFound);
  return target;
};

/**
 * Huquq berish shartlari. Aktor doim superadmin bo'lgani uchun "o'ziga berish"
 * holati `isLocked` bilan allaqachon to'siladi — alohida shart shart emas.
 */
const assertGrantTarget = (target: User, role: GrantableRole): void => {
  if (isLocked(target)) throw new ForbiddenError(t.admin.adminEnvLocked, { targetId: target.id });
  if (target.telegramId === null) throw new ValidationError(t.admin.adminNotStarted, { targetId: target.id });
  if (target.role === Role.ADVERTISER) {
    throw new ForbiddenError(t.admin.adminCannotGrantAdvertiser, { targetId: target.id });
  }
  if (target.role === role) throw new ConflictError(t.admin.adminAlreadyHasRole, { targetId: target.id });
};

const assertRevokeTarget = (actor: User, target: User): void => {
  if (target.id === actor.id) throw new ForbiddenError(t.admin.adminSelfRevoke, { targetId: target.id });
  if (isLocked(target)) throw new ForbiddenError(t.admin.adminEnvLocked, { targetId: target.id });
  if (!STAFF_ROLES.includes(target.role)) throw new NotFoundError(t.admin.adminNotFound, { targetId: target.id });
};

// ─────────────────────────── O'qish ───────────────────────────

/** Rol bo'yicha (SUPERADMIN → ADMIN → OPERATOR), so'ng qo'shilgan vaqti bo'yicha. */
export const listAdmins = async (opts: { readonly page?: number } = {}): Promise<Page<AdminWithMeta>> => {
  const page = opts.page ?? 1;

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where: STAFF_WHERE,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      skip: toSkip(page),
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where: STAFF_WHERE }),
  ]);

  return buildPage<AdminWithMeta>(items.map(withEnvFlag), total, page);
};

/**
 * Admin kartochkasi uchun — FAQAT xodim rollari qaytadi.
 *
 * Nima uchun rol bo'yicha cheklangan: eskirgan tugma (`adm.op:<id>`) huquqi
 * allaqachon olib tashlangan odamni "admin kartochkasi" sifatida ochib,
 * tarjima qilinmagan xom rol nomini ("DRIVER") va ishlamaydigan "huquqni olib
 * tashlash" tugmasini ko'rsatardi. Endi bunday holat aniq "topilmadi" beradi.
 */
export const findAdminUser = async (userId: string): Promise<AdminWithMeta | null> => {
  const user = await prisma.user.findFirst({ where: { id: userId, ...STAFF_WHERE } });
  return user === null ? null : withEnvFlag(user);
};

export const findUserByTelegramId = async (telegramId: number | bigint): Promise<User | null> =>
  prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });

export const countAdmins = async (): Promise<AdminCounts> => {
  const [superadmins, admins, operators] = await prisma.$transaction([
    prisma.user.count({ where: { role: Role.SUPERADMIN } }),
    prisma.user.count({ where: { role: Role.ADMIN } }),
    prisma.user.count({ where: { role: Role.OPERATOR } }),
  ]);
  return { superadmins, admins, operators };
};

const findByTelegramId = async (value: string): Promise<User | null> => {
  if (!TELEGRAM_ID_PATTERN.test(value)) return null;
  return prisma.user.findUnique({ where: { telegramId: BigInt(value) } });
};

const findByUsername = async (value: string): Promise<User | null> => {
  const username = normalizeUsername(value);
  if (username === null) return null;

  return prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' }, telegramId: { not: null } },
  });
};

const findByPhone = async (value: string): Promise<User | null> => {
  const phone = normalizePhone(value);
  if (phone === null) return null;

  return prisma.user.findFirst({ where: { phone, telegramId: { not: null } } });
};

/**
 * Kiritilgan matndan foydalanuvchini topadi: Telegram ID, @username,
 * t.me havolasi yoki telefon raqam. Tartib muhim — raqamlar avval Telegram ID
 * sifatida tekshiriladi, aks holda ular telefon raqam deb o'qilardi.
 *
 * Botga hali kirmagan odam uchun yozuv YARATILMAYDI (R5): bo'sh @username ni
 * oldindan egallab, uning kelajakdagi egasiga admin huquqini berib bo'lardi.
 */
export const findGrantTarget = async (raw: string): Promise<User | null> => {
  const value = raw.trim();
  if (value.length === 0) return null;

  const byId = await findByTelegramId(value);
  if (byId !== null) return byId;

  const byUsername = await findByUsername(value);
  if (byUsername !== null) return byUsername;

  return findByPhone(value);
};

// ─────────────────────────── Yozish ───────────────────────────

/**
 * Huquq beradi. Tekshirish va yozish bitta tranzaksiyada bajariladi: ikki
 * superadmin bir vaqtda bosganda qoidalar eskirgan surat ustida ishlamasin.
 */
export const grantAdminRole = async (input: GrantAdminInput): Promise<User> => {
  assertSuperAdmin(input.actor);
  assertGrantableRole(input.role);

  const updated = await prisma.$transaction(async (tx) => {
    const target = requireTarget(await tx.user.findUnique({ where: { id: input.targetUserId } }));
    assertGrantTarget(target, input.role);
    return tx.user.update({ where: { id: target.id }, data: { role: input.role } });
  });

  await recordAudit({
    actorId: input.actor.id,
    action: 'admin.grant',
    entity: 'User',
    entityId: updated.id,
    meta: { role: input.role, telegramId: updated.telegramId },
  });

  return updated;
};

/** Huquqni olib tashlaydi — foydalanuvchi oddiy haydovchiga qaytadi. */
export const revokeAdminRole = async (input: RevokeAdminInput): Promise<User> => {
  assertSuperAdmin(input.actor);

  const result = await prisma.$transaction(async (tx) => {
    const target = requireTarget(await tx.user.findUnique({ where: { id: input.targetUserId } }));
    assertRevokeTarget(input.actor, target);
    const updated = await tx.user.update({ where: { id: target.id }, data: { role: REVOKED_ROLE } });
    return { updated, previousRole: target.role };
  });

  await recordAudit({
    actorId: input.actor.id,
    action: 'admin.revoke',
    entity: 'User',
    entityId: result.updated.id,
    meta: { previousRole: result.previousRole, telegramId: result.updated.telegramId },
  });

  return result.updated;
};
