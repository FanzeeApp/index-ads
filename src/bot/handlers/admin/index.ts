import { createConversation } from '@grammyjs/conversations';
import { Composer, type Bot, type Middleware } from 'grammy';

import { childLogger } from '../../../core/logger.js';
import type { BotContext } from '../../bot.js';
import { tryParseCallback } from '../../callbacks.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { authOf } from '../guard.js';
import { advertiserCreateConversation, registerAdvertiserHandlers } from './advertisers.js';
import { broadcastConversation, registerBroadcastHandlers } from './broadcast.js';
import { campaignCarsConversation, campaignCreateConversation, registerCampaignHandlers } from './campaigns.js';
import { carAssignConversation, carCreateConversation } from './carCreate.js';
import { carSearchConversation, registerCarHandlers } from './cars.js';
import { checkRejectConversation, checkRunConversation, registerCheckHandlers } from './checks.js';
import { driverSearchConversation, registerDriverHandlers } from './drivers.js';
import { registerMenuHandlers, showAdminMenu } from './menu.js';
import { registerStatsHandlers } from './stats.js';
import {
  ADMIN_CONVERSATION_PREFIX,
  ADMIN_ONLY_ACTIONS,
  CONVERSATION,
  CONVERSATION_IDLE_TTL_MS,
  SHARED_ACTIONS,
  type AdminConversation,
} from './shared.js';

const log = childLogger('admin:router');

/** Panelni ochuvchi buyruqlar. */
const ADMIN_COMMAND_PATTERN = /^\/(admin|panel)(@[\w_]+)?(\s|$)/i;

type AdminConversationFn = (conversation: AdminConversation, ctx: BotContext) => Promise<void>;

/**
 * Suhbat middleware'ini bitta joyda turga keltiramiz — `createConversation`
 * `C & ConversationFlavor` qaytaradi, `BotContext` esa uni allaqachon o'z ichiga oladi.
 */
const conversationMiddleware = (
  builder: AdminConversationFn,
  id: string,
): Middleware<BotContext> =>
  createConversation<BotContext>(builder, { id, maxMillisecondsToWait: CONVERSATION_IDLE_TTL_MS });

type ConversationSessionShape = { readonly conversation?: Readonly<Record<string, unknown>> };

/**
 * conversations plagini faol suhbatlarni sessiyada saqlaydi. `ConversationFlavor`
 * sessiya turini "lazy" variant bilan birlashtirgani uchun maydonga to'g'ridan-to'g'ri
 * murojaat qilib bo'lmaydi — shuning uchun shakl ish vaqtida tekshiriladi.
 */
const activeConversationIds = (session: unknown): readonly string[] => {
  if (typeof session !== 'object' || session === null) return [];
  const active = (session as ConversationSessionShape).conversation;
  return active === undefined ? [] : Object.keys(active);
};

const hasActiveAdminConversation = (ctx: BotContext): boolean => {
  try {
    return activeConversationIds(ctx.session).some((id) =>
      id.startsWith(ADMIN_CONVERSATION_PREFIX),
    );
  } catch (error) {
    // Sessiya kaliti yo'q yangilanishlar (masalan kanal postlari) — panelga aloqasi yo'q.
    log.debug({ err: String(error) }, 'sessiya mavjud emas');
    return false;
  }
};

/**
 * Yangilanish admin paneliga tegishlimi?
 *
 * Bu filtr faqat MARSHRUTLASH uchun — ruxsatni `requireAdmin()` beradi:
 *  • admin amallari roldan qat'i nazar panelga kiradi, shunda ruxsatsiz
 *    urinish `requireAdmin()` da aniq rad javobini oladi;
 *  • umumiy tugmalar (bosh menyu, bekor qilish) esa faqat admin uchun
 *    yo'naltiriladi — aks holda haydovchi va reklama beruvchining
 *    "Bosh menyu" tugmasi admin paneliga tushib qolardi.
 */
const isAdminUpdate = (ctx: BotContext): boolean => {
  // Eng muhim shart birinchi: faol suhbat HAR QANDAY yangilanishni kutadi —
  // matn, rasm va tanlov tugmalarini ham. Aks holda oqim javobsiz qotib qolardi.
  if (hasActiveAdminConversation(ctx)) return true;

  const parsed = tryParseCallback(ctx.callbackQuery?.data);
  if (parsed !== null) {
    if (ADMIN_ONLY_ACTIONS.has(parsed.action)) return true;
    return SHARED_ACTIONS.has(parsed.action) && authOf(ctx).isAdmin;
  }

  return ADMIN_COMMAND_PATTERN.test(ctx.message?.text ?? '');
};

const registerConversations = (composer: Composer<BotContext>): void => {
  composer.use(conversationMiddleware(carCreateConversation, CONVERSATION.carCreate));
  composer.use(conversationMiddleware(carAssignConversation, CONVERSATION.carAssign));
  composer.use(conversationMiddleware(carSearchConversation, CONVERSATION.carSearch));
  composer.use(conversationMiddleware(driverSearchConversation, CONVERSATION.driverSearch));
  composer.use(conversationMiddleware(advertiserCreateConversation, CONVERSATION.advertiserCreate));
  composer.use(conversationMiddleware(campaignCreateConversation, CONVERSATION.campaignCreate));
  composer.use(conversationMiddleware(campaignCarsConversation, CONVERSATION.campaignCars));
  composer.use(conversationMiddleware(checkRejectConversation, CONVERSATION.checkReject));
  composer.use(conversationMiddleware(checkRunConversation, CONVERSATION.checkRun));
  composer.use(conversationMiddleware(broadcastConversation, CONVERSATION.broadcast));
};

/**
 * Admin panelini botga ulaydi.
 *
 * Zanjir tartibi muhim:
 *   1) `filter` — faqat panelga tegishli yangilanishlar kiradi, qolgani
 *      keyingi handlerlarga (haydovchi, reklama beruvchi) o'tadi;
 *   2) `requireAdmin()` — buyruq ham, callback ham, suhbat davomi ham himoyalanadi;
 *   3) suhbatlar, so'ng bo'lim handlerlari.
 */
export const registerAdminHandlers = (bot: Bot<BotContext>): void => {
  const panel = new Composer<BotContext>();

  panel.use(requireAdmin());

  registerConversations(panel);

  registerMenuHandlers(panel);
  registerCarHandlers(panel);
  registerDriverHandlers(panel);
  registerAdvertiserHandlers(panel);
  registerCampaignHandlers(panel);
  registerCheckHandlers(panel);
  registerBroadcastHandlers(panel);
  registerStatsHandlers(panel);

  bot.filter(isAdminUpdate).use(panel);
  log.info('Admin panel handlerlari ulandi');
};

export { showAdminMenu };
