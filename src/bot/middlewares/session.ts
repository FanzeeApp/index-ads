import { session, type MiddlewareFn } from 'grammy';
import type { BotContext, SessionData } from '../bot.js';

/** Yangi suhbat uchun bo'sh sessiya. Mavjud sessiyaga tegilmaydi. */
const initialSession = (): SessionData => ({});

/**
 * Sessiya kaliti foydalanuvchi bo'yicha olinadi: bot faqat shaxsiy chatlarda ishlaydi,
 * callback_query da esa `ctx.chat` bo'lmasligi mumkin, `ctx.from` esa doim mavjud.
 */
const resolveSessionKey = (ctx: Omit<BotContext, 'session'>): string | undefined =>
  ctx.from === undefined ? undefined : String(ctx.from.id);

/**
 * Xotiradagi sessiya (default MemorySessionStorage) — bitta Railway instansiyasi uchun yetarli.
 * Qayta ishga tushganda faqat yarim tugallangan suhbat yo'qoladi, biznes ma'lumot PostgreSQL da.
 */
export const createSessionMiddleware = (): MiddlewareFn<BotContext> =>
  session<SessionData, BotContext>({
    initial: initialSession,
    getSessionKey: resolveSessionKey,
  });

/**
 * Sessiyani tozalaydi. Mavjud obyekt o'zgartirilmaydi — yangi nusxa yoziladi,
 * shunda conversations plagini saqlagan maydonlar ham joyida qoladi.
 */
export const resetSession = (ctx: BotContext): void => {
  ctx.session = { ...ctx.session, step: undefined, draft: undefined, page: undefined };
};
