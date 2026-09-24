import type { MiddlewareFn } from 'grammy';
import { childLogger } from '../../core/logger.js';
import type { BotContext } from '../bot.js';

/**
 * Har bir kiruvchi yangilanishni qayd etadi.
 *
 * Nega kerak: busiz loglarda faqat xatolar ko'rinardi, ya'ni "yangilanish
 * umuman kelmadi" bilan "keldi va jimgina qayta ishlandi" ni ajratib
 * bo'lmasdi. Webhook ishlamay qolganda bu farq eng muhim ma'lumot.
 *
 * Maxfiylik: xabar matni loglanmaydi (haydovchilarning shaxsiy yozishmalari),
 * faqat tur, foydalanuvchi va callback amali yoziladi.
 */

const log = childLogger('bot:update');

/** Callback ma'lumotidan faqat amal qismini oladi (qiymatlar shaxsiy bo'lishi mumkin). */
const callbackAction = (data: string | undefined): string | undefined =>
  data === undefined ? undefined : data.split(':')[0];

const describeUpdate = (ctx: BotContext): string => {
  if (ctx.callbackQuery) return 'callback_query';
  if (ctx.message?.photo) return 'photo';
  if (ctx.message?.contact) return 'contact';
  if (ctx.message?.text?.startsWith('/')) return 'command';
  if (ctx.message) return 'message';
  if (ctx.myChatMember) return 'my_chat_member';
  return ctx.update ? Object.keys(ctx.update).filter((key) => key !== 'update_id')[0] ?? 'unknown' : 'unknown';
};

export const updateLog = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const startedAt = Date.now();
  const kind = describeUpdate(ctx);
  const command = ctx.message?.text?.startsWith('/') ? ctx.message.text.split(' ')[0] : undefined;

  log.info(
    {
      kind,
      updateId: ctx.update?.update_id,
      userId: ctx.from?.id,
      username: ctx.from?.username,
      action: callbackAction(ctx.callbackQuery?.data),
      command,
    },
    'Yangilanish keldi',
  );

  try {
    await next();
    log.info({ kind, userId: ctx.from?.id, role: ctx.auth?.role, ms: Date.now() - startedAt }, 'Yangilanish qayta ishlandi');
  } catch (error) {
    // Xatoni errorBoundary qayta ishlaydi — bu yerda faqat davomiylikni qayd etamiz.
    log.warn({ kind, userId: ctx.from?.id, ms: Date.now() - startedAt }, 'Yangilanish xato bilan tugadi');
    throw error;
  }
};
