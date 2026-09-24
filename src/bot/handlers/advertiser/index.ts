/**
 * Reklama beruvchi kabineti — marshrutlarni yig'ish nuqtasi.
 * Nima uchun filtr: kabinet faqat o'ziga tegishli yangilanishlarni oladi,
 * shuning uchun rol darvozasi boshqa rollarning (haydovchi, admin) oqimiga
 * umuman aralashmaydi.
 */
import { Composer } from 'grammy';
import type { Bot } from 'grammy';
import { t } from '../../../i18n/index.js';
import { requireRole } from '../../middlewares/auth.js';
import { isCabinetCallback } from './callbacks.js';
import { registerFeedHandlers } from './feed.js';
import { registerMenuHandlers, showAdvertiserMenu } from './menu.js';
import { registerReportHandlers } from './report.js';
import type { BotContext } from '../../bot.js';

/** Kabinetga kiruvchi matnli tugmalar. */
const ENTRY_TEXTS: ReadonlySet<string> = new Set([
  t.advertiser.myCampaigns,
  t.advertiser.liveFeed,
  t.advertiser.report,
]);

const isCabinetUpdate = (ctx: BotContext): boolean => {
  if (ctx.callbackQuery !== undefined) return isCabinetCallback(ctx.callbackQuery.data);
  const text = ctx.message?.text;
  return text !== undefined && ENTRY_TEXTS.has(text);
};

/** Kabinet handlerlarini botga ulaydi. */
export const registerAdvertiserHandlers = (bot: Bot<BotContext>): void => {
  const cabinet = new Composer<BotContext>();

  // Kabinetning barcha ekranlari uchun yagona rol darvozasi.
  cabinet.use(requireRole('ADVERTISER', 'SUPERADMIN', 'ADMIN'));

  registerMenuHandlers(cabinet);
  registerFeedHandlers(cabinet);
  registerReportHandlers(cabinet);

  bot.filter(isCabinetUpdate).use(cabinet);
};

export { showAdvertiserMenu };
