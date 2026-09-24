import type { User } from '@prisma/client';
import type { MiddlewareFn } from 'grammy';
import { MINUTE_MS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { describeError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { prisma } from '../../db/client.js';
import { t } from '../../i18n/index.js';
import { findAdvertiserByTelegramId } from '../../services/advertiserService.js';
import { findDriverByTelegramId, upsertUserFromTelegram } from '../../services/driverService.js';
import type { AppRole, BotContext } from '../bot.js';

const log = childLogger('bot:auth');

/** Har bir update da `lastSeenAt` yozish qimmat — shu oraliqda bir marta yangilanadi. */
const LAST_SEEN_THROTTLE_MS = 5 * MINUTE_MS;
const LAST_SEEN_TTL_MS = 60 * MINUTE_MS;
const LAST_SEEN_SWEEP_MS = 15 * MINUTE_MS;

const ADMIN_ROLES: readonly AppRole[] = Object.freeze(['SUPERADMIN', 'ADMIN', 'OPERATOR']);

/** .env dagi super-adminlar — BigInt bilan solishtirmaslik uchun matn ko'rinishida. */
const SUPER_ADMIN_KEYS: ReadonlySet<string> = new Set(env.SUPER_ADMIN_IDS.map((id) => String(id)));

/** telegramId -> oxirgi `lastSeenAt` yozilgan vaqt. */
const lastSeenWrites = new Map<number, number>();
let lastSweepAt = 0;

const sweepLastSeen = (now: number): void => {
  if (now - lastSweepAt < LAST_SEEN_SWEEP_MS) return;
  lastSweepAt = now;
  for (const [telegramId, writtenAt] of lastSeenWrites) {
    if (now - writtenAt > LAST_SEEN_TTL_MS) lastSeenWrites.delete(telegramId);
  }
};

const isSuperAdmin = (telegramId: bigint | null): boolean =>
  telegramId !== null && SUPER_ADMIN_KEYS.has(telegramId.toString());

/**
 * Rolni aniqlaydi. Tartib muhim: env dagi super-admin har doim ustun,
 * so'ng DB dagi xodim roli, keyin reklama beruvchi, oxirida haydovchi.
 */
const resolveRole = async (user: User): Promise<AppRole> => {
  if (isSuperAdmin(user.telegramId) || user.role === 'SUPERADMIN') return 'SUPERADMIN';
  if (user.role === 'ADMIN' || user.role === 'OPERATOR') return user.role;
  if (user.telegramId === null) return 'GUEST';

  const advertiser = await findAdvertiserByTelegramId(user.telegramId);
  if (advertiser !== null) return 'ADVERTISER';

  const driver = await findDriverByTelegramId(user.telegramId);
  if (driver !== null) return 'DRIVER';

  return 'GUEST';
};

/** `lastSeenAt` ni yangilaydi. Xatosi update ni to'xtatmaydi — faqat loglanadi. */
const touchLastSeen = async (user: User, now: number): Promise<void> => {
  if (user.telegramId === null) return;
  const key = Number(user.telegramId);
  const writtenAt = lastSeenWrites.get(key) ?? 0;
  if (now - writtenAt < LAST_SEEN_THROTTLE_MS) return;

  lastSeenWrites.set(key, now);
  try {
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(now) } });
  } catch (error) {
    log.warn({ userId: user.id, reason: describeError(error) }, "lastSeenAt yangilanmadi");
  }
};

const guestAuth = Object.freeze({ user: null, role: 'GUEST' as AppRole, isAdmin: false });

/**
 * Har bir update uchun foydalanuvchini bazaga yozadi va `ctx.auth` ni to'ldiradi.
 * `isBlocked` haydovchi ham o'tkaziladi — /start orqali u yana faollasha oladi.
 */
export const authMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const from = ctx.from;
  if (from === undefined || from.is_bot) {
    ctx.auth = guestAuth;
    await next();
    return;
  }

  const user = await upsertUserFromTelegram({
    id: from.id,
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
    language_code: from.language_code,
  });

  const role = await resolveRole(user);
  ctx.auth = Object.freeze({ user, role, isAdmin: ADMIN_ROLES.includes(role) });

  const now = Date.now();
  sweepLastSeen(now);
  await touchLastSeen(user, now);

  await next();
};

const denyAccess = async (ctx: BotContext): Promise<void> => {
  log.warn({ userId: ctx.from?.id, role: ctx.auth?.role }, "Ruxsatsiz urinish");
  if (ctx.callbackQuery !== undefined) {
    await ctx.answerCallbackQuery({ text: t.common.forbidden, show_alert: true });
    return;
  }
  await ctx.reply(t.common.forbidden);
};

/** Ko'rsatilgan rollardan biri bo'lmasa zanjirni to'xtatadi. */
export const requireRole =
  (...roles: readonly AppRole[]): MiddlewareFn<BotContext> =>
  async (ctx, next) => {
    const role = ctx.auth?.role;
    if (role !== undefined && roles.includes(role)) {
      await next();
      return;
    }
    await denyAccess(ctx);
  };

/** Admin paneli uchun qisqartma: SUPERADMIN | ADMIN | OPERATOR. */
export const requireAdmin = (): MiddlewareFn<BotContext> => requireRole(...ADMIN_ROLES);

/** Testlar uchun — throttle holatini tozalaydi. */
export const resetAuthState = (): void => {
  lastSeenWrites.clear();
  lastSweepAt = 0;
};
