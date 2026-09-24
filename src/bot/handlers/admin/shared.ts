import type { Conversation } from '@grammyjs/conversations';
import { GrammyError, type InlineKeyboard } from 'grammy';

import { MINUTE_MS } from '../../../config/constants.js';
import { describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { MESSAGE_LIMIT, truncate } from '../../../utils/html.js';
import type { Page } from '../../../utils/pagination.js';
import type { BotContext } from '../../bot.js';
import { CB, tryParseCallback } from '../../callbacks.js';
import type { ListRow } from '../../keyboards/common.js';

const log = childLogger('admin');

export type AdminConversation = Conversation<BotContext>;

/** Noto'g'ri kiritishlarning chegarasi — undan keyin oqim bekor qilinadi. */
export const MAX_INPUT_ATTEMPTS = 3;

/**
 * Tashlab ketilgan suhbat admin uchun panelni butunlay to'sib qo'ymasligi kerak:
 * shu muddatdan keyin kelgan yangilanish suhbatni tiklamaydi, oddiy yangilanish
 * sifatida qayta ishlanadi.
 */
export const CONVERSATION_IDLE_TTL_MS = 30 * MINUTE_MS;

/** Ro'yxatlarning birinchi sahifasi. */
export const FIRST_PAGE = 1;

/**
 * Umumiy `CB` ro'yxatida yo'q, faqat admin paneliga tegishli amallar.
 * Nomlash uslubi `CB` bilan bir xil: "<bo'lim>.<amal>".
 */
export const ADMIN_CB = Object.freeze({
  carSearch: 'car.fnd',
  driverSearch: 'drv.fnd',
  driverBlock: 'drv.bl',
  driverUnblock: 'drv.ub',
  /** Suhbat ichidagi tanlov tugmalari (`askChoice`). */
  choice: 'a.ch',
} as const);

/**
 * Faqat adminga tegishli amallar. Bu ro'yxatdagi callback panelga kiradi va
 * `requireAdmin()` tomonidan tekshiriladi — ruxsatsiz urinish shu yerda to'xtaydi.
 */
export const ADMIN_ONLY_ACTIONS: ReadonlySet<string> = new Set<string>([
  CB.adminSettings,
  CB.carList,
  CB.carOpen,
  CB.carAdd,
  CB.carAssign,
  CB.carUnassign,
  CB.carStatus,
  CB.carArchive,
  CB.carReferral,
  CB.driverList,
  CB.driverOpen,
  CB.driverUnlink,
  CB.advertiserList,
  CB.advertiserOpen,
  CB.advertiserAdd,
  CB.advertiserInvite,
  CB.advertiserCampaigns,
  CB.campaignList,
  CB.campaignOpen,
  CB.campaignAdd,
  CB.campaignStatus,
  CB.campaignCars,
  CB.checkList,
  CB.checkOpen,
  CB.checkApprove,
  CB.checkReject,
  CB.checkRun,
  CB.broadcastAudience,
  CB.statsRefresh,
  // Admin boshqaruvi: panelga kiradi, so'ng requireRole('SUPERADMIN') tekshiradi.
  CB.adminList,
  CB.adminOpen,
  CB.adminAdd,
  CB.adminRevoke,
  CB.adminRevokeYes,
  CB.adminRole,
  ...Object.values(ADMIN_CB),
]);

/**
 * Barcha rollarga tegishli tugmalar. Ular panelga faqat foydalanuvchi
 * admin bo'lgandagina yo'naltiriladi — aks holda reklama beruvchi yoki
 * haydovchining "Bosh menyu" tugmasi ishlamay qolardi.
 */
export const SHARED_ACTIONS: ReadonlySet<string> = new Set<string>([CB.menu, CB.noop, CB.cancel]);

/** Suhbat identifikatorlari. Umumiy prefiks faol admin suhbatini aniqlash uchun. */
export const ADMIN_CONVERSATION_PREFIX = 'admin_';

export const CONVERSATION = Object.freeze({
  carCreate: 'admin_car_create',
  carAssign: 'admin_car_assign',
  carSearch: 'admin_car_search',
  driverSearch: 'admin_driver_search',
  advertiserCreate: 'admin_advertiser_create',
  campaignCreate: 'admin_campaign_create',
  campaignCars: 'admin_campaign_cars',
  checkReject: 'admin_check_reject',
  checkRun: 'admin_check_run',
  broadcast: 'admin_broadcast',
  adminGrant: 'admin_admin_grant',
});

// ─────────────────────────── Callback argumentlari ───────────────────────────

const EMPTY_PARTS: readonly string[] = Object.freeze([]);

export const callbackParts = (ctx: BotContext): readonly string[] =>
  tryParseCallback(ctx.callbackQuery?.data)?.parts ?? EMPTY_PARTS;

export const argAt = (ctx: BotContext, index: number): string => callbackParts(ctx)[index] ?? '';

/** Sahifa raqami; yaroqsiz qiymatda birinchi sahifa. */
export const pageArg = (ctx: BotContext, index: number): number => {
  const parsed = Number.parseInt(argAt(ctx, index), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : FIRST_PAGE;
};

/** `Page<T>` ni klaviatura kutadigan eng sodda shaklga o'tkazadi. */
export const toListRows = <T>(page: Page<T>, toRow: (item: T) => ListRow): readonly ListRow[] =>
  page.items.map(toRow);

// ─────────────────────────── Xabar chizish ───────────────────────────

const isNotModified = (error: unknown): boolean =>
  error instanceof GrammyError && error.description.includes('message is not modified');

const extraFor = (keyboard: InlineKeyboard) =>
  ({
    parse_mode: 'HTML',
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  }) as const;

/**
 * Panelni joyida yangilaydi. Callbackdan kelmagan bo'lsa yoki xabarni
 * tahrirlab bo'lmasa (media xabar, juda eski xabar) — yangi xabar yuboriladi.
 */
export const renderPanel = async (
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> => {
  const body = truncate(text, MESSAGE_LIMIT);

  if (ctx.callbackQuery === undefined) {
    await ctx.reply(body, extraFor(keyboard));
    return;
  }

  try {
    await ctx.editMessageText(body, extraFor(keyboard));
  } catch (error) {
    if (isNotModified(error)) return;
    log.debug({ err: describeError(error) }, 'panel tahrirlanmadi — yangi xabar yuboriladi');
    await ctx.reply(body, extraFor(keyboard));
  }
};

/** Yangi xabar sifatida yuboradi — suhbat oxirida yozishmaning pastida turishi uchun. */
export const sendPanel = async (
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> => {
  await ctx.reply(truncate(text, MESSAGE_LIMIT), extraFor(keyboard));
};

export type DrawMode = 'panel' | 'fresh';

export const draw = async (
  ctx: BotContext,
  mode: DrawMode,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> => {
  if (mode === 'fresh') await sendPanel(ctx, text, keyboard);
  else await renderPanel(ctx, text, keyboard);
};

/** Ro'yxat bo'sh bo'lsa sarlavhaga izoh qo'shadi. */
export const withEmptyNotice = (header: string, isEmpty: boolean, emptyText: string): string =>
  isEmpty ? `${header}\n\n${emptyText}` : header;

// ─────────────────────────── Sessiya qoralamasi ───────────────────────────

/**
 * Suhbatga parametr uzatishning yagona yo'li — conversations v1 da `enter()`
 * argument qabul qilmaydi, shuning uchun sessiya qoralamasidan foydalanamiz.
 */
export const setDraft = (ctx: BotContext, patch: Readonly<Record<string, unknown>>): void => {
  // grammY sessiyani faqat ctx ga o'zlashtirish orqali saqlaydi — boshqa API yo'q.
  // Qiymatning o'zi mutatsiya qilinmaydi: har safar yangi obyekt yoziladi.
  // eslint-disable-next-line no-param-reassign
  ctx.session = { ...ctx.session, draft: { ...(ctx.session.draft ?? {}), ...patch } };
};

export const readDraftString = (ctx: BotContext, key: string): string => {
  const value = ctx.session.draft?.[key];
  return typeof value === 'string' ? value : '';
};

/**
 * Suhbat ichidan sessiyani yangilash. `conversation.session` qayta o'ynatish
 * paytida ham to'g'ri suratni beradi — `ctx.session` esa bermaydi.
 */
export const setConversationDraft = (
  conversation: AdminConversation,
  patch: Readonly<Record<string, unknown>>,
): void => {
  const current = conversation.session;
  // Yuqoridagi kabi: plagin sessiyani o'zlashtirish orqali qabul qiladi.
  // eslint-disable-next-line no-param-reassign
  conversation.session = { ...current, draft: { ...(current.draft ?? {}), ...patch } };
};

/** Qoralamani to'ldirib, suhbatni qayta boshlaydi (eskisi bo'lsa — almashtiradi). */
export const enterConversation = async (
  ctx: BotContext,
  id: string,
  draft?: Readonly<Record<string, unknown>>,
): Promise<void> => {
  if (draft) setDraft(ctx, draft);
  await ctx.conversation.enter(id, { overwrite: true });
};
