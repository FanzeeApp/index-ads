import type { Bot } from 'grammy';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import type { BotContext } from '../bot.js';
import { answerSafe, replySafe, safeHandler } from './guard.js';
import { sendRoleMenu } from './start.js';

const log = childLogger('bot:fallback');

/** Guruh/kanalda bot ishlamaydi — u yerda javob bermaymiz. */
const isPrivateChat = (ctx: BotContext): boolean => ctx.chat?.type === 'private';

/** Hech bir handler ushlamagan xabar: sabab aytiladi va rolga mos menyu qayta ko'rsatiladi. */
const handleUnhandledMessage = async (ctx: BotContext): Promise<void> => {
  if (!isPrivateChat(ctx)) return;
  log.debug({ fromId: ctx.from?.id, updateId: ctx.update.update_id }, 'Ushlanmagan xabar');
  await replySafe(ctx, t.common.unknownCommand);
  await sendRoleMenu(ctx);
};

/** Eskirgan yoki begona inline tugma — Telegram "soat" ni aylantirib qolmasligi uchun javob beramiz. */
const handleUnhandledCallback = async (ctx: BotContext): Promise<void> => {
  log.debug({ fromId: ctx.from?.id }, 'Ushlanmagan callback');
  await answerSafe(ctx, t.common.unknownCommand, true);
};

/**
 * ENG OXIRIDA ulanadi — undan oldin barcha rol handlerlari ro'yxatdan o'tgan bo'lishi shart,
 * aks holda bu fallback ularning xabarlarini yutib yuboradi.
 */
export const registerFallbackHandlers = (bot: Bot<BotContext>): void => {
  bot.on('message', safeHandler('fallback:message', handleUnhandledMessage));
  bot.on('callback_query:data', safeHandler('fallback:callback', handleUnhandledCallback));
};
