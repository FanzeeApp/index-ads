import type { MiddlewareFn } from 'grammy';
import { describeError, isAppError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import { truncate } from '../../utils/html.js';
import type { BotContext } from '../bot.js';

const log = childLogger('bot:error');

/** Telegram answerCallbackQuery matni uchun chegara. */
const CALLBACK_ALERT_LIMIT = 200;

/** Update turi (message, callback_query, ...) — logni o'qishni osonlashtiradi. */
const updateKind = (ctx: BotContext): string =>
  Object.keys(ctx.update).find((key) => key !== 'update_id') ?? 'unknown';

/** Faqat AppError.userFacing matni ko'rsatiladi; qolgan hollarda umumiy xabar. */
const toUserMessage = (error: unknown): string =>
  isAppError(error) && error.userFacing ? error.message : t.common.error;

const notifyUser = async (ctx: BotContext, text: string): Promise<void> => {
  if (ctx.callbackQuery !== undefined) {
    await ctx.answerCallbackQuery({ text: truncate(text, CALLBACK_ALERT_LIMIT), show_alert: true });
    return;
  }
  if (ctx.chat !== undefined) {
    // parse_mode ataylab qo'yilmadi: xato matnida foydalanuvchi kiritgan belgilar bo'lishi mumkin,
    // HTML tahlili buzilsa xabar umuman yetib bormaydi.
    await ctx.reply(text);
  }
};

/**
 * Butun zanjirni o'rab turadigan xato chegarasi: hech bir xato jim yutilmaydi —
 * foydalanuvchiga o'zbekcha xabar boradi, serverda to'liq kontekst loglanadi.
 */
export const errorBoundary = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    log.error(
      {
        update: updateKind(ctx),
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        callbackData: ctx.callbackQuery?.data,
        reason: describeError(error),
      },
      'Update qayta ishlashda xato',
    );

    try {
      await notifyUser(ctx, toUserMessage(error));
    } catch (notifyError) {
      // Xabar yuborishning o'zi ham uzilishi mumkin (bot bloklangan, callback eskirgan).
      // Bunda qayta tashlamaymiz — aks holda xato yuqoriga chiqib, update butunlay yo'qoladi.
      log.warn(
        { userId: ctx.from?.id, reason: describeError(notifyError) },
        "Xato xabarini yuborib bo'lmadi",
      );
    }
  }
};
