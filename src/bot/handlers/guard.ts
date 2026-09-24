import { describeError, isAppError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import type { AppRole, AuthFlavor, BotContext } from '../bot.js';

const log = childLogger('bot:handler');

type ReplyOptions = Parameters<BotContext['reply']>[1];
type AuthState = AuthFlavor['auth'];

/** Auth oraliq qatlami ishlamagan holat uchun xavfsiz zaxira — hech qanday huquq bermaydi. */
const GUEST_AUTH: AuthState = Object.freeze({
  user: null,
  role: 'GUEST' as AppRole,
  isAdmin: false,
});

/**
 * ctx.auth ni xavfsiz o'qiydi. Middleware hali ulanmagan bo'lsa ham handler yiqilmaydi —
 * foydalanuvchi eng past huquq (GUEST) bilan ko'riladi.
 */
export const authOf = (ctx: BotContext): AuthState => (ctx as BotContext & AuthFlavor).auth ?? GUEST_AUTH;

/** Admin panelga kiradigan rollar. */
const ADMIN_ROLES: readonly AppRole[] = Object.freeze(['SUPERADMIN', 'ADMIN', 'OPERATOR']);

export const isAdminRole = (role: AppRole): boolean => ADMIN_ROLES.includes(role);

/**
 * Xatodan foydalanuvchiga ko'rsatish mumkin bo'lgan matnni ajratadi.
 * Ichki xatolar hech qachon oshkor qilinmaydi — umumiy matn qaytadi.
 */
export const userFacingText = (error: unknown, fallback: string = t.common.error): string =>
  isAppError(error) && error.userFacing && error.message.length > 0 ? error.message : fallback;

/** Javob yuborishning o'zi ham muvaffaqiyatsiz bo'lishi mumkin (chat bloklangan) — uni ham loglaymiz. */
export const replySafe = async (ctx: BotContext, text: string, extra?: ReplyOptions): Promise<void> => {
  try {
    await ctx.reply(text, extra);
  } catch (error) {
    log.warn({ chatId: ctx.chat?.id, err: describeError(error) }, 'Javob yuborilmadi');
  }
};

/** Inline tugma bosilganini tasdiqlaydi — tasdiqlanmasa Telegram "soat" ni ko'rsatib turadi. */
export const answerSafe = async (ctx: BotContext, text?: string, showAlert = false): Promise<void> => {
  if (ctx.callbackQuery === undefined) return;
  try {
    await ctx.answerCallbackQuery(text === undefined ? undefined : { text, show_alert: showAlert });
  } catch (error) {
    log.warn({ err: describeError(error) }, 'Callback javobi yuborilmadi');
  }
};

/**
 * Handlerni o'raydi: xato hech qachon jim yutilmaydi — serverda batafsil log,
 * foydalanuvchiga esa tushunarli o'zbekcha xabar boradi.
 */
export const safeHandler =
  <C extends BotContext>(scope: string, handler: (ctx: C) => Promise<void>) =>
  async (ctx: C): Promise<void> => {
    try {
      await handler(ctx);
    } catch (error) {
      log.error(
        { scope, updateId: ctx.update.update_id, fromId: ctx.from?.id, err: describeError(error) },
        'Handler xatosi',
      );
      const text = userFacingText(error);
      if (ctx.callbackQuery !== undefined) {
        await answerSafe(ctx, text, true);
        return;
      }
      await replySafe(ctx, text);
    }
  };
