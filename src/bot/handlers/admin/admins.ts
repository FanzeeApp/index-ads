import { Role, type User } from '@prisma/client';
import type { Composer } from 'grammy';

import { ForbiddenError, NotFoundError } from '../../../core/errors.js';
import { t } from '../../../i18n/index.js';
import {
  countAdmins,
  findAdminUser,
  grantAdminRole,
  GRANTABLE_ROLES,
  listAdmins,
  revokeAdminRole,
  type AdminCounts,
  type AdminWithMeta,
  type GrantableRole,
} from '../../../services/adminService.js';
import { sendMessageSafe } from '../../../services/notifyService.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatDate } from '../../../utils/time.js';
import type { BotContext } from '../../bot.js';
import { callbackPattern, CB, tryParseCallback } from '../../callbacks.js';
import {
  adminDetailKeyboard,
  adminListKeyboard,
  adminRevokeConfirmKeyboard,
  adminRoleKeyboard,
} from '../../keyboards/admin.js';
import type { ListRow } from '../../keyboards/common.js';
import { requireRole } from '../../middlewares/auth.js';
import { answerSafe, authOf, safeHandler } from '../guard.js';
import { displayName, orDash, safeUsername } from './format.js';
import {
  argAt,
  CONVERSATION,
  draw,
  enterConversation,
  FIRST_PAGE,
  pageArg,
  toListRows,
  withEmptyNotice,
} from './shared.js';

/**
 * Bot ichidan admin qo'shish/olib tashlash — FAQAT superadmin uchun.
 *
 * Himoya ikki qatlamli: bu yerda `requireRole('SUPERADMIN')` (va suhbat
 * boshida bazadan qayta tekshirish), servisda esa qoidalar yana bir bor
 * majburlanadi. Menyudagi tugmani yashirish himoya hisoblanmaydi.
 */

/** Superadmin boshqaruvi callbacklari — faqat shular superadmin filtridan o'tadi. */
const ADMIN_MANAGE_ACTIONS: ReadonlySet<string> = new Set<string>([
  CB.adminList,
  CB.adminOpen,
  CB.adminAdd,
  CB.adminRevoke,
  CB.adminRevokeYes,
  CB.adminRole,
]);

const ROLE_LABELS: Readonly<Partial<Record<Role, string>>> = Object.freeze({
  [Role.SUPERADMIN]: t.admin.adminRoleSuperadmin,
  [Role.ADMIN]: t.admin.adminRoleAdmin,
  [Role.OPERATOR]: t.admin.adminRoleOperator,
});

export const roleLabel = (role: Role): string => ROLE_LABELS[role] ?? role;

export const isGrantableRole = (value: string): value is GrantableRole =>
  (GRANTABLE_ROLES as readonly string[]).includes(value);

/** "Ism (@username)" — ro'yxat va tasdiqlash matnlari uchun. */
export const adminWho = (user: User): string => {
  const name = displayName({
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
  });
  const handle = user.username === null ? '' : `@${user.username}`;
  return handle === '' || name === handle ? name : `${name} (${handle})`;
};

const actorOf = (ctx: BotContext): User => {
  const actor = authOf(ctx).user;
  if (actor === null) throw new ForbiddenError(t.common.forbidden);
  return actor;
};

// ─────────────────────────── Ro'yxat ───────────────────────────

const adminRow = (admin: AdminWithMeta): ListRow => ({
  id: admin.id,
  label: t.admin.adminListRow(adminWho(admin), roleLabel(admin.role), admin.isEnvSuperAdmin),
});

type AdminListView = {
  readonly rows: readonly ListRow[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
  readonly stats: AdminCounts;
};

const fetchAdminList = async (page: number): Promise<AdminListView> => {
  const [result, stats] = await Promise.all([listAdmins({ page }), countAdmins()]);
  return {
    rows: toListRows(result, adminRow),
    page: result.page,
    totalPages: result.totalPages,
    totalItems: result.totalItems,
    stats,
  };
};

const showAdminList = async (ctx: BotContext, page: number): Promise<void> => {
  const view = await fetchAdminList(page);
  const header = `${t.admin.adminsTitle(view.totalItems)}\n${t.admin.adminStats(view.stats)}`;

  await draw(
    ctx,
    'panel',
    withEmptyNotice(header, view.rows.length === 0, t.common.empty),
    adminListKeyboard(view.rows, view.page, view.totalPages),
  );
};

// ─────────────────────────── Kartochka ───────────────────────────

const requireAdminUser = async (userId: string): Promise<AdminWithMeta> => {
  const admin = await findAdminUser(userId);
  if (admin === null) throw new NotFoundError(t.admin.adminNotFound);
  return admin;
};

const showAdminDetail = async (ctx: BotContext, userId: string): Promise<void> => {
  const admin = await requireAdminUser(userId);
  const locked = admin.isEnvSuperAdmin || admin.role === Role.SUPERADMIN;

  const card = t.admin.adminDetail({
    name: escapeHtml(adminWho(admin)),
    username: safeUsername(admin.username),
    telegramId: orDash(admin.telegramId === null ? null : admin.telegramId.toString()),
    role: roleLabel(admin.role),
    created: formatDate(admin.createdAt),
  });

  const text = locked ? `${card}\n\n${t.admin.adminEnvLocked}` : card;
  await draw(ctx, 'panel', text, adminDetailKeyboard(admin.id, locked));
};

const confirmRevoke = async (ctx: BotContext, userId: string): Promise<void> => {
  const admin = await requireAdminUser(userId);
  await draw(
    ctx,
    'panel',
    t.admin.adminRevokeConfirm(escapeHtml(adminWho(admin))),
    adminRevokeConfirmKeyboard(admin.id),
  );
};

/** Yangi huquq haqida xabar berish — yuborilmasa ham amal bekor qilinmaydi. */
export const notifyGranted = async (user: User, role: GrantableRole): Promise<void> => {
  if (user.telegramId === null) return;
  await sendMessageSafe(user.telegramId, t.admin.adminGrantedNotice(roleLabel(role)));
};

/**
 * Huquq olingani haqida xabar berish. Huquq berishda xabar boradi, olishda esa
 * bormasa — odam panel tugmalari nega ishlamay qolganini bilmay qolardi.
 * Yuborilmasa ham amal bekor qilinmaydi (rol bazada allaqachon o'zgargan).
 */
export const notifyRevoked = async (user: User): Promise<void> => {
  if (user.telegramId === null) return;
  await sendMessageSafe(user.telegramId, t.admin.adminRevokedNotice);
};

const applyRevoke = async (ctx: BotContext, userId: string): Promise<void> => {
  const updated = await revokeAdminRole({ actor: actorOf(ctx), targetUserId: userId });
  await notifyRevoked(updated);
  await answerSafe(ctx, t.admin.adminRevoked(adminWho(updated)));
  await showAdminList(ctx, FIRST_PAGE);
};

const applyRole = async (ctx: BotContext, userId: string, role: GrantableRole): Promise<void> => {
  const updated = await grantAdminRole({ actor: actorOf(ctx), targetUserId: userId, role });
  await notifyGranted(updated, role);
  await answerSafe(ctx, t.admin.adminGranted(adminWho(updated), roleLabel(role)));
  await showAdminDetail(ctx, userId);
};

// ─────────────────────────── Handlerlar ───────────────────────────

/** `adm.rl:<userId>` — rol tanlash; `adm.rl:<userId>:<rol>` — tanlovni qo'llash. */
const handleRoleCallback = async (ctx: BotContext): Promise<void> => {
  const userId = argAt(ctx, 0);
  const role = argAt(ctx, 1);

  if (role === '') {
    const admin = await requireAdminUser(userId);
    const prompt = t.admin.adminPickRole(escapeHtml(adminWho(admin)));
    await answerSafe(ctx);
    await draw(ctx, 'panel', prompt, adminRoleKeyboard(userId));
    return;
  }

  // Eski yoki qo'lda yig'ilgan tugma SUPERADMIN bermasligi kerak.
  if (!isGrantableRole(role)) throw new ForbiddenError(t.admin.adminEnvLocked);

  await applyRole(ctx, userId, role);
};

const isAdminManageUpdate = (ctx: BotContext): boolean => {
  const parsed = tryParseCallback(ctx.callbackQuery?.data);
  return parsed !== null && ADMIN_MANAGE_ACTIONS.has(parsed.action);
};

/**
 * Faqat admin boshqaruvi callbacklari superadmin filtridan o'tkaziladi —
 * panelning qolgan bo'limlari ADMIN va OPERATOR uchun ochiq qoladi.
 */
export const registerAdminUserHandlers = (composer: Composer<BotContext>): void => {
  const scoped = composer.filter(isAdminManageUpdate);
  scoped.use(requireRole('SUPERADMIN'));

  scoped.callbackQuery(
    callbackPattern(CB.adminList),
    safeHandler('admin:admins:list', async (ctx) => {
      await answerSafe(ctx);
      await showAdminList(ctx, pageArg(ctx, 0));
    }),
  );

  scoped.callbackQuery(
    callbackPattern(CB.adminOpen),
    safeHandler('admin:admins:open', async (ctx) => {
      await answerSafe(ctx);
      await showAdminDetail(ctx, argAt(ctx, 0));
    }),
  );

  scoped.callbackQuery(
    callbackPattern(CB.adminAdd),
    safeHandler('admin:admins:add', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.adminGrant);
    }),
  );

  scoped.callbackQuery(
    callbackPattern(CB.adminRole),
    safeHandler('admin:admins:role', handleRoleCallback),
  );

  scoped.callbackQuery(
    callbackPattern(CB.adminRevoke),
    safeHandler('admin:admins:revoke', async (ctx) => {
      await answerSafe(ctx);
      await confirmRevoke(ctx, argAt(ctx, 0));
    }),
  );

  scoped.callbackQuery(
    callbackPattern(CB.adminRevokeYes),
    safeHandler('admin:admins:revokeYes', async (ctx) => {
      // Javobni `applyRevoke` beradi — bitta callback ikki marta javob olmaydi.
      await applyRevoke(ctx, argAt(ctx, 0));
    }),
  );
};
